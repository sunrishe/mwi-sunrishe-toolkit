// character-card-constants
// 名片按真实尺寸展示；内部尺寸由原 390px 设计同比收紧到 300px。
export const CARD_BASE_WIDTH = 300;
export const CARD_PADDING = 12;
export const CARD_BORDER_WIDTH = 2;
export const CARD_COLUMN_GAP = 12;
export const CARD_CONTENT_WIDTH = CARD_BASE_WIDTH - CARD_PADDING * 2 - CARD_BORDER_WIDTH * 2;
export const CARD_DESKTOP_WIDTH = CARD_CONTENT_WIDTH * 2 + CARD_COLUMN_GAP + CARD_PADDING * 2 + CARD_BORDER_WIDTH * 2;
// 布局只排列完整区块，不改变区块尺寸；两个生活区块加间距等于一个主区块。
export const CARD_MAIN_PANEL_HEIGHT = 314;
export const CARD_LIFE_PANEL_HEIGHT = (CARD_MAIN_PANEL_HEIGHT - CARD_COLUMN_GAP) / 2;
export const CARD_EXPORT_SCALE = 2;
export const TEAM_CARD_EXPORT_BACKGROUND = '#131419';
// html-to-image 默认会为每个节点复制数百个计算样式；名片只需要以下可见样式。
export const CARD_EXPORT_STYLE_PROPERTIES = [
  'align-content', 'align-items', 'align-self', 'aspect-ratio', 'background',
  'background-blend-mode', 'background-clip', 'background-color', 'background-image', 'background-origin',
  'background-position', 'background-repeat', 'background-size', 'border', 'border-bottom',
  'border-bottom-color', 'border-bottom-left-radius', 'border-bottom-right-radius', 'border-bottom-style', 'border-bottom-width',
  'border-collapse', 'border-color', 'border-left', 'border-left-color', 'border-left-style',
  'border-left-width', 'border-radius', 'border-right', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-spacing', 'border-style', 'border-top', 'border-top-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-top-style', 'border-top-width', 'border-width',
  'bottom', 'box-shadow', 'box-sizing', 'color', 'content',
  'direction', 'display', 'fill', 'fill-opacity', 'filter',
  'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow',
  'flex-shrink', 'flex-wrap', 'font', 'font-family', 'font-feature-settings',
  'font-size', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
  'gap', 'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow',
  'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-gap', 'grid-column-start',
  'grid-row', 'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template',
  'grid-template-areas', 'grid-template-columns', 'grid-template-rows', 'height', 'image-rendering',
  'inset', 'isolation', 'justify-content', 'justify-items', 'justify-self',
  'left', 'letter-spacing', 'line-height', 'margin', 'margin-bottom',
  'margin-left', 'margin-right', 'margin-top', 'mask', 'max-height',
  'max-width', 'min-height', 'min-width', 'mix-blend-mode', 'object-fit',
  'object-position', 'opacity', 'order', 'outline', 'overflow',
  'overflow-wrap', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'place-content', 'place-items',
  'place-self', 'position', 'right', 'row-gap', 'stroke',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-width', 'table-layout',
  'text-align', 'text-decoration', 'text-indent', 'text-overflow', 'text-shadow',
  'text-transform', 'top', 'transform', 'transform-origin', 'vertical-align',
  'visibility', 'white-space', 'width', 'word-break', 'word-spacing',
  'writing-mode', 'z-index', '-webkit-text-fill-color', '-webkit-text-stroke', '-webkit-text-stroke-color',
  '-webkit-text-stroke-width'
];

export const PARTY_BUTTONS_SELECTOR = '[class^="Party_partyButtons__"], [class*=" Party_partyButtons__"]';
export const PARTY_RIGHT_BUTTONS_SELECTOR = '[class^="Party_rightButtons__"], [class*=" Party_rightButtons__"]';
export const PARTY_NAME_SELECTOR = '[class^="Party_partyName__"], [class*=" Party_partyName__"]';
