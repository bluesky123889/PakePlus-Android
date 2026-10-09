/**
 * mobile/js/app.js
 * 移动端主逻辑：启动、登录、列表、编辑器、锁定、抽屉、Markdown 工具栏
 */
(function () {
  'use strict';

  const REMEMBER_KEY = 'lingyu_remember';
  const CURRENT_USER_KEY = 'lingyu_current_user';
  const CURRENT_WALLPAPER_KEY = 'lingyu_current_wallpaper';

  const {
    generateId, formatTime,
    hashPassword, isValidUsername, generateRecoveryKey,
    renderMarkdown
  } = window.Utils;

  const { bgDB, getUsers, saveUsers } = window.DB;

  const state = {
    notes: [],
    activeNoteId: null,
    searchKeyword: '',
    activeCategory: 'all',
    currentUser: null,
    currentWallpaperId: null,
    settings: window.DB.defaultSettings(),
    mainVideoObjectUrl: null
  };

  const $ = (id) => document.getElementById(id);

  const splashScreen = $('splashScreen');
  const splashLastUser = $('splashLastUser');
  const appContainer = $('appContainer');
  const loginOverlay = $('loginOverlay');
  const loginUsername = $('loginUsername');
  const loginPassword = $('loginPassword');
  const loginRemember = $('loginRemember');
  const loginSubmitBtn = $('loginSubmitBtn');
  const loginSwitchText = $('loginSwitchText');
  const loginSwitchBtn = $('loginSwitchBtn');
  const loginForgotBtn = $('loginForgotBtn');
  const openDrawerBtn = $('openDrawerBtn');
  const newNoteBtn = $('newNoteBtn');
  const searchInput = $('searchInput');
  const categoryTabs = $('categoryTabs');
  const notesList = $('notesList');
  const backToListBtn = $('backToListBtn');
  const editorTopTitle = $('editorTopTitle');
  const moreBtn = $('moreBtn');
  const noteTitleInput = $('noteTitleInput');
  const noteContentInput = $('noteContentInput');
  const notePreview = $('notePreview');
  const lockOverlay = $('lockOverlay');
  const lockInput = $('lockInput');
  const lockUnlockBtn = $('lockUnlockBtn');
  const lockError = $('lockError');
  const mdBar = $('mdBar');
  const toggleModeBtn = $('toggleModeBtn');
  const lockBtn = $('lockBtn');
  const saveBtn = $('saveBtn');
  const deleteNoteBtn = $('deleteNoteBtn');
  const drawer = $('drawer');
  const drawerMask = $('drawerMask');
  const drawerSettingsBtn = $('drawerSettingsBtn');
  const drawerTrashBtn = $('drawerTrashBtn');
  const drawerShortcutsBtn = $('drawerShortcutsBtn');
  const drawerAboutBtn = $('drawerAboutBtn');
  const drawerUser = $('drawerUser');
  const logoutBtn = $('logoutBtn');
  const bgLayer = $('bgLayer');
  const mainWallpaperVideo = $('mainWallpaperVideo');

  function showToast(message) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'm-toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 220);
    }, 1800);
  }

  function openDialog({ title = '提示', message = '', buttons = [], customHTML = '' }) {
    return new Promise((resolve) => {
      const dialogOverlay = $('dialogOverlay');
      const dialogTitle = $('dialogTitle');
      const dialogMessage = $('dialogMessage');
      const dialogCustom = $('dialogCustom');
      const dialogButtons = $('dialogButtons');

      dialogTitle.textContent = title;
      dialogMessage.textContent = message;
      dialogCustom.innerHTML = customHTML;
      dialogButtons.innerHTML = '';

      buttons.forEach((btn) => {
        const el = document.createElement('button');
        el.className = 'm-dialog-btn ' + (btn.type || 'cancel');
        if (btn.danger) el.classList.add('danger');
        el.textContent = btn.text;
        el.addEventListener('click', () => {
          closeDialog();
          resolve(btn.value);
        });
        dialogButtons.appendChild(el);
      });

      dialogOverlay.classList.add('show');
    });
  }

  function closeDialog() {
    $('dialogOverlay').classList.remove('show');
  }

  function showAlert(message, { title = '提示', confirmText = '知道了' } = {}) {
    return openDialog({
      title,
      message,
      buttons: [{ text: confirmText, type: 'confirm', value: true }]
    });
  }

  function showConfirm(message, { title = '确认', confirmText = '确定', cancelText = '取消', danger = false } = {}) {
    return openDialog({
      title,
      message,
      buttons: [
        { text: cancelText, type: 'cancel', value: false },
        { text: confirmText, type: 'confirm', value: true, danger }
      ]
    });
  }

  // ==================== 进度条 ====================
  let progressHideTimer = null;
  let progressResetTimer = null;

  function showProgress(title) {
    const overlay = $('progressOverlay');
    if (!overlay) return;
    if (progressHideTimer) { clearTimeout(progressHideTimer); progressHideTimer = null; }
    if (progressResetTimer) { clearTimeout(progressResetTimer); progressResetTimer = null; }
    $('progressTitle').textContent = title || '正在处理...';
    $('progressPercent').textContent = '0%';
    $('progressFill').style.width = '0%';
    overlay.classList.add('show');
  }

  function updateProgress(current, total) {
    if (total <= 0) return;
    const pct = Math.min(100, Math.round((current / total) * 100));
    $('progressFill').style.width = pct + '%';
    $('progressPercent').textContent = pct + '%';
  }

  function setProgressTitle(title) {
    $('progressTitle').textContent = title;
  }

  function hideProgress() {
    const overlay = $('progressOverlay');
    if (!overlay) return;
    $('progressFill').style.width = '100%';
    $('progressPercent').textContent = '100%';
    progressHideTimer = setTimeout(() => {
      overlay.classList.remove('show');
      progressHideTimer = null;
      progressResetTimer = setTimeout(() => {
        $('progressFill').style.width = '0%';
        $('progressPercent').textContent = '0%';
        progressResetTimer = null;
      }, 200);
    }, 150);
  }

  function yieldToUI() {
    return new Promise(r => requestAnimationFrame(r));
  }

  // ==================== 启动屏 ====================
  let splashStarted = false;

  function initSplash() {
    if (!splashScreen) return;
    let lastUser = '';
    try { lastUser = localStorage.getItem('lingyu_last_username') || ''; } catch (e) {}
    if (lastUser && splashLastUser) {
      splashLastUser.textContent = `上次登录：${lastUser}`;
    }

    const start = () => {
      if (splashStarted) return;
      splashStarted = true;
      document.removeEventListener('touchstart', onTrigger);
      document.removeEventListener('click', onTrigger);
      document.removeEventListener('keydown', onTrigger);
      splashScreen.classList.add('hide');
      showLogin();
      setTimeout(() => {
        if (splashScreen.parentNode) splashScreen.parentNode.removeChild(splashScreen);
      }, 700);
    };
    const onTrigger = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      start();
    };
    document.addEventListener('touchstart', onTrigger, { passive: false });
    document.addEventListener('click', onTrigger);
    document.addEventListener('keydown', onTrigger);
  }

  // ==================== 壁纸 ====================
  async function loadWallpaperVideo(id) {
    if (!id) {
      if (state.mainVideoObjectUrl) {
        URL.revokeObjectURL(state.mainVideoObjectUrl);
        state.mainVideoObjectUrl = null;
      }
      mainWallpaperVideo.classList.remove('ready');
      mainWallpaperVideo.removeAttribute('src');
      mainWallpaperVideo.load();
      mainWallpaperVideo.dataset.loadedId = '';
      return;
    }
    if (String(id) === mainWallpaperVideo.dataset.loadedId && mainWallpaperVideo.src) {
      mainWallpaperVideo.play().catch(() => {});
      mainWallpaperVideo.classList.add('ready');
      return;
    }
    if (state.mainVideoObjectUrl) {
      URL.revokeObjectURL(state.mainVideoObjectUrl);
      state.mainVideoObjectUrl = null;
    }
    mainWallpaperVideo.classList.remove('ready');
    mainWallpaperVideo.removeAttribute('src');
    mainWallpaperVideo.load();
    mainWallpaperVideo.dataset.loadedId = '';

    try {
      const item = await bgDB.getWallpaper(id);
      if (!item || !item.data) return;
      state.mainVideoObjectUrl = URL.createObjectURL(item.data);
      mainWallpaperVideo.src = state.mainVideoObjectUrl;
      mainWallpaperVideo.load();
      const onLoaded = () => {
        mainWallpaperVideo.removeEventListener('loadeddata', onLoaded);
        mainWallpaperVideo.play().catch(() => {});
        requestAnimationFrame(() => {
          requestAnimationFrame(() => mainWallpaperVideo.classList.add('ready'));
        });
      };
      if (mainWallpaperVideo.readyState >= 2) onLoaded();
      else mainWallpaperVideo.addEventListener('loadeddata', onLoaded, { once: true });
      mainWallpaperVideo.dataset.loadedId = String(id);
    } catch (e) {
      console.warn('动态壁纸加载失败', e);
    }
  }

  async function applyBackground() {
    if (!state.settings.currentBgId) { bgLayer.style.backgroundImage = ''; return; }
    const item = await bgDB.get(state.settings.currentBgId);
    if (item && item.data && item.owner === state.currentUser) {
      bgLayer.style.backgroundImage = `url('${item.data}')`;
    } else {
      bgLayer.style.backgroundImage = '';
    }
  }

  function syncWallpaperVisibility() {
    const inMainApp = !!state.currentUser && appContainer.classList.contains('visible');
    const videoReady = mainWallpaperVideo.classList.contains('ready');
    let showVideo;
    if (!inMainApp) showVideo = videoReady;
    else showVideo = state.settings.mainWallpaperEnabled && videoReady;
    bgLayer.style.opacity = showVideo ? '0' : '1';
  }

  // ==================== 数据存取 ====================
  function saveNotesToStorage() {
    if (!state.currentUser) return;
    window.DB.saveNotes(state.currentUser, state.notes);
  }

  function saveSettingsToStorage() {
    if (!state.currentUser) return;
    window.DB.saveSettings(state.currentUser, state.settings);
  }

  function loadNotesFromStorage() {
    if (!state.currentUser) return;
    const stored = window.DB.loadNotes(state.currentUser);
    if (stored) {
      state.notes = stored;
      state.notes.forEach(n => {
        if (n.preview === undefined) n.preview = false;
        if (n.locked === undefined) n.locked = false;
        if (n.pinned === undefined) n.pinned = false;
        if (n.category === undefined) n.category = 'other';
        if (n.deleted === undefined) n.deleted = false;
      });
      sortNotes();
      if (state.notes.length > 0) {
        const visible = state.notes.filter(n => !n.deleted);
        if (!state.activeNoteId || !state.notes.some(n => n.id === state.activeNoteId)) {
          state.activeNoteId = visible.length > 0 ? visible[0].id : state.notes[0].id;
        }
      } else {
        state.activeNoteId = null;
      }
    } else {
      const now = Date.now();
      state.notes = [{
        id: generateId(),
        title: '欢迎使用灵羽笔记',
        content: '# 欢迎使用灵羽笔记\n\n这是一个完全在本地运行的笔记软件。\n\n## 主要功能\n\n- **自动保存**：所有更改都会保存到本地\n- *Markdown 语法*：支持标题、粗体、斜体、删除线、链接\n\n## 试试看\n\n1. 点击右下角「+」创建笔记\n2. 输入 **粗体** 或 *斜体* 文字\n3. 点击底部「预览」查看效果',
        createdAt: now - 3600000 * 5,
        updatedAt: now - 3600000 * 2,
        preview: false,
        locked: false,
        pinned: false,
        category: 'other',
        deleted: false
      }];
      sortNotes();
      state.activeNoteId = state.notes[0].id;
      saveNotesToStorage();
    }
  }

  function loadSettingsFromStorage() {
    if (!state.currentUser) { state.settings = window.DB.defaultSettings(); return; }
    state.settings = window.DB.loadSettings(state.currentUser);
  }

  function sortNotes() {
    const s = state.settings;
    const compareBase = (a, b) => {
      if (s.sortBy === 'updatedAt') return b.updatedAt - a.updatedAt;
      if (s.sortBy === 'createdAt') return b.createdAt - a.createdAt;
      if (s.sortBy === 'title') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
      return 0;
    };
    state.notes.sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return compareBase(a, b);
    });
  }

  // ==================== 笔记列表 ====================
  const CATEGORY_LABELS = { work: '工作', fun: '娱乐', other: '其他' };

  function renderNoteList() {
    const s = state;
    let filtered = s.notes.filter(n => !n.deleted);
    if (s.activeCategory !== 'all') {
      filtered = filtered.filter(n => (n.category || 'other') === s.activeCategory);
    }
    if (s.searchKeyword.trim()) {
      const kw = s.searchKeyword.trim().toLowerCase();
      filtered = filtered.filter(n =>
        (n.title || '').toLowerCase().includes(kw) ||
        (n.content || '').toLowerCase().includes(kw)
      );
    }

    notesList.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'm-list-empty';
      if (s.searchKeyword) empty.textContent = '没有匹配的笔记';
      else if (s.activeCategory !== 'all') empty.textContent = '这个分类下暂无笔记';
      else empty.textContent = '暂无笔记\n点击右上角「+」新建';
      notesList.appendChild(empty);
      return;
    }

    const pinned = filtered.filter(n => n.pinned);
    const normal = filtered.filter(n => !n.pinned);

    if (pinned.length > 0) {
      const label = document.createElement('div');
      label.className = 'm-note-group-label';
      label.textContent = '置顶';
      notesList.appendChild(label);
      pinned.forEach(n => notesList.appendChild(createNoteItemEl(n)));
    }
    if (pinned.length > 0 && normal.length > 0) {
      const label = document.createElement('div');
      label.className = 'm-note-group-label';
      label.textContent = '全部笔记';
      notesList.appendChild(label);
    }
    normal.forEach(n => notesList.appendChild(createNoteItemEl(n)));
  }

  function createNoteItemEl(note) {
    const el = document.createElement('div');
    el.className = 'm-note-item' + (note.pinned ? ' pinned' : '');
    el.dataset.noteId = note.id;

    const titleRow = document.createElement('div');
    titleRow.className = 'm-note-title';

    const pin = document.createElement('span');
    pin.className = 'm-note-pin';
    pin.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    titleRow.appendChild(pin);

    const titleText = document.createElement('span');
    titleText.className = 'm-note-title-text';
    titleText.textContent = note.title || '无标题笔记';
    titleRow.appendChild(titleText);
    el.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'm-note-meta';
    const time = document.createElement('span');
    time.textContent = formatTime(note.updatedAt);
    meta.appendChild(time);
    if (state.activeCategory === 'all') {
      const cat = note.category || 'other';
      const catEl = document.createElement('span');
      catEl.className = 'm-note-cat cat-' + cat;
      catEl.textContent = CATEGORY_LABELS[cat] || '其他';
      meta.appendChild(catEl);
    }
    el.appendChild(meta);

    let longPressTimer = null;
    let longPressed = false;
    el.addEventListener('touchstart', () => {
      longPressed = false;
      longPressTimer = setTimeout(() => {
        longPressed = true;
        if (window.MobileApp && window.MobileApp.openNoteSheet) {
          window.MobileApp.openNoteSheet(note.id);
        }
      }, 500);
    }, { passive: true });
    const cancel = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('click', (e) => {
      if (longPressed) { longPressed = false; e.preventDefault(); return; }
      setActiveNote(note.id);
      openEditor();
    });
    return el;
  }

  // ==================== 笔记操作 ====================
  function setActiveNote(noteId) {
    if (state.activeNoteId === noteId) return;
    if (state.activeNoteId && state.notes.some(n => n.id === state.activeNoteId)) {
      syncEditorToActiveNote();
    }
    state.activeNoteId = noteId;
    renderEditorForActiveNote();
    saveNotesToStorage();
  }

  function syncEditorToActiveNote() {
    if (!state.activeNoteId) return false;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note || note.locked) return false;
    const newTitle = noteTitleInput.value;
    const newContent = noteContentInput.value;
    if (note.title === newTitle && note.content === newContent) return false;
    note.title = newTitle;
    note.content = newContent;
    note.updatedAt = Date.now();
    sortNotes();
    saveNotesToStorage();
    return true;
  }

  function renderEditorForActiveNote() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    editorTopTitle.textContent = note.title || '笔记';
    noteTitleInput.value = note.title || '';
    noteContentInput.value = note.content || '';
    notePreview.innerHTML = renderMarkdown(note.content || '');
    if (window.MobileApp && window.MobileApp.loadNoteImages) {
      window.MobileApp.loadNoteImages(notePreview);
    }
    applyModeState();
    applyLockState();
  }

  function applyModeState() {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    const locked = !!note.locked;
    const preview = !!note.preview;
    if (!locked) {
      if (preview) {
        noteTitleInput.style.display = 'block';
        noteTitleInput.readOnly = true;
        noteContentInput.style.display = 'none';
        notePreview.style.display = 'block';
        toggleModeBtn.textContent = '编辑';
        mdBar.classList.remove('show');
      } else {
        noteTitleInput.style.display = 'block';
        noteTitleInput.readOnly = false;
        noteContentInput.style.display = 'block';
        notePreview.style.display = 'none';
        toggleModeBtn.textContent = '预览';
        mdBar.classList.add('show');
      }
    }
  }

  function applyLockState() {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    const locked = note ? !!note.locked : false;
    if (locked) {
      lockOverlay.classList.add('show');
      lockBtn.textContent = '已锁定';
      lockInput.value = '';
      lockError.textContent = '';
      mdBar.classList.remove('show');
      setTimeout(() => lockInput.focus(), 200);
    } else {
      lockOverlay.classList.remove('show');
      lockBtn.textContent = '锁定';
    }
  }

  function toggleEditPreviewMode() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    if (!note.preview) {
      syncEditorToActiveNote();
      const fresh = state.notes.find(n => n.id === state.activeNoteId);
      notePreview.innerHTML = renderMarkdown(fresh.content);
      if (window.MobileApp && window.MobileApp.loadNoteImages) {
        window.MobileApp.loadNoteImages(notePreview);
      }
      fresh.preview = true;
    } else {
      noteTitleInput.value = note.title;
      noteContentInput.value = note.content;
      note.preview = false;
    }
    saveNotesToStorage();
    applyModeState();
    updateEditorTopTitle();
  }

  function updateEditorTopTitle() {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (note) editorTopTitle.textContent = note.title || '笔记';
  }

  function saveActiveNote() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    if (note.locked) { showToast('笔记已锁定，无法保存'); return; }
    if (note.preview) { showToast('已保存'); return; }
    note.title = noteTitleInput.value;
    note.content = noteContentInput.value;
    note.updatedAt = Date.now();
    sortNotes();
    saveNotesToStorage();
    renderNoteList();
    updateEditorTopTitle();
    showToast('已保存');
  }

  function createNewNote() {
    if (state.activeNoteId) syncEditorToActiveNote();
    const now = Date.now();
    const newNote = {
      id: generateId(),
      title: '新笔记',
      content: '',
      createdAt: now,
      updatedAt: now,
      preview: false,
      locked: false,
      pinned: false,
      category: state.activeCategory === 'all' ? 'other' : state.activeCategory,
      deleted: false
    };
    state.notes.unshift(newNote);
    state.activeNoteId = newNote.id;
    state.searchKeyword = '';
    searchInput.value = '';
    sortNotes();
    saveNotesToStorage();
    renderNoteList();
    renderEditorForActiveNote();
    openEditor();
    setTimeout(() => {
      noteTitleInput.focus();
      noteTitleInput.select();
    }, 320);
  }

  function deleteCurrentNote() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    showConfirm(`确定删除「${note.title || '无标题笔记'}」吗？`, {
      confirmText: '删除', danger: true
    }).then((ok) => {
      if (!ok) return;
      note.deleted = true;
      note.deletedAt = Date.now();
      const visible = state.notes.filter(n => !n.deleted);
      state.activeNoteId = visible.length > 0 ? visible[0].id : null;
      sortNotes();
      saveNotesToStorage();
      renderNoteList();
      closeEditor();
      showToast('已移到回收站');
    });
  }

  function toggleLock() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    if (note.locked) { lockInput.focus(); return; }
    const users = getUsers();
    const info = users[state.currentUser];
    if (!info || !info.noteLockPassword) {
      showAlert('请先在「设置 → 安全」中设置笔记锁密码', { title: '未设置笔记锁密码' });
      return;
    }
    syncEditorToActiveNote();
    note.locked = true;
    saveNotesToStorage();
    applyLockState();
    showToast('已锁定');
  }

  function tryUnlock() {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;
    const input = lockInput.value.trim();
    if (!input) { lockError.textContent = '请输入笔记锁密码'; return; }
    const users = getUsers();
    const info = users[state.currentUser];
    if (!info || !info.noteLockPassword) { lockError.textContent = '未设置笔记锁密码'; return; }
    if (input !== info.noteLockPassword) {
      lockError.textContent = '笔记锁密码不正确';
      lockInput.select();
      return;
    }
    note.locked = false;
    saveNotesToStorage();
    lockError.textContent = '';
    lockInput.value = '';
    applyLockState();
    applyModeState();
    showToast('已解锁');
  }

  // ==================== Markdown 工具栏 ====================
  function insertAtCursor(text, offset) {
    const ta = noteContentInput;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    let prefix = '';
    if (start > 0 && ta.value[start - 1] !== '\n') prefix = '\n';
    const insertion = prefix + text;
    ta.value = ta.value.substring(0, start) + insertion + ta.value.substring(end);
    const pos = offset != null ? start + prefix.length + offset : start + insertion.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wrapSelection(prefix, suffix, placeholder) {
    const ta = noteContentInput;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    if (start === end) {
      const insertion = prefix + placeholder + suffix;
      ta.value = value.substring(0, start) + insertion + value.substring(end);
      const pos = start + prefix.length + placeholder.length;
      ta.setSelectionRange(pos, pos);
    } else {
      const selected = value.substring(start, end);
      ta.value = value.substring(0, start) + prefix + selected + suffix + value.substring(end);
      const pos = start + prefix.length + selected.length + suffix.length;
      ta.setSelectionRange(pos, pos);
    }
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handleMdAction(type) {
    if (isCurrentNoteLocked()) return;
    if (type === 'image') {
      const input = $('noteImageFileInput');
      if (input) input.click();
      return;
    }
    switch (type) {
      case 'h1': insertAtCursor('# ', 2); break;
      case 'h2': insertAtCursor('## ', 3); break;
      case 'bold': wrapSelection('**', '**', '粗体'); break;
      case 'italic': wrapSelection('*', '*', '斜体'); break;
      case 'strike': wrapSelection('~~', '~~', '删除线'); break;
      case 'ul': insertAtCursor('- ', 2); break;
      case 'ol': insertAtCursor('1. ', 3); break;
      case 'todo': insertAtCursor('- [ ] ', 6); break;
      case 'link':
        (function () {
          const ta = noteContentInput;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const value = ta.value;
          let insertion, cursorPos;
          if (start === end) {
            insertion = '[链接](url)';
            ta.value = value.substring(0, start) + insertion + value.substring(end);
            cursorPos = start + 1;
          } else {
            const selected = value.substring(start, end);
            insertion = '[' + selected + '](url)';
            ta.value = value.substring(0, start) + insertion + value.substring(end);
            cursorPos = start + 1 + selected.length + 3;
          }
          ta.setSelectionRange(cursorPos, cursorPos);
          ta.focus();
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        })();
        break;
    }
  }

  // ==================== 页面切换 ====================
  function openEditor() {
    appContainer.classList.add('editor-open');
    renderEditorForActiveNote();
  }
  function closeEditor() {
    syncEditorToActiveNote();
    appContainer.classList.remove('editor-open');
    renderNoteList();
  }

  // ==================== 抽屉 ====================
  function openDrawer() {
    drawer.classList.add('show');
    drawerMask.classList.add('show');
  }
  function closeDrawer() {
    drawer.classList.remove('show');
    drawerMask.classList.remove('show');
  }

  // ==================== 登录 ====================
  let isRegisterMode = false;

  function setLoginMode(register) {
    isRegisterMode = register;
    if (register) {
      loginSubmitBtn.textContent = '注册';
      loginSwitchText.textContent = '已有账号？';
      loginSwitchBtn.textContent = '点此登录';
    } else {
      loginSubmitBtn.textContent = '登录';
      loginSwitchText.textContent = '还没有账号？';
      loginSwitchBtn.textContent = '点此注册';
    }
  }

  function applyRemember() {
    try {
      const stored = localStorage.getItem(REMEMBER_KEY);
      if (stored) {
        const { username, password } = JSON.parse(stored);
        loginUsername.value = username || '';
        loginPassword.value = password || '';
        loginRemember.checked = true;
      } else {
        let lastUser = '';
        try { lastUser = localStorage.getItem('lingyu_last_username') || ''; } catch (e) {}
        loginUsername.value = lastUser;
        loginPassword.value = '';
        loginRemember.checked = false;
      }
    } catch (e) {}
  }

  function showLogin() {
    applyRemember();
    loginOverlay.classList.remove('hide-fast');
    loginOverlay.classList.add('show');
    loadWallpaperVideo(state.currentWallpaperId);
    syncWallpaperVisibility();
    setTimeout(() => { if (!loginUsername.value) loginUsername.focus(); }, 600);
  }

  function hideLogin() {
    loginOverlay.classList.add('hide-fast');
    loginOverlay.classList.remove('show');
  }

  async function handleLoginSubmit() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    if (!isValidUsername(username)) {
      await showAlert('用户名需为 3-20 位字母、数字或下划线', { title: '格式错误' });
      return;
    }
    if (!password) { await showAlert('请输入密码'); return; }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = isRegisterMode ? '注册中...' : '登录中...';

    const users = getUsers();
    let errorMsg = null;
    let recoveryKey = null;

    if (isRegisterMode) {
      if (users[username]) errorMsg = '用户名已存在，请直接登录';
      else {
        recoveryKey = generateRecoveryKey();
        users[username] = {
          password: hashPassword(password),
          recoveryKey,
          createdAt: Date.now(),
          noteLockPassword: null
        };
        saveUsers(users);
      }
    } else {
      if (!users[username]) errorMsg = '用户不存在';
      else if (users[username].password !== hashPassword(password)) errorMsg = '密码错误';
    }

    if (errorMsg) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = isRegisterMode ? '注册' : '登录';
      await showAlert(errorMsg, { title: isRegisterMode ? '注册失败' : '登录失败' });
      return;
    }

    try { localStorage.setItem('lingyu_last_username', username); } catch (e) {}
    if (loginRemember.checked) {
      try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password })); } catch (e) {}
    } else {
      try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
    }

    state.currentUser = username;
    try { localStorage.setItem(CURRENT_USER_KEY, username); } catch (e) {}

    if (recoveryKey) await showRecoveryKeyDialog(recoveryKey);

    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = isRegisterMode ? '注册' : '登录';
    hideLogin();
    setTimeout(async () => {
      appContainer.classList.remove('hidden-app');
      void appContainer.offsetWidth;
      appContainer.classList.add('visible');
      await enterApp();
      showToast(`欢迎，${username}`);
    }, 260);
  }

  function showRecoveryKeyDialog(recoveryKey) {
    return new Promise((resolve) => {
      const html = `
        <div class="m-dialog-key-box">
          <div class="m-dialog-key-text" id="mRecoveryKeyText">${recoveryKey}</div>
          <button class="m-dialog-key-copy" id="mRecoveryKeyCopy">复制</button>
        </div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.6);line-height:1.6;text-align:center;">
          请务必保存好这串密钥。<br>忘记密码时，只能通过它来重置密码。
        </div>
      `;
      openDialog({
        title: '请保存你的恢复密钥',
        message: '',
        customHTML: html,
        buttons: [{ text: '我已保存', type: 'confirm', value: true }]
      }).then(resolve);
      setTimeout(() => {
        const copyBtn = document.getElementById('mRecoveryKeyCopy');
        const textEl = document.getElementById('mRecoveryKeyText');
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
    });
  }

  async function logout() {
    const ok = await showConfirm('确定要退出登录吗？', { confirmText: '退出', danger: true });
    if (!ok) return;
    syncEditorToActiveNote();
    saveNotesToStorage();
    saveSettingsToStorage();
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
    closeDrawer();
    state.currentUser = null;
    state.notes = [];
    state.activeNoteId = null;
    appContainer.classList.remove('editor-open');
    appContainer.classList.remove('visible');
    setTimeout(() => {
      appContainer.classList.add('hidden-app');
      showLogin();
    }, 300);
  }

  async function enterApp() {
    state.notes = [];
    state.activeNoteId = null;
    state.searchKeyword = '';
    searchInput.value = '';
    state.activeCategory = 'all';
    categoryTabs.querySelectorAll('.m-cat-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.category === 'all');
    });

    state.settings = window.DB.defaultSettings();
    loadSettingsFromStorage();
    loadNotesFromStorage();

    if (state.notes.length === 0) {
      const now = Date.now();
      state.notes = [{
        id: generateId(),
        title: '我的第一篇笔记',
        content: '点击这里开始编辑...',
        createdAt: now,
        updatedAt: now,
        preview: false,
        locked: false,
        pinned: false,
        category: 'other',
        deleted: false
      }];
      state.activeNoteId = state.notes[0].id;
      saveNotesToStorage();
    }
    if (!state.activeNoteId) {
      const firstVisible = state.notes.filter(n => !n.deleted)[0];
      state.activeNoteId = firstVisible ? firstVisible.id : null;
    }

    await applyBackground();
    try { state.currentWallpaperId = localStorage.getItem(CURRENT_WALLPAPER_KEY) || null; } catch (e) {}
    await loadWallpaperVideo(state.currentWallpaperId);
    syncWallpaperVisibility();

    drawerUser.textContent = state.currentUser;
    renderNoteList();
    renderEditorForActiveNote();

    if (window.MobileApp && window.MobileApp.applySettings) {
      window.MobileApp.applySettings();
    }
    if (window.MobileApp && window.MobileApp.renderAvatar) {
      window.MobileApp.renderAvatar();
    }

    purgeExpiredTrash();
  }

  function purgeExpiredTrash() {
    const days = state.settings.trashRetentionDays || 30;
    if (days <= 0) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const toPurge = state.notes.filter(n => n.deleted && n.deletedAt && n.deletedAt < cutoff);
    if (toPurge.length === 0) return;
    state.notes = state.notes.filter(n => !(n.deleted && n.deletedAt && n.deletedAt < cutoff));
    if (state.activeNoteId && !state.notes.some(n => n.id === state.activeNoteId)) {
      const visible = state.notes.filter(n => !n.deleted);
      state.activeNoteId = visible.length > 0 ? visible[0].id : null;
    }
    sortNotes();
    saveNotesToStorage();
    renderNoteList();
  }

  function isCurrentNoteLocked() {
    if (!state.activeNoteId) return false;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    return note ? !!note.locked : false;
  }

  function bindEvents() {
    loginSubmitBtn.addEventListener('click', handleLoginSubmit);
    loginSwitchBtn.addEventListener('click', () => {
      setLoginMode(!isRegisterMode);
      loginPassword.value = '';
      loginPassword.focus();
    });
    loginForgotBtn.addEventListener('click', () => {
      if (window.MobileApp && window.MobileApp.openForgotPasswordDialog) {
        window.MobileApp.openForgotPasswordDialog();
      }
    });
    loginUsername.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loginPassword.focus(); }
    });
    loginPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleLoginSubmit(); }
    });

    openDrawerBtn.addEventListener('click', openDrawer);
    drawerMask.addEventListener('click', closeDrawer);
    drawerSettingsBtn.addEventListener('click', () => {
      closeDrawer();
      if (window.MobileApp && window.MobileApp.openSettings) window.MobileApp.openSettings();
    });
    drawerTrashBtn.addEventListener('click', () => {
      closeDrawer();
      if (window.MobileApp && window.MobileApp.openTrash) window.MobileApp.openTrash();
    });
    drawerShortcutsBtn.addEventListener('click', () => {
      closeDrawer();
      if (window.MobileApp && window.MobileApp.openShortcuts) window.MobileApp.openShortcuts();
    });
    drawerAboutBtn.addEventListener('click', () => {
      closeDrawer();
      if (window.MobileApp && window.MobileApp.openAbout) window.MobileApp.openAbout();
    });
    logoutBtn.addEventListener('click', logout);

    newNoteBtn.addEventListener('click', createNewNote);
    searchInput.addEventListener('input', (e) => {
      state.searchKeyword = e.target.value;
      renderNoteList();
    });
    categoryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.m-cat-tab');
      if (!tab) return;
      const cat = tab.dataset.category;
      if (cat === state.activeCategory) return;
      state.activeCategory = cat;
      categoryTabs.querySelectorAll('.m-cat-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.category === cat);
      });
      renderNoteList();
    });

    backToListBtn.addEventListener('click', closeEditor);
    moreBtn.addEventListener('click', () => {
      if (state.activeNoteId && window.MobileApp && window.MobileApp.openNoteSheet) {
        window.MobileApp.openNoteSheet(state.activeNoteId);
      }
    });

    noteTitleInput.addEventListener('input', () => {
      if (isCurrentNoteLocked()) return;
      updateEditorTopTitle();
    });
    noteTitleInput.addEventListener('blur', () => {
      if (state.activeNoteId) {
        syncEditorToActiveNote();
        updateEditorTopTitle();
      }
    });
    noteContentInput.addEventListener('blur', () => {
      if (state.activeNoteId) syncEditorToActiveNote();
    });

    toggleModeBtn.addEventListener('click', toggleEditPreviewMode);
    lockBtn.addEventListener('click', toggleLock);
    lockUnlockBtn.addEventListener('click', tryUnlock);
    lockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
    saveBtn.addEventListener('click', saveActiveNote);
    deleteNoteBtn.addEventListener('click', deleteCurrentNote);

    mdBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.m-md-btn');
      if (!btn) return;
      handleMdAction(btn.dataset.md);
    });

    window.addEventListener('popstate', () => {
      if (appContainer.classList.contains('editor-open')) {
        closeEditor();
        history.pushState(null, '', location.href);
      }
    });
    history.pushState(null, '', location.href);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.currentUser) {
        syncEditorToActiveNote();
        saveNotesToStorage();
      }
    });

    window.addEventListener('beforeunload', () => {
      if (state.currentUser) {
        syncEditorToActiveNote();
        saveNotesToStorage();
      }
      if (state.mainVideoObjectUrl) URL.revokeObjectURL(state.mainVideoObjectUrl);
    });
  }

  async function init() {
    await bgDB.open();
    try { state.currentWallpaperId = localStorage.getItem(CURRENT_WALLPAPER_KEY) || null; } catch (e) {}
    const users = getUsers();
    const hasUsers = Object.keys(users).length > 0;
    applyRemember();
    setLoginMode(!hasUsers);
    await loadWallpaperVideo(state.currentWallpaperId);
    syncWallpaperVisibility();
    bindEvents();
    initSplash();
  }

  window.MobileApp = {
    state,
    $,
    showToast,
    showAlert,
    showConfirm,
    openDialog,
    closeDialog,
    showProgress,
    updateProgress,
    setProgressTitle,
    hideProgress,
    yieldToUI,
    saveNotesToStorage,
    saveSettingsToStorage,
    loadSettingsFromStorage,
    sortNotes,
    renderNoteList,
    renderEditorForActiveNote,
    applyModeState,
    applyLockState,
    applyBackground,
    loadWallpaperVideo,
    syncWallpaperVisibility,
    setActiveNote,
    openEditor,
    closeEditor,
    openDrawer,
    closeDrawer,
    logout,
    isCurrentNoteLocked,
    CATEGORY_LABELS,
    CURRENT_WALLPAPER_KEY
  };

  init();
})();