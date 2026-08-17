import {CARD_EXPORT_SCALE, CARD_EXPORT_STYLE_PROPERTIES, TEAM_CARD_EXPORT_BACKGROUND} from './constants.js';

// character-card-export-sprites
export class CharacterCardExportSprites {
  constructor(state) {
    this.state = state;
    this.spriteTextCache = new Map();
    this.spriteSymbolCache = new Map();
  }

  loadSpriteText(spriteUrl) {
    const absoluteUrl = new URL(spriteUrl, location.href).href;
    if (this.spriteTextCache.has(absoluteUrl)) return this.spriteTextCache.get(absoluteUrl);
    const promise = fetch(absoluteUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .catch((error) => {
        this.spriteTextCache.delete(absoluteUrl);
        throw error;
      });
    this.spriteTextCache.set(absoluteUrl, promise);
    return promise;
  }

  async loadSpriteSymbol(spriteUrl, symbolId) {
    const absoluteUrl = new URL(spriteUrl, location.href).href;
    const cacheKey = `${absoluteUrl}#${symbolId}`;
    if (this.spriteSymbolCache.has(cacheKey)) return this.spriteSymbolCache.get(cacheKey);
    const promise = this.loadSpriteText(absoluteUrl)
      .then((svgText) => {
        // Sprite 文件可达数 MB，只截取目标 symbol 后再解析，避免构建整份 SVG DOM。
        let idIndex = svgText.indexOf(`id="${symbolId}"`);
        if (idIndex < 0) idIndex = svgText.indexOf(`id='${symbolId}'`);
        if (idIndex < 0) return null;
        const start = svgText.lastIndexOf('<symbol', idIndex);
        const end = svgText.indexOf('</symbol>', idIndex);
        if (start < 0 || end < 0) return null;
        const symbolText = svgText.slice(start, end + '</symbol>'.length);
        const symbol = new DOMParser().parseFromString(symbolText, 'image/svg+xml').documentElement;
        return symbol?.localName === 'symbol' ? symbol : null;
      })
      .catch((error) => {
        this.spriteSymbolCache.delete(cacheKey);
        console.warn('[MST] 无法加载名片 SVG symbol:', cacheKey, error);
        return null;
      });
    this.spriteSymbolCache.set(cacheKey, promise);
    return promise;
  }

  async inlineSvgSprites(root) {
    this.state.svgTool.refreshSpritePathsFromDOM();
    const entries = [
      ...root.querySelectorAll('svg use')
    ]
      .map((useElement) => {
        const href = useElement.getAttribute('href') || useElement.getAttribute('xlink:href') || '';
        const separator = href.lastIndexOf('#');
        return {
          useElement,
          spriteUrl: separator > 0 ? href.slice(0, separator) : '',
          symbolId: separator > 0 ? href.slice(separator + 1) : ''
        };
      })
      .filter((entry) => entry.spriteUrl && entry.symbolId);
    const symbolKeys = [
      ...new Set(entries.map((entry) => `${entry.spriteUrl}#${entry.symbolId}`))
    ];
    const symbols = new Map(
      await Promise.all(
        symbolKeys.map(async (key) => {
          const separator = key.lastIndexOf('#');
          const spriteUrl = key.slice(0, separator);
          const symbolId = key.slice(separator + 1);
          return [
            key, await this.loadSpriteSymbol(spriteUrl, symbolId)
          ];
        })
      )
    );

    entries.forEach(({useElement, spriteUrl, symbolId}) => {
      try {
        const svg = useElement.closest('svg');
        const symbol = symbols.get(`${spriteUrl}#${symbolId}`);
        if (!svg || !symbol) return;
        const symbolClone = symbol.cloneNode(true);
        svg.replaceChildren(...Array.from(symbolClone.childNodes));
        const viewBox = symbol.getAttribute('viewBox');
        if (viewBox) svg.setAttribute('viewBox', viewBox);
        const fill = symbol.getAttribute('fill');
        if (fill) svg.setAttribute('fill', fill);
      } catch (error) {
        console.warn('[MST] 内联名片 SVG 失败:', error);
      }
    });
  }
}

// character-card-export-renderer
export class CharacterCardExportRenderer {
  constructor(i18n) {
    this.i18n = i18n;
  }

  mountExportClone(clone) {
    const host = document.createElement('div');
    // 导出克隆无需点击态，移除后也可避免第三方脚本扫描已内联的 SVG。
    clone.querySelectorAll('[class*="Item_clickable__"]').forEach((element) => {
      [
        ...element.classList
      ]
        .filter((className) => className.startsWith('Item_clickable__'))
        .forEach((className) => element.classList.remove(className));
    });
    Object.assign(host.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: 'max-content',
      margin: '0',
      padding: '0',
      pointerEvents: 'none'
    });
    clone.style.margin = '0';
    host.appendChild(clone);
    document.body.appendChild(host);
    return host;
  }

  renderCardCanvas(element, backgroundColor = null) {
    if (typeof htmlToImage === 'undefined') {
      return Promise.reject(new Error(this.i18n.t('imageRendererUnavailable')));
    }
    const width = Math.ceil(element.getBoundingClientRect().width || element.scrollWidth || element.offsetWidth);
    const height = Math.ceil(element.getBoundingClientRect().height || element.scrollHeight || element.offsetHeight);
    const options = {
      width,
      height,
      pixelRatio: CARD_EXPORT_SCALE,
      cacheBust: false,
      skipFonts: true,
      includeStyleProperties: CARD_EXPORT_STYLE_PROPERTIES
    };
    if (backgroundColor) options.backgroundColor = backgroundColor;
    return htmlToImage.toCanvas(element, options);
  }

  yieldForCardExport() {
    return new Promise((resolve) => {
      const settle = () => setTimeout(resolve, 0);
      if (window.requestAnimationFrame) window.requestAnimationFrame(settle);
      else settle();
    });
  }

  async renderTeamCardCanvas(container, onProgress) {
    const cardWraps = [
      ...container.querySelectorAll('.mst-team-card-wrap')
    ];
    if (!cardWraps.length) return this.renderCardCanvas(container, TEAM_CARD_EXPORT_BACKGROUND);

    const containerRect = container.getBoundingClientRect();
    const width = Math.ceil(containerRect.width || container.scrollWidth || container.offsetWidth);
    const height = Math.ceil(containerRect.height || container.scrollHeight || container.offsetHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width * CARD_EXPORT_SCALE;
    canvas.height = height * CARD_EXPORT_SCALE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(this.i18n.t('cardCanvasUnavailable'));
    context.fillStyle = TEAM_CARD_EXPORT_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);

    try {
      for (let index = 0; index < cardWraps.length; index++) {
        onProgress?.(index + 1, cardWraps.length);
        await this.yieldForCardExport();
        const cardWrap = cardWraps[index];
        const cardRect = cardWrap.getBoundingClientRect();
        const cardCanvas = await this.renderCardCanvas(cardWrap);
        context.drawImage(
          cardCanvas,
          Math.round((cardRect.left - containerRect.left) * CARD_EXPORT_SCALE),
          Math.round((cardRect.top - containerRect.top) * CARD_EXPORT_SCALE)
        );
        cardCanvas.width = 0;
        cardCanvas.height = 0;
      }
      return canvas;
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      throw error;
    }
  }
}

// character-card-export-io
export class CharacterCardExportIO {
  constructor(i18n) {
    this.i18n = i18n;
  }

  canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }

  assertImageClipboardSupport() {
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error(this.i18n.t('imageClipboardUnavailable'));
    }
  }

  writeCanvasPromiseToClipboard(canvasPromise) {
    const blobPromise = Promise.resolve(canvasPromise).then(async (canvas) => {
      try {
        const blob = await this.canvasToPngBlob(canvas);
        if (!blob) throw new Error(this.i18n.t('imageEncodeFailed'));
        return blob;
      } finally {
        this.releaseCanvas(canvas);
      }
    });
    return navigator.clipboard.write([
      new ClipboardItem({'image/png': blobPromise})
    ]);
  }

  async downloadCanvas(canvas, fileName) {
    const blob = await this.canvasToPngBlob(canvas);
    if (!blob) throw new Error(this.i18n.t('imageEncodeFailed'));
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = `${fileName}.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// character-card-export-canvas
export class CharacterCardExportCanvas {
  constructor(deps) {
    this.deps = deps;
    this.sprites = new CharacterCardExportSprites(deps.state);
    this.renderer = new CharacterCardExportRenderer(deps.i18n);
    this.io = new CharacterCardExportIO(deps.i18n);
  }

  assertImageClipboardSupport() {
    return this.io.assertImageClipboardSupport();
  }

  downloadCanvas(canvas, fileName) {
    return this.io.downloadCanvas(canvas, fileName);
  }

  releaseCanvas(canvas) {
    return this.io.releaseCanvas(canvas);
  }

  writeCanvasPromiseToClipboard(canvasPromise) {
    return this.io.writeCanvasPromiseToClipboard(canvasPromise);
  }

  async createCharacterCanvas() {
    const {getStandaloneCharacterCard, hydrateBuildScores, i18n} = this.deps;
    const cardElement = getStandaloneCharacterCard();
    if (!cardElement) throw new Error(i18n.t('characterCardElementNotFound'));
    await hydrateBuildScores(cardElement);

    const clonedCard = cardElement.cloneNode(true);
    await this.sprites.inlineSvgSprites(clonedCard);
    const exportHost = this.renderer.mountExportClone(clonedCard);
    try {
      await document.fonts?.ready;
      return await this.renderer.renderCardCanvas(clonedCard);
    } finally {
      exportHost.remove();
    }
  }

  async createTeamCanvas(onProgress) {
    const {hydrateBuildScores, i18n} = this.deps;
    const wrapper = document.getElementById('mst-team-character-card');
    if (!wrapper) throw new Error(i18n.t('partyCardElementNotFound'));
    await hydrateBuildScores(wrapper);

    // 保持与预览一致的结构，直接克隆容器。
    const cloned = wrapper.cloneNode(true);
    cloned.querySelectorAll('.mst-team-card-delete').forEach((button) => button.remove());
    cloned.classList.remove('mst-overflow-mode');
    Object.assign(cloned.style, {
      width: 'max-content',
      minHeight: '0',
      padding: '0',
      overflow: 'visible',
      justifyContent: 'flex-start',
      background: TEAM_CARD_EXPORT_BACKGROUND
    });
    await this.sprites.inlineSvgSprites(cloned);

    const exportHost = this.renderer.mountExportClone(cloned);
    try {
      await document.fonts?.ready;
      return await this.renderer.renderTeamCardCanvas(cloned, onProgress);
    } finally {
      exportHost.remove();
    }
  }
}

// character-card-export-actions
export class CharacterCardExportActions {
  constructor(deps, canvasApi) {
    this.deps = deps;
    this.canvasApi = canvasApi;
  }

  async downloadCharacter(exporter) {
    const {getStandaloneCharacterCard, Notifier, i18n} = this.deps;
    const downloadBtn = document.querySelector('.mst-download-card-btn');
    const originalText = downloadBtn?.textContent || '';
    try {
      if (!getStandaloneCharacterCard()) {
        Notifier.alert(i18n.t('characterCardElementNotFound'));
        return;
      }

      if (downloadBtn) {
        downloadBtn.textContent = i18n.t('generating');
        downloadBtn.disabled = true;
      }
      const canvas = await exporter.createCharacterCanvas();
      try {
        await this.canvasApi.downloadCanvas(canvas, `MWI_Character_Card_${Date.now()}`);
      } finally {
        this.canvasApi.releaseCanvas(canvas);
      }
      console.debug('名片图片已生成并下载');
    } catch (error) {
      console.error('下载名片失败:', error);
      Notifier.alert(`${i18n.t('downloadCharacterCardFailed')}\n\n${error.message || ''}`.trim());
    } finally {
      if (downloadBtn) {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
      }
    }
  }

  async copyCharacter(exporter) {
    const {getStandaloneCharacterCard, Notifier, i18n, showToastNotice} = this.deps;
    const copyBtn = document.querySelector('.mst-copy-card-btn');
    const originalText = copyBtn?.textContent || '';
    try {
      this.canvasApi.assertImageClipboardSupport();
      if (!getStandaloneCharacterCard()) {
        Notifier.alert(i18n.t('characterCardElementNotFound'));
        return;
      }
      if (copyBtn) {
        copyBtn.textContent = i18n.t('copying');
        copyBtn.disabled = true;
      }
      await this.canvasApi.writeCanvasPromiseToClipboard(exporter.createCharacterCanvas());
      showToastNotice(i18n.t('characterCardCopied'), 'success');
    } catch (error) {
      console.error('复制名片失败:', error);
      Notifier.alert(`${i18n.t('copyCharacterCardFailed')}\n\n${error.message || i18n.t('clipboardPermissionHint')}`);
    } finally {
      if (copyBtn) {
        copyBtn.textContent = originalText;
        copyBtn.disabled = false;
      }
    }
  }

  async downloadTeam(exporter) {
    const {Notifier, i18n} = this.deps;
    const btn = document.querySelector('.mst-download-team-card-btn');
    const originalText = btn?.textContent || '';
    try {
      if (!document.getElementById('mst-team-character-card')) {
        Notifier.alert(i18n.t('partyCardElementNotFound'));
        return;
      }
      if (btn) {
        btn.textContent = i18n.t('generating');
        btn.disabled = true;
      }
      const canvas = await exporter.createTeamCanvas((current, total) => {
        if (btn) btn.textContent = i18n.t('generatingProgress', current, total);
      });
      try {
        await this.canvasApi.downloadCanvas(canvas, `MWI_Party_Card_${Date.now()}`);
      } finally {
        this.canvasApi.releaseCanvas(canvas);
      }
      console.debug('队伍名片图片已生成并下载');
    } catch (error) {
      console.error('下载队伍名片失败:', error);
      Notifier.alert(i18n.t('downloadPartyCardFailed'));
    } finally {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }

  async copyTeam(exporter) {
    const {Notifier, i18n, showToastNotice} = this.deps;
    const btn = document.querySelector('.mst-copy-team-card-btn');
    const originalText = btn?.textContent || '';
    try {
      this.canvasApi.assertImageClipboardSupport();
      if (!document.getElementById('mst-team-character-card')) {
        Notifier.alert(i18n.t('partyCardElementNotFound'));
        return;
      }
      if (btn) {
        btn.textContent = i18n.t('copying');
        btn.disabled = true;
      }
      const canvasPromise = exporter.createTeamCanvas((current, total) => {
        if (btn) btn.textContent = i18n.t('copyingProgress', current, total);
      });
      await this.canvasApi.writeCanvasPromiseToClipboard(canvasPromise);
      showToastNotice(i18n.t('partyCardCopied'), 'success');
    } catch (error) {
      console.error('复制队伍名片失败:', error);
      Notifier.alert(`${i18n.t('copyPartyCardFailed')}\n\n${error.message || i18n.t('clipboardPermissionHint')}`);
    } finally {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }
}

// character-card-image-exporter
export class CharacterCardImageExporter {
  constructor(deps) {
    this.canvasApi = new CharacterCardExportCanvas(deps);
    this.actions = new CharacterCardExportActions(deps, this.canvasApi);
  }

  createCharacterCanvas() {
    return this.canvasApi.createCharacterCanvas();
  }

  downloadCharacter = () => this.actions.downloadCharacter(this);

  // ClipboardItem 接收异步 Blob，避免生成图片时丢失用户激活状态。
  copyCharacter = () => this.actions.copyCharacter(this);

  createTeamCanvas(onProgress) {
    return this.canvasApi.createTeamCanvas(onProgress);
  }

  downloadTeam = () => this.actions.downloadTeam(this);

  copyTeam = () => this.actions.copyTeam(this);
}

export function createCharacterCardImageExporter(deps) {
  return new CharacterCardImageExporter(deps);
}
