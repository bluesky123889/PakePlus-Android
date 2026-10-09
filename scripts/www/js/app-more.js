/**
 * mobile/js/app-more.js
 * 更多菜单 / 设置 / 回收站 / 操作说明 / 关于
 * 依赖：app.js 暴露的 window.MobileApp
 */
(function () {
  'use strict';

  const M = window.MobileApp;
  if (!M) { console.error('[app-more] MobileApp 未初始化'); return; }

  const { state, $, showToast, showAlert, showConfirm, openDialog } = M;
  const { generateId, formatTime, hashPassword } = window.Utils;
  const { bgDB, getUsers, saveUsers } = window.DB;

  const sheetOverlay = $('sheetOverlay');
  const sheetTitle = $('sheetTitle');
  const sheetBody = $('sheetBody');
  const sheetCloseBtn = $('sheetCloseBtn');

  function openSheet(title, contentEl, options = {}) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = '';
    sheetBody.appendChild(contentEl);
    sheetOverlay.classList.add('show');
    sheetOverlay._onClose = options.onClose || null;
  }

  function closeSheet() {
    sheetOverlay.classList.remove('show');
    if (sheetOverlay._onClose) {
      const cb = sheetOverlay._onClose;
      sheetOverlay._onClose = null;
      setTimeout(cb, 260);
    }
  }

  sheetCloseBtn.addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', (e) => {
    if (e.target === sheetOverlay) closeSheet();
  });

  function makeSheetItem({ icon, label, hint, danger, onClick }) {
    const btn = document.createElement('button');
    btn.className = 'm-sheet-item' + (danger ? ' danger' : '');
    if (icon) {
      const ic = document.createElement('span');
      ic.className = 'm-sheet-item-icon';
      ic.innerHTML = icon;
      btn.appendChild(ic);
    }
    const lb = document.createElement('span');
    lb.className = 'm-sheet-item-label';
    lb.textContent = label;
    btn.appendChild(lb);
    if (hint) {
      const ht = document.createElement('span');
      ht.className = 'm-sheet-item-hint';
      ht.textContent = hint;
      btn.appendChild(ht);
    }
    btn.addEventListener('click', () => onClick());
    return btn;
  }

  const ICONS = {
    pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    work: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    fun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    other: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    export: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
  };

  function openNoteSheet(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    M.setActiveNote(noteId);

    const frag = document.createDocumentFragment();
    frag.appendChild(makeSheetItem({
      icon: ICONS.pin,
      label: note.pinned ? '取消置顶' : '置顶',
      onClick: () => {
        note.pinned = !note.pinned;
        M.sortNotes();
        M.saveNotesToStorage();
        M.renderNoteList();
        closeSheet();
        showToast(note.pinned ? '已置顶' : '已取消置顶');
      }
    }));

    const div = document.createElement('div');
    div.className = 'm-sheet-divider';
    frag.appendChild(div);

    const groupTitle = document.createElement('div');
    groupTitle.className = 'm-sheet-group-title';
    groupTitle.textContent = '分类';
    frag.appendChild(groupTitle);

    [
      { key: 'work', label: '工作', icon: ICONS.work },
      { key: 'fun', label: '娱乐', icon: ICONS.fun },
      { key: 'other', label: '其他', icon: ICONS.other }
    ].forEach(c => {
      frag.appendChild(makeSheetItem({
        icon: c.icon,
        label: c.label,
        hint: (note.category || 'other') === c.key ? '当前' : '',
        onClick: () => {
          note.category = c.key;
          note.updatedAt = Date.now();
          M.sortNotes();
          M.saveNotesToStorage();
          M.renderNoteList();
          closeSheet();
          showToast(`已改为「${c.label}」`);
        }
      }));
    });

    const div2 = document.createElement('div');
    div2.className = 'm-sheet-divider';
    frag.appendChild(div2);

    frag.appendChild(makeSheetItem({
      icon: ICONS.export,
      label: '导出 .md',
      onClick: () => { closeSheet(); exportNoteAsMarkdown(noteId); }
    }));

    frag.appendChild(makeSheetItem({
      icon: ICONS.trash,
      label: '删除',
      danger: true,
      onClick: async () => {
        closeSheet();
        const ok = await showConfirm(`确定删除「${note.title || '无标题笔记'}」吗？`, {
          confirmText: '删除', danger: true
        });
        if (!ok) return;
        note.deleted = true;
        note.deletedAt = Date.now();
        const visible = state.notes.filter(n => !n.deleted);
        state.activeNoteId = visible.length > 0 ? visible[0].id : null;
        M.sortNotes();
        M.saveNotesToStorage();
        M.renderNoteList();
        M.closeEditor();
        showToast('已移到回收站');
      }
    }));

    openSheet('笔记操作', frag);
  }

  async function exportNoteAsMarkdown(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) { showToast('笔记不存在'); return; }
    const title = (note.title || '无标题笔记').trim() || '无标题笔记';
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const md = `# ${title}\n\n${note.content || ''}\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const filename = `${safeTitle}.md`;

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'text/markdown' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: safeTitle }); return; }
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
  }

  function openTrash() {
    const frag = document.createDocumentFragment();

    function refresh() {
      frag.innerHTML = '';
      const deleted = state.notes
        .filter(n => n.deleted)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

      if (deleted.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'm-sheet-empty';
        empty.textContent = '回收站是空的';
        frag.appendChild(empty);
      } else {
        deleted.forEach(note => {
          const item = document.createElement('div');
          item.className = 'm-trash-item';

          const info = document.createElement('div');
          info.className = 'm-trash-info';

          const t = document.createElement('div');
          t.className = 'm-trash-title';
          t.textContent = note.title || '无标题笔记';
          info.appendChild(t);

          const meta = document.createElement('div');
          meta.className = 'm-trash-meta';
          const days = state.settings.trashRetentionDays || 30;
          const deletedAt = note.deletedAt || note.updatedAt;
          const expiresAt = deletedAt + days * 24 * 60 * 60 * 1000;
          const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
          meta.textContent = `删除于 ${formatTime(deletedAt)} · ${daysLeft > 0 ? '剩余 ' + daysLeft + ' 天' : '即将清理'}`;
          info.appendChild(meta);
          item.appendChild(info);

          const actions = document.createElement('div');
          actions.className = 'm-trash-actions';

          const restore = document.createElement('button');
          restore.className = 'restore';
          restore.textContent = '恢复';
          restore.addEventListener('click', () => {
            note.deleted = false;
            delete note.deletedAt;
            note.updatedAt = Date.now();
            M.sortNotes();
            M.saveNotesToStorage();
            M.renderNoteList();
            refresh();
            showToast('已恢复');
          });
          actions.appendChild(restore);

          const del = document.createElement('button');
          del.className = 'delete-forever';
          del.textContent = '彻底删除';
          del.addEventListener('click', async () => {
            const ok = await showConfirm(`彻底删除「${note.title || '无标题笔记'}」？\n\n此操作不可恢复。`, {
              confirmText: '彻底删除', danger: true
            });
            if (!ok) return;
            const idx = state.notes.findIndex(n => n.id === note.id);
            if (idx !== -1) state.notes.splice(idx, 1);
            if (state.activeNoteId === note.id) {
              const visible = state.notes.filter(n => !n.deleted);
              state.activeNoteId = visible.length > 0 ? visible[0].id : null;
            }
            M.sortNotes();
            M.saveNotesToStorage();
            M.renderNoteList();
            M.renderEditorForActiveNote();
            refresh();
            showToast('已彻底删除');
          });
          actions.appendChild(del);
          item.appendChild(actions);
          frag.appendChild(item);
        });
      }

      const footer = document.createElement('div');
      footer.className = 'm-sheet-footer';
      const emptyBtn = document.createElement('button');
      emptyBtn.textContent = '清空回收站';
      emptyBtn.addEventListener('click', async () => {
        const deleted = state.notes.filter(n => n.deleted);
        if (deleted.length === 0) { showToast('回收站已经是空的'); return; }
        const ok = await showConfirm(`确定清空回收站吗？\n\n${deleted.length} 篇笔记将被永久删除。`, {
          confirmText: '清空', danger: true
        });
        if (!ok) return;
        state.notes = state.notes.filter(n => !n.deleted);
        if (state.activeNoteId && !state.notes.some(n => n.id === state.activeNoteId)) {
          state.activeNoteId = state.notes.length > 0 ? state.notes[0].id : null;
        }
        M.sortNotes();
        M.saveNotesToStorage();
        M.renderNoteList();
        M.renderEditorForActiveNote();
        refresh();
        showToast('回收站已清空');
      });
      footer.appendChild(emptyBtn);
      frag.appendChild(footer);
    }

    refresh();
    openSheet('回收站', frag, { onClose: () => M.renderNoteList() });
  }

  // ==================== 设置 ====================
  const settingsPage = $('settingsPage');

  function openSettings() {
    syncSettingsUI();
    settingsPage.classList.add('show');
  }
  function closeSettings() {
    settingsPage.classList.remove('show');
  }

  function syncSettingsUI() {
    const s = state.settings;
    $('setDarkMode').classList.toggle('on', !!s.darkMode);
    $('setAnimation').classList.toggle('on', s.animationEnabled !== false);
    $('setFontSize').value = s.fontSize || 'medium';
    $('setBlur').value = s.blur || 0;
    $('setDefaultPreview').value = s.defaultPreview ? 'preview' : 'edit';
    $('setSortBy').value = s.sortBy || 'updatedAt';
    $('setTrashRetention').value = String(s.trashRetentionDays || 30);
    $('setMainWallpaper').classList.toggle('on', !!s.mainWallpaperEnabled);
    $('setAccountName').textContent = state.currentUser || '-';

    const users = getUsers();
    const info = users[state.currentUser];
    const status = $('setNoteLockPwdStatus');
    if (info && info.noteLockPassword) {
      status.textContent = '已设置';
      status.classList.add('set');
    } else {
      status.textContent = '未设置';
      status.classList.remove('set');
    }
  }

  function applySettings() {
    const s = state.settings;
    document.body.classList.toggle('dark-mode', !!s.darkMode);
    if (s.animationEnabled === false) document.body.classList.add('no-animation');
    else document.body.classList.remove('no-animation');

    let noteSize = '1rem';
    if (s.fontSize === 'small') noteSize = '0.9rem';
    else if (s.fontSize === 'large') noteSize = '1.15rem';
    document.documentElement.style.setProperty('--m-note-font-size', noteSize);

    const blurPx = (s.blur || 0) / 100 * 24;
    document.querySelectorAll('.m-page').forEach(p => {
      p.style.backdropFilter = `blur(${blurPx}px)`;
      p.style.webkitBackdropFilter = `blur(${blurPx}px)`;
    });
  }

  $('setDarkMode').addEventListener('click', () => {
    state.settings.darkMode = !state.settings.darkMode;
    $('setDarkMode').classList.toggle('on', state.settings.darkMode);
    M.saveSettingsToStorage();
    applySettings();
  });
  $('setAnimation').addEventListener('click', () => {
    state.settings.animationEnabled = state.settings.animationEnabled === false;
    $('setAnimation').classList.toggle('on', state.settings.animationEnabled);
    M.saveSettingsToStorage();
    applySettings();
  });
  $('setFontSize').addEventListener('change', (e) => {
    state.settings.fontSize = e.target.value;
    M.saveSettingsToStorage();
    applySettings();
  });
  $('setBlur').addEventListener('input', (e) => {
    state.settings.blur = parseInt(e.target.value) || 0;
    M.saveSettingsToStorage();
    applySettings();
  });
  $('setDefaultPreview').addEventListener('change', (e) => {
    state.settings.defaultPreview = e.target.value === 'preview';
    M.saveSettingsToStorage();
  });
  $('setSortBy').addEventListener('change', (e) => {
    state.settings.sortBy = e.target.value;
    M.saveSettingsToStorage();
    M.sortNotes();
    M.renderNoteList();
  });
  $('setTrashRetention').addEventListener('change', (e) => {
    state.settings.trashRetentionDays = parseInt(e.target.value) || 30;
    M.saveSettingsToStorage();
    showToast(`回收站保留 ${state.settings.trashRetentionDays} 天`);
  });

  $('setMainWallpaper').addEventListener('click', () => {
    state.settings.mainWallpaperEnabled = !state.settings.mainWallpaperEnabled;
    $('setMainWallpaper').classList.toggle('on', state.settings.mainWallpaperEnabled);
    M.saveSettingsToStorage();
    M.syncWallpaperVisibility();
  });
  $('setWallpaperEntry').addEventListener('click', () => {
    if (window.MobileMedia && window.MobileMedia.openWallpaperManager) {
      window.MobileMedia.openWallpaperManager();
    }
  });
  $('setBgEntry').addEventListener('click', () => {
    if (window.MobileMedia && window.MobileMedia.openBgManager) {
      window.MobileMedia.openBgManager();
    }
  });

  $('setNoteLockPwd').addEventListener('click', openSetNoteLockPasswordDialog);
  $('setViewNoteLockPwd').addEventListener('click', openViewNoteLockPasswordDialog);

  $('setExportJson').addEventListener('click', exportNotesJson);
  $('setExportZip').addEventListener('click', () => {
    if (window.MobileZip && window.MobileZip.exportZip) window.MobileZip.exportZip();
  });
  $('setImportJson').addEventListener('click', () => $('importJsonInput').click());
  $('setImportZip').addEventListener('click', () => $('importZipInput').click());
  $('setClearNotes').addEventListener('click', async () => {
    const ok1 = await showConfirm('确定要清空所有笔记吗？此操作不可恢复！', { confirmText: '继续', danger: true });
    if (!ok1) return;
    const ok2 = await showConfirm('再次确认：所有笔记将被永久删除。', { confirmText: '删除全部', danger: true });
    if (!ok2) return;
    state.notes = [];
    state.activeNoteId = null;
    M.saveNotesToStorage();
    M.renderNoteList();
    M.renderEditorForActiveNote();
    showToast('所有笔记已清空');
  });

  $('importJsonInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        if (!Array.isArray(raw)) { showAlert('文件格式不正确'); return; }
        const imported = raw.filter(item => item && typeof item === 'object').map(item => ({
          id: typeof item.id === 'string' && item.id ? item.id : generateId(),
          title: typeof item.title === 'string' ? item.title : '',
          content: typeof item.content === 'string' ? item.content : '',
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
          preview: !!item.preview,
          locked: !!item.locked,
          pinned: !!item.pinned,
          category: ['work','fun','other'].includes(item.category) ? item.category : 'other',
          deleted: !!item.deleted
        }));
        if (imported.length === 0) { showAlert('没有可导入的笔记'); return; }
        const overwrite = await showConfirm(
          `导入 ${imported.length} 篇笔记，覆盖现有笔记？`,
          { title: '导入笔记', confirmText: '覆盖', cancelText: '追加' }
        );
        if (overwrite) {
          state.notes = imported;
        } else {
          const ids = new Set(state.notes.map(n => n.id));
          state.notes = state.notes.concat(imported.filter(n => !ids.has(n.id)));
        }
        M.sortNotes();
        state.activeNoteId = state.notes[0]?.id || null;
        M.saveNotesToStorage();
        M.renderNoteList();
        M.renderEditorForActiveNote();
        showAlert('导入完成！');
      } catch (err) {
        showAlert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  });

  $('importZipInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (window.MobileZip && window.MobileZip.importZip) {
      window.MobileZip.importZip(file);
    }
  });

  $('setChangePwd').addEventListener('click', showChangePasswordDialog);
  $('setViewRecovery').addEventListener('click', showViewRecoveryDialog);
  $('setLogout').addEventListener('click', () => {
    closeSettings();
    setTimeout(() => M.logout(), 260);
  });
  $('setDeleteAccount').addEventListener('click', showDeleteAccountDialog);
  $('settingsBackBtn').addEventListener('click', closeSettings);

  // 头像
  const setAvatar = $('setAvatar');
  if (setAvatar) {
    setAvatar.addEventListener('click', () => {
      $('avatarFileInput').click();
    });
  }

  function openSetNoteLockPasswordDialog() {
    const users = getUsers();
    const existing = users[state.currentUser] && users[state.currentUser].noteLockPassword;
    const hasExisting = !!existing;

    const html = `
      ${hasExisting ? `
      <div class="m-dialog-field">
        <label>当前笔记锁密码</label>
        <input type="password" id="mNlpOld" placeholder="当前笔记锁密码">
      </div>` : ''}
      <div class="m-dialog-field">
        <label>新笔记锁密码</label>
        <input type="password" id="mNlpNew" placeholder="新笔记锁密码">
      </div>
      <div class="m-dialog-field">
        <label>确认新笔记锁密码</label>
        <input type="password" id="mNlpConfirm" placeholder="再次输入">
      </div>
    `;
    openDialog({
      title: hasExisting ? '修改笔记锁密码' : '设置笔记锁密码',
      message: '',
      customHTML: html,
      buttons: [
        { text: '取消', type: 'cancel', value: null },
        { text: '确认', type: 'confirm', value: 'submit' }
      ]
    }).then(async (val) => {
      if (val !== 'submit') return;
      if (hasExisting) {
        const oldPwd = document.getElementById('mNlpOld').value;
        if (!oldPwd) { await showAlert('请输入当前笔记锁密码'); return; }
        if (oldPwd !== existing) { await showAlert('当前笔记锁密码不正确'); return; }
      }
      const newPwd = document.getElementById('mNlpNew').value;
      const confirmPwd = document.getElementById('mNlpConfirm').value;
      if (!newPwd) { await showAlert('请输入新笔记锁密码'); return; }
      if (newPwd !== confirmPwd) { await showAlert('两次输入不一致'); return; }

      const users2 = getUsers();
      if (!users2[state.currentUser]) return;
      users2[state.currentUser].noteLockPassword = newPwd;
      saveUsers(users2);
      syncSettingsUI();
      showAlert(hasExisting ? '笔记锁密码已修改' : '笔记锁密码已设置');
    });
  }

  function openViewNoteLockPasswordDialog() {
    const users = getUsers();
    const info = users[state.currentUser];
    if (!info || !info.noteLockPassword) { showAlert('尚未设置笔记锁密码'); return; }
    const html = `
      <div class="m-dialog-field">
        <label>请输入登录密码验证身份</label>
        <input type="password" id="mVnpLogin" placeholder="登录密码">
      </div>
    `;
    openDialog({
      title: '查看笔记锁密码',
      message: '',
      customHTML: html,
      buttons: [
        { text: '取消', type: 'cancel', value: null },
        { text: '验证', type: 'confirm', value: 'verify' }
      ]
    }).then(async (val) => {
      if (val !== 'verify') return;
      const pwd = document.getElementById('mVnpLogin').value;
      const users2 = getUsers();
      const info2 = users2[state.currentUser];
      if (!info2 || hashPassword(pwd) !== info2.password) {
        await showAlert('登录密码不正确');
        return;
      }
      showKeyDialog('你的笔记锁密码', info2.noteLockPassword);
    });
  }

  function showKeyDialog(title, key) {
    const html = `
      <div class="m-dialog-key-box">
        <div class="m-dialog-key-text" id="mKeyText">${key}</div>
        <button class="m-dialog-key-copy" id="mKeyCopy">复制</button>
      </div>
    `;
    openDialog({
      title,
      message: '',
      customHTML: html,
      buttons: [{ text: '关闭', type: 'confirm', value: true }]
    });
    setTimeout(() => {
      const copyBtn = document.getElementById('mKeyCopy');
      const textEl = document.getElementById('mKeyText');
      if (copyBtn && textEl) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(textEl.textContent);
            copyBtn.textContent = '已复制';
            setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
          } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = textEl.textContent;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
        });
      }
    }, 50);
  }

  async function exportNotesJson() {
    const data = JSON.stringify(state.notes, null, 2);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const filename = `灵羽笔记-${state.currentUser}-${dateStr}.json`;
    const blob = new Blob([data], { type: 'application/json' });

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/json' });
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
  }

  function showChangePasswordDialog() {
    const html = `
      <div class="m-dialog-field"><label>旧密码</label><input type="password" id="mCpOld"></div>
      <div class="m-dialog-field"><label>新密码</label><input type="password" id="mCpNew"></div>
      <div class="m-dialog-field"><label>确认新密码</label><input type="password" id="mCpConfirm"></div>
    `;
    openDialog({
      title: '修改密码',
      message: '',
      customHTML: html,
      buttons: [
        { text: '取消', type: 'cancel', value: null },
        { text: '确认修改', type: 'confirm', value: 'submit' }
      ]
    }).then(async (val) => {
      if (val !== 'submit') return;
      const oldPwd = document.getElementById('mCpOld').value;
      const newPwd = document.getElementById('mCpNew').value;
      const confirmPwd = document.getElementById('mCpConfirm').value;
      if (!oldPwd) { await showAlert('请输入旧密码'); return; }
      if (!newPwd) { await showAlert('请输入新密码'); return; }
      if (newPwd !== confirmPwd) { await showAlert('两次输入不一致'); return; }
      const users = getUsers();
      if (!users[state.currentUser]) { await showAlert('用户不存在'); return; }
      if (users[state.currentUser].password !== hashPassword(oldPwd)) {
        await showAlert('旧密码错误');
        return;
      }
      users[state.currentUser].password = hashPassword(newPwd);
      saveUsers(users);
      await showAlert('密码已修改');
    });
  }

  function showViewRecoveryDialog() {
    const users = getUsers();
    const info = users[state.currentUser];
    if (!info || !info.recoveryKey) { showAlert('未找到恢复密钥'); return; }
    showKeyDialog('你的恢复密钥', info.recoveryKey);
  }

  function showDeleteAccountDialog() {
    const html = `
      <div class="m-dialog-field">
        <label>请输入用户名 <strong style="color:#ff8a9a;">${state.currentUser}</strong> 以确认</label>
        <input type="text" id="mDaConfirm" placeholder="输入用户名" autocomplete="off">
      </div>
    `;
    openDialog({
      title: '确认注销账号',
      message: '',
      customHTML: html,
      buttons: [
        { text: '取消', type: 'cancel', value: null },
        { text: '确认注销', type: 'confirm', value: 'submit', danger: true }
      ]
    }).then(async (val) => {
      if (val !== 'submit') return;
      const input = document.getElementById('mDaConfirm').value.trim();
      if (input !== state.currentUser) { await showAlert('用户名不正确'); return; }

      const ok1 = await showConfirm(
        '账号下所有笔记、设置、背景、壁纸都将被永久删除。\n\n此操作不可恢复！',
        { title: '确认注销', confirmText: '继续', danger: true }
      );
      if (!ok1) return;

      const username = state.currentUser;
      try {
        window.DB.removeUserData(username);
        localStorage.removeItem('lingyu_current_user');
      } catch (e) {}

      const users = getUsers();
      delete users[username];
      saveUsers(users);

      try {
        const allBgs = await bgDB.getAll();
        for (const bg of allBgs.filter(i => i.owner === username)) await bgDB.delete(bg.id);
        const allWps = await bgDB.getAllWallpapers();
        for (const wp of allWps.filter(i => i.owner === username)) await bgDB.deleteWallpaper(wp.id);
        const allImgs = await bgDB.getAllNoteImages();
        for (const img of allImgs.filter(i => i.owner === username)) await bgDB.deleteNoteImage(img.id);
      } catch (e) { console.warn('清理用户资源失败', e); }

      closeSettings();
      state.currentUser = null;
      state.notes = [];
      state.activeNoteId = null;
      document.getElementById('appContainer').classList.remove('visible');
      setTimeout(() => {
        document.getElementById('appContainer').classList.add('hidden-app');
        location.reload();
      }, 400);
    });
  }

  function openForgotPasswordDialog() {
    const prefilled = document.getElementById('loginUsername').value.trim();
    const html = `
      <div class="m-dialog-field">
        <label>用户名</label>
        <input type="text" id="mFpUser" value="${prefilled}" placeholder="用户名" autocapitalize="off">
      </div>
      <div class="m-dialog-field">
        <label>恢复密钥</label>
        <input type="text" id="mFpKey" placeholder="A7K-9F2-MXP-4WT" autocapitalize="characters">
      </div>
      <div class="m-dialog-field">
        <label>新密码</label>
        <input type="password" id="mFpNew">
      </div>
    `;
    openDialog({
      title: '重置密码',
      message: '',
      customHTML: html,
      buttons: [
        { text: '取消', type: 'cancel', value: null },
        { text: '确认重置', type: 'confirm', value: 'submit' }
      ]
    }).then(async (val) => {
      if (val !== 'submit') return;
      const u = document.getElementById('mFpUser').value.trim();
      const k = document.getElementById('mFpKey').value.trim().toUpperCase();
      const p = document.getElementById('mFpNew').value;
      if (!u) { await showAlert('请输入用户名'); return; }
      if (!k) { await showAlert('请输入恢复密钥'); return; }
      if (!p) { await showAlert('请输入新密码'); return; }
      const users = getUsers();
      if (!users[u]) { await showAlert('用户不存在'); return; }
      if (!users[u].recoveryKey || users[u].recoveryKey !== k) {
        await showAlert('恢复密钥不正确');
        return;
      }
      users[u].password = hashPassword(p);
      saveUsers(users);
      document.getElementById('loginUsername').value = u;
      document.getElementById('loginPassword').value = p;
      await showAlert('密码已重置，请重新登录');
    });
  }

  function openShortcuts() {
    const frag = document.createDocumentFragment();
    [
      ['列表 · 轻触笔记', '打开笔记'],
      ['列表 · 长按笔记', '打开操作菜单'],
      ['列表 · 右上角 +', '新建笔记'],
      ['编辑器 · 底部按钮', '预览 / 锁定 / 保存 / 删除'],
      ['编辑器 · 右上角 ⋯', '更多操作'],
      ['编辑器 · 底部快捷栏', '插入 Markdown 语法'],
      ['侧边抽屉 · 左上角', '设置 / 回收站 / 关于']
    ].forEach(([k, v]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.88rem;';
      const kEl = document.createElement('span');
      kEl.style.color = 'rgba(255,255,255,0.85)';
      kEl.textContent = k;
      const vEl = document.createElement('span');
      vEl.style.color = 'rgba(255,255,255,0.55)';
      vEl.textContent = v;
      row.appendChild(kEl);
      row.appendChild(vEl);
      frag.appendChild(row);
    });
    openSheet('操作说明', frag);
  }

  function openAbout() {
    const frag = document.createDocumentFragment();
    const div = document.createElement('div');
    div.style.cssText = 'padding:20px;text-align:center;line-height:1.8;color:rgba(255,255,255,0.8);font-size:0.88rem;';
    div.innerHTML = `
      <div style="font-size:2.4rem;margin-bottom:8px;">✨</div>
      <div style="font-size:1.2rem;font-weight:700;color:#e0d4ff;margin-bottom:4px;">灵羽笔记</div>
      <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-bottom:16px;">移动版 1.0.0</div>
      <div style="margin-bottom:16px;">一个完全在本地运行的笔记应用。<br>数据只保存在你的设备上。</div>
      <div style="text-align:left;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 18px;font-size:0.82rem;">
        <div style="font-weight:600;margin-bottom:6px;">主要功能</div>
        · Markdown 笔记与实时预览<br>
        · 多用户、独立设置、笔记锁<br>
        · 动态壁纸与毛玻璃背景<br>
        · JSON / ZIP 导入导出
      </div>
      <div style="margin-top:16px;font-size:0.72rem;color:rgba(255,255,255,0.4);">© 2026 灵羽笔记</div>
    `;
    frag.appendChild(div);
    openSheet('关于', frag);
  }

  // 暴露
  window.MobileApp.openNoteSheet = openNoteSheet;
  window.MobileApp.openTrash = openTrash;
  window.MobileApp.openSettings = openSettings;
  window.MobileApp.openShortcuts = openShortcuts;
  window.MobileApp.openAbout = openAbout;
  window.MobileApp.openForgotPasswordDialog = openForgotPasswordDialog;
  window.MobileApp.applySettings = applySettings;
  window.MobileApp.syncSettingsUI = syncSettingsUI;

  applySettings();
  console.log('[app-more] loaded');
})();