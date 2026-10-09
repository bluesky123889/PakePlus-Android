/**
 * utils.js
 * 纯工具函数：不碰 DOM、不碰状态、不碰数据库。
 * 所有函数挂到 window 上，供 db.js / app.js 使用。
 */

(function () {
  'use strict';

  // ==================== ID / 时间 / 字节 ====================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (seconds < 10) return '刚刚';
    if (seconds < 60) return `${seconds}秒前`;
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  // ==================== 字符串 / HTML ====================
  let _escapeDiv = null;
  function escapeHtml(text) {
    if (_escapeDiv === null) {
      _escapeDiv = document.createElement('div');
    }
    _escapeDiv.textContent = text == null ? '' : String(text);
    return _escapeDiv.innerHTML;
  }

  // ==================== Base64 <-> Blob ====================
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mimeMatch = meta.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function extFromMime(mime) {
    if (!mime) return 'bin';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('svg')) return 'svg';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    return 'bin';
  }

  // ==================== 视频缩略图 ====================
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

      video.addEventListener('loadeddata', () => {
        video.currentTime = 0.1;
      });

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

  // ==================== 光标坐标 ====================
  function getCaretCoordinates(element, position) {
    const properties = [
      'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
      'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
      'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize',
      'MozTabSize'
    ];

    const isFirefox = (window.mozInnerScreenX != null);

    const div = document.createElement('div');
    div.id = 'input-textarea-caret-position-mirror-div';
    document.body.appendChild(div);

    const style = div.style;
    const computed = window.getComputedStyle(element);

    style.whiteSpace = 'pre-wrap';
    if (element.nodeName !== 'INPUT') {
      style.wordWrap = 'break-word';
    }
    style.position = 'absolute';
    style.visibility = 'hidden';

    properties.forEach(prop => {
      style[prop] = computed[prop];
    });

    if (isFirefox) {
      if (element.scrollHeight > parseInt(computed.height, 10)) {
        style.overflowY = 'scroll';
      }
    } else {
      style.overflow = 'hidden';
    }

    div.textContent = element.value.substring(0, position);
    if (element.nodeName === 'INPUT') {
      div.textContent = div.textContent.replace(/\s/g, '\u00a0');
    }

    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    const coordinates = {
      top: span.offsetTop + parseInt(computed.borderTopWidth, 10),
      left: span.offsetLeft + parseInt(computed.borderLeftWidth, 10),
      height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) * 1.6
    };

    document.body.removeChild(div);

    return coordinates;
  }

  // ==================== 密码 / 恢复密钥 ====================
  const RECOVERY_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function randomInt(max) {
    if (max <= 0) return 0;
    const limit = Math.floor(0xFFFFFFFF / max) * max;
    const buf = new Uint32Array(1);
    let v;
    do {
      crypto.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % max;
  }

  // 注意：这不是密码学哈希，只是把密码做 base64 编码后存储。
  // 本应用定位为「本地单机笔记」，用户密码只用于本机多用户区分，
  // 不承担网络传输/服务器认证职责。若未来需要联网同步，必须替换为
  // 真正的密码哈希（如 PBKDF2 / scrypt / Argon2 + salt）。
  function hashPassword(pwd) {
    try {
      return btoa(unescape(encodeURIComponent(pwd)));
    } catch (e) {
      return btoa(pwd);
    }
  }

  function isValidUsername(username) {
    return /^[A-Za-z0-9_]{3,20}$/.test(username);
  }

  function generateRecoveryKey() {
    const groups = [];
    for (let g = 0; g < 4; g++) {
      let group = '';
      for (let i = 0; i < 3; i++) {
        group += RECOVERY_CHARSET.charAt(randomInt(RECOVERY_CHARSET.length));
      }
      groups.push(group);
    }
    return groups.join('-');
  }

  // ==================== 快捷键工具 ====================
  const INVALID_MAIN_KEYS = new Set([
    'Control', 'Alt', 'Shift', 'Meta',
    'Dead', 'Unidentified', 'Process',
    'Compose', 'AltGraph', 'CapsLock',
    'NumLock', 'ScrollLock', 'Fn', 'FnLock',
    'OS', 'Hyper', 'Super', 'Symbol', 'SymbolLock'
  ]);

  function eventToShortcut(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    const k = e.key;
    if (!k) return '';
    if (INVALID_MAIN_KEYS.has(k)) return '';
    let keyName = k;
    if (k === ' ') keyName = 'Space';
    if (k.length === 1) keyName = k.toUpperCase();
    parts.push(keyName);
    return parts.join('+');
  }

  function matchShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.split('+');
    const needCtrl = parts.includes('Ctrl');
    const needAlt = parts.includes('Alt');
    const needShift = parts.includes('Shift');
    const needMeta = parts.includes('Meta');
    const mainKey = parts.filter(p => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(p))[0];

    if (needCtrl !== e.ctrlKey) return false;
    if (needAlt !== e.altKey) return false;
    if (needShift !== e.shiftKey) return false;
    if (needMeta !== e.metaKey) return false;
    if (!mainKey) return false;

    let pressedKey = e.key;
    if (pressedKey === ' ') pressedKey = 'Space';
    if (pressedKey.length === 1) pressedKey = pressedKey.toUpperCase();

    return pressedKey === mainKey;
  }

  function isValidShortcut(str) {
    if (!str) return false;
    const parts = str.split('+');
    const main = parts.filter(p => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(p));
    if (main.length !== 1) return false;
    if (INVALID_MAIN_KEYS.has(main[0])) return false;
    return true;
  }

  // ==================== Markdown 渲染 ====================
  function renderInline(text) {
    let result = escapeHtml(text);

    // 图片 ![alt](id) —— 必须在 link 之前替换
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, imgId) => {
      return `<img class="note-image loading" data-img-id="${escapeHtml(imgId)}" alt="${escapeHtml(alt)}">`;
    });

    // 链接 [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, linkText, url) => {
      if (!/^(https?:\/\/|#|\/)/i.test(url)) {
        return m;
      }
      return `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer" data-url="${escapeHtml(url)}">${linkText}</a>`;
    });

    result = result.replace(/\*\*([^*]+)\*\*/g, '<span class="md-bold">$1</span>');
    result = result.replace(/~~([^~]+)~~/g, '<span class="md-strike">$1</span>');
    result = result.replace(/\*([^*]+)\*/g, '<span class="md-italic">$1</span>');

    return result;
  }

  function renderMarkdown(content) {
    if (!content) return '<p style="color: rgba(255,255,255,0.4);">暂无内容</p>';
    const lines = content.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const todoMatch = line.match(/^- \[([ x])\] (.*)$/);
      if (todoMatch) {
        const isChecked = todoMatch[1] === 'x';
        html += `<div class="preview-todo ${isChecked ? 'completed' : ''}" data-line="${i}">
          <span class="checkbox">${isChecked ? '☑' : '☐'}</span>
          <span>${renderInline(todoMatch[2])}</span>
        </div>`;
        i++;
        continue;
      }

      const h1Match = line.match(/^# (.+)$/);
      if (h1Match) {
        html += `<h1 class="md-h1">${renderInline(h1Match[1])}</h1>`;
        i++;
        continue;
      }

      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) {
        html += `<h2 class="md-h2">${renderInline(h2Match[1])}</h2>`;
        i++;
        continue;
      }

      // 独占一行的图片
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      if (imgMatch) {
        html += renderInline(line);
        i++;
        continue;
      }

      const ulMatch = line.match(/^- (.+)$/);
      if (ulMatch) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^- (?!\[[ x]\])(.+)$/);
          if (!m) break;
          items.push(`<li>${renderInline(m[1])}</li>`);
          i++;
        }
        html += `<ul class="md-ul">${items.join('')}</ul>`;
        continue;
      }

      const olMatch = line.match(/^\d+\. (.+)$/);
      if (olMatch) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\d+\. (.+)$/);
          if (!m) break;
          items.push(`<li>${renderInline(m[1])}</li>`);
          i++;
        }
        html += `<ol class="md-ol">${items.join('')}</ol>`;
        continue;
      }

      if (line.trim() === '') {
        html += '<div class="md-paragraph-empty"></div>';
        i++;
        continue;
      }

      html += `<div class="md-paragraph">${renderInline(line)}</div>`;
      i++;
    }

    return html;
  }

  // ==================== 挂到 window ====================
  window.Utils = {
    generateId,
    formatTime,
    formatBytes,
    escapeHtml,
    blobToBase64,
    base64ToBlob,
    extFromMime,
    generateVideoThumbnail,
    getCaretCoordinates,
    hashPassword,
    isValidUsername,
    generateRecoveryKey,
    RECOVERY_CHARSET,
    randomInt,
    eventToShortcut,
    matchShortcut,
    isValidShortcut,
    renderInline,
    renderMarkdown
  };
})();