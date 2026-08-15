// 市场卖出收益统一从这里扣税，交易税调整时只改这一处。
export const MARKET_TAX_RATE = 0.05;
export const MARKET_TAX_MULTIPLIER = 1 - MARKET_TAX_RATE;

// 牛铃袋在市场上出售按 18% 特殊税率扣税，与普通市场税分开管理，调整时只改这一处。
export const COWBELL_TAX_RATE = 0.18;
export const COWBELL_TAX_MULTIPLIER = 1 - COWBELL_TAX_RATE;

// 牛铃袋挂单、最近成交和官方市场价值（marketItemValues）全部缺失时的最后兜底估值，
// 避免牛铃及牛铃袋递归估值为 0；取官方 marketplace 快照（2026-08-15）牛铃袋最近成交价 1,075,167。
export const COWBELL_BAG_FALLBACK_PRICE = 1075167;

// 缓存时间按数据类型区分：市场价格短缓存，角色资料可长期复用。
export const MARKET_CACHE_TTL = 60 * 60 * 1000;
export const PROFILE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
export const PROFILE_CACHE_LIMIT = 50;
// 名片角色资料缓存占用上限，超限时按最旧淘汰，防止接近浏览器 localStorage 配额。
export const PROFILE_CACHE_MAX_BYTES = 1024 * 1024;

// 房屋等级上限来自当前官方升级数据，界面批量选择沿用同一边界。
export const HOUSE_MIN_FROM_LEVEL = 1;
export const HOUSE_MAX_FROM_LEVEL = 7;
export const HOUSE_MAX_TO_LEVEL = 8;

export const AUTO_CALC_DELAY = 150;
export const TOAST_MAX_COUNT = 3;
export const TOAST_DURATION = 3000;
