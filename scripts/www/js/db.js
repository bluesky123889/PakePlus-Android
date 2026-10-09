/**
 * db.js
 * 数据层：IndexedDB（背景图 + 动态壁纸 + 自定义光标 + 笔记图片） + localStorage（用户 / 笔记 / 设置 / 头像 / 保存路径）
 */

(function () {
  'use strict';

  const USERS_KEY = 'lingyu_users';
  const BG_DB_NAME = 'lingyu_bg_db';
  const BG_STORE_NAME = 'backgrounds';
  const WALLPAPER_STORE_NAME = 'wallpapers';
  const CURSOR_STORE_NAME = 'cursors';
  const NOTE_IMAGE_STORE_NAME = 'noteImages';

  function notesKey(user) { return `lingyu_notes_v3_${user}`; }
  function settingsKey(user) { return `lingyu_settings_v4_${user}`; }
  function avatarKey(user) { return `lingyu_avatar_${user}`; }
  function saveDirKey(user) { return `lingyu_save_dir_${user}`; }

  function defaultSettings() {
    return {
      darkMode: false,
      fontSize: 'medium',
      currentBgId: null,
      blur: 0,
      sortBy: 'updatedAt',
      defaultPreview: false,
      sidebarDefaultHidden: false,
      autoSaveInterval: 5,
      trashRetentionDays: 30,
      animationEnabled: true,
      mainWallpaperEnabled: false,
      splashWallpaperEnabled: true,
      customCursorEnabled: false,
      customCursorImageId: null,
      customCursorTextImageId: null,
      customCursorPointerImageId: null,
      shortcuts: {
        toggleMode: 'E',
        toggleSidebar: 'B',
        newNote: 'N',
        deleteNote: 'D',
        toggleDark: 'T',
        openSettings: 'S',
        export: 'Ctrl+E',
        lock: 'L'
      }
    };
  }

  function getUsers() {
    try {
      const stored = localStorage.getItem(USERS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.warn('保存用户失败', e);
    }
  }

  function saveNotes(user, notes) {
    if (!user) return;
    try {
      localStorage.setItem(notesKey(user), JSON.stringify(notes));
    } catch (e) {
      console.warn('保存笔记失败', e);
    }
  }

  function loadNotes(user) {
    if (!user) return null;
    try {
      const stored = localStorage.getItem(notesKey(user));
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('读取笔记失败', e);
      return null;
    }
  }

  function saveSettings(user, settings) {
    if (!user) return;
    try {
      localStorage.setItem(settingsKey(user), JSON.stringify(settings));
    } catch (e) {
      console.warn('保存设置失败', e);
    }
  }

  function loadSettings(user) {
    const merged = defaultSettings();
    if (!user) return merged;

    try {
      const stored = localStorage.getItem(settingsKey(user));
      if (!stored) return merged;

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return merged;

      if (parsed.shortcuts && typeof parsed.shortcuts === 'object') {
        Object.assign(merged.shortcuts, parsed.shortcuts);
        delete parsed.shortcuts;
      }
      Object.assign(merged, parsed);
      const defaults = defaultSettings();
      for (const k in defaults.shortcuts) {
        if (!merged.shortcuts[k]) merged.shortcuts[k] = defaults.shortcuts[k];
      }
      return merged;
    } catch (e) {
      console.warn('读取设置失败', e);
      return merged;
    }
  }

  function saveAvatar(user, dataUrl) {
    if (!user) return;
    try {
      localStorage.setItem(avatarKey(user), dataUrl);
    } catch (e) {
      console.warn('保存头像失败', e);
    }
  }

  function loadAvatar(user) {
    if (!user) return null;
    try {
      return localStorage.getItem(avatarKey(user));
    } catch (e) {
      return null;
    }
  }

  function removeAvatar(user) {
    if (!user) return;
    try {
      localStorage.removeItem(avatarKey(user));
    } catch (e) {}
  }

  function saveSaveDir(user, dir) {
    if (!user) return;
    try {
      localStorage.setItem(saveDirKey(user), dir);
    } catch (e) {
      console.warn('保存目录失败', e);
    }
  }

  function loadSaveDir(user) {
    if (!user) return null;
    try {
      return localStorage.getItem(saveDirKey(user));
    } catch (e) {
      return null;
    }
  }

  function removeSaveDir(user) {
    if (!user) return;
    try {
      localStorage.removeItem(saveDirKey(user));
    } catch (e) {}
  }

  function removeUserData(user) {
    if (!user) return;
    try {
      localStorage.removeItem(notesKey(user));
      localStorage.removeItem(settingsKey(user));
      localStorage.removeItem(avatarKey(user));
      localStorage.removeItem(saveDirKey(user));
    } catch (e) {}
  }

  const bgDB = {
    db: null,

    async open() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(BG_DB_NAME, 4);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(BG_STORE_NAME)) {
            db.createObjectStore(BG_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(WALLPAPER_STORE_NAME)) {
            db.createObjectStore(WALLPAPER_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(CURSOR_STORE_NAME)) {
            db.createObjectStore(CURSOR_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(NOTE_IMAGE_STORE_NAME)) {
            db.createObjectStore(NOTE_IMAGE_STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    },

    // ---------- 背景图 ----------
    async add(item) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, 'readwrite');
        const store = tx.objectStore(BG_STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve(item.id);
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async getAll() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, 'readonly');
        const store = tx.objectStore(BG_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async get(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, 'readonly');
        const store = tx.objectStore(BG_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async delete(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, 'readwrite');
        const store = tx.objectStore(BG_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    // ---------- 动态壁纸 ----------
    async addWallpaper(item) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(WALLPAPER_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WALLPAPER_STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve(item.id);
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async getAllWallpapers() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(WALLPAPER_STORE_NAME, 'readonly');
        const store = tx.objectStore(WALLPAPER_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async getWallpaper(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(WALLPAPER_STORE_NAME, 'readonly');
        const store = tx.objectStore(WALLPAPER_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async deleteWallpaper(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(WALLPAPER_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WALLPAPER_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    // ---------- 自定义光标 ----------
    async addCursor(item) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CURSOR_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CURSOR_STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve(item.id);
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async getCursor(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CURSOR_STORE_NAME, 'readonly');
        const store = tx.objectStore(CURSOR_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async deleteCursor(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CURSOR_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CURSOR_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    // ---------- 笔记内嵌图片 ----------
    async addNoteImage(item) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(NOTE_IMAGE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(NOTE_IMAGE_STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve(item.id);
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async getNoteImage(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(NOTE_IMAGE_STORE_NAME, 'readonly');
        const store = tx.objectStore(NOTE_IMAGE_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async deleteNoteImage(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(NOTE_IMAGE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(NOTE_IMAGE_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async getAllNoteImages() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(NOTE_IMAGE_STORE_NAME, 'readonly');
        const store = tx.objectStore(NOTE_IMAGE_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      });
    }
  };

  window.DB = {
    notesKey,
    settingsKey,
    avatarKey,
    saveDirKey,
    defaultSettings,
    getUsers,
    saveUsers,
    saveNotes,
    loadNotes,
    saveSettings,
    loadSettings,
    saveAvatar,
    loadAvatar,
    removeAvatar,
    saveSaveDir,
    loadSaveDir,
    removeSaveDir,
    removeUserData,
    bgDB
  };
})();