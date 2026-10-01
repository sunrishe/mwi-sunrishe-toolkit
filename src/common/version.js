// 版本号解析与比较：当前构建版本（dev 构建带 -dev.<时间戳> 后缀）与 GreasyFork meta 版本
// 都走同一套口径，只比较数字前缀，后缀不参与比较。
export function parseVersionNumbers(version) {
  const base = String(version || '')
    .trim()
    .match(/^\d+(?:\.\d+)*/);
  return base ? base[0].split('.').map((part) => Number(part)) : [];
}

export function getBaseVersion(version) {
  const numbers = parseVersionNumbers(version);
  return numbers.length ? numbers.join('.') : '';
}

// 逐段比较：2.9.0 < 2.10.0（按数字而非字符串），段数不同时缺失段按 0 处理。
export function compareVersions(left, right) {
  const a = parseVersionNumbers(left);
  const b = parseVersionNumbers(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}
