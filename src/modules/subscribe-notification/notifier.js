// 渠道请求构造与推送限速：纯逻辑边界，不依赖 DOM 与 DataHub。
// 签名算法按官方文档核对：
// - 钉钉：sign = urlencode(base64(HmacSHA256(key=secret, msg="{毫秒时间戳}\n{secret}")))，追加在 URL 参数。
// - 飞书：sign = base64(HMAC-SHA256(key="{秒时间戳}\n{secret}", msg=空))，放请求头 X-Lark-Request-Timestamp/Sign。
//   注意飞书官方示例是“以待签串为密钥、消息体为空”，与钉钉的 key=secret 相反；
//   shell 里 `openssl dgst -hmac "$SECRET"`（key=secret）与官方 Python 口径不一致，实现以官方文档为准。
// - 企业微信：无签名环节。

export const CHANNEL_LIMITS = {
  // 钉钉 text.content 最短 1、最长 500 字符（按字符截断）。
  dingtalk: {maxChars: 500},
  // 企业微信官方限制请求体 4096 字节，text.content 按 2048 字节保守截断（UTF-8 字节）。
  wecom: {maxBytes: 2048},
  // 飞书请求体不能超过 20KB。
  feishu: {maxBytes: 20 * 1024}
};

// 按字符截断，保留 UTF-16 码元完整（用于钉钉字符数限制）。
export function truncateByChars(text, maxChars) {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function utf8ByteLength(text) {
  return new TextEncoder().encode(text).length;
}

// 按 UTF-8 字节截断，逐字节回退避免截出残缺多字节字符，超长以 … 收尾。
export function truncateByUtf8Bytes(text, maxBytes) {
  const value = String(text ?? '');
  if (utf8ByteLength(value) <= maxBytes) return value;
  const bytes = new TextEncoder().encode(value);
  const suffix = new TextEncoder().encode('…');
  let end = maxBytes - suffix.length;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  let head = bytes.slice(0, Math.max(0, end));
  return new TextDecoder().decode(head) + '…';
}

export function truncateForChannel(channel, text) {
  const limits = CHANNEL_LIMITS[channel];
  if (!limits) return String(text ?? '');
  if (limits.maxChars != null) return truncateByChars(text, limits.maxChars);
  return truncateByUtf8Bytes(text, limits.maxBytes);
}

// 默认 HMAC-SHA256 助手：key 与 message 都是 UTF-8 字符串，返回 base64。
// 通过 WebCrypto 实现；环境不支持时返回 null，由调用方决定降级行为。
export function createDefaultHmac() {
  const subtle = globalThis.crypto?.subtle;
  const encoder = globalThis.TextEncoder ? new TextEncoder() : null;
  if (!subtle || !encoder) return null;
  return async (keyString, messageString) => {
    const key = await subtle.importKey(
      'raw',
      encoder.encode(String(keyString)),
      {name: 'HMAC', hash: 'SHA-256'},
      false,
      [
        'sign'
      ]
    );
    const signature = await subtle.sign('HMAC', key, encoder.encode(String(messageString ?? '')));
    return btoa(Array.from(new Uint8Array(signature), (byte) => String.fromCharCode(byte)).join(''));
  };
}

// 钉钉：加签后把 timestamp/sign 追加到 Webhook URL；body 为纯文本消息。
export const buildDingTalkRequest = async ({url, secret, content}, {timestampMs = Date.now(), hmac} = {}) => {
  let requestUrl = String(url || '');
  if (secret) {
    const sign = await hmac(secret, `${timestampMs}\n${secret}`);
    const joiner = requestUrl.includes('?') ? '&' : '?';
    requestUrl = `${requestUrl}${joiner}timestamp=${timestampMs}&sign=${encodeURIComponent(sign)}`;
  }
  return {
    url: requestUrl,
    headers: {'Content-Type': 'application/json;charset=utf-8'},
    body: JSON.stringify({msgtype: 'text', text: {content}})
  };
};

// 企业微信：key 已在 URL 内，无签名。
export function buildWeComRequest({url, content}) {
  return {
    url: String(url || ''),
    headers: {'Content-Type': 'application/json;charset=utf-8'},
    body: JSON.stringify({msgtype: 'text', text: {content}})
  };
}

// 飞书：签名放请求头（秒级时间戳），待签串为 "{timestamp}\n{secret}"、消息体为空。
export const buildFeishuRequest = async (
  {url, secret, content},
  {timestampSec = Math.floor(Date.now() / 1000), hmac} = {}
) => {
  const headers = {'Content-Type': 'application/json;charset=utf-8'};
  if (secret) {
    const sign = await hmac(`${timestampSec}\n${secret}`, '');
    headers['X-Lark-Request-Timestamp'] = String(timestampSec);
    headers['X-Lark-Request-Sign'] = sign;
  }
  return {
    url: String(url || ''),
    headers,
    body: JSON.stringify({msg_type: 'text', content: {text: content}})
  };
};

// 飞书 Hook 地址归一化：允许粘贴完整地址，也允许只填 hook-id（自动拼接官方地址）。
export function normalizeFeishuHookUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://open.feishu.cn/open-apis/bot/v2/hook/${value.replace(/^\/+/, '')}`;
}

// 统一解析官方响应：钉钉/企微看 errcode，飞书看 code。
export function parseChannelResponse(channel, responseText) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(responseText ?? ''));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') {
    const snippet = String(responseText ?? '').slice(0, 120);
    return {ok: false, code: null, msg: snippet || 'empty response'};
  }
  if (channel === 'feishu') {
    return {ok: parsed.code === 0, code: parsed.code ?? null, msg: parsed.msg || parsed.StatusCode || ''};
  }
  return {ok: parsed.errcode === 0, code: parsed.errcode ?? null, msg: parsed.errmsg || ''};
}

// 推送限速器：两层限制同时生效——
// 1) 两次推送至少间隔 minIntervalMs（渠道推送频率下限）；
// 2) perMinuteLimit 每分钟推送上限（滑动 60 秒窗口），超限时推迟到窗口最早一条过期；
// 间隔内或等待重试期间的多次提交合并为一条、只保留最新内容；
// 发送失败按 retryDelaysMs 指数退避重试，重试次数用尽后丢弃并回调 onGiveUp。
export class NotificationSender {
  constructor({send, minIntervalMs = 10000, perMinuteLimit = null, retryDelaysMs = [
      60000, 120000, 240000
    ], clock = () =>
      Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = (timer) => clearTimeout(timer), onGiveUp = null} = {}) {
    this.send = send;
    this.minIntervalMs = minIntervalMs;
    this.perMinuteLimit = perMinuteLimit;
    this.retryDelaysMs = retryDelaysMs;
    this.clock = clock;
    this.schedule = schedule;
    this.cancel = cancel;
    this.onGiveUp = onGiveUp;
    this.lastSentAt = 0;
    this.sentTimestamps = [];
    this.pendingText = null;
    this.pendingTimer = null;
    this.retryTimer = null;
    this.retryCount = 0;
  }

  // 计算下次可发送还需等待的毫秒数：最小间隔与每分钟滑动窗口（60 秒）取较大者。
  nextWaitMs() {
    const now = this.clock();
    let wait = Math.max(0, this.lastSentAt + this.minIntervalMs - now);
    if (this.perMinuteLimit != null && this.perMinuteLimit > 0) {
      this.sentTimestamps = this.sentTimestamps.filter((timestamp) => now - timestamp < 60000);
      if (this.sentTimestamps.length >= this.perMinuteLimit) {
        wait = Math.max(wait, this.sentTimestamps[0] + 60000 - now);
      }
    }
    return wait;
  }

  // 提交一条待发内容：总是先记录最新文案，再按限速/重试状态安排发送。
  submit(text) {
    this.pendingText = text;
    if (this.pendingTimer || this.retryTimer) return {queued: true};
    const wait = this.nextWaitMs();
    if (wait === 0) {
      this.pendingText = null;
      this.dispatch(text);
      return {queued: false};
    }
    this.pendingTimer = this.schedule(() => this.flush(), wait);
    return {queued: true};
  }

  flush() {
    this.pendingTimer = null;
    const text = this.pendingText;
    this.pendingText = null;
    if (text == null) return;
    const wait = this.nextWaitMs();
    if (wait > 0) {
      // 等待期间限速参数被调小等场景：仍未到可发送时间则继续等待。
      this.pendingText = text;
      this.pendingTimer = this.schedule(() => this.flush(), wait);
      return;
    }
    this.dispatch(text);
  }

  async dispatch(text) {
    // 发送开始即占坑，避免发送期间的新提交绕过限速。
    const now = this.clock();
    this.lastSentAt = now;
    if (this.perMinuteLimit != null && this.perMinuteLimit > 0) {
      this.sentTimestamps.push(now);
    }
    try {
      await this.send(text);
      this.retryCount = 0;
    } catch (error) {
      this.handleFailure(text, error);
    }
  }

  handleFailure(text, error) {
    if (this.retryCount >= this.retryDelaysMs.length) {
      this.retryCount = 0;
      this.pendingText = null;
      this.onGiveUp?.(error);
      return;
    }
    const delay = this.retryDelaysMs[this.retryCount++];
    this.pendingText = text;
    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      const retryText = this.pendingText;
      this.pendingText = null;
      if (retryText != null) this.dispatch(retryText);
    }, delay);
  }

  dispose() {
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    if (this.retryTimer) this.cancel(this.retryTimer);
    this.pendingTimer = null;
    this.retryTimer = null;
    this.pendingText = null;
  }
}
