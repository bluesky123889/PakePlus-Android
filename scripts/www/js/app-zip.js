/**
 * mobile/js/app-zip.js
 * ZIP 导出 / 导入，与电脑端格式一致
 */
(function () {
  'use strict';

  const M = window.MobileApp;
  if (!M) { console.error('[app-zip] MobileApp 未初始化'); return; }

  const { state, $, showToast, showAlert, showConfirm } = M;
  const { generateId, extFromMime } = window.Utils;
  const { bgDB } = window.DB;

  const ZIP_MANIFEST_VERSION = 1;

  function filterWallpapersByOwner(items) {
    if (!state.currentUser) return items.slice();
    return items.filter(it => !it.owner || it.owner === state.currentUser);
  }

  async function readBlobWithProgress(blob, onProgress) {
    const total = blob.size;
    const out = new Uint8Array(total);
    const reader = blob.stream().getReader();
    let offset = 0;
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out.set(value, offset);
      offset += value.length;
      chunkCount++;
      if (onProgress) onProgress(offset);
      if (chunkCount % 4 === 0) await M.yieldToUI();
    }
    return out.subarray(0, offset);
  }

  async function exportZip() {
    if (typeof fflate === 'undefined') {
      await showAlert('未找到 fflate 库');
      return;
    }
    try {
      const files = {};
      const notesJson = JSON.stringify(state.notes, null, 2);
      const settingsJson = JSON.stringify(state.settings, null, 2);
      const notesBytes = new Blob([notesJson]).size;
      const settingsBytes = new Blob([settingsJson]).size;

      const allBgs = await bgDB.getAll();
      const userBgs = allBgs.filter(item => item.owner === state.currentUser);
      const wallpapers = filterWallpapersByOwner(await bgDB.getAllWallpapers());
      const allNoteImgs = await bgDB.getAllNoteImages();
      const userNoteImgs = allNoteImgs.filter(item => item.owner === state.currentUser);

      let bgBytesTotal = 0;
      for (const item of userBgs) {
        if (item.type === 'file' && typeof item.data === 'string') {
          const base64 = (item.data.split(',')[1]) || '';
          bgBytesTotal += Math.floor(base64.length * 0.75);
        } else {
          bgBytesTotal += 1024;
        }
      }
      let wpBytesTotal = 0;
      for (const item of wallpapers) {
        if (item.data instanceof Blob) wpBytesTotal += item.data.size;
        else wpBytesTotal += item.size || 0;
      }
      let niBytesTotal = 0;
      for (const img of userNoteImgs) {
        if (typeof img.data === 'string') {
          const base64 = (img.data.split(',')[1]) || '';
          niBytesTotal += Math.floor(base64.length * 0.75);
        }
      }

      const overhead = 8192;
      const totalBytes = notesBytes + settingsBytes + bgBytesTotal + wpBytesTotal + niBytesTotal + overhead;
      let doneBytes = 0;
      const useProgress = totalBytes > 1024 * 1024;
      const DATA_STAGE_MAX = 85;

      function updateDataProgress(done, total) {
        if (!useProgress || total <= 0) return;
        const ratio = Math.min(1, done / total);
        const pct = ratio * DATA_STAGE_MAX;
        $('progressFill').style.width = pct + '%';
        $('progressPercent').textContent = Math.round(pct) + '%';
      }

      if (useProgress) {
        M.showProgress('正在导出 ZIP...');
        M.updateProgress(0, totalBytes);
        await M.yieldToUI();
      }

      files['notes.json'] = fflate.strToU8(notesJson);
      files['settings.json'] = fflate.strToU8(settingsJson);
      doneBytes += notesBytes + settingsBytes;

      const avatarData = window.DB.loadAvatar(state.currentUser);
      if (avatarData) files['avatar.jpg'] = fflate.strToU8(avatarData);

      if (useProgress) { updateDataProgress(doneBytes, totalBytes); await M.yieldToUI(); }

      const bgUrls = [];
      const bgThumbs = [];
      for (const item of userBgs) {
        if (item.type === 'url') {
          bgUrls.push({ id: item.id, type: 'url', data: item.data, createdAt: item.createdAt });
          doneBytes += 1024;
        } else if (item.type === 'file' && typeof item.data === 'string') {
          const ext = extFromMime((item.data.match(/^data:([^;]+);/) || [])[1]);
          const filename = `backgrounds/${item.id}.${ext}`;
          const base64 = (item.data.split(',')[1]) || '';
          try {
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            files[filename] = bytes;
          } catch (e) {}
          doneBytes += Math.floor(base64.length * 0.75);
        }
        if (item.thumbnail) bgThumbs.push({ id: item.id, thumbnail: item.thumbnail });
        if (useProgress) { updateDataProgress(doneBytes, totalBytes); await M.yieldToUI(); }
      }
      if (bgUrls.length > 0) files['backgrounds/urls.json'] = fflate.strToU8(JSON.stringify(bgUrls, null, 2));
      if (bgThumbs.length > 0) files['backgrounds/thumbnails.json'] = fflate.strToU8(JSON.stringify(bgThumbs, null, 2));

      const noteImgMeta = [];
      for (const img of userNoteImgs) {
        const ext = extFromMime(img.type);
        const filename = `noteImages/${img.id}.${ext}`;
        const base64 = (img.data.split(',')[1]) || '';
        try {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          files[filename] = bytes;
          noteImgMeta.push({ id: img.id, name: img.name, type: img.type, filename, createdAt: img.createdAt });
          doneBytes += Math.floor(base64.length * 0.75);
        } catch (e) {}
        if (useProgress) { updateDataProgress(doneBytes, totalBytes); await M.yieldToUI(); }
      }
      if (noteImgMeta.length > 0) files['noteImages/meta.json'] = fflate.strToU8(JSON.stringify(noteImgMeta, null, 2));

      const wpMeta = [];
      for (const item of wallpapers) {
        const ext = extFromMime(item.type);
        const filename = `wallpapers/${item.id}.${ext}`;
        if (item.data instanceof Blob) {
          const fileStart = doneBytes;
          const fileSize = item.data.size;
          try {
            const bytes = await readBlobWithProgress(item.data, (received) => {
              if (useProgress) updateDataProgress(fileStart + received, totalBytes);
            });
            files[filename] = [bytes, { level: 0 }];
          } catch (e) {}
          doneBytes += fileSize;
        } else {
          doneBytes += item.size || 0;
        }
        wpMeta.push({
          id: item.id, name: item.name, type: item.type, size: item.size,
          thumbnail: item.thumbnail, createdAt: item.createdAt, filename, owner: item.owner
        });
        if (useProgress) { updateDataProgress(doneBytes, totalBytes); await M.yieldToUI(); }
      }
      files['wallpapers/meta.json'] = fflate.strToU8(JSON.stringify(wpMeta, null, 2));
      files['manifest.json'] = fflate.strToU8(JSON.stringify({
        version: ZIP_MANIFEST_VERSION,
        exportedAt: Date.now(),
        username: state.currentUser,
        currentBgId: state.settings.currentBgId,
        currentWallpaperId: state.currentWallpaperId
      }, null, 2));

      if (useProgress) {
        $('progressFill').style.width = DATA_STAGE_MAX + '%';
        $('progressPercent').textContent = DATA_STAGE_MAX + '%';
        M.setProgressTitle('正在压缩...');
        await M.yieldToUI();
      }

      let zipFakeTimer = null;
      if (useProgress) {
        let fakePct = DATA_STAGE_MAX;
        zipFakeTimer = setInterval(() => {
          const remaining = 98 - fakePct;
          fakePct += Math.max(0.1, remaining * 0.06);
          if (fakePct > 98) fakePct = 98;
          M.updateProgress(totalBytes * (fakePct / 100), totalBytes);
        }, 120);
      }

      let zipped;
      try {
        zipped = await new Promise((resolve, reject) => {
          fflate.zip(files, { level: 6 }, (err, data) => {
            if (err) reject(err); else resolve(data);
          });
        });
      } finally {
        if (zipFakeTimer) { clearInterval(zipFakeTimer); zipFakeTimer = null; }
      }

      if (useProgress) {
        M.setProgressTitle('正在写入文件...');
        M.updateProgress(totalBytes, totalBytes);
        await M.yieldToUI();
      }

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const timeStr = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const filename = `灵羽笔记-${state.currentUser}-${dateStr}-${timeStr}.zip`;
      const blob = new Blob([zipped], { type: 'application/zip' });

      if (useProgress) M.hideProgress();

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: 'application/zip' });
        if (navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: filename }); return; }
          catch (e) { if (e.name === 'AbortError') return; }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('已导出');
    } catch (err) {
      M.hideProgress();
      console.error(err);
      await showAlert('导出 ZIP 失败：' + (err.message || '未知错误'));
    }
  }

  async function importZip(file) {
    if (typeof fflate === 'undefined') {
      await showAlert('未找到 fflate 库');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const unzipped = fflate.unzipSync(new Uint8Array(buf));

      let importedNotes = null;
      if (unzipped['notes.json']) {
        const text = fflate.strFromU8(unzipped['notes.json']);
        importedNotes = JSON.parse(text);
        if (Array.isArray(importedNotes)) {
          importedNotes.forEach(n => {
            if (n.preview === undefined) n.preview = false;
            if (n.locked === undefined) n.locked = false;
            if (n.pinned === undefined) n.pinned = false;
            if (n.category === undefined) n.category = 'other';
            if (n.deleted === undefined) n.deleted = false;
          });
        }
      }

      let overwrite = false;
      if (importedNotes && Array.isArray(importedNotes)) {
        overwrite = await showConfirm(
          `ZIP 中包含 ${importedNotes.length} 篇笔记。\n\n覆盖现有笔记？`,
          { title: '导入 ZIP', confirmText: '覆盖', cancelText: '追加' }
        );
        if (overwrite) {
          const allBgs = await bgDB.getAll();
          const userBgs = allBgs.filter(item => item.owner === state.currentUser);
          for (const bg of userBgs) await bgDB.delete(bg.id);
          state.notes = importedNotes;
        } else {
          const existingIds = new Set(state.notes.map(n => n.id));
          const toAdd = importedNotes.filter(n => !existingIds.has(n.id));
          state.notes = state.notes.concat(toAdd);
        }
      } else {
        overwrite = await showConfirm(
          'ZIP 中不包含笔记数据。\n\n覆盖现有资源？',
          { title: '导入 ZIP', confirmText: '覆盖', cancelText: '追加' }
        );
      }

      if (unzipped['settings.json']) {
        try {
          const parsed = JSON.parse(fflate.strFromU8(unzipped['settings.json']));
          if (parsed && typeof parsed === 'object') {
            const defaults = window.DB.defaultSettings();
            if (parsed.shortcuts) delete parsed.shortcuts;
            Object.assign(state.settings, parsed);
          }
        } catch (e) {}
      }

      if (unzipped['avatar.jpg']) {
        try {
          const text = fflate.strFromU8(unzipped['avatar.jpg']);
          window.DB.saveAvatar(state.currentUser, text);
        } catch (e) {}
      }

      // 背景图
      const bgUrlEntries = [];
      const bgFileEntries = [];
      for (const path in unzipped) {
        if (path.startsWith('backgrounds/') && path !== 'backgrounds/urls.json' && path !== 'backgrounds/thumbnails.json') {
          bgFileEntries.push({ path, data: unzipped[path] });
        }
      }
      if (unzipped['backgrounds/urls.json']) {
        try {
          const arr = JSON.parse(fflate.strFromU8(unzipped['backgrounds/urls.json']));
          if (Array.isArray(arr)) bgUrlEntries.push(...arr);
        } catch (e) {}
      }

      const thumbMap = {};
      if (unzipped['backgrounds/thumbnails.json']) {
        try {
          const arr = JSON.parse(fflate.strFromU8(unzipped['backgrounds/thumbnails.json']));
          if (Array.isArray(arr)) arr.forEach(e => { if (e && e.id) thumbMap[e.id] = e.thumbnail; });
        } catch (e) {}
      }

      const existingBgs = await bgDB.getAll();
      const existingBgIds = new Set(existingBgs.map(b => b.id));

      function binToDataUrl(bytes, ext, explicitMime) {
        let mime;
        if (explicitMime && typeof explicitMime === 'string') mime = explicitMime;
        else if (ext === 'png') mime = 'image/png';
        else if (ext === 'webp') mime = 'image/webp';
        else if (ext === 'gif') mime = 'image/gif';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'svg') mime = 'image/svg+xml';
        else mime = 'image/jpeg';
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return `data:${mime};base64,${btoa(binary)}`;
      }

      const bgToImport = [];
      for (const entry of bgUrlEntries) {
        if (!entry || !entry.id) continue;
        if (!overwrite && existingBgIds.has(entry.id)) continue;
        bgToImport.push({ kind: 'url', entry });
      }
      for (const entry of bgFileEntries) {
        const filename = entry.path.split('/').pop();
        const id = filename.replace(/\.[^.]+$/, '');
        if (!id) continue;
        if (!overwrite && existingBgIds.has(id)) continue;
        const ext = (filename.match(/\.([^.]+)$/) || [])[1] || 'jpg';
        bgToImport.push({ kind: 'file', entry, id, ext });
      }

      const noteImgMeta = [];
      if (unzipped['noteImages/meta.json']) {
        try {
          const arr = JSON.parse(fflate.strFromU8(unzipped['noteImages/meta.json']));
          if (Array.isArray(arr)) noteImgMeta.push(...arr);
        } catch (e) {}
      }
      const existingNoteImgs = await bgDB.getAllNoteImages();
      const existingNoteImgIds = new Set(existingNoteImgs.map(i => i.id));
      const noteImgToImport = [];
      for (const meta of noteImgMeta) {
        if (!meta || !meta.id) continue;
        if (existingNoteImgIds.has(meta.id)) continue;
        const fileData = unzipped[meta.filename];
        if (!fileData) continue;
        noteImgToImport.push({ meta, fileData });
      }

      const wpMeta = [];
      if (unzipped['wallpapers/meta.json']) {
        try {
          const arr = JSON.parse(fflate.strFromU8(unzipped['wallpapers/meta.json']));
          if (Array.isArray(arr)) wpMeta.push(...arr);
        } catch (e) {}
      }
      const existingWps = await bgDB.getAllWallpapers();
      const existingWpIds = new Set(filterWallpapersByOwner(existingWps).map(w => w.id));
      if (overwrite) {
        const userWps = filterWallpapersByOwner(existingWps);
        for (const wp of userWps) {
          try { await bgDB.deleteWallpaper(wp.id); } catch (e) {}
        }
      }
      const wpToImport = [];
      for (const meta of wpMeta) {
        if (!meta || !meta.id) continue;
        if (!overwrite && existingWpIds.has(meta.id)) continue;
        const fileData = unzipped[meta.filename];
        if (!fileData) continue;
        wpToImport.push({ meta, fileData });
      }

      const totalSteps = bgToImport.length + noteImgToImport.length + wpToImport.length;
      const useProgress = totalSteps >= 2;
      if (useProgress) {
        M.showProgress('正在导入 ZIP...');
        M.updateProgress(0, totalSteps);
        await M.yieldToUI();
      }
      let currentStep = 0;

      for (const item of bgToImport) {
        try {
          if (item.kind === 'url') {
            const entry = item.entry;
            await bgDB.add({
              id: entry.id, type: 'url', data: entry.data,
              thumbnail: thumbMap[entry.id] || null,
              createdAt: entry.createdAt || Date.now(),
              owner: state.currentUser
            });
          } else {
            const dataUrl = binToDataUrl(item.entry.data, item.ext);
            await bgDB.add({
              id: item.id, type: 'file', data: dataUrl,
              thumbnail: thumbMap[item.id] || null,
              createdAt: Date.now(),
              owner: state.currentUser
            });
          }
        } catch (e) { console.warn('背景图导入失败', e); }
        currentStep++;
        if (useProgress) { M.updateProgress(currentStep, totalSteps); await M.yieldToUI(); }
      }

      for (const item of noteImgToImport) {
        const meta = item.meta;
        const ext = extFromMime(meta.type);
        const dataUrl = binToDataUrl(item.fileData, ext, meta.type);
        try {
          await bgDB.addNoteImage({
            id: meta.id, name: meta.name, type: meta.type, data: dataUrl,
            createdAt: meta.createdAt || Date.now(),
            owner: state.currentUser
          });
        } catch (e) {}
        currentStep++;
        if (useProgress) { M.updateProgress(currentStep, totalSteps); await M.yieldToUI(); }
      }

      for (const item of wpToImport) {
        const meta = item.meta;
        const blob = new Blob([item.fileData], { type: meta.type || 'video/mp4' });
        await bgDB.addWallpaper({
          id: meta.id, name: meta.name, type: meta.type,
          size: meta.size || blob.size, thumbnail: meta.thumbnail,
          data: blob, createdAt: meta.createdAt || Date.now(),
          owner: state.currentUser
        });
        currentStep++;
        if (useProgress) { M.updateProgress(currentStep, totalSteps); await M.yieldToUI(); }
      }

      M.sortNotes();
      state.activeNoteId = state.notes.length > 0 ? state.notes[0].id : null;
      M.saveNotesToStorage();
      M.saveSettingsToStorage();
      if (window.MobileApp.applySettings) window.MobileApp.applySettings();
      M.renderNoteList();
      M.renderEditorForActiveNote();
      if (window.MobileMedia && window.MobileMedia.renderAvatar) window.MobileMedia.renderAvatar();

      if (useProgress) M.hideProgress();
      await showAlert('导入完成！', { title: '成功' });
    } catch (err) {
      M.hideProgress();
      console.error(err);
      await showAlert('导入 ZIP 失败：' + (err.message || '未知错误'));
    }
  }

  window.MobileZip = { exportZip, importZip };
  console.log('[app-zip] loaded');
})();