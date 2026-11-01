export class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export class Cache {
  constructor({
    maxEntries = 256,
    maxBytes = 32 * 1024 * 1024,
    now = Date.now,
  } = {}) {
    this.entries = new Map();
    this.bytes = 0;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.now = now;
    this.pending = new Map();
  }
  get(key) {
    const item = this.entries.get(key);
    if (!item) return;
    if (item.expires <= this.now()) {
      this.entries.delete(key);
      this.bytes -= item.size;
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.value;
  }
  set(key, value, ttl) {
    const size = Buffer.isBuffer(value)
      ? value.length
      : Buffer.byteLength(JSON.stringify(value));
    if (size > this.maxBytes) return value;
    const old = this.entries.get(key);
    if (old) this.bytes -= old.size;
    this.entries.delete(key);
    this.entries.set(key, { value, size, expires: this.now() + ttl });
    this.bytes += size;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const first = this.entries.keys().next().value;
      this.bytes -= this.entries.get(first).size;
      this.entries.delete(first);
    }
    return value;
  }
  async load(key, ttl, fn) {
    const value = this.get(key);
    if (value !== undefined) return value;
    if (this.pending.has(key)) return this.pending.get(key);
    const request = Promise.resolve()
      .then(fn)
      .then((value) => this.set(key, value, ttl))
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
export function limiter(concurrency = 4, maxQueued = 64) {
  let active = 0;
  const queue = [];
  return async (task) => {
    if (active >= concurrency) {
      if (queue.length >= maxQueued)
        throw new ServiceError(
          503,
          "The server is busy. Please retry shortly.",
        );
      await new Promise((resolve) => queue.push(resolve));
    } else active++;
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}
export function publicBase(value, { allowLocal = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an absolute URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (allowLocal && local && url.protocol === "http:")
    )
  )
    throw new Error(
      "PUBLIC_BASE_URL must be a root HTTPS origin (HTTP localhost is allowed in development).",
    );
  return url.origin;
}
