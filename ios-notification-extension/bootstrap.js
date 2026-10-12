/* Minimal Web APIs for JavaScriptCore; protocol and policy stay in shared TypeScript. */
/* global __encodeUTF8, __decodeUTF8, __randomBytes, __base64Encode, __base64Decode,
  __setTimer, __clearTimer, __parseURL, __fetch, __cancelFetch, __openSocket,
  __sendSocket, __closeSocket */
globalThis.global = globalThis;
globalThis.queueMicrotask = (task) => Promise.resolve().then(task);
globalThis.console = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
globalThis.performance = { now: () => Date.now() };
globalThis.TextEncoder = class {
  encode(value = '') { return Uint8Array.from(__encodeUTF8(String(value))); }
};
globalThis.TextDecoder = class {
  decode(value = new Uint8Array()) { return __decodeUTF8(Array.from(new Uint8Array(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength))); }
};
globalThis.crypto = {
  getRandomValues(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > 65536) throw new Error('Invalid random byte request');
    bytes.set(__randomBytes(bytes.length));
    return bytes;
  },
};
globalThis.btoa = (value) => __base64Encode(value);
globalThis.atob = (value) => __base64Decode(value);
globalThis.setTimeout = (callback, delay = 0, ...args) => __setTimer(() => callback(...args), Math.max(0, Number(delay) || 0));
globalThis.clearTimeout = (id) => __clearTimer(id);
globalThis.setInterval = (callback, delay, ...args) => {
  const state = { id: 0, stopped: false };
  const tick = () => { if (state.stopped) return; callback(...args); state.id = setTimeout(tick, delay); };
  state.id = setTimeout(tick, delay);
  return state;
};
globalThis.clearInterval = (state) => { state.stopped = true; clearTimeout(state.id); };
class Signal {
  aborted = false;
  reason = undefined;
  listeners = new Set();
  addEventListener(type, callback) { if (type === 'abort') this.listeners.add(callback); }
  removeEventListener(type, callback) { if (type === 'abort') this.listeners.delete(callback); }
  throwIfAborted() { if (this.aborted) throw this.reason; }
}
globalThis.AbortController = class {
  signal = new Signal();
  abort(reason = new Error('Aborted')) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    for (const callback of this.signal.listeners) callback();
    this.signal.listeners.clear();
  }
};
globalThis.URLSearchParams = class {
  constructor(query = '', onChange = () => {}) {
    this.onChange = onChange;
    this.entriesList = String(query).replace(/^\?/, '').split('&').filter(Boolean).map((item) => {
      const index = item.indexOf('=');
      const decode = (value) => decodeURIComponent(value.replace(/\+/g, ' '));
      return index < 0 ? [decode(item), ''] : [decode(item.slice(0, index)), decode(item.slice(index + 1))];
    });
  }
  get(key) { return this.entriesList.find(([name]) => name === key)?.[1] ?? null; }
  set(key, value) { this.delete(key); this.append(key, value); }
  append(key, value) { this.entriesList.push([String(key), String(value)]); this.onChange(this.toString()); }
  delete(key) { this.entriesList = this.entriesList.filter(([name]) => name !== key); this.onChange(this.toString()); }
  sort() {
    this.entriesList.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    this.onChange(this.toString());
  }
  toString() {
    const encode = (value) => encodeURIComponent(value).replace(/%20/g, '+')
      .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return this.entriesList.map((pair) => pair.map(encode).join('=')).join('&');
  }
};
globalThis.URL = class {
  constructor(value, base) {
    const result = __parseURL(String(value), base === undefined ? '' : String(base));
    if (!result) throw new TypeError('Invalid URL');
    Object.assign(this, result);
  }
  get origin() { return `${this.protocol}//${this.host}`; }
  get hostname() { return this.host.split(':')[0]; }
  get port() { return this.host.match(/:(\d+)$/)?.[1] ?? ''; }
  set port(value) { this.host = this.host.replace(/:\d+$/, '') + (value ? `:${value}` : ''); }
  get searchParams() {
    return new URLSearchParams(this.search, (query) => { this.search = query ? `?${query}` : ''; });
  }
  get href() { return this.toString(); }
  toString() { return `${this.protocol}//${this.host}${this.pathname || '/'}${this.search}${this.hash}`; }
};
globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
  const id = __fetch(String(url), options.method ?? 'GET', options.headers ?? {}, options.body ?? null, (error, response) => {
    options.signal?.removeEventListener('abort', cancel);
    if (error) { reject(new Error(error)); return; }
    resolve({
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      json: async () => JSON.parse(response.body),
      text: async () => response.body,
    });
  });
  const cancel = () => { __cancelFetch(id); reject(options.signal.reason ?? new Error('Aborted')); };
  options.signal?.addEventListener('abort', cancel);
  if (options.signal?.aborted) cancel();
});
globalThis.WebSocket = class {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  constructor(url) {
    this.id = __openSocket(String(url), (type, value) => {
      if (type === 'open') this.readyState = 1;
      if (type === 'close') this.readyState = 3;
      this[`on${type}`]?.(type === 'message' ? { data: value } : { message: value });
    });
  }
  send(message) { if (this.readyState !== 1) throw new Error('Socket closed'); __sendSocket(this.id, String(message)); }
  close() { this.readyState = 2; __closeSocket(this.id); }
};
