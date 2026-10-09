/**
 * mobile/js/app-media.js
 * 头像裁切、笔记内嵌图片、动态壁纸管理、背景图片管理
 */
(function () {
  'use strict';

  const M = window.MobileApp;
  if (!M) { console.error('[app-media] MobileApp 未初始化'); return; }

  const { state, $, showToast, showAlert, showConfirm, openDialog } = M;
  const { generateId } = window.Utils;
  const { bgDB } = window.DB;

  const AVATAR_SIZE = 200;
  const MAX_NOTE_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
  const THUMB_MAX_W = 300;
  const THUMB_MAX_H = 200;

  // ==================== 工具 ====================
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function makeThumbnail(dataUrl, maxW, maxH) {
    maxW = maxW || THUMB_MAX_W;
    maxH = maxH || THUMB_MAX_H;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function generateVideoThumbnail(videoBlob) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = URL.createObjectURL(videoBlob);
      const cleanup = () => {
        URL.revokeObjectURL(video.src);
        video.remove();
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('视频缩略图生成超时'));
      }, 10000);
      video.addEventListener('loadeddata', () => { video.currentTime = 0.1; });
      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 200;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          clearTimeout(timeout);
          cleanup();
          resolve(dataUrl);
        } catch (e) {
          clearTimeout(timeout);
          cleanup();
          reject(e);
        }
      });
      video.addEventListener('error', () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('视频加载失败'));
      });
    });
  }

  // ==================== 头像裁切 ====================
  const cropOverlay = $('cropOverlay');
  const cropCanvas = $('cropCanvas');
  const cropStage = $('cropStage');
  const cropZoom = $('cropZoom');
  const cropCloseBtn = $('cropCloseBtn');
  const cropCancelBtn = $('cropCancelBtn');
  const cropResetBtn = $('cropResetBtn');
  const cropConfirmBtn = $('cropConfirmBtn');

  const cropState = {
    img: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    minScale: 1,
    maxScale: 3,
    isDragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    canvasW: 0,
    canvasH: 0,
    cropRadius: 0,
    pinchStartDist: 0,
    pinchStartScale: 1
  };

  function initCropCanvas() {
    const rect = cropStage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cropCanvas.width = rect.width * dpr;
    cropCanvas.height = rect.height * dpr;
    cropCanvas.style.width = rect.width + 'px';
    cropCanvas.style.height = rect.height + 'px';
    cropState.canvasW = rect.width;
    cropState.canvasH = rect.height;
    cropState.cropRadius = Math.min(rect.width, rect.height) * 0.4;
    const img = cropState.img;
    if (!img) return;
    const diameter = cropState.cropRadius * 2;
    cropState.minScale = Math.max(diameter / img.width, diameter / img.height);
    cropState.maxScale = cropState.minScale * 3;
  }

  function drawCrop() {
    const ctx = cropCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = cropState.canvasW;
    const h = cropState.canvasH;
    const img = cropState.img;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, w, h);
    if (!img) { ctx.restore(); return; }

    const dw = img.width * cropState.scale;
    const dh = img.height * cropState.scale;
    const dx = (w - dw) / 2 + cropState.offsetX;
    const dy = (h - dh) / 2 + cropState.offsetY;
    ctx.drawImage(img, dx, dy, dw, dh);

    const cx = w / 2;
    const cy = h / 2;
    const r = cropState.cropRadius;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function clampCropOffset() {
    const img = cropState.img;
    if (!img) return;
    const w = cropState.canvasW;
    const h = cropState.canvasH;
    const dw = img.width * cropState.scale;
    const dh = img.height * cropState.scale;
    const cx = w / 2;
    const cy = h / 2;
    const r = cropState.cropRadius;
    const baseDx = (w - dw) / 2;
    const baseDy = (h - dh) / 2;
    const minOffsetX = (cx + r - dw) - baseDx;
    const maxOffsetX = (cx - r) - baseDx;
    const minOffsetY = (cy + r - dh) - baseDy;
    const maxOffsetY = (cy - r) - baseDy;
    if (cropState.offsetX < minOffsetX) cropState.offsetX = minOffsetX;
    if (cropState.offsetX > maxOffsetX) cropState.offsetX = maxOffsetX;
    if (cropState.offsetY < minOffsetY) cropState.offsetY = minOffsetY;
    if (cropState.offsetY > maxOffsetY) cropState.offsetY = maxOffsetY;
  }

  function resetCrop() {
    cropState.scale = cropState.minScale;
    cropState.offsetX = 0;
    cropState.offsetY = 0;
    cropZoom.value = 100;
    drawCrop();
  }

  function openCropDialog(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        cropState.img = img;
        cropOverlay.classList.add('show');
        requestAnimationFrame(() => {
          initCropCanvas();
          resetCrop();
        });
      };
      img.onerror = () => showAlert('图片加载失败');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function closeCrop() {
    cropOverlay.classList.remove('show');
    cropState.img = null;
  }

  // 触摸拖拽
  cropCanvas.addEventListener('touchstart', (e) => {
    if (!cropState.img) return;
    if (e.touches.length === 1) {
      cropState.isDragging = true;
      cropState.startX = e.touches[0].clientX;
      cropState.startY = e.touches[0].clientY;
      cropState.startOffsetX = cropState.offsetX;
      cropState.startOffsetY = cropState.offsetY;
    } else if (e.touches.length === 2) {
      cropState.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      cropState.pinchStartDist = Math.hypot(dx, dy);
      cropState.pinchStartScale = cropState.scale;
    }
  }, { passive: true });

  cropCanvas.addEventListener('touchmove', (e) => {
    if (!cropState.img) return;
    e.preventDefault();
    if (e.touches.length === 1 && cropState.isDragging) {
      const dx = e.touches[0].clientX - cropState.startX;
      const dy = e.touches[0].clientY - cropState.startY;
      cropState.offsetX = cropState.startOffsetX + dx;
      cropState.offsetY = cropState.startOffsetY + dy;
      clampCropOffset();
      drawCrop();
    } else if (e.touches.length === 2 && cropState.pinchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / cropState.pinchStartDist;
      let newScale = cropState.pinchStartScale * ratio;
      newScale = Math.min(cropState.maxScale, Math.max(cropState.minScale, newScale));
      cropState.scale = newScale;
      cropZoom.value = Math.round((newScale / cropState.minScale) * 100);
      clampCropOffset();
      drawCrop();
    }
  }, { passive: false });

  cropCanvas.addEventListener('touchend', () => {
    cropState.isDragging = false;
    cropState.pinchStartDist = 0;
  });

  // 鼠标拖拽（桌面调试）
  cropCanvas.addEventListener('mousedown', (e) => {
    if (!cropState.img) return;
    cropState.isDragging = true;
    cropState.startX = e.clientX;
    cropState.startY = e.clientY;
    cropState.startOffsetX = cropState.offsetX;
    cropState.startOffsetY = cropState.offsetY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!cropState.isDragging || !cropState.img) return;
    const dx = e.clientX - cropState.startX;
    const dy = e.clientY - cropState.startY;
    cropState.offsetX = cropState.startOffsetX + dx;
    cropState.offsetY = cropState.startOffsetY + dy;
    clampCropOffset();
    drawCrop();
  });
  window.addEventListener('mouseup', () => { cropState.isDragging = false; });

  cropZoom.addEventListener('input', (e) => {
    if (!cropState.img) return;
    const percent = parseInt(e.target.value);
    cropState.scale = cropState.minScale * (percent / 100);
    clampCropOffset();
    drawCrop();
  });

  cropResetBtn.addEventListener('click', resetCrop);
  cropCloseBtn.addEventListener('click', closeCrop);
  cropCancelBtn.addEventListener('click', closeCrop);

  cropConfirmBtn.addEventListener('click', async () => {
    if (!cropState.img) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = AVATAR_SIZE;
    outCanvas.height = AVATAR_SIZE;
    const outCtx = outCanvas.getContext('2d');
    const outputR = AVATAR_SIZE / 2;

    const w = cropState.canvasW;
    const h = cropState.canvasH;
    const img = cropState.img;
    const dw = img.width * cropState.scale;
    const dh = img.height * cropState.scale;
    const dx = (w - dw) / 2 + cropState.offsetX;
    const dy = (h - dh) / 2 + cropState.offsetY;
    const cx = w / 2;
    const cy = h / 2;
    const r = cropState.cropRadius;

    const srcCx = (cx - dx) / cropState.scale;
    const srcCy = (cy - dy) / cropState.scale;
    const srcR = r / cropState.scale;

    outCtx.save();
    outCtx.beginPath();
    outCtx.arc(outputR, outputR, outputR, 0, Math.PI * 2);
    outCtx.closePath();
    outCtx.clip();
    outCtx.fillStyle = '#000';
    outCtx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    outCtx.drawImage(img, srcCx - srcR, srcCy - srcR, srcR * 2, srcR * 2, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    outCtx.restore();

    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
    try {
      window.DB.saveAvatar(state.currentUser, dataUrl);
    } catch (e) {
      await showAlert('头像保存失败：存储空间不足');
      return;
    }
    renderAvatar();
    closeCrop();
  });

  $('avatarFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showAlert('图片过大，请选择小于 10MB 的图片');
      return;
    }
    openCropDialog(file);
  });

  function renderAvatar() {
    if (!state.currentUser) return;
    const setAvatar = $('setAvatar');
    const setAvatarLetter = $('setAvatarLetter');
    if (setAvatarLetter) setAvatarLetter.textContent = state.currentUser.charAt(0).toUpperCase();
    const data = window.DB.loadAvatar(state.currentUser);
    if (setAvatar) {
      if (data) {
        setAvatar.style.backgroundImage = `url('${data}')`;
        setAvatar.classList.add('has-image');
      } else {
        setAvatar.style.backgroundImage = 'linear-gradient(135deg, rgba(91, 141, 238, 0.6), rgba(160, 120, 255, 0.6))';
        setAvatar.classList.remove('has-image');
      }
    }
  }

  // ==================== 笔记内嵌图片 ====================
  async function insertNoteImage(file) {
    if (!file) return;
    if (file.size > MAX_NOTE_IMAGE_SIZE) {
      showAlert('图片过大，请选择小于 10MB 的图片');
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const id = generateId();
      await bgDB.addNoteImage({
        id,
        name: file.name || 'image',
        type: file.type,
        data: dataUrl,
        createdAt: Date.now(),
        owner: state.currentUser
      });

      const ta = $('noteContentInput');
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      let prefix = '';
      if (start > 0 && value[start - 1] !== '\n') prefix = '\n';
      const insertion = `${prefix}![图片](${id})\n`;
      ta.value = value.substring(0, start) + insertion + value.substring(end);
      const pos = start + insertion.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('已插入图片');
    } catch (err) {
      console.error(err);
      showAlert('插入图片失败：' + (err.message || '未知错误'));
    }
  }

  async function loadNoteImages(container) {
    const imgs = container.querySelectorAll('.note-image[data-img-id]');
    const jobs = [];
    imgs.forEach(img => {
      const id = img.getAttribute('data-img-id');
      if (!id) return;
      jobs.push((async () => {
        try {
          const item = await bgDB.getNoteImage(id);
          if (item && item.data) {
            img.src = item.data;
            img.classList.remove('loading');
          } else {
            img.alt = '图片丢失';
            img.classList.remove('loading');
          }
        } catch (e) {
          img.classList.remove('loading');
        }
      })());
    });
    await Promise.all(jobs);
  }

  $('noteImageFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) insertNoteImage(file);
  });

  // ==================== 动态壁纸管理 ====================
  function openWallpaperManager() {
    const M2 = window.MobileApp;
    const frag = document.createDocumentFragment();

    async function refresh() {
      frag.innerHTML = '';

      const actions = document.createElement('div');
      actions.className = 'm-media-actions';
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ 上传视频';
      addBtn.addEventListener('click', () => $('wallpaperFileInput').click());
      actions.appendChild(addBtn);
      frag.appendChild(actions);

      const hint = document.createElement('div');
      hint.className = 'm-media-hint';
      hint.textContent = '建议时长 10-30 秒，文件小于 100MB';
      frag.appendChild(hint);

      const allItems = await bgDB.getAllWallpapers();
      const items = allItems
        .filter(it => !it.owner || it.owner === state.currentUser)
        .sort((a, b) => a.createdAt - b.createdAt);

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'm-media-empty';
        empty.textContent = '还没有动态壁纸\n点击上方按钮添加';
        frag.appendChild(empty);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'm-media-grid';

      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'm-media-item' + (item.id === state.currentWallpaperId ? ' current' : '');

        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = '';
        el.appendChild(img);

        if (item.id === state.currentWallpaperId) {
          const badge = document.createElement('span');
          badge.className = 'm-media-badge';
          badge.textContent = '当前';
          el.appendChild(badge);
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'm-media-name';
        nameEl.textContent = item.name || '未命名';
        el.appendChild(nameEl);

        const del = document.createElement('button');
        del.className = 'm-media-del';
        del.textContent = '✕';
        del.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await showConfirm('确定删除这段视频吗？', { confirmText: '删除', danger: true });
          if (!ok) return;
          await bgDB.deleteWallpaper(item.id);
          if (state.currentWallpaperId === item.id) {
            const rest = items.filter(i => i.id !== item.id);
            if (rest.length > 0) {
              state.currentWallpaperId = rest[0].id;
              localStorage.setItem(M.CURRENT_WALLPAPER_KEY, rest[0].id);
            } else {
              state.currentWallpaperId = null;
              localStorage.removeItem(M.CURRENT_WALLPAPER_KEY);
            }
            await M.loadWallpaperVideo(state.currentWallpaperId);
            M.syncWallpaperVisibility();
          }
          refresh();
          showToast('已删除');
        });
        el.appendChild(del);

        el.addEventListener('click', async () => {
          if (state.currentWallpaperId === item.id) return;
          state.currentWallpaperId = item.id;
          localStorage.setItem(M.CURRENT_WALLPAPER_KEY, item.id);
          await M.loadWallpaperVideo(item.id);
          M.syncWallpaperVisibility();
          refresh();
          showToast('已切换动态壁纸');
        });

        grid.appendChild(el);
      });

      frag.appendChild(grid);
    }

    refresh();
    M.openSheet ? M.openSheet('动态壁纸', frag) : (function () {
      // 兜底：直接使用 sheet
      const sheetOverlay = $('sheetOverlay');
      $('sheetTitle').textContent = '动态壁纸';
      const body = $('sheetBody');
      body.innerHTML = '';
      body.appendChild(frag);
      sheetOverlay.classList.add('show');
    })();
  }

  $('wallpaperFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) { showAlert('视频过大，请选择小于 100MB 的文件'); return; }
    const valid = ['video/mp4', 'video/webm'];
    if (!valid.includes(file.type) && !file.name.toLowerCase().endsWith('.mp4') && !file.name.toLowerCase().endsWith('.webm')) {
      showAlert('请选择 MP4 或 WebM 格式的视频');
      return;
    }
    try {
      M.showProgress && M.showProgress('正在处理视频...');
      const thumbnail = await generateVideoThumbnail(file);
      const item = {
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        type: file.type || 'video/mp4',
        size: file.size,
        thumbnail,
        data: file,
        createdAt: Date.now(),
        owner: state.currentUser
      };
      await bgDB.addWallpaper(item);
      M.hideProgress && M.hideProgress();

      state.currentWallpaperId = item.id;
      localStorage.setItem(M.CURRENT_WALLPAPER_KEY, item.id);
      await M.loadWallpaperVideo(item.id);
      M.syncWallpaperVisibility();
      showToast('已上传动态壁纸');
      openWallpaperManager();
    } catch (err) {
      M.hideProgress && M.hideProgress();
      console.error(err);
      showAlert('导入失败：' + (err.message || '未知错误'));
    }
  });

  // ==================== 背景图片管理 ====================
  function openBgManager() {
    const frag = document.createDocumentFragment();

    async function refresh() {
      frag.innerHTML = '';

      const actions = document.createElement('div');
      actions.className = 'm-media-actions';
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ 从相册选择';
      addBtn.addEventListener('click', () => $('bgFileInput').click());
      actions.appendChild(addBtn);
      frag.appendChild(actions);

      const allItems = await bgDB.getAll();
      const items = allItems
        .filter(it => it.owner === state.currentUser)
        .sort((a, b) => a.createdAt - b.createdAt);

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'm-media-empty';
        empty.textContent = '还没有背景图片\n点击上方按钮添加';
        frag.appendChild(empty);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'm-media-grid';

      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'm-media-item' + (item.id === state.settings.currentBgId ? ' current' : '');

        const img = document.createElement('img');
        img.src = item.thumbnail || item.data;
        img.alt = '';
        el.appendChild(img);

        if (item.id === state.settings.currentBgId) {
          const badge = document.createElement('span');
          badge.className = 'm-media-badge';
          badge.textContent = '当前';
          el.appendChild(badge);
        }

        const del = document.createElement('button');
        del.className = 'm-media-del';
        del.textContent = '✕';
        del.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await showConfirm('确定删除这张背景图吗？', { confirmText: '删除', danger: true });
          if (!ok) return;
          await bgDB.delete(item.id);
          if (state.settings.currentBgId === item.id) {
            const rest = items.filter(i => i.id !== item.id);
            state.settings.currentBgId = rest.length > 0 ? rest[0].id : null;
            M.saveSettingsToStorage();
            await M.applyBackground();
          }
          refresh();
          showToast('已删除');
        });
        el.appendChild(del);

        el.addEventListener('click', async () => {
          if (state.settings.currentBgId === item.id) return;
          state.settings.currentBgId = item.id;
          M.saveSettingsToStorage();
          await M.applyBackground();
          refresh();
          showToast('已切换背景');
        });

        grid.appendChild(el);
      });

      frag.appendChild(grid);
    }

    refresh();
    const sheetOverlay = $('sheetOverlay');
    $('sheetTitle').textContent = '背景图片';
    const body = $('sheetBody');
    body.innerHTML = '';
    body.appendChild(frag);
    sheetOverlay.classList.add('show');
  }

  $('bgFileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const useProgress = files.length >= 2;
    if (useProgress && M.showProgress) {
      M.showProgress('正在添加背景...');
      M.updateProgress(0, files.length);
      await M.yieldToUI();
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const dataUrl = await readFileAsDataURL(file);
        const thumbnail = await makeThumbnail(dataUrl);
        const item = {
          id: generateId(),
          type: 'file',
          data: dataUrl,
          thumbnail,
          createdAt: Date.now(),
          owner: state.currentUser
        };
        await bgDB.add(item);
        if (!state.settings.currentBgId) {
          state.settings.currentBgId = item.id;
          M.saveSettingsToStorage();
        }
        if (useProgress && M.updateProgress) {
          M.updateProgress(i + 1, files.length);
          await M.yieldToUI();
        }
      } catch (err) {
        console.warn('添加背景失败', err);
      }
    }
    await M.applyBackground();
    if (useProgress && M.hideProgress) M.hideProgress();
    showToast(files.length > 1 ? `已添加 ${files.length} 张背景` : '已添加背景');
    openBgManager();
  });

  // ==================== 暴露 ====================
  window.MobileMedia = {
    openWallpaperManager,
    openBgManager,
    loadNoteImages,
    insertNoteImage,
    renderAvatar,
    closeCrop
  };

  // 首次渲染头像
  window.MobileApp.renderAvatar = renderAvatar;

  console.log('[app-media] loaded');
})();