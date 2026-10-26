// 可移植的密码学随机源。
//
// 出处：https://github.com/xqy2006/ModelTrace  (MIT, Copyright (c) 2026 xqy2006)
// 对应 Python 侧的 random.SystemRandom 与 secrets.token_hex。
// Node 22 与浏览器都提供 globalThis.crypto，因此这一份代码宿主与前端共用。

function webCrypto(): Crypto {
  const source = (globalThis as { crypto?: Crypto }).crypto;
  if (source === undefined || typeof source.getRandomValues !== 'function') {
    throw new Error('fingerprint: no Web Crypto source available');
  }
  return source;
}

function fillRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  webCrypto().getRandomValues(bytes);
  return bytes;
}

/** `[0, maxExclusive)` 上的无偏整数（拒绝采样，与 Python `random.randrange` 同语义）。 */
export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`fingerprint: randomInt bound must be a positive integer, got ${maxExclusive}`);
  }
  if (maxExclusive > 0x100000000) throw new RangeError('fingerprint: randomInt bound exceeds 2^32');
  const limit = 0x100000000 - (0x100000000 % maxExclusive);
  for (;;) {
    const bytes = fillRandomBytes(4);
    const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    if (value < limit) return value % maxExclusive;
  }
}

/** `secrets.token_hex(n)`：n 个随机字节的十六进制串，长度 2n。 */
export function randomToken(bytes: number): string {
  let out = '';
  for (const byte of fillRandomBytes(bytes)) out += byte.toString(16).padStart(2, '0');
  return out;
}
