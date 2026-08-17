// 构建/调试共用的版本时间戳格式：YYYYMMDDHHMMSS。
// rollup.config.mjs 用它生成 dev 后缀版本，watch-server.mjs 用它生成调试入口版本，
// 两边共用一份实现，避免时间格式分叉。
export function formatDevVersionTimestamp(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}${month}${day}${hour}${minute}${second}`;
}
