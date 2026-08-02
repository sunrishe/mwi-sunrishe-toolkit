// service
export function createI18nService({CONFIG, messageGroups}) {
  const i18n = {
    currentLang: 'en',
    messageGroups,
    messageIndex: {},

    buildMessageIndex() {
      const index = {};
      for (const [
        moduleName, messages
      ] of Object.entries(this.messageGroups)) {
        for (const [
          key, message
        ] of Object.entries(messages)) {
          if (index[key]) throw new Error(`[MST] i18n 文案 key 重复：${key}（${moduleName}）`);
          index[key] = message;
        }
      }
      this.messageIndex = index;
    },

    readPageLanguage() {
      const storageKey = CONFIG.isMilkonomySite ? 'lang-storage-key' : 'i18nextLng';
      return localStorage.getItem(storageKey) || document.documentElement.lang || '';
    },

    loadLangPref() {
      try {
        this.currentLang = this.normalizeLang(this.readPageLanguage());
      } catch {
        this.currentLang = 'en';
      }
    },

    syncPageLanguage() {
      try {
        return this.setLanguage(this.readPageLanguage());
      } catch {
        return false;
      }
    },

    normalizeLang(value) {
      return String(value || '')
        .toLowerCase()
        .startsWith('zh')
        ? 'zh'
        : 'en';
    },

    get languageKey() {
      return this.currentLang === 'zh' ? 'zh' : 'en';
    },

    get locale() {
      return this.languageKey === 'zh' ? 'zh-CN' : 'en-US';
    },

    get alternateLanguage() {
      return this.languageKey === 'zh' ? 'en' : 'zh';
    },

    setLanguage(value) {
      const nextLang = this.normalizeLang(value);
      if (this.currentLang === nextLang) return false;
      this.currentLang = nextLang;
      return true;
    },

    pick(entry, fallback = '') {
      if (!entry || typeof entry !== 'object') return String(entry ?? fallback);
      return entry[this.languageKey] ?? entry.zh ?? entry.en ?? fallback;
    },

    t(key, ...args) {
      const entry = this.messageIndex[key];
      if (!entry) return key;
      let text = this.pick(entry, key);
      for (let i = 0; i < args.length; i++) {
        text = text.replace('{' + i + '}', String(args[i] ?? ''));
      }
      return text;
    }
  };
  return i18n;
}

export function createLanguageEvents() {
  return {
    listeners: new Set(),

    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Language listener must be a function');
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },

    emit(lang) {
      const detail = {lang};
      this.listeners.forEach((listener) => {
        try {
          listener(detail);
        } catch (error) {
          console.error('[MST] Language listener failed:', error);
        }
      });
      // 保留旧事件名，兼容可能监听 MST 语言变化的外部脚本。
      window.dispatchEvent(new CustomEvent('hccp-lang-changed', {detail}));
    }
  };
}
