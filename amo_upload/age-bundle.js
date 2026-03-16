/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
function isBytes$2(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is positive integer. */
function anumber$2(n, title = '') {
    if (!Number.isSafeInteger(n) || n < 0) {
        const prefix = title && `"${title}" `;
        throw new Error(`${prefix}expected integer >= 0, got ${n}`);
    }
}
/** Asserts something is Uint8Array. */
function abytes$2(value, length, title = '') {
    const bytes = isBytes$2(value);
    const len = value?.length;
    const needsLen = length !== undefined;
    if (!bytes || (needsLen && len !== length)) {
        const prefix = title && `"${title}" `;
        const ofLen = needsLen ? ` of length ${length}` : '';
        const got = bytes ? `length=${len}` : `type=${typeof value}`;
        throw new Error(prefix + 'expected Uint8Array' + ofLen + ', got ' + got);
    }
    return value;
}
/** Asserts something is hash */
function ahash(h) {
    if (typeof h !== 'function' || typeof h.create !== 'function')
        throw new Error('Hash must wrapped by utils.createHasher');
    anumber$2(h.outputLen);
    anumber$2(h.blockLen);
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists$1(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput$1(out, instance) {
    abytes$2(out, undefined, 'digestInto() output');
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('"digestInto() output" expected to be of length >=' + min);
    }
}
/** Cast u8 / u16 / u32 to u32. */
function u32$1(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/** Zeroize a byte array. Warning: JS provides no guarantees. */
function clean$1(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Create DataView of an array for easy byte-level manipulation. */
function createView$1(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** The rotate right (circular right shift) operation for uint32 */
function rotr(word, shift) {
    return (word << (32 - shift)) | (word >>> shift);
}
/** The rotate left (circular left shift) operation for uint32 */
function rotl$1(word, shift) {
    return (word << shift) | ((word >>> (32 - shift)) >>> 0);
}
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
const isLE$1 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
/** The byte swap operation for uint32 */
function byteSwap(word) {
    return (((word << 24) & 0xff000000) |
        ((word << 8) & 0xff0000) |
        ((word >>> 8) & 0xff00) |
        ((word >>> 24) & 0xff));
}
/** In place byte swap for Uint32Array */
function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
    }
    return arr;
}
const swap32IfBE = isLE$1
    ? (u) => u
    : byteSwap32;
// Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
const hasHexBuiltin = /* @__PURE__ */ (() => 
// @ts-ignore
typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
// Array where index 0xf0 (240) is mapped to string 'f0'
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
/**
 * Convert byte array to hex string. Uses built-in function, when available.
 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
 */
function bytesToHex(bytes) {
    abytes$2(bytes);
    // @ts-ignore
    if (hasHexBuiltin)
        return bytes.toHex();
    // pre-caching improves the speed 6x
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
    }
    return hex;
}
// We use optimized technique to convert hex string to byte array
const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
    if (ch >= asciis._0 && ch <= asciis._9)
        return ch - asciis._0; // '2' => 50-48
    if (ch >= asciis.A && ch <= asciis.F)
        return ch - (asciis.A - 10); // 'B' => 66-(65-10)
    if (ch >= asciis.a && ch <= asciis.f)
        return ch - (asciis.a - 10); // 'b' => 98-(97-10)
    return;
}
/**
 * Convert hex string to byte array. Uses built-in function, when available.
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
function hexToBytes(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    // @ts-ignore
    if (hasHexBuiltin)
        return Uint8Array.fromHex(hex);
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
        throw new Error('hex string expected, got unpadded hex of length ' + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = asciiToBase16(hex.charCodeAt(hi));
        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
        if (n1 === undefined || n2 === undefined) {
            const char = hex[hi] + hex[hi + 1];
            throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
        }
        array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
    }
    return array;
}
/**
 * Converts string to bytes using UTF8 encoding.
 * Built-in doesn't validate input to be string: we do the check.
 * @example utf8ToBytes('abc') // Uint8Array.from([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error('string expected');
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Helper for KDFs: consumes uint8array or string.
 * When string is passed, does utf8 decoding, using TextDecoder.
 */
function kdfInputToBytes(data, errorTitle = '') {
    if (typeof data === 'string')
        return utf8ToBytes(data);
    return abytes$2(data, undefined, errorTitle);
}
/** Copies several Uint8Arrays into one. */
function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
        const a = arrays[i];
        abytes$2(a);
        sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
        const a = arrays[i];
        res.set(a, pad);
        pad += a.length;
    }
    return res;
}
/** Merges default options and passed options. */
function checkOpts$1(defaults, opts) {
    if (opts !== undefined && {}.toString.call(opts) !== '[object Object]')
        throw new Error('options must be object or undefined');
    const merged = Object.assign(defaults, opts);
    return merged;
}
/** Creates function with outputLen, blockLen, create properties from a class constructor. */
function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(undefined);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
}
/** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
function randomBytes$1(bytesLength = 32) {
    const cr = typeof globalThis === 'object' ? globalThis.crypto : null;
    if (typeof cr?.getRandomValues !== 'function')
        throw new Error('crypto.getRandomValues must be defined');
    return cr.getRandomValues(new Uint8Array(bytesLength));
}
/** Creates OID opts for NIST hashes, with prefix 06 09 60 86 48 01 65 03 04 02. */
const oidNist = (suffix) => ({
    oid: Uint8Array.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, suffix]),
});

/**
 * HMAC: RFC2104 message authentication code.
 * @module
 */
/** Internal class for HMAC. */
class _HMAC {
    oHash;
    iHash;
    blockLen;
    outputLen;
    finished = false;
    destroyed = false;
    constructor(hash, key) {
        ahash(hash);
        abytes$2(key, undefined, 'key');
        this.iHash = hash.create();
        if (typeof this.iHash.update !== 'function')
            throw new Error('Expected instance of class which extends utils.Hash');
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        // blockLen can be bigger than outputLen
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36;
        this.iHash.update(pad);
        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
        this.oHash = hash.create();
        // Undo internal XOR && apply outer XOR
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36 ^ 0x5c;
        this.oHash.update(pad);
        clean$1(pad);
    }
    update(buf) {
        aexists$1(this);
        this.iHash.update(buf);
        return this;
    }
    digestInto(out) {
        aexists$1(this);
        abytes$2(out, this.outputLen, 'output');
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
    }
    digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
    }
    _cloneInto(to) {
        // Create new instance without calling constructor since key already in state and we don't know it.
        to ||= Object.create(Object.getPrototypeOf(this), {});
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
    }
    clone() {
        return this._cloneInto();
    }
    destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
    }
}
/**
 * HMAC: RFC2104 message authentication code.
 * @param hash - function that would be used e.g. sha256
 * @param key - message key
 * @param message - message data
 * @example
 * import { hmac } from '@noble/hashes/hmac';
 * import { sha256 } from '@noble/hashes/sha2';
 * const mac1 = hmac(sha256, 'key', 'message');
 */
const hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new _HMAC(hash, key);

/**
 * HKDF (RFC 5869): extract + expand in one step.
 * See https://soatok.blog/2021/11/17/understanding-hkdf/.
 * @module
 */
/**
 * HKDF-extract from spec. Less important part. `HKDF-Extract(IKM, salt) -> PRK`
 * Arguments position differs from spec (IKM is first one, since it is not optional)
 * @param hash - hash function that would be used (e.g. sha256)
 * @param ikm - input keying material, the initial key
 * @param salt - optional salt value (a non-secret random value)
 */
function extract(hash, ikm, salt) {
    ahash(hash);
    // NOTE: some libraries treat zero-length array as 'not provided';
    // we don't, since we have undefined as 'not provided'
    // https://github.com/RustCrypto/KDFs/issues/15
    if (salt === undefined)
        salt = new Uint8Array(hash.outputLen);
    return hmac(hash, salt, ikm);
}
const HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
const EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
/**
 * HKDF-expand from the spec. The most important part. `HKDF-Expand(PRK, info, L) -> OKM`
 * @param hash - hash function that would be used (e.g. sha256)
 * @param prk - a pseudorandom key of at least HashLen octets (usually, the output from the extract step)
 * @param info - optional context and application specific information (can be a zero-length string)
 * @param length - length of output keying material in bytes
 */
function expand(hash, prk, info, length = 32) {
    ahash(hash);
    anumber$2(length, 'length');
    const olen = hash.outputLen;
    if (length > 255 * olen)
        throw new Error('Length must be <= 255*HashLen');
    const blocks = Math.ceil(length / olen);
    if (info === undefined)
        info = EMPTY_BUFFER;
    else
        abytes$2(info, undefined, 'info');
    // first L(ength) octets of T
    const okm = new Uint8Array(blocks * olen);
    // Re-use HMAC instance between blocks
    const HMAC = hmac.create(hash, prk);
    const HMACTmp = HMAC._cloneInto();
    const T = new Uint8Array(HMAC.outputLen);
    for (let counter = 0; counter < blocks; counter++) {
        HKDF_COUNTER[0] = counter + 1;
        // T(0) = empty string (zero length)
        // T(N) = HMAC-Hash(PRK, T(N-1) | info | N)
        HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T)
            .update(info)
            .update(HKDF_COUNTER)
            .digestInto(T);
        okm.set(T, olen * counter);
        HMAC._cloneInto(HMACTmp);
    }
    HMAC.destroy();
    HMACTmp.destroy();
    clean$1(T, HKDF_COUNTER);
    return okm.slice(0, length);
}
/**
 * HKDF (RFC 5869): derive keys from an initial input.
 * Combines hkdf_extract + hkdf_expand in one step
 * @param hash - hash function that would be used (e.g. sha256)
 * @param ikm - input keying material, the initial key
 * @param salt - optional salt value (a non-secret random value)
 * @param info - optional context and application specific information (can be a zero-length string)
 * @param length - length of output keying material in bytes
 * @example
 * import { hkdf } from '@noble/hashes/hkdf';
 * import { sha256 } from '@noble/hashes/sha2';
 * import { randomBytes } from '@noble/hashes/utils';
 * const inputKey = randomBytes(32);
 * const salt = randomBytes(32);
 * const info = 'application-key';
 * const hk1 = hkdf(sha256, inputKey, salt, info, 32);
 */
const hkdf = (hash, ikm, salt, info, length) => expand(hash, extract(hash, ikm, salt), info, length);

/**
 * Internal Merkle-Damgard hash utils.
 * @module
 */
/** Choice: a ? b : c */
function Chi(a, b, c) {
    return (a & b) ^ (~a & c);
}
/** Majority function, true if any two inputs is true. */
function Maj(a, b, c) {
    return (a & b) ^ (a & c) ^ (b & c);
}
/**
 * Merkle-Damgard hash construction base class.
 * Could be used to create MD5, RIPEMD, SHA1, SHA2.
 */
class HashMD {
    blockLen;
    outputLen;
    padOffset;
    isLE;
    // For partial updates less than block size
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE) {
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView$1(this.buffer);
    }
    update(data) {
        aexists$1(this);
        abytes$2(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path: we have at least one block in input, cast it to view and process
            if (take === blockLen) {
                const dataView = createView$1(data);
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(dataView, pos);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(view, 0);
                this.pos = 0;
            }
        }
        this.length += data.length;
        this.roundClean();
        return this;
    }
    digestInto(out) {
        aexists$1(this);
        aoutput$1(out, this);
        this.finished = true;
        // Padding
        // We can avoid allocation of buffer for padding completely if it
        // was previously not allocated here. But it won't change performance.
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        // append the bit '1' to the message
        buffer[pos++] = 0b10000000;
        clean$1(this.buffer.subarray(pos));
        // we have less than padOffset left in buffer, so we cannot put length in
        // current block, need process it and pad again
        if (this.padOffset > blockLen - pos) {
            this.process(view, 0);
            pos = 0;
        }
        // Pad until full block byte with zeros
        for (let i = pos; i < blockLen; i++)
            buffer[i] = 0;
        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
        // So we just write lowest 64 bits of that value.
        view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView$1(out);
        const len = this.outputLen;
        // NOTE: we do division by 4 later, which must be fused in single op with modulo by JIT
        if (len % 4)
            throw new Error('_sha2: outputLen must be aligned to 32bit');
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
            throw new Error('_sha2: outputLen bigger than state');
        for (let i = 0; i < outLen; i++)
            oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        to ||= new this.constructor();
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
            to.buffer.set(buffer);
        return to;
    }
    clone() {
        return this._cloneInto();
    }
}
/**
 * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
 * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
 */
/** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
/** Initial SHA384 state. Bits 0..64 of frac part of sqrt of primes 23..53 */
const SHA384_IV = /* @__PURE__ */ Uint32Array.from([
    0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
    0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
]);

/**
 * Internal helpers for u64. BigUint64Array is too slow as per 2025, so we implement it using Uint32Array.
 * @todo re-check https://issues.chromium.org/issues/42212588
 * @module
 */
const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
// for Shift in [0, 32)
const shrSH = (h, _l, s) => h >>> s;
const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in [1, 32)
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
// Left rotate for Shift in [1, 32)
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
// JS uses 32-bit signed integers for bitwise operations which means we cannot
// simple take carry out of low bit sum by shift, we need to use division.
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
// Addition with more than 2 elements
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;

/**
 * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
 * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
 * Check out [RFC 4634](https://www.rfc-editor.org/rfc/rfc4634) and
 * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 * @module
 */
/**
 * Round constants:
 * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
 */
// prettier-ignore
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
/** Reusable temporary buffer. "W" comes straight from spec. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
/** Internal 32-byte base SHA2 hash class. */
class SHA2_32B extends HashMD {
    constructor(outputLen) {
        super(64, outputLen, 8, false);
    }
    get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4)
            SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
            const W15 = SHA256_W[i - 15];
            const W2 = SHA256_W[i - 2];
            const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
            const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
        }
        // Compression function main loop, 64 rounds
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
            const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
            const T2 = (sigma0 + Maj(A, B, C)) | 0;
            H = G;
            G = F;
            F = E;
            E = (D + T1) | 0;
            D = C;
            C = B;
            B = A;
            A = (T1 + T2) | 0;
        }
        // Add the compressed chunk to the current hash value
        A = (A + this.A) | 0;
        B = (B + this.B) | 0;
        C = (C + this.C) | 0;
        D = (D + this.D) | 0;
        E = (E + this.E) | 0;
        F = (F + this.F) | 0;
        G = (G + this.G) | 0;
        H = (H + this.H) | 0;
        this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
        clean$1(SHA256_W);
    }
    destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean$1(this.buffer);
    }
}
/** Internal SHA2-256 hash class. */
class _SHA256 extends SHA2_32B {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    A = SHA256_IV[0] | 0;
    B = SHA256_IV[1] | 0;
    C = SHA256_IV[2] | 0;
    D = SHA256_IV[3] | 0;
    E = SHA256_IV[4] | 0;
    F = SHA256_IV[5] | 0;
    G = SHA256_IV[6] | 0;
    H = SHA256_IV[7] | 0;
    constructor() {
        super(32);
    }
}
// SHA2-512 is slower than sha256 in js because u64 operations are slow.
// Round contants
// First 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409
// prettier-ignore
const K512 = /* @__PURE__ */ (() => split([
    '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
    '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
    '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
    '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
    '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
    '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
    '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
    '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
    '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
    '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
    '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
    '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
    '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
    '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
    '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
    '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
    '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
    '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
    '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
    '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
].map(n => BigInt(n))))();
const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
// Reusable temporary buffers
const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
/** Internal 64-byte base SHA2 hash class. */
class SHA2_64B extends HashMD {
    constructor(outputLen) {
        super(128, outputLen, 16, false);
    }
    // prettier-ignore
    get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4) {
            SHA512_W_H[i] = view.getUint32(offset);
            SHA512_W_L[i] = view.getUint32((offset += 4));
        }
        for (let i = 16; i < 80; i++) {
            // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
            const W15h = SHA512_W_H[i - 15] | 0;
            const W15l = SHA512_W_L[i - 15] | 0;
            const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
            const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
            // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
            const W2h = SHA512_W_H[i - 2] | 0;
            const W2l = SHA512_W_L[i - 2] | 0;
            const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
            const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
            // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
            const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
            const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
            SHA512_W_H[i] = SUMh | 0;
            SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        // Compression function main loop, 80 rounds
        for (let i = 0; i < 80; i++) {
            // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
            const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
            const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
            //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const CHIh = (Eh & Fh) ^ (~Eh & Gh);
            const CHIl = (El & Fl) ^ (~El & Gl);
            // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
            // prettier-ignore
            const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
            const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
            const T1l = T1ll | 0;
            // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
            const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
            const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
            const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
            const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
            Hh = Gh | 0;
            Hl = Gl | 0;
            Gh = Fh | 0;
            Gl = Fl | 0;
            Fh = Eh | 0;
            Fl = El | 0;
            ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
            Dh = Ch | 0;
            Dl = Cl | 0;
            Ch = Bh | 0;
            Cl = Bl | 0;
            Bh = Ah | 0;
            Bl = Al | 0;
            const All = add3L(T1l, sigma0l, MAJl);
            Ah = add3H(All, T1h, sigma0h, MAJh);
            Al = All | 0;
        }
        // Add the compressed chunk to the current hash value
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
        clean$1(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
        clean$1(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
}
/** Internal SHA2-384 hash class. */
class _SHA384 extends SHA2_64B {
    Ah = SHA384_IV[0] | 0;
    Al = SHA384_IV[1] | 0;
    Bh = SHA384_IV[2] | 0;
    Bl = SHA384_IV[3] | 0;
    Ch = SHA384_IV[4] | 0;
    Cl = SHA384_IV[5] | 0;
    Dh = SHA384_IV[6] | 0;
    Dl = SHA384_IV[7] | 0;
    Eh = SHA384_IV[8] | 0;
    El = SHA384_IV[9] | 0;
    Fh = SHA384_IV[10] | 0;
    Fl = SHA384_IV[11] | 0;
    Gh = SHA384_IV[12] | 0;
    Gl = SHA384_IV[13] | 0;
    Hh = SHA384_IV[14] | 0;
    Hl = SHA384_IV[15] | 0;
    constructor() {
        super(48);
    }
}
/**
 * SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
 *
 * - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
 * - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 * - Each sha256 hash is executing 2^18 bit operations.
 * - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
 */
const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), 
/* @__PURE__ */ oidNist(0x01));
/** SHA2-384 hash function from RFC 4634. */
const sha384 = /* @__PURE__ */ createHasher(() => new _SHA384(), 
/* @__PURE__ */ oidNist(0x02));

/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function isBytes$1(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is Uint8Array. */
function abytes$1(b) {
    if (!isBytes$1(b))
        throw new Error('Uint8Array expected');
}
function isArrayOf(isString, arr) {
    if (!Array.isArray(arr))
        return false;
    if (arr.length === 0)
        return true;
    if (isString) {
        return arr.every((item) => typeof item === 'string');
    }
    else {
        return arr.every((item) => Number.isSafeInteger(item));
    }
}
function afn(input) {
    if (typeof input !== 'function')
        throw new Error('function expected');
    return true;
}
function astr(label, input) {
    if (typeof input !== 'string')
        throw new Error(`${label}: string expected`);
    return true;
}
function anumber$1(n) {
    if (!Number.isSafeInteger(n))
        throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
    if (!Array.isArray(input))
        throw new Error('array expected');
}
function astrArr(label, input) {
    if (!isArrayOf(true, input))
        throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
    if (!isArrayOf(false, input))
        throw new Error(`${label}: array of numbers expected`);
}
/**
 * @__NO_SIDE_EFFECTS__
 */
function chain(...args) {
    const id = (a) => a;
    // Wrap call in closure so JIT can inline calls
    const wrap = (a, b) => (c) => a(b(c));
    // Construct chain of args[-1].encode(args[-2].encode([...]))
    const encode = args.map((x) => x.encode).reduceRight(wrap, id);
    // Construct chain of args[0].decode(args[1].decode(...))
    const decode = args.map((x) => x.decode).reduce(wrap, id);
    return { encode, decode };
}
/**
 * Encodes integer radix representation to array of strings using alphabet and back.
 * Could also be array of strings.
 * @__NO_SIDE_EFFECTS__
 */
function alphabet(letters) {
    // mapping 1 to "b"
    const lettersA = typeof letters === 'string' ? letters.split('') : letters;
    const len = lettersA.length;
    astrArr('alphabet', lettersA);
    // mapping "b" to 1
    const indexes = new Map(lettersA.map((l, i) => [l, i]));
    return {
        encode: (digits) => {
            aArr(digits);
            return digits.map((i) => {
                if (!Number.isSafeInteger(i) || i < 0 || i >= len)
                    throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
                return lettersA[i];
            });
        },
        decode: (input) => {
            aArr(input);
            return input.map((letter) => {
                astr('alphabet.decode', letter);
                const i = indexes.get(letter);
                if (i === undefined)
                    throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
                return i;
            });
        },
    };
}
/**
 * @__NO_SIDE_EFFECTS__
 */
function join(separator = '') {
    astr('join', separator);
    return {
        encode: (from) => {
            astrArr('join.decode', from);
            return from.join(separator);
        },
        decode: (to) => {
            astr('join.decode', to);
            return to.split(separator);
        },
    };
}
/**
 * Pad strings array so it has integer number of bits
 * @__NO_SIDE_EFFECTS__
 */
function padding(bits, chr = '=') {
    anumber$1(bits);
    astr('padding', chr);
    return {
        encode(data) {
            astrArr('padding.encode', data);
            while ((data.length * bits) % 8)
                data.push(chr);
            return data;
        },
        decode(input) {
            astrArr('padding.decode', input);
            let end = input.length;
            if ((end * bits) % 8)
                throw new Error('padding: invalid, string should have whole number of bytes');
            for (; end > 0 && input[end - 1] === chr; end--) {
                const last = end - 1;
                const byte = last * bits;
                if (byte % 8 === 0)
                    throw new Error('padding: invalid, string has too much padding');
            }
            return input.slice(0, end);
        },
    };
}
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
const powers = /* @__PURE__ */ (() => {
    let res = [];
    for (let i = 0; i < 40; i++)
        res.push(2 ** i);
    return res;
})();
/**
 * Implemented with numbers, because BigInt is 5x slower
 */
function convertRadix2(data, from, to, padding) {
    aArr(data);
    if (from <= 0 || from > 32)
        throw new Error(`convertRadix2: wrong from=${from}`);
    if (to <= 0 || to > 32)
        throw new Error(`convertRadix2: wrong to=${to}`);
    if (radix2carry(from, to) > 32) {
        throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
    }
    let carry = 0;
    let pos = 0; // bitwise position in current element
    const max = powers[from];
    const mask = powers[to] - 1;
    const res = [];
    for (const n of data) {
        anumber$1(n);
        if (n >= max)
            throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
        carry = (carry << from) | n;
        if (pos + from > 32)
            throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
        pos += from;
        for (; pos >= to; pos -= to)
            res.push(((carry >> (pos - to)) & mask) >>> 0);
        const pow = powers[pos];
        if (pow === undefined)
            throw new Error('invalid carry');
        carry &= pow - 1; // clean carry, otherwise it will cause overflow
    }
    carry = (carry << (to - pos)) & mask;
    if (!padding && pos >= from)
        throw new Error('Excess padding');
    if (!padding && carry > 0)
        throw new Error(`Non-zero padding: ${carry}`);
    if (padding && pos > 0)
        res.push(carry >>> 0);
    return res;
}
/**
 * If both bases are power of same number (like `2**8 <-> 2**64`),
 * there is a linear algorithm. For now we have implementation for power-of-two bases only.
 * @__NO_SIDE_EFFECTS__
 */
function radix2(bits, revPadding = false) {
    anumber$1(bits);
    if (bits <= 0 || bits > 32)
        throw new Error('radix2: bits should be in (0..32]');
    if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
        throw new Error('radix2: carry overflow');
    return {
        encode: (bytes) => {
            if (!isBytes$1(bytes))
                throw new Error('radix2.encode input should be Uint8Array');
            return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
        },
        decode: (digits) => {
            anumArr('radix2.decode', digits);
            return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
        },
    };
}
function unsafeWrapper(fn) {
    afn(fn);
    return function (...args) {
        try {
            return fn.apply(null, args);
        }
        catch (e) { }
    };
}
// Built-in base64 conversion https://caniuse.com/mdn-javascript_builtins_uint8array_frombase64
// prettier-ignore
const hasBase64Builtin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toBase64 === 'function' &&
    typeof Uint8Array.fromBase64 === 'function')();
const decodeBase64Builtin = (s, isUrl) => {
    astr('base64', s);
    const re = /^[A-Za-z0-9=+/]+$/;
    const alphabet = 'base64';
    if (s.length > 0 && !re.test(s))
        throw new Error('invalid base64');
    return Uint8Array.fromBase64(s, { alphabet, lastChunkHandling: 'strict' });
};
/**
 * base64 from RFC 4648. Padded.
 * Use `base64nopad` for unpadded version.
 * Also check out `base64url`, `base64urlnopad`.
 * Falls back to built-in function, when available.
 * @example
 * ```js
 * base64.encode(Uint8Array.from([0x12, 0xab]));
 * // => 'Eqs='
 * base64.decode('Eqs=');
 * // => Uint8Array.from([0x12, 0xab])
 * ```
 */
// prettier-ignore
const base64 = hasBase64Builtin ? {
    encode(b) { abytes$1(b); return b.toBase64(); },
    decode(s) { return decodeBase64Builtin(s); },
} : chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
/**
 * base64 from RFC 4648. No padding.
 * Use `base64` for padded version.
 * @example
 * ```js
 * base64nopad.encode(Uint8Array.from([0x12, 0xab]));
 * // => 'Eqs'
 * base64nopad.decode('Eqs');
 * // => Uint8Array.from([0x12, 0xab])
 * ```
 */
const base64nopad = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), join(''));
const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function bech32Polymod(pre) {
    const b = pre >> 25;
    let chk = (pre & 0x1ffffff) << 5;
    for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
        if (((b >> i) & 1) === 1)
            chk ^= POLYMOD_GENERATORS[i];
    }
    return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
    const len = prefix.length;
    let chk = 1;
    for (let i = 0; i < len; i++) {
        const c = prefix.charCodeAt(i);
        if (c < 33 || c > 126)
            throw new Error(`Invalid prefix (${prefix})`);
        chk = bech32Polymod(chk) ^ (c >> 5);
    }
    chk = bech32Polymod(chk);
    for (let i = 0; i < len; i++)
        chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
    for (let v of words)
        chk = bech32Polymod(chk) ^ v;
    for (let i = 0; i < 6; i++)
        chk = bech32Polymod(chk);
    chk ^= encodingConst;
    return BECH_ALPHABET.encode(convertRadix2([chk % powers[30]], 30, 5, false));
}
/**
 * @__NO_SIDE_EFFECTS__
 */
function genBech32(encoding) {
    const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
    const _words = radix2(5);
    const fromWords = _words.decode;
    const toWords = _words.encode;
    const fromWordsUnsafe = unsafeWrapper(fromWords);
    function encode(prefix, words, limit = 90) {
        astr('bech32.encode prefix', prefix);
        if (isBytes$1(words))
            words = Array.from(words);
        anumArr('bech32.encode', words);
        const plen = prefix.length;
        if (plen === 0)
            throw new TypeError(`Invalid prefix length ${plen}`);
        const actualLength = plen + 7 + words.length;
        if (limit !== false && actualLength > limit)
            throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
        const lowered = prefix.toLowerCase();
        const sum = bechChecksum(lowered, words, ENCODING_CONST);
        return `${lowered}1${BECH_ALPHABET.encode(words)}${sum}`;
    }
    function decode(str, limit = 90) {
        astr('bech32.decode input', str);
        const slen = str.length;
        if (slen < 8 || (limit !== false && slen > limit))
            throw new TypeError(`invalid string length: ${slen} (${str}). Expected (8..${limit})`);
        // don't allow mixed case
        const lowered = str.toLowerCase();
        if (str !== lowered && str !== str.toUpperCase())
            throw new Error(`String must be lowercase or uppercase`);
        const sepIndex = lowered.lastIndexOf('1');
        if (sepIndex === 0 || sepIndex === -1)
            throw new Error(`Letter "1" must be present between prefix and data only`);
        const prefix = lowered.slice(0, sepIndex);
        const data = lowered.slice(sepIndex + 1);
        if (data.length < 6)
            throw new Error('Data must be at least 6 characters long');
        const words = BECH_ALPHABET.decode(data).slice(0, -6);
        const sum = bechChecksum(prefix, words, ENCODING_CONST);
        if (!data.endsWith(sum))
            throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
        return { prefix, words };
    }
    const decodeUnsafe = unsafeWrapper(decode);
    function decodeToBytes(str) {
        const { prefix, words } = decode(str, false);
        return { prefix, words, bytes: fromWords(words) };
    }
    function encodeFromBytes(prefix, bytes) {
        return encode(prefix, toWords(bytes));
    }
    return {
        encode,
        decode,
        encodeFromBytes,
        decodeToBytes,
        decodeUnsafe,
        fromWords,
        fromWordsUnsafe,
        toWords,
    };
}
/**
 * bech32 from BIP 173. Operates on words.
 * For high-level, check out scure-btc-signer:
 * https://github.com/paulmillr/scure-btc-signer.
 */
const bech32 = genBech32('bech32');

/**
 * PBKDF (RFC 2898). Can be used to create a key from password and salt.
 * @module
 */
// Common start and end for sync/async functions
function pbkdf2Init(hash, _password, _salt, _opts) {
    ahash(hash);
    const opts = checkOpts$1({ dkLen: 32, asyncTick: 10 }, _opts);
    const { c, dkLen, asyncTick } = opts;
    anumber$2(c, 'c');
    anumber$2(dkLen, 'dkLen');
    anumber$2(asyncTick, 'asyncTick');
    if (c < 1)
        throw new Error('iterations (c) must be >= 1');
    const password = kdfInputToBytes(_password, 'password');
    const salt = kdfInputToBytes(_salt, 'salt');
    // DK = PBKDF2(PRF, Password, Salt, c, dkLen);
    const DK = new Uint8Array(dkLen);
    // U1 = PRF(Password, Salt + INT_32_BE(i))
    const PRF = hmac.create(hash, password);
    const PRFSalt = PRF._cloneInto().update(salt);
    return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}
function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
    PRF.destroy();
    PRFSalt.destroy();
    if (prfW)
        prfW.destroy();
    clean$1(u);
    return DK;
}
/**
 * PBKDF2-HMAC: RFC 2898 key derivation function
 * @param hash - hash function that would be used e.g. sha256
 * @param password - password from which a derived key is generated
 * @param salt - cryptographic salt
 * @param opts - {c, dkLen} where c is work factor and dkLen is output message size
 * @example
 * const key = pbkdf2(sha256, 'password', 'salt', { dkLen: 32, c: Math.pow(2, 18) });
 */
function pbkdf2(hash, password, salt, opts) {
    const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
    let prfW; // Working copy
    const arr = new Uint8Array(4);
    const view = createView$1(arr);
    const u = new Uint8Array(PRF.outputLen);
    // DK = T1 + T2 + ⋯ + Tdklen/hlen
    for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
        // Ti = F(Password, Salt, c, i)
        const Ti = DK.subarray(pos, pos + PRF.outputLen);
        view.setInt32(0, ti, false);
        // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
        // U1 = PRF(Password, Salt + INT_32_BE(i))
        (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
        Ti.set(u.subarray(0, Ti.length));
        for (let ui = 1; ui < c; ui++) {
            // Uc = PRF(Password, Uc−1)
            PRF._cloneInto(prfW).update(u).digestInto(u);
            for (let i = 0; i < Ti.length; i++)
                Ti[i] ^= u[i];
        }
    }
    return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}

/**
 * RFC 7914 Scrypt KDF. Can be used to create a key from password and salt.
 * @module
 */
// The main Scrypt loop: uses Salsa extensively.
// Six versions of the function were tried, this is the fastest one.
// prettier-ignore
function XorAndSalsa(prev, pi, input, ii, out, oi) {
    // Based on https://cr.yp.to/salsa20.html
    // Xor blocks
    let y00 = prev[pi++] ^ input[ii++], y01 = prev[pi++] ^ input[ii++];
    let y02 = prev[pi++] ^ input[ii++], y03 = prev[pi++] ^ input[ii++];
    let y04 = prev[pi++] ^ input[ii++], y05 = prev[pi++] ^ input[ii++];
    let y06 = prev[pi++] ^ input[ii++], y07 = prev[pi++] ^ input[ii++];
    let y08 = prev[pi++] ^ input[ii++], y09 = prev[pi++] ^ input[ii++];
    let y10 = prev[pi++] ^ input[ii++], y11 = prev[pi++] ^ input[ii++];
    let y12 = prev[pi++] ^ input[ii++], y13 = prev[pi++] ^ input[ii++];
    let y14 = prev[pi++] ^ input[ii++], y15 = prev[pi++] ^ input[ii++];
    // Save state to temporary variables (salsa)
    let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
    // Main loop (salsa)
    for (let i = 0; i < 8; i += 2) {
        x04 ^= rotl$1(x00 + x12 | 0, 7);
        x08 ^= rotl$1(x04 + x00 | 0, 9);
        x12 ^= rotl$1(x08 + x04 | 0, 13);
        x00 ^= rotl$1(x12 + x08 | 0, 18);
        x09 ^= rotl$1(x05 + x01 | 0, 7);
        x13 ^= rotl$1(x09 + x05 | 0, 9);
        x01 ^= rotl$1(x13 + x09 | 0, 13);
        x05 ^= rotl$1(x01 + x13 | 0, 18);
        x14 ^= rotl$1(x10 + x06 | 0, 7);
        x02 ^= rotl$1(x14 + x10 | 0, 9);
        x06 ^= rotl$1(x02 + x14 | 0, 13);
        x10 ^= rotl$1(x06 + x02 | 0, 18);
        x03 ^= rotl$1(x15 + x11 | 0, 7);
        x07 ^= rotl$1(x03 + x15 | 0, 9);
        x11 ^= rotl$1(x07 + x03 | 0, 13);
        x15 ^= rotl$1(x11 + x07 | 0, 18);
        x01 ^= rotl$1(x00 + x03 | 0, 7);
        x02 ^= rotl$1(x01 + x00 | 0, 9);
        x03 ^= rotl$1(x02 + x01 | 0, 13);
        x00 ^= rotl$1(x03 + x02 | 0, 18);
        x06 ^= rotl$1(x05 + x04 | 0, 7);
        x07 ^= rotl$1(x06 + x05 | 0, 9);
        x04 ^= rotl$1(x07 + x06 | 0, 13);
        x05 ^= rotl$1(x04 + x07 | 0, 18);
        x11 ^= rotl$1(x10 + x09 | 0, 7);
        x08 ^= rotl$1(x11 + x10 | 0, 9);
        x09 ^= rotl$1(x08 + x11 | 0, 13);
        x10 ^= rotl$1(x09 + x08 | 0, 18);
        x12 ^= rotl$1(x15 + x14 | 0, 7);
        x13 ^= rotl$1(x12 + x15 | 0, 9);
        x14 ^= rotl$1(x13 + x12 | 0, 13);
        x15 ^= rotl$1(x14 + x13 | 0, 18);
    }
    // Write output (salsa)
    out[oi++] = (y00 + x00) | 0;
    out[oi++] = (y01 + x01) | 0;
    out[oi++] = (y02 + x02) | 0;
    out[oi++] = (y03 + x03) | 0;
    out[oi++] = (y04 + x04) | 0;
    out[oi++] = (y05 + x05) | 0;
    out[oi++] = (y06 + x06) | 0;
    out[oi++] = (y07 + x07) | 0;
    out[oi++] = (y08 + x08) | 0;
    out[oi++] = (y09 + x09) | 0;
    out[oi++] = (y10 + x10) | 0;
    out[oi++] = (y11 + x11) | 0;
    out[oi++] = (y12 + x12) | 0;
    out[oi++] = (y13 + x13) | 0;
    out[oi++] = (y14 + x14) | 0;
    out[oi++] = (y15 + x15) | 0;
}
function BlockMix(input, ii, out, oi, r) {
    // The block B is r 128-byte chunks (which is equivalent of 2r 64-byte chunks)
    let head = oi + 0;
    let tail = oi + 16 * r;
    for (let i = 0; i < 16; i++)
        out[tail + i] = input[ii + (2 * r - 1) * 16 + i]; // X ← B[2r−1]
    for (let i = 0; i < r; i++, head += 16, ii += 16) {
        // We write odd & even Yi at same time. Even: 0bXXXXX0 Odd:  0bXXXXX1
        XorAndSalsa(out, tail, input, ii, out, head); // head[i] = Salsa(blockIn[2*i] ^ tail[i-1])
        if (i > 0)
            tail += 16; // First iteration overwrites tmp value in tail
        XorAndSalsa(out, head, input, (ii += 16), out, tail); // tail[i] = Salsa(blockIn[2*i+1] ^ head[i])
    }
}
// Common prologue and epilogue for sync/async functions
function scryptInit(password, salt, _opts) {
    // Maxmem - 1GB+1KB by default
    const opts = checkOpts$1({
        dkLen: 32,
        asyncTick: 10,
        maxmem: 1024 ** 3 + 1024,
    }, _opts);
    const { N, r, p, dkLen, asyncTick, maxmem, onProgress } = opts;
    anumber$2(N, 'N');
    anumber$2(r, 'r');
    anumber$2(p, 'p');
    anumber$2(dkLen, 'dkLen');
    anumber$2(asyncTick, 'asyncTick');
    anumber$2(maxmem, 'maxmem');
    if (onProgress !== undefined && typeof onProgress !== 'function')
        throw new Error('progressCb must be a function');
    const blockSize = 128 * r;
    const blockSize32 = blockSize / 4;
    // Max N is 2^32 (Integrify is 32-bit).
    // Real limit can be 2^22: some JS engines limit Uint8Array to 4GB.
    // Spec check `N >= 2^(blockSize / 8)` is not done for compat with popular libs,
    // which used incorrect r: 1, p: 8. Also, the check seems to be a spec error:
    // https://www.rfc-editor.org/errata_search.php?rfc=7914
    const pow32 = Math.pow(2, 32);
    if (N <= 1 || (N & (N - 1)) !== 0 || N > pow32)
        throw new Error('"N" expected a power of 2, and 2^1 <= N <= 2^32');
    if (p < 1 || p > ((pow32 - 1) * 32) / blockSize)
        throw new Error('"p" expected integer 1..((2^32 - 1) * 32) / (128 * r)');
    if (dkLen < 1 || dkLen > (pow32 - 1) * 32)
        throw new Error('"dkLen" expected integer 1..(2^32 - 1) * 32');
    const memUsed = blockSize * (N + p);
    if (memUsed > maxmem)
        throw new Error('"maxmem" limit was hit, expected 128*r*(N+p) <= "maxmem"=' + maxmem);
    // [B0...Bp−1] ← PBKDF2HMAC-SHA256(Passphrase, Salt, 1, blockSize*ParallelizationFactor)
    // Since it has only one iteration there is no reason to use async variant
    const B = pbkdf2(sha256, password, salt, { c: 1, dkLen: blockSize * p });
    const B32 = u32$1(B);
    // Re-used between parallel iterations. Array(iterations) of B
    const V = u32$1(new Uint8Array(blockSize * N));
    const tmp = u32$1(new Uint8Array(blockSize));
    let blockMixCb = () => { };
    if (onProgress) {
        const totalBlockMix = 2 * N * p;
        // Invoke callback if progress changes from 10.01 to 10.02
        // Allows to draw smooth progress bar on up to 8K screen
        const callbackPer = Math.max(Math.floor(totalBlockMix / 10000), 1);
        let blockMixCnt = 0;
        blockMixCb = () => {
            blockMixCnt++;
            if (onProgress && (!(blockMixCnt % callbackPer) || blockMixCnt === totalBlockMix))
                onProgress(blockMixCnt / totalBlockMix);
        };
    }
    return { N, r, p, dkLen, blockSize32, V, B32, B, tmp, blockMixCb, asyncTick };
}
function scryptOutput(password, dkLen, B, V, tmp) {
    const res = pbkdf2(sha256, password, B, { c: 1, dkLen });
    clean$1(B, V, tmp);
    return res;
}
/**
 * Scrypt KDF from RFC 7914. See {@link ScryptOpts}.
 * @example
 * scrypt('password', 'salt', { N: 2**18, r: 8, p: 1, dkLen: 32 });
 */
function scrypt(password, salt, opts) {
    const { N, r, p, dkLen, blockSize32, V, B32, B, tmp, blockMixCb } = scryptInit(password, salt, opts);
    swap32IfBE(B32);
    for (let pi = 0; pi < p; pi++) {
        const Pi = blockSize32 * pi;
        for (let i = 0; i < blockSize32; i++)
            V[i] = B32[Pi + i]; // V[0] = B[i]
        for (let i = 0, pos = 0; i < N - 1; i++) {
            BlockMix(V, pos, V, (pos += blockSize32), r); // V[i] = BlockMix(V[i-1]);
            blockMixCb();
        }
        BlockMix(V, (N - 1) * blockSize32, B32, Pi, r); // Process last element
        blockMixCb();
        for (let i = 0; i < N; i++) {
            // First u32 of the last 64-byte block (u32 is LE)
            // & (N - 1) is % N as N is a power of 2, N & (N - 1) = 0 is checked above; >>> 0 for unsigned, input fits in u32
            const j = (B32[Pi + blockSize32 - 16] & (N - 1)) >>> 0; // j = Integrify(X) % iterations
            for (let k = 0; k < blockSize32; k++)
                tmp[k] = B32[Pi + k] ^ V[j * blockSize32 + k]; // tmp = B ^ V[j]
            BlockMix(tmp, 0, B32, Pi, r); // B = BlockMix(B ^ V[j])
            blockMixCb();
        }
    }
    swap32IfBE(B32);
    return scryptOutput(password, dkLen, B, V, tmp);
}

/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
function isBytes(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is boolean. */
function abool$1(b) {
    if (typeof b !== 'boolean')
        throw new Error(`boolean expected, not ${b}`);
}
/** Asserts something is positive integer. */
function anumber(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('positive integer expected, got ' + n);
}
/** Asserts something is Uint8Array. */
function abytes(value, length, title = '') {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== undefined;
    if (!bytes || (needsLen && len !== length)) {
        const prefix = title && `"${title}" `;
        const ofLen = needsLen ? ` of length ${length}` : '';
        const got = bytes ? `length=${len}` : `type=${typeof value}`;
        throw new Error(prefix + 'expected Uint8Array' + ofLen + ', got ' + got);
    }
    return value;
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput(out, instance) {
    abytes(out, undefined, 'output');
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('digestInto() expects output buffer of length at least ' + min);
    }
}
/** Cast u8 / u16 / u32 to u32. */
function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/** Zeroize a byte array. Warning: JS provides no guarantees. */
function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Create DataView of an array for easy byte-level manipulation. */
function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
function checkOpts(defaults, opts) {
    if (opts == null || typeof opts !== 'object')
        throw new Error('options must be defined');
    const merged = Object.assign(defaults, opts);
    return merged;
}
/** Compares 2 uint8array-s in kinda constant time. */
function equalBytes$1(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
/**
 * Wraps a cipher: validates args, ensures encrypt() can only be called once.
 * @__NO_SIDE_EFFECTS__
 */
const wrapCipher = (params, constructor) => {
    function wrappedCipher(key, ...args) {
        // Validate key
        abytes(key, undefined, 'key');
        // Big-Endian hardware is rare. Just in case someone still decides to run ciphers:
        if (!isLE)
            throw new Error('Non little-endian hardware is not yet supported');
        // Validate nonce if nonceLength is present
        if (params.nonceLength !== undefined) {
            const nonce = args[0];
            abytes(nonce, params.varSizeNonce ? undefined : params.nonceLength, 'nonce');
        }
        // Validate AAD if tagLength present
        const tagl = params.tagLength;
        if (tagl && args[1] !== undefined)
            abytes(args[1], undefined, 'AAD');
        const cipher = constructor(key, ...args);
        const checkOutput = (fnLength, output) => {
            if (output !== undefined) {
                if (fnLength !== 2)
                    throw new Error('cipher output not supported');
                abytes(output, undefined, 'output');
            }
        };
        // Create wrapped cipher with validation and single-use encryption
        let called = false;
        const wrCipher = {
            encrypt(data, output) {
                if (called)
                    throw new Error('cannot encrypt() twice with same key + nonce');
                called = true;
                abytes(data);
                checkOutput(cipher.encrypt.length, output);
                return cipher.encrypt(data, output);
            },
            decrypt(data, output) {
                abytes(data);
                if (tagl && data.length < tagl)
                    throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
                checkOutput(cipher.decrypt.length, output);
                return cipher.decrypt(data, output);
            },
        };
        return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
};
/**
 * By default, returns u8a of length.
 * When out is available, it checks it for validity and uses it.
 */
function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === undefined)
        return new Uint8Array(expectedLength);
    if (out.length !== expectedLength)
        throw new Error('"output" expected Uint8Array of length ' + expectedLength + ', got: ' + out.length);
    if (onlyAligned && !isAligned32$1(out))
        throw new Error('invalid output, must be aligned');
    return out;
}
function u64Lengths(dataLength, aadLength, isLE) {
    abool$1(isLE);
    const num = new Uint8Array(16);
    const view = createView(num);
    view.setBigUint64(0, BigInt(aadLength), isLE);
    view.setBigUint64(8, BigInt(dataLength), isLE);
    return num;
}
// Is byte array aligned to 4 byte offset (u32)?
function isAligned32$1(bytes) {
    return bytes.byteOffset % 4 === 0;
}
// copy bytes to new u8a (aligned). Because Buffer.slice is broken.
function copyBytes$2(bytes) {
    return Uint8Array.from(bytes);
}

/**
 * Basic utils for ARX (add-rotate-xor) salsa and chacha ciphers.

RFC8439 requires multi-step cipher stream, where
authKey starts with counter: 0, actual msg with counter: 1.

For this, we need a way to re-use nonce / counter:

    const counter = new Uint8Array(4);
    chacha(..., counter, ...); // counter is now 1
    chacha(..., counter, ...); // counter is now 2

This is complicated:

- 32-bit counters are enough, no need for 64-bit: max ArrayBuffer size in JS is 4GB
- Original papers don't allow mutating counters
- Counter overflow is undefined [^1]
- Idea A: allow providing (nonce | counter) instead of just nonce, re-use it
- Caveat: Cannot be re-used through all cases:
- * chacha has (counter | nonce)
- * xchacha has (nonce16 | counter | nonce16)
- Idea B: separate nonce / counter and provide separate API for counter re-use
- Caveat: there are different counter sizes depending on an algorithm.
- salsa & chacha also differ in structures of key & sigma:
  salsa20:      s[0] | k(4) | s[1] | nonce(2) | cnt(2) | s[2] | k(4) | s[3]
  chacha:       s(4) | k(8) | cnt(1) | nonce(3)
  chacha20orig: s(4) | k(8) | cnt(2) | nonce(2)
- Idea C: helper method such as `setSalsaState(key, nonce, sigma, data)`
- Caveat: we can't re-use counter array

xchacha [^2] uses the subkey and remaining 8 byte nonce with ChaCha20 as normal
(prefixed by 4 NUL bytes, since [RFC8439] specifies a 12-byte nonce).

[^1]: https://mailarchive.ietf.org/arch/msg/cfrg/gsOnTJzcbgG6OqD8Sc0GO5aR_tU/
[^2]: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#appendix-A.2

 * @module
 */
// Replaces `TextEncoder`, which is not available in all environments
const encodeStr = (str) => Uint8Array.from(str.split(''), (c) => c.charCodeAt(0));
const sigma16 = encodeStr('expand 16-byte k');
const sigma32 = encodeStr('expand 32-byte k');
const sigma16_32 = u32(sigma16);
const sigma32_32 = u32(sigma32);
/** Rotate left. */
function rotl(a, b) {
    return (a << b) | (a >>> (32 - b));
}
// Is byte array aligned to 4 byte offset (u32)?
function isAligned32(b) {
    return b.byteOffset % 4 === 0;
}
// Salsa and Chacha block length is always 512-bit
const BLOCK_LEN = 64;
const BLOCK_LEN32 = 16;
// new Uint32Array([2**32])   // => Uint32Array(1) [ 0 ]
// new Uint32Array([2**32-1]) // => Uint32Array(1) [ 4294967295 ]
const MAX_COUNTER = 2 ** 32 - 1;
const U32_EMPTY = Uint32Array.of();
function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
    const len = data.length;
    const block = new Uint8Array(BLOCK_LEN);
    const b32 = u32(block);
    // Make sure that buffers aligned to 4 bytes
    const isAligned = isAligned32(data) && isAligned32(output);
    const d32 = isAligned ? u32(data) : U32_EMPTY;
    const o32 = isAligned ? u32(output) : U32_EMPTY;
    for (let pos = 0; pos < len; counter++) {
        core(sigma, key, nonce, b32, counter, rounds);
        if (counter >= MAX_COUNTER)
            throw new Error('arx: counter overflow');
        const take = Math.min(BLOCK_LEN, len - pos);
        // aligned to 4 bytes
        if (isAligned && take === BLOCK_LEN) {
            const pos32 = pos / 4;
            if (pos % 4 !== 0)
                throw new Error('arx: invalid block position');
            for (let j = 0, posj; j < BLOCK_LEN32; j++) {
                posj = pos32 + j;
                o32[posj] = d32[posj] ^ b32[j];
            }
            pos += BLOCK_LEN;
            continue;
        }
        for (let j = 0, posj; j < take; j++) {
            posj = pos + j;
            output[posj] = data[posj] ^ block[j];
        }
        pos += take;
    }
}
/** Creates ARX-like (ChaCha, Salsa) cipher stream from core function. */
function createCipher(core, opts) {
    const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
    if (typeof core !== 'function')
        throw new Error('core must be a function');
    anumber(counterLength);
    anumber(rounds);
    abool$1(counterRight);
    abool$1(allowShortKeys);
    return (key, nonce, data, output, counter = 0) => {
        abytes(key, undefined, 'key');
        abytes(nonce, undefined, 'nonce');
        abytes(data, undefined, 'data');
        const len = data.length;
        if (output === undefined)
            output = new Uint8Array(len);
        abytes(output, undefined, 'output');
        anumber(counter);
        if (counter < 0 || counter >= MAX_COUNTER)
            throw new Error('arx: counter overflow');
        if (output.length < len)
            throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
        const toClean = [];
        // Key & sigma
        // key=16 -> sigma16, k=key|key
        // key=32 -> sigma32, k=key
        let l = key.length;
        let k;
        let sigma;
        if (l === 32) {
            toClean.push((k = copyBytes$2(key)));
            sigma = sigma32_32;
        }
        else if (l === 16 && allowShortKeys) {
            k = new Uint8Array(32);
            k.set(key);
            k.set(key, 16);
            sigma = sigma16_32;
            toClean.push(k);
        }
        else {
            abytes(key, 32, 'arx key');
            throw new Error('invalid key size');
            // throw new Error(`"arx key" expected Uint8Array of length 32, got length=${l}`);
        }
        // Nonce
        // salsa20:      8   (8-byte counter)
        // chacha20orig: 8   (8-byte counter)
        // chacha20:     12  (4-byte counter)
        // xsalsa20:     24  (16 -> hsalsa,  8 -> old nonce)
        // xchacha20:    24  (16 -> hchacha, 8 -> old nonce)
        // Align nonce to 4 bytes
        if (!isAligned32(nonce))
            toClean.push((nonce = copyBytes$2(nonce)));
        const k32 = u32(k);
        // hsalsa & hchacha: handle extended nonce
        if (extendNonceFn) {
            if (nonce.length !== 24)
                throw new Error(`arx: extended nonce must be 24 bytes`);
            extendNonceFn(sigma, k32, u32(nonce.subarray(0, 16)), k32);
            nonce = nonce.subarray(16);
        }
        // Handle nonce counter
        const nonceNcLen = 16 - counterLength;
        if (nonceNcLen !== nonce.length)
            throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
        // Pad counter when nonce is 64 bit
        if (nonceNcLen !== 12) {
            const nc = new Uint8Array(12);
            nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
            nonce = nc;
            toClean.push(nonce);
        }
        const n32 = u32(nonce);
        runCipher(core, sigma, k32, n32, data, output, counter, rounds);
        clean(...toClean);
        return output;
    };
}

/**
 * Poly1305 ([PDF](https://cr.yp.to/mac/poly1305-20050329.pdf),
 * [wiki](https://en.wikipedia.org/wiki/Poly1305))
 * is a fast and parallel secret-key message-authentication code suitable for
 * a wide variety of applications. It was standardized in
 * [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) and is now used in TLS 1.3.
 *
 * Polynomial MACs are not perfect for every situation:
 * they lack Random Key Robustness: the MAC can be forged, and can't be used in PAKE schemes.
 * See [invisible salamanders attack](https://keymaterial.net/2020/09/07/invisible-salamanders-in-aes-gcm-siv/).
 * To combat invisible salamanders, `hash(key)` can be included in ciphertext,
 * however, this would violate ciphertext indistinguishability:
 * an attacker would know which key was used - so `HKDF(key, i)`
 * could be used instead.
 *
 * Check out [original website](https://cr.yp.to/mac.html).
 * Based on Public Domain [poly1305-donna](https://github.com/floodyberry/poly1305-donna).
 * @module
 */
// prettier-ignore
function u8to16(a, i) {
    return (a[i++] & 0xff) | ((a[i++] & 0xff) << 8);
}
/** Poly1305 class. Prefer poly1305() function instead. */
class Poly1305 {
    blockLen = 16;
    outputLen = 16;
    buffer = new Uint8Array(16);
    r = new Uint16Array(10); // Allocating 1 array with .subarray() here is slower than 3
    h = new Uint16Array(10);
    pad = new Uint16Array(8);
    pos = 0;
    finished = false;
    // Can be speed-up using BigUint64Array, at the cost of complexity
    constructor(key) {
        key = copyBytes$2(abytes(key, 32, 'key'));
        const t0 = u8to16(key, 0);
        const t1 = u8to16(key, 2);
        const t2 = u8to16(key, 4);
        const t3 = u8to16(key, 6);
        const t4 = u8to16(key, 8);
        const t5 = u8to16(key, 10);
        const t6 = u8to16(key, 12);
        const t7 = u8to16(key, 14);
        // https://github.com/floodyberry/poly1305-donna/blob/e6ad6e091d30d7f4ec2d4f978be1fcfcbce72781/poly1305-donna-16.h#L47
        this.r[0] = t0 & 0x1fff;
        this.r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
        this.r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03;
        this.r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
        this.r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff;
        this.r[5] = (t4 >>> 1) & 0x1ffe;
        this.r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
        this.r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81;
        this.r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
        this.r[9] = (t7 >>> 5) & 0x007f;
        for (let i = 0; i < 8; i++)
            this.pad[i] = u8to16(key, 16 + 2 * i);
    }
    process(data, offset, isLast = false) {
        const hibit = isLast ? 0 : 1 << 11;
        const { h, r } = this;
        const r0 = r[0];
        const r1 = r[1];
        const r2 = r[2];
        const r3 = r[3];
        const r4 = r[4];
        const r5 = r[5];
        const r6 = r[6];
        const r7 = r[7];
        const r8 = r[8];
        const r9 = r[9];
        const t0 = u8to16(data, offset + 0);
        const t1 = u8to16(data, offset + 2);
        const t2 = u8to16(data, offset + 4);
        const t3 = u8to16(data, offset + 6);
        const t4 = u8to16(data, offset + 8);
        const t5 = u8to16(data, offset + 10);
        const t6 = u8to16(data, offset + 12);
        const t7 = u8to16(data, offset + 14);
        let h0 = h[0] + (t0 & 0x1fff);
        let h1 = h[1] + (((t0 >>> 13) | (t1 << 3)) & 0x1fff);
        let h2 = h[2] + (((t1 >>> 10) | (t2 << 6)) & 0x1fff);
        let h3 = h[3] + (((t2 >>> 7) | (t3 << 9)) & 0x1fff);
        let h4 = h[4] + (((t3 >>> 4) | (t4 << 12)) & 0x1fff);
        let h5 = h[5] + ((t4 >>> 1) & 0x1fff);
        let h6 = h[6] + (((t4 >>> 14) | (t5 << 2)) & 0x1fff);
        let h7 = h[7] + (((t5 >>> 11) | (t6 << 5)) & 0x1fff);
        let h8 = h[8] + (((t6 >>> 8) | (t7 << 8)) & 0x1fff);
        let h9 = h[9] + ((t7 >>> 5) | hibit);
        let c = 0;
        let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
        c = d0 >>> 13;
        d0 &= 0x1fff;
        d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
        c += d0 >>> 13;
        d0 &= 0x1fff;
        let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
        c = d1 >>> 13;
        d1 &= 0x1fff;
        d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
        c += d1 >>> 13;
        d1 &= 0x1fff;
        let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
        c = d2 >>> 13;
        d2 &= 0x1fff;
        d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
        c += d2 >>> 13;
        d2 &= 0x1fff;
        let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
        c = d3 >>> 13;
        d3 &= 0x1fff;
        d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
        c += d3 >>> 13;
        d3 &= 0x1fff;
        let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
        c = d4 >>> 13;
        d4 &= 0x1fff;
        d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
        c += d4 >>> 13;
        d4 &= 0x1fff;
        let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
        c = d5 >>> 13;
        d5 &= 0x1fff;
        d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
        c += d5 >>> 13;
        d5 &= 0x1fff;
        let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
        c = d6 >>> 13;
        d6 &= 0x1fff;
        d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
        c += d6 >>> 13;
        d6 &= 0x1fff;
        let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
        c = d7 >>> 13;
        d7 &= 0x1fff;
        d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
        c += d7 >>> 13;
        d7 &= 0x1fff;
        let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
        c = d8 >>> 13;
        d8 &= 0x1fff;
        d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
        c += d8 >>> 13;
        d8 &= 0x1fff;
        let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
        c = d9 >>> 13;
        d9 &= 0x1fff;
        d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
        c += d9 >>> 13;
        d9 &= 0x1fff;
        c = ((c << 2) + c) | 0;
        c = (c + d0) | 0;
        d0 = c & 0x1fff;
        c = c >>> 13;
        d1 += c;
        h[0] = d0;
        h[1] = d1;
        h[2] = d2;
        h[3] = d3;
        h[4] = d4;
        h[5] = d5;
        h[6] = d6;
        h[7] = d7;
        h[8] = d8;
        h[9] = d9;
    }
    finalize() {
        const { h, pad } = this;
        const g = new Uint16Array(10);
        let c = h[1] >>> 13;
        h[1] &= 0x1fff;
        for (let i = 2; i < 10; i++) {
            h[i] += c;
            c = h[i] >>> 13;
            h[i] &= 0x1fff;
        }
        h[0] += c * 5;
        c = h[0] >>> 13;
        h[0] &= 0x1fff;
        h[1] += c;
        c = h[1] >>> 13;
        h[1] &= 0x1fff;
        h[2] += c;
        g[0] = h[0] + 5;
        c = g[0] >>> 13;
        g[0] &= 0x1fff;
        for (let i = 1; i < 10; i++) {
            g[i] = h[i] + c;
            c = g[i] >>> 13;
            g[i] &= 0x1fff;
        }
        g[9] -= 1 << 13;
        let mask = (c ^ 1) - 1;
        for (let i = 0; i < 10; i++)
            g[i] &= mask;
        mask = ~mask;
        for (let i = 0; i < 10; i++)
            h[i] = (h[i] & mask) | g[i];
        h[0] = (h[0] | (h[1] << 13)) & 0xffff;
        h[1] = ((h[1] >>> 3) | (h[2] << 10)) & 0xffff;
        h[2] = ((h[2] >>> 6) | (h[3] << 7)) & 0xffff;
        h[3] = ((h[3] >>> 9) | (h[4] << 4)) & 0xffff;
        h[4] = ((h[4] >>> 12) | (h[5] << 1) | (h[6] << 14)) & 0xffff;
        h[5] = ((h[6] >>> 2) | (h[7] << 11)) & 0xffff;
        h[6] = ((h[7] >>> 5) | (h[8] << 8)) & 0xffff;
        h[7] = ((h[8] >>> 8) | (h[9] << 5)) & 0xffff;
        let f = h[0] + pad[0];
        h[0] = f & 0xffff;
        for (let i = 1; i < 8; i++) {
            f = (((h[i] + pad[i]) | 0) + (f >>> 16)) | 0;
            h[i] = f & 0xffff;
        }
        clean(g);
    }
    update(data) {
        aexists(this);
        abytes(data);
        data = copyBytes$2(data);
        const { buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path: we have at least one block in input
            if (take === blockLen) {
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(data, pos);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(buffer, 0, false);
                this.pos = 0;
            }
        }
        return this;
    }
    destroy() {
        clean(this.h, this.r, this.buffer, this.pad);
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, h } = this;
        let { pos } = this;
        if (pos) {
            buffer[pos++] = 1;
            for (; pos < 16; pos++)
                buffer[pos] = 0;
            this.process(buffer, 0, true);
        }
        this.finalize();
        let opos = 0;
        for (let i = 0; i < 8; i++) {
            out[opos++] = h[i] >>> 0;
            out[opos++] = h[i] >>> 8;
        }
        return out;
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
}
function wrapConstructorWithKey(hashCons) {
    const hashC = (msg, key) => hashCons(key).update(msg).digest();
    const tmp = hashCons(new Uint8Array(32)); // tmp array, used just once below
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (key) => hashCons(key);
    return hashC;
}
/** Poly1305 MAC from RFC 8439. */
const poly1305 = /** @__PURE__ */ (() => wrapConstructorWithKey((key) => new Poly1305(key)))();

/**
 * ChaCha stream cipher, released
 * in 2008. Developed after Salsa20, ChaCha aims to increase diffusion per round.
 * It was standardized in [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) and
 * is now used in TLS 1.3.
 *
 * [XChaCha20](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
 * extended-nonce variant is also provided. Similar to XSalsa, it's safe to use with
 * randomly-generated nonces.
 *
 * Check out [PDF](http://cr.yp.to/chacha/chacha-20080128.pdf) and
 * [wiki](https://en.wikipedia.org/wiki/Salsa20) and
 * [website](https://cr.yp.to/chacha.html).
 *
 * @module
 */
/** Identical to `chachaCore_small`. Unused. */
// prettier-ignore
function chachaCore(s, k, n, out, cnt, rounds = 20) {
    let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
    y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], // Key      Key     Key     Key
    y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], // Key      Key     Key     Key
    y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2]; // Counter  Counter	Nonce   Nonce
    // Save state to temporary variables
    let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
    for (let r = 0; r < rounds; r += 2) {
        x00 = (x00 + x04) | 0;
        x12 = rotl(x12 ^ x00, 16);
        x08 = (x08 + x12) | 0;
        x04 = rotl(x04 ^ x08, 12);
        x00 = (x00 + x04) | 0;
        x12 = rotl(x12 ^ x00, 8);
        x08 = (x08 + x12) | 0;
        x04 = rotl(x04 ^ x08, 7);
        x01 = (x01 + x05) | 0;
        x13 = rotl(x13 ^ x01, 16);
        x09 = (x09 + x13) | 0;
        x05 = rotl(x05 ^ x09, 12);
        x01 = (x01 + x05) | 0;
        x13 = rotl(x13 ^ x01, 8);
        x09 = (x09 + x13) | 0;
        x05 = rotl(x05 ^ x09, 7);
        x02 = (x02 + x06) | 0;
        x14 = rotl(x14 ^ x02, 16);
        x10 = (x10 + x14) | 0;
        x06 = rotl(x06 ^ x10, 12);
        x02 = (x02 + x06) | 0;
        x14 = rotl(x14 ^ x02, 8);
        x10 = (x10 + x14) | 0;
        x06 = rotl(x06 ^ x10, 7);
        x03 = (x03 + x07) | 0;
        x15 = rotl(x15 ^ x03, 16);
        x11 = (x11 + x15) | 0;
        x07 = rotl(x07 ^ x11, 12);
        x03 = (x03 + x07) | 0;
        x15 = rotl(x15 ^ x03, 8);
        x11 = (x11 + x15) | 0;
        x07 = rotl(x07 ^ x11, 7);
        x00 = (x00 + x05) | 0;
        x15 = rotl(x15 ^ x00, 16);
        x10 = (x10 + x15) | 0;
        x05 = rotl(x05 ^ x10, 12);
        x00 = (x00 + x05) | 0;
        x15 = rotl(x15 ^ x00, 8);
        x10 = (x10 + x15) | 0;
        x05 = rotl(x05 ^ x10, 7);
        x01 = (x01 + x06) | 0;
        x12 = rotl(x12 ^ x01, 16);
        x11 = (x11 + x12) | 0;
        x06 = rotl(x06 ^ x11, 12);
        x01 = (x01 + x06) | 0;
        x12 = rotl(x12 ^ x01, 8);
        x11 = (x11 + x12) | 0;
        x06 = rotl(x06 ^ x11, 7);
        x02 = (x02 + x07) | 0;
        x13 = rotl(x13 ^ x02, 16);
        x08 = (x08 + x13) | 0;
        x07 = rotl(x07 ^ x08, 12);
        x02 = (x02 + x07) | 0;
        x13 = rotl(x13 ^ x02, 8);
        x08 = (x08 + x13) | 0;
        x07 = rotl(x07 ^ x08, 7);
        x03 = (x03 + x04) | 0;
        x14 = rotl(x14 ^ x03, 16);
        x09 = (x09 + x14) | 0;
        x04 = rotl(x04 ^ x09, 12);
        x03 = (x03 + x04) | 0;
        x14 = rotl(x14 ^ x03, 8);
        x09 = (x09 + x14) | 0;
        x04 = rotl(x04 ^ x09, 7);
    }
    // Write output
    let oi = 0;
    out[oi++] = (y00 + x00) | 0;
    out[oi++] = (y01 + x01) | 0;
    out[oi++] = (y02 + x02) | 0;
    out[oi++] = (y03 + x03) | 0;
    out[oi++] = (y04 + x04) | 0;
    out[oi++] = (y05 + x05) | 0;
    out[oi++] = (y06 + x06) | 0;
    out[oi++] = (y07 + x07) | 0;
    out[oi++] = (y08 + x08) | 0;
    out[oi++] = (y09 + x09) | 0;
    out[oi++] = (y10 + x10) | 0;
    out[oi++] = (y11 + x11) | 0;
    out[oi++] = (y12 + x12) | 0;
    out[oi++] = (y13 + x13) | 0;
    out[oi++] = (y14 + x14) | 0;
    out[oi++] = (y15 + x15) | 0;
}
/**
 * ChaCha stream cipher. Conforms to RFC 8439 (IETF, TLS). 12-byte nonce, 4-byte counter.
 * With smaller nonce, it's not safe to make it random (CSPRNG), due to collision chance.
 */
const chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
    counterRight: false,
    counterLength: 4,
    allowShortKeys: false,
});
const ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
// Pad to digest size with zeros
const updatePadded = (h, msg) => {
    h.update(msg);
    const leftover = msg.length % 16;
    if (leftover)
        h.update(ZEROS16.subarray(leftover));
};
const ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
function computeTag(fn, key, nonce, ciphertext, AAD) {
    if (AAD !== undefined)
        abytes(AAD, undefined, 'AAD');
    const authKey = fn(key, nonce, ZEROS32);
    const lengths = u64Lengths(ciphertext.length, AAD ? AAD.length : 0, true);
    // Methods below can be replaced with
    // return poly1305_computeTag_small(authKey, lengths, ciphertext, AAD)
    const h = poly1305.create(authKey);
    if (AAD)
        updatePadded(h, AAD);
    updatePadded(h, ciphertext);
    h.update(lengths);
    const res = h.digest();
    clean(authKey, lengths);
    return res;
}
/**
 * AEAD algorithm from RFC 8439.
 * Salsa20 and chacha (RFC 8439) use poly1305 differently.
 * We could have composed them, but it's hard because of authKey:
 * In salsa20, authKey changes position in salsa stream.
 * In chacha, authKey can't be computed inside computeTag, it modifies the counter.
 */
const _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
    const tagLength = 16;
    return {
        encrypt(plaintext, output) {
            const plength = plaintext.length;
            output = getOutput(plength + tagLength, output, false);
            output.set(plaintext);
            const oPlain = output.subarray(0, -tagLength);
            // Actual encryption
            xorStream(key, nonce, oPlain, oPlain, 1);
            const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
            output.set(tag, plength); // append tag
            clean(tag);
            return output;
        },
        decrypt(ciphertext, output) {
            output = getOutput(ciphertext.length - tagLength, output, false);
            const data = ciphertext.subarray(0, -tagLength);
            const passedTag = ciphertext.subarray(-tagLength);
            const tag = computeTag(xorStream, key, nonce, data, AAD);
            if (!equalBytes$1(passedTag, tag))
                throw new Error('invalid tag');
            output.set(ciphertext.subarray(0, -tagLength));
            // Actual decryption
            xorStream(key, nonce, output, output, 1); // start stream with i=1
            clean(tag);
            return output;
        },
    };
};
/**
 * ChaCha20-Poly1305 from RFC 8439.
 *
 * Unsafe to use random nonces under the same key, due to collision chance.
 * Prefer XChaCha instead.
 */
const chacha20poly1305 = /* @__PURE__ */ wrapCipher({ blockSize: 64, nonceLength: 12, tagLength: 16 }, _poly1305_aead(chacha20));

/**
 * Hex, bytes and number utilities.
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const _0n$5 = /* @__PURE__ */ BigInt(0);
const _1n$6 = /* @__PURE__ */ BigInt(1);
function abool(value, title = '') {
    if (typeof value !== 'boolean') {
        const prefix = title && `"${title}" `;
        throw new Error(prefix + 'expected boolean, got type=' + typeof value);
    }
    return value;
}
// Used in weierstrass, der
function abignumber(n) {
    if (typeof n === 'bigint') {
        if (!isPosBig(n))
            throw new Error('positive bigint expected, got ' + n);
    }
    else
        anumber$2(n);
    return n;
}
function numberToHexUnpadded(num) {
    const hex = abignumber(num).toString(16);
    return hex.length & 1 ? '0' + hex : hex;
}
function hexToNumber(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    return hex === '' ? _0n$5 : BigInt('0x' + hex); // Big Endian
}
// BE: Big Endian, LE: Little Endian
function bytesToNumberBE(bytes) {
    return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
    return hexToNumber(bytesToHex(copyBytes$1(abytes$2(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
    anumber$2(len);
    n = abignumber(n);
    const res = hexToBytes(n.toString(16).padStart(len * 2, '0'));
    if (res.length !== len)
        throw new Error('number too large');
    return res;
}
function numberToBytesLE(n, len) {
    return numberToBytesBE(n, len).reverse();
}
/**
 * Copies Uint8Array. We can't use u8a.slice(), because u8a can be Buffer,
 * and Buffer#slice creates mutable copy. Never use Buffers!
 */
function copyBytes$1(bytes) {
    return Uint8Array.from(bytes);
}
/**
 * Decodes 7-bit ASCII string to Uint8Array, throws on non-ascii symbols
 * Should be safe to use for things expected to be ASCII.
 * Returns exact same result as `TextEncoder` for ASCII or throws.
 */
function asciiToBytes(ascii) {
    return Uint8Array.from(ascii, (c, i) => {
        const charCode = c.charCodeAt(0);
        if (c.length !== 1 || charCode > 127) {
            throw new Error(`string contains non-ASCII character "${ascii[i]}" with code ${charCode} at position ${i}`);
        }
        return charCode;
    });
}
// Is positive bigint
const isPosBig = (n) => typeof n === 'bigint' && _0n$5 <= n;
function inRange(n, min, max) {
    return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
/**
 * Asserts min <= n < max. NOTE: It's < max and not <= max.
 * @example
 * aInRange('x', x, 1n, 256n); // would assume x is in (1n..255n)
 */
function aInRange(title, n, min, max) {
    // Why min <= n < max and not a (min < n < max) OR b (min <= n <= max)?
    // consider P=256n, min=0n, max=P
    // - a for min=0 would require -1:          `inRange('x', x, -1n, P)`
    // - b would commonly require subtraction:  `inRange('x', x, 0n, P - 1n)`
    // - our way is the cleanest:               `inRange('x', x, 0n, P)
    if (!inRange(n, min, max))
        throw new Error('expected valid ' + title + ': ' + min + ' <= n < ' + max + ', got ' + n);
}
// Bit operations
/**
 * Calculates amount of bits in a bigint.
 * Same as `n.toString(2).length`
 * TODO: merge with nLength in modular
 */
function bitLen(n) {
    let len;
    for (len = 0; n > _0n$5; n >>= _1n$6, len += 1)
        ;
    return len;
}
/**
 * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
 * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
 */
const bitMask = (n) => (_1n$6 << BigInt(n)) - _1n$6;
/**
 * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
 * @returns function that will call DRBG until 2nd arg returns something meaningful
 * @example
 *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
 *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
 */
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
    anumber$2(hashLen, 'hashLen');
    anumber$2(qByteLen, 'qByteLen');
    if (typeof hmacFn !== 'function')
        throw new Error('hmacFn must be a function');
    const u8n = (len) => new Uint8Array(len); // creates Uint8Array
    const NULL = Uint8Array.of();
    const byte0 = Uint8Array.of(0x00);
    const byte1 = Uint8Array.of(0x01);
    const _maxDrbgIters = 1000;
    // Step B, Step C: set hashLen to 8*ceil(hlen/8)
    let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
    let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
    let i = 0; // Iterations counter, will throw when over 1000
    const reset = () => {
        v.fill(1);
        k.fill(0);
        i = 0;
    };
    const h = (...msgs) => hmacFn(k, concatBytes(v, ...msgs)); // hmac(k)(v, ...values)
    const reseed = (seed = NULL) => {
        // HMAC-DRBG reseed() function. Steps D-G
        k = h(byte0, seed); // k = hmac(k || v || 0x00 || seed)
        v = h(); // v = hmac(k || v)
        if (seed.length === 0)
            return;
        k = h(byte1, seed); // k = hmac(k || v || 0x01 || seed)
        v = h(); // v = hmac(k || v)
    };
    const gen = () => {
        // HMAC-DRBG generate() function
        if (i++ >= _maxDrbgIters)
            throw new Error('drbg: tried max amount of iterations');
        let len = 0;
        const out = [];
        while (len < qByteLen) {
            v = h();
            const sl = v.slice();
            out.push(sl);
            len += v.length;
        }
        return concatBytes(...out);
    };
    const genUntil = (seed, pred) => {
        reset();
        reseed(seed); // Steps D-G
        let res = undefined; // Step H: grind until k is in [1..n-1]
        while (!(res = pred(gen())))
            reseed();
        reset();
        return res;
    };
    return genUntil;
}
function validateObject(object, fields = {}, optFields = {}) {
    if (!object || typeof object !== 'object')
        throw new Error('expected valid options object');
    function checkField(fieldName, expectedType, isOpt) {
        const val = object[fieldName];
        if (isOpt && val === undefined)
            return;
        const current = typeof val;
        if (current !== expectedType || val === null)
            throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
    }
    const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
    iter(fields, false);
    iter(optFields, true);
}
/**
 * Memoizes (caches) computation result.
 * Uses WeakMap: the value is going auto-cleaned by GC after last reference is removed.
 */
function memoized(fn) {
    const map = new WeakMap();
    return (arg, ...args) => {
        const val = map.get(arg);
        if (val !== undefined)
            return val;
        const computed = fn(arg, ...args);
        map.set(arg, computed);
        return computed;
    };
}

/**
 * Utils for modular division and fields.
 * Field over 11 is a finite (Galois) field is integer number operations `mod 11`.
 * There is no division: it is replaced by modular multiplicative inverse.
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// Numbers aren't used in x25519 / x448 builds
// prettier-ignore
const _0n$4 = /* @__PURE__ */ BigInt(0), _1n$5 = /* @__PURE__ */ BigInt(1), _2n$4 = /* @__PURE__ */ BigInt(2);
// prettier-ignore
const _3n$2 = /* @__PURE__ */ BigInt(3), _4n$1 = /* @__PURE__ */ BigInt(4), _5n$1 = /* @__PURE__ */ BigInt(5);
// prettier-ignore
const _7n$1 = /* @__PURE__ */ BigInt(7), _8n = /* @__PURE__ */ BigInt(8), _9n = /* @__PURE__ */ BigInt(9);
const _16n = /* @__PURE__ */ BigInt(16);
// Calculates a modulo b
function mod$1(a, b) {
    const result = a % b;
    return result >= _0n$4 ? result : b + result;
}
/** Does `x^(2^power)` mod p. `pow2(30, 4)` == `30^(2^4)` */
function pow2(x, power, modulo) {
    let res = x;
    while (power-- > _0n$4) {
        res *= res;
        res %= modulo;
    }
    return res;
}
/**
 * Inverses number over modulo.
 * Implemented using [Euclidean GCD](https://brilliant.org/wiki/extended-euclidean-algorithm/).
 */
function invert(number, modulo) {
    if (number === _0n$4)
        throw new Error('invert: expected non-zero number');
    if (modulo <= _0n$4)
        throw new Error('invert: expected positive modulus, got ' + modulo);
    // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
    let a = mod$1(number, modulo);
    let b = modulo;
    // prettier-ignore
    let x = _0n$4, u = _1n$5;
    while (a !== _0n$4) {
        // JIT applies optimization if those two lines follow each other
        const q = b / a;
        const r = b % a;
        const m = x - u * q;
        // prettier-ignore
        b = a, a = r, x = u, u = m;
    }
    const gcd = b;
    if (gcd !== _1n$5)
        throw new Error('invert: does not exist');
    return mod$1(x, modulo);
}
function assertIsSquare(Fp, root, n) {
    if (!Fp.eql(Fp.sqr(root), n))
        throw new Error('Cannot find square root');
}
// Not all roots are possible! Example which will throw:
// const NUM =
// n = 72057594037927816n;
// Fp = Field(BigInt('0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab'));
function sqrt3mod4(Fp, n) {
    const p1div4 = (Fp.ORDER + _1n$5) / _4n$1;
    const root = Fp.pow(n, p1div4);
    assertIsSquare(Fp, root, n);
    return root;
}
function sqrt5mod8(Fp, n) {
    const p5div8 = (Fp.ORDER - _5n$1) / _8n;
    const n2 = Fp.mul(n, _2n$4);
    const v = Fp.pow(n2, p5div8);
    const nv = Fp.mul(n, v);
    const i = Fp.mul(Fp.mul(nv, _2n$4), v);
    const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
    assertIsSquare(Fp, root, n);
    return root;
}
// Based on RFC9380, Kong algorithm
// prettier-ignore
function sqrt9mod16(P) {
    const Fp_ = Field(P);
    const tn = tonelliShanks(P);
    const c1 = tn(Fp_, Fp_.neg(Fp_.ONE)); //  1. c1 = sqrt(-1) in F, i.e., (c1^2) == -1 in F
    const c2 = tn(Fp_, c1); //  2. c2 = sqrt(c1) in F, i.e., (c2^2) == c1 in F
    const c3 = tn(Fp_, Fp_.neg(c1)); //  3. c3 = sqrt(-c1) in F, i.e., (c3^2) == -c1 in F
    const c4 = (P + _7n$1) / _16n; //  4. c4 = (q + 7) / 16        # Integer arithmetic
    return (Fp, n) => {
        let tv1 = Fp.pow(n, c4); //  1. tv1 = x^c4
        let tv2 = Fp.mul(tv1, c1); //  2. tv2 = c1 * tv1
        const tv3 = Fp.mul(tv1, c2); //  3. tv3 = c2 * tv1
        const tv4 = Fp.mul(tv1, c3); //  4. tv4 = c3 * tv1
        const e1 = Fp.eql(Fp.sqr(tv2), n); //  5.  e1 = (tv2^2) == x
        const e2 = Fp.eql(Fp.sqr(tv3), n); //  6.  e2 = (tv3^2) == x
        tv1 = Fp.cmov(tv1, tv2, e1); //  7. tv1 = CMOV(tv1, tv2, e1)  # Select tv2 if (tv2^2) == x
        tv2 = Fp.cmov(tv4, tv3, e2); //  8. tv2 = CMOV(tv4, tv3, e2)  # Select tv3 if (tv3^2) == x
        const e3 = Fp.eql(Fp.sqr(tv2), n); //  9.  e3 = (tv2^2) == x
        const root = Fp.cmov(tv1, tv2, e3); // 10.  z = CMOV(tv1, tv2, e3)   # Select sqrt from tv1 & tv2
        assertIsSquare(Fp, root, n);
        return root;
    };
}
/**
 * Tonelli-Shanks square root search algorithm.
 * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
 * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
 * @param P field order
 * @returns function that takes field Fp (created from P) and number n
 */
function tonelliShanks(P) {
    // Initialization (precomputation).
    // Caching initialization could boost perf by 7%.
    if (P < _3n$2)
        throw new Error('sqrt is not defined for small field');
    // Factor P - 1 = Q * 2^S, where Q is odd
    let Q = P - _1n$5;
    let S = 0;
    while (Q % _2n$4 === _0n$4) {
        Q /= _2n$4;
        S++;
    }
    // Find the first quadratic non-residue Z >= 2
    let Z = _2n$4;
    const _Fp = Field(P);
    while (FpLegendre(_Fp, Z) === 1) {
        // Basic primality test for P. After x iterations, chance of
        // not finding quadratic non-residue is 2^x, so 2^1000.
        if (Z++ > 1000)
            throw new Error('Cannot find square root: probably non-prime P');
    }
    // Fast-path; usually done before Z, but we do "primality test".
    if (S === 1)
        return sqrt3mod4;
    // Slow-path
    // TODO: test on Fp2 and others
    let cc = _Fp.pow(Z, Q); // c = z^Q
    const Q1div2 = (Q + _1n$5) / _2n$4;
    return function tonelliSlow(Fp, n) {
        if (Fp.is0(n))
            return n;
        // Check if n is a quadratic residue using Legendre symbol
        if (FpLegendre(Fp, n) !== 1)
            throw new Error('Cannot find square root');
        // Initialize variables for the main loop
        let M = S;
        let c = Fp.mul(Fp.ONE, cc); // c = z^Q, move cc from field _Fp into field Fp
        let t = Fp.pow(n, Q); // t = n^Q, first guess at the fudge factor
        let R = Fp.pow(n, Q1div2); // R = n^((Q+1)/2), first guess at the square root
        // Main loop
        // while t != 1
        while (!Fp.eql(t, Fp.ONE)) {
            if (Fp.is0(t))
                return Fp.ZERO; // if t=0 return R=0
            let i = 1;
            // Find the smallest i >= 1 such that t^(2^i) ≡ 1 (mod P)
            let t_tmp = Fp.sqr(t); // t^(2^1)
            while (!Fp.eql(t_tmp, Fp.ONE)) {
                i++;
                t_tmp = Fp.sqr(t_tmp); // t^(2^2)...
                if (i === M)
                    throw new Error('Cannot find square root');
            }
            // Calculate the exponent for b: 2^(M - i - 1)
            const exponent = _1n$5 << BigInt(M - i - 1); // bigint is important
            const b = Fp.pow(c, exponent); // b = 2^(M - i - 1)
            // Update variables
            M = i;
            c = Fp.sqr(b); // c = b^2
            t = Fp.mul(t, c); // t = (t * b^2)
            R = Fp.mul(R, b); // R = R*b
        }
        return R;
    };
}
/**
 * Square root for a finite field. Will try optimized versions first:
 *
 * 1. P ≡ 3 (mod 4)
 * 2. P ≡ 5 (mod 8)
 * 3. P ≡ 9 (mod 16)
 * 4. Tonelli-Shanks algorithm
 *
 * Different algorithms can give different roots, it is up to user to decide which one they want.
 * For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
 */
function FpSqrt(P) {
    // P ≡ 3 (mod 4) => √n = n^((P+1)/4)
    if (P % _4n$1 === _3n$2)
        return sqrt3mod4;
    // P ≡ 5 (mod 8) => Atkin algorithm, page 10 of https://eprint.iacr.org/2012/685.pdf
    if (P % _8n === _5n$1)
        return sqrt5mod8;
    // P ≡ 9 (mod 16) => Kong algorithm, page 11 of https://eprint.iacr.org/2012/685.pdf (algorithm 4)
    if (P % _16n === _9n)
        return sqrt9mod16(P);
    // Tonelli-Shanks algorithm
    return tonelliShanks(P);
}
// prettier-ignore
const FIELD_FIELDS = [
    'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
    'eql', 'add', 'sub', 'mul', 'pow', 'div',
    'addN', 'subN', 'mulN', 'sqrN'
];
function validateField(field) {
    const initial = {
        ORDER: 'bigint',
        BYTES: 'number',
        BITS: 'number',
    };
    const opts = FIELD_FIELDS.reduce((map, val) => {
        map[val] = 'function';
        return map;
    }, initial);
    validateObject(field, opts);
    // const max = 16384;
    // if (field.BYTES < 1 || field.BYTES > max) throw new Error('invalid field');
    // if (field.BITS < 1 || field.BITS > 8 * max) throw new Error('invalid field');
    return field;
}
// Generic field functions
/**
 * Same as `pow` but for Fp: non-constant-time.
 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
 */
function FpPow(Fp, num, power) {
    if (power < _0n$4)
        throw new Error('invalid exponent, negatives unsupported');
    if (power === _0n$4)
        return Fp.ONE;
    if (power === _1n$5)
        return num;
    let p = Fp.ONE;
    let d = num;
    while (power > _0n$4) {
        if (power & _1n$5)
            p = Fp.mul(p, d);
        d = Fp.sqr(d);
        power >>= _1n$5;
    }
    return p;
}
/**
 * Efficiently invert an array of Field elements.
 * Exception-free. Will return `undefined` for 0 elements.
 * @param passZero map 0 to 0 (instead of undefined)
 */
function FpInvertBatch(Fp, nums, passZero = false) {
    const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : undefined);
    // Walk from first to last, multiply them by each other MOD p
    const multipliedAcc = nums.reduce((acc, num, i) => {
        if (Fp.is0(num))
            return acc;
        inverted[i] = acc;
        return Fp.mul(acc, num);
    }, Fp.ONE);
    // Invert last element
    const invertedAcc = Fp.inv(multipliedAcc);
    // Walk from last to first, multiply them by inverted each other MOD p
    nums.reduceRight((acc, num, i) => {
        if (Fp.is0(num))
            return acc;
        inverted[i] = Fp.mul(acc, inverted[i]);
        return Fp.mul(acc, num);
    }, invertedAcc);
    return inverted;
}
/**
 * Legendre symbol.
 * Legendre constant is used to calculate Legendre symbol (a | p)
 * which denotes the value of a^((p-1)/2) (mod p).
 *
 * * (a | p) ≡ 1    if a is a square (mod p), quadratic residue
 * * (a | p) ≡ -1   if a is not a square (mod p), quadratic non residue
 * * (a | p) ≡ 0    if a ≡ 0 (mod p)
 */
function FpLegendre(Fp, n) {
    // We can use 3rd argument as optional cache of this value
    // but seems unneeded for now. The operation is very fast.
    const p1mod2 = (Fp.ORDER - _1n$5) / _2n$4;
    const powered = Fp.pow(n, p1mod2);
    const yes = Fp.eql(powered, Fp.ONE);
    const zero = Fp.eql(powered, Fp.ZERO);
    const no = Fp.eql(powered, Fp.neg(Fp.ONE));
    if (!yes && !zero && !no)
        throw new Error('invalid Legendre symbol result');
    return yes ? 1 : zero ? 0 : -1;
}
// CURVE.n lengths
function nLength(n, nBitLength) {
    // Bit size, byte size of CURVE.n
    if (nBitLength !== undefined)
        anumber$2(nBitLength);
    const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
    const nByteLength = Math.ceil(_nBitLength / 8);
    return { nBitLength: _nBitLength, nByteLength };
}
class _Field {
    ORDER;
    BITS;
    BYTES;
    isLE;
    ZERO = _0n$4;
    ONE = _1n$5;
    _lengths;
    _sqrt; // cached sqrt
    _mod;
    constructor(ORDER, opts = {}) {
        if (ORDER <= _0n$4)
            throw new Error('invalid field: expected ORDER > 0, got ' + ORDER);
        let _nbitLength = undefined;
        this.isLE = false;
        if (opts != null && typeof opts === 'object') {
            if (typeof opts.BITS === 'number')
                _nbitLength = opts.BITS;
            if (typeof opts.sqrt === 'function')
                this.sqrt = opts.sqrt;
            if (typeof opts.isLE === 'boolean')
                this.isLE = opts.isLE;
            if (opts.allowedLengths)
                this._lengths = opts.allowedLengths?.slice();
            if (typeof opts.modFromBytes === 'boolean')
                this._mod = opts.modFromBytes;
        }
        const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
        if (nByteLength > 2048)
            throw new Error('invalid field: expected ORDER of <= 2048 bytes');
        this.ORDER = ORDER;
        this.BITS = nBitLength;
        this.BYTES = nByteLength;
        this._sqrt = undefined;
        Object.preventExtensions(this);
    }
    create(num) {
        return mod$1(num, this.ORDER);
    }
    isValid(num) {
        if (typeof num !== 'bigint')
            throw new Error('invalid field element: expected bigint, got ' + typeof num);
        return _0n$4 <= num && num < this.ORDER; // 0 is valid element, but it's not invertible
    }
    is0(num) {
        return num === _0n$4;
    }
    // is valid and invertible
    isValidNot0(num) {
        return !this.is0(num) && this.isValid(num);
    }
    isOdd(num) {
        return (num & _1n$5) === _1n$5;
    }
    neg(num) {
        return mod$1(-num, this.ORDER);
    }
    eql(lhs, rhs) {
        return lhs === rhs;
    }
    sqr(num) {
        return mod$1(num * num, this.ORDER);
    }
    add(lhs, rhs) {
        return mod$1(lhs + rhs, this.ORDER);
    }
    sub(lhs, rhs) {
        return mod$1(lhs - rhs, this.ORDER);
    }
    mul(lhs, rhs) {
        return mod$1(lhs * rhs, this.ORDER);
    }
    pow(num, power) {
        return FpPow(this, num, power);
    }
    div(lhs, rhs) {
        return mod$1(lhs * invert(rhs, this.ORDER), this.ORDER);
    }
    // Same as above, but doesn't normalize
    sqrN(num) {
        return num * num;
    }
    addN(lhs, rhs) {
        return lhs + rhs;
    }
    subN(lhs, rhs) {
        return lhs - rhs;
    }
    mulN(lhs, rhs) {
        return lhs * rhs;
    }
    inv(num) {
        return invert(num, this.ORDER);
    }
    sqrt(num) {
        // Caching _sqrt speeds up sqrt9mod16 by 5x and tonneli-shanks by 10%
        if (!this._sqrt)
            this._sqrt = FpSqrt(this.ORDER);
        return this._sqrt(this, num);
    }
    toBytes(num) {
        return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
    }
    fromBytes(bytes, skipValidation = false) {
        abytes$2(bytes);
        const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
        if (allowedLengths) {
            if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
                throw new Error('Field.fromBytes: expected ' + allowedLengths + ' bytes, got ' + bytes.length);
            }
            const padded = new Uint8Array(BYTES);
            // isLE add 0 to right, !isLE to the left.
            padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
            bytes = padded;
        }
        if (bytes.length !== BYTES)
            throw new Error('Field.fromBytes: expected ' + BYTES + ' bytes, got ' + bytes.length);
        let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
        if (modFromBytes)
            scalar = mod$1(scalar, ORDER);
        if (!skipValidation)
            if (!this.isValid(scalar))
                throw new Error('invalid field element: outside of range 0..ORDER');
        // NOTE: we don't validate scalar here, please use isValid. This done such way because some
        // protocol may allow non-reduced scalar that reduced later or changed some other way.
        return scalar;
    }
    // TODO: we don't need it here, move out to separate fn
    invertBatch(lst) {
        return FpInvertBatch(this, lst);
    }
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov(a, b, condition) {
        return condition ? b : a;
    }
}
/**
 * Creates a finite field. Major performance optimizations:
 * * 1. Denormalized operations like mulN instead of mul.
 * * 2. Identical object shape: never add or remove keys.
 * * 3. `Object.freeze`.
 * Fragile: always run a benchmark on a change.
 * Security note: operations don't check 'isValid' for all elements for performance reasons,
 * it is caller responsibility to check this.
 * This is low-level code, please make sure you know what you're doing.
 *
 * Note about field properties:
 * * CHARACTERISTIC p = prime number, number of elements in main subgroup.
 * * ORDER q = similar to cofactor in curves, may be composite `q = p^m`.
 *
 * @param ORDER field order, probably prime, or could be composite
 * @param bitLen how many bits the field consumes
 * @param isLE (default: false) if encoding / decoding should be in little-endian
 * @param redef optional faster redefinitions of sqrt and other methods
 */
function Field(ORDER, opts = {}) {
    return new _Field(ORDER, opts);
}
/**
 * Returns total number of bytes consumed by the field element.
 * For example, 32 bytes for usual 256-bit weierstrass curve.
 * @param fieldOrder number of field elements, usually CURVE.n
 * @returns byte length of field
 */
function getFieldBytesLength(fieldOrder) {
    if (typeof fieldOrder !== 'bigint')
        throw new Error('field order must be bigint');
    const bitLength = fieldOrder.toString(2).length;
    return Math.ceil(bitLength / 8);
}
/**
 * Returns minimal amount of bytes that can be safely reduced
 * by field order.
 * Should be 2^-128 for 128-bit curve such as P256.
 * @param fieldOrder number of field elements, usually CURVE.n
 * @returns byte length of target hash
 */
function getMinHashLength(fieldOrder) {
    const length = getFieldBytesLength(fieldOrder);
    return length + Math.ceil(length / 2);
}
/**
 * "Constant-time" private key generation utility.
 * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
 * and convert them into private scalar, with the modulo bias being negligible.
 * Needs at least 48 bytes of input for 32-byte private key.
 * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
 * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
 * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
 * @param hash hash output from SHA3 or a similar function
 * @param groupOrder size of subgroup - (e.g. secp256k1.Point.Fn.ORDER)
 * @param isLE interpret hash bytes as LE num
 * @returns valid private scalar
 */
function mapHashToField(key, fieldOrder, isLE = false) {
    abytes$2(key);
    const len = key.length;
    const fieldLen = getFieldBytesLength(fieldOrder);
    const minLen = getMinHashLength(fieldOrder);
    // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
    if (len < 16 || len < minLen || len > 1024)
        throw new Error('expected ' + minLen + '-1024 bytes of input, got ' + len);
    const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
    // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
    const reduced = mod$1(num, fieldOrder - _1n$5) + _1n$5;
    return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

/**
 * Methods for elliptic curve multiplication by scalars.
 * Contains wNAF, pippenger.
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const _0n$3 = /* @__PURE__ */ BigInt(0);
const _1n$4 = /* @__PURE__ */ BigInt(1);
function negateCt(condition, item) {
    const neg = item.negate();
    return condition ? neg : item;
}
/**
 * Takes a bunch of Projective Points but executes only one
 * inversion on all of them. Inversion is very slow operation,
 * so this improves performance massively.
 * Optimization: converts a list of projective points to a list of identical points with Z=1.
 */
function normalizeZ(c, points) {
    const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
    return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
    if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
        throw new Error('invalid window size, expected [1..' + bits + '], got W=' + W);
}
function calcWOpts(W, scalarBits) {
    validateW(W, scalarBits);
    const windows = Math.ceil(scalarBits / W) + 1; // W=8 33. Not 32, because we skip zero
    const windowSize = 2 ** (W - 1); // W=8 128. Not 256, because we skip zero
    const maxNumber = 2 ** W; // W=8 256
    const mask = bitMask(W); // W=8 255 == mask 0b11111111
    const shiftBy = BigInt(W); // W=8 8
    return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
    const { windowSize, mask, maxNumber, shiftBy } = wOpts;
    let wbits = Number(n & mask); // extract W bits.
    let nextN = n >> shiftBy; // shift number by W bits.
    // What actually happens here:
    // const highestBit = Number(mask ^ (mask >> 1n));
    // let wbits2 = wbits - 1; // skip zero
    // if (wbits2 & highestBit) { wbits2 ^= Number(mask); // (~);
    // split if bits > max: +224 => 256-32
    if (wbits > windowSize) {
        // we skip zero, which means instead of `>= size-1`, we do `> size`
        wbits -= maxNumber; // -32, can be maxNumber - wbits, but then we need to set isNeg here.
        nextN += _1n$4; // +256 (carry)
    }
    const offsetStart = window * windowSize;
    const offset = offsetStart + Math.abs(wbits) - 1; // -1 because we skip zero
    const isZero = wbits === 0; // is current window slice a 0?
    const isNeg = wbits < 0; // is current window slice negative?
    const isNegF = window % 2 !== 0; // fake random statement for noise
    const offsetF = offsetStart; // fake offset for noise
    return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
// Since points in different groups cannot be equal (different object constructor),
// we can have single place to store precomputes.
// Allows to make points frozen / immutable.
const pointPrecomputes = new WeakMap();
const pointWindowSizes = new WeakMap();
function getW(P) {
    // To disable precomputes:
    // return 1;
    return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
    if (n !== _0n$3)
        throw new Error('invalid wNAF');
}
/**
 * Elliptic curve multiplication of Point by scalar. Fragile.
 * Table generation takes **30MB of ram and 10ms on high-end CPU**,
 * but may take much longer on slow devices. Actual generation will happen on
 * first call of `multiply()`. By default, `BASE` point is precomputed.
 *
 * Scalars should always be less than curve order: this should be checked inside of a curve itself.
 * Creates precomputation tables for fast multiplication:
 * - private scalar is split by fixed size windows of W bits
 * - every window point is collected from window's table & added to accumulator
 * - since windows are different, same point inside tables won't be accessed more than once per calc
 * - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
 * - +1 window is neccessary for wNAF
 * - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
 *
 * @todo Research returning 2d JS array of windows, instead of a single window.
 * This would allow windows to be in different memory locations
 */
class wNAF {
    BASE;
    ZERO;
    Fn;
    bits;
    // Parametrized with a given Point class (not individual point)
    constructor(Point, bits) {
        this.BASE = Point.BASE;
        this.ZERO = Point.ZERO;
        this.Fn = Point.Fn;
        this.bits = bits;
    }
    // non-const time multiplication ladder
    _unsafeLadder(elm, n, p = this.ZERO) {
        let d = elm;
        while (n > _0n$3) {
            if (n & _1n$4)
                p = p.add(d);
            d = d.double();
            n >>= _1n$4;
        }
        return p;
    }
    /**
     * Creates a wNAF precomputation window. Used for caching.
     * Default window size is set by `utils.precompute()` and is equal to 8.
     * Number of precomputed points depends on the curve size:
     * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
     * - 𝑊 is the window size
     * - 𝑛 is the bitlength of the curve order.
     * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
     * @param point Point instance
     * @param W window size
     * @returns precomputed point tables flattened to a single array
     */
    precomputeWindow(point, W) {
        const { windows, windowSize } = calcWOpts(W, this.bits);
        const points = [];
        let p = point;
        let base = p;
        for (let window = 0; window < windows; window++) {
            base = p;
            points.push(base);
            // i=1, bc we skip 0
            for (let i = 1; i < windowSize; i++) {
                base = base.add(p);
                points.push(base);
            }
            p = base.double();
        }
        return points;
    }
    /**
     * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
     * More compact implementation:
     * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
     * @returns real and fake (for const-time) points
     */
    wNAF(W, precomputes, n) {
        // Scalar should be smaller than field order
        if (!this.Fn.isValid(n))
            throw new Error('invalid scalar');
        // Accumulators
        let p = this.ZERO;
        let f = this.BASE;
        // This code was first written with assumption that 'f' and 'p' will never be infinity point:
        // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
        // there is negate now: it is possible that negated element from low value
        // would be the same as high element, which will create carry into next window.
        // It's not obvious how this can fail, but still worth investigating later.
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
            // (n === _0n) is handled and not early-exited. isEven and offsetF are used for noise
            const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
            n = nextN;
            if (isZero) {
                // bits are 0: add garbage to fake point
                // Important part for const-time getPublicKey: add random "noise" point to f.
                f = f.add(negateCt(isNegF, precomputes[offsetF]));
            }
            else {
                // bits are 1: add to result point
                p = p.add(negateCt(isNeg, precomputes[offset]));
            }
        }
        assert0(n);
        // Return both real and fake points: JIT won't eliminate f.
        // At this point there is a way to F be infinity-point even if p is not,
        // which makes it less const-time: around 1 bigint multiply.
        return { p, f };
    }
    /**
     * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
     * @param acc accumulator point to add result of multiplication
     * @returns point
     */
    wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
            if (n === _0n$3)
                break; // Early-exit, skip 0 value
            const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
            n = nextN;
            if (isZero) {
                // Window bits are 0: skip processing.
                // Move to next window.
                continue;
            }
            else {
                const item = precomputes[offset];
                acc = acc.add(isNeg ? item.negate() : item); // Re-using acc allows to save adds in MSM
            }
        }
        assert0(n);
        return acc;
    }
    getPrecomputes(W, point, transform) {
        // Calculate precomputes on a first run, reuse them after
        let comp = pointPrecomputes.get(point);
        if (!comp) {
            comp = this.precomputeWindow(point, W);
            if (W !== 1) {
                // Doing transform outside of if brings 15% perf hit
                if (typeof transform === 'function')
                    comp = transform(comp);
                pointPrecomputes.set(point, comp);
            }
        }
        return comp;
    }
    cached(point, scalar, transform) {
        const W = getW(point);
        return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
    }
    unsafe(point, scalar, transform, prev) {
        const W = getW(point);
        if (W === 1)
            return this._unsafeLadder(point, scalar, prev); // For W=1 ladder is ~x2 faster
        return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
    }
    // We calculate precomputes for elliptic curve point multiplication
    // using windowed method. This specifies window size and
    // stores precomputed values. Usually only base point would be precomputed.
    createCache(P, W) {
        validateW(W, this.bits);
        pointWindowSizes.set(P, W);
        pointPrecomputes.delete(P);
    }
    hasCache(elm) {
        return getW(elm) !== 1;
    }
}
/**
 * Endomorphism-specific multiplication for Koblitz curves.
 * Cost: 128 dbl, 0-256 adds.
 */
function mulEndoUnsafe(Point, point, k1, k2) {
    let acc = point;
    let p1 = Point.ZERO;
    let p2 = Point.ZERO;
    while (k1 > _0n$3 || k2 > _0n$3) {
        if (k1 & _1n$4)
            p1 = p1.add(acc);
        if (k2 & _1n$4)
            p2 = p2.add(acc);
        acc = acc.double();
        k1 >>= _1n$4;
        k2 >>= _1n$4;
    }
    return { p1, p2 };
}
function createField(order, field, isLE) {
    if (field) {
        if (field.ORDER !== order)
            throw new Error('Field.ORDER must match order: Fp == p, Fn == n');
        validateField(field);
        return field;
    }
    else {
        return Field(order, { isLE });
    }
}
/** Validates CURVE opts and creates fields */
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
    if (FpFnLE === undefined)
        FpFnLE = type === 'edwards';
    if (!CURVE || typeof CURVE !== 'object')
        throw new Error(`expected valid ${type} CURVE object`);
    for (const p of ['p', 'n', 'h']) {
        const val = CURVE[p];
        if (!(typeof val === 'bigint' && val > _0n$3))
            throw new Error(`CURVE.${p} must be positive bigint`);
    }
    const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
    const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
    const _b = 'b' ;
    const params = ['Gx', 'Gy', 'a', _b];
    for (const p of params) {
        // @ts-ignore
        if (!Fp.isValid(CURVE[p]))
            throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
    }
    CURVE = Object.freeze(Object.assign({}, CURVE));
    return { CURVE, Fp, Fn };
}
function createKeygen(randomSecretKey, getPublicKey) {
    return function keygen(seed) {
        const secretKey = randomSecretKey(seed);
        return { secretKey, publicKey: getPublicKey(secretKey) };
    };
}

/**
 * Montgomery curve methods. It's not really whole montgomery curve,
 * just bunch of very specific methods for X25519 / X448 from
 * [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748)
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const _0n$2 = BigInt(0);
const _1n$3 = BigInt(1);
const _2n$3 = BigInt(2);
function validateOpts(curve) {
    validateObject(curve, {
        adjustScalarBytes: 'function',
        powPminus2: 'function',
    });
    return Object.freeze({ ...curve });
}
function montgomery(curveDef) {
    const CURVE = validateOpts(curveDef);
    const { P, type, adjustScalarBytes, powPminus2, randomBytes: rand } = CURVE;
    const is25519 = type === 'x25519';
    if (!is25519 && type !== 'x448')
        throw new Error('invalid type');
    const randomBytes_ = rand || randomBytes$1;
    const montgomeryBits = is25519 ? 255 : 448;
    const fieldLen = is25519 ? 32 : 56;
    const Gu = is25519 ? BigInt(9) : BigInt(5);
    // RFC 7748 #5:
    // The constant a24 is (486662 - 2) / 4 = 121665 for curve25519/X25519 and
    // (156326 - 2) / 4 = 39081 for curve448/X448
    // const a = is25519 ? 156326n : 486662n;
    const a24 = is25519 ? BigInt(121665) : BigInt(39081);
    // RFC: x25519 "the resulting integer is of the form 2^254 plus
    // eight times a value between 0 and 2^251 - 1 (inclusive)"
    // x448: "2^447 plus four times a value between 0 and 2^445 - 1 (inclusive)"
    const minScalar = is25519 ? _2n$3 ** BigInt(254) : _2n$3 ** BigInt(447);
    const maxAdded = is25519
        ? BigInt(8) * _2n$3 ** BigInt(251) - _1n$3
        : BigInt(4) * _2n$3 ** BigInt(445) - _1n$3;
    const maxScalar = minScalar + maxAdded + _1n$3; // (inclusive)
    const modP = (n) => mod$1(n, P);
    const GuBytes = encodeU(Gu);
    function encodeU(u) {
        return numberToBytesLE(modP(u), fieldLen);
    }
    function decodeU(u) {
        const _u = copyBytes$1(abytes$2(u, fieldLen, 'uCoordinate'));
        // RFC: When receiving such an array, implementations of X25519
        // (but not X448) MUST mask the most significant bit in the final byte.
        if (is25519)
            _u[31] &= 127; // 0b0111_1111
        // RFC: Implementations MUST accept non-canonical values and process them as
        // if they had been reduced modulo the field prime.  The non-canonical
        // values are 2^255 - 19 through 2^255 - 1 for X25519 and 2^448 - 2^224
        // - 1 through 2^448 - 1 for X448.
        return modP(bytesToNumberLE(_u));
    }
    function decodeScalar(scalar) {
        return bytesToNumberLE(adjustScalarBytes(copyBytes$1(abytes$2(scalar, fieldLen, 'scalar'))));
    }
    function scalarMult(scalar, u) {
        const pu = montgomeryLadder(decodeU(u), decodeScalar(scalar));
        // Some public keys are useless, of low-order. Curve author doesn't think
        // it needs to be validated, but we do it nonetheless.
        // https://cr.yp.to/ecdh.html#validate
        if (pu === _0n$2)
            throw new Error('invalid private or public key received');
        return encodeU(pu);
    }
    // Computes public key from private. By doing scalar multiplication of base point.
    function scalarMultBase(scalar) {
        return scalarMult(scalar, GuBytes);
    }
    const getPublicKey = scalarMultBase;
    const getSharedSecret = scalarMult;
    // cswap from RFC7748 "example code"
    function cswap(swap, x_2, x_3) {
        // dummy = mask(swap) AND (x_2 XOR x_3)
        // Where mask(swap) is the all-1 or all-0 word of the same length as x_2
        // and x_3, computed, e.g., as mask(swap) = 0 - swap.
        const dummy = modP(swap * (x_2 - x_3));
        x_2 = modP(x_2 - dummy); // x_2 = x_2 XOR dummy
        x_3 = modP(x_3 + dummy); // x_3 = x_3 XOR dummy
        return { x_2, x_3 };
    }
    /**
     * Montgomery x-only multiplication ladder.
     * @param pointU u coordinate (x) on Montgomery Curve 25519
     * @param scalar by which the point would be multiplied
     * @returns new Point on Montgomery curve
     */
    function montgomeryLadder(u, scalar) {
        aInRange('u', u, _0n$2, P);
        aInRange('scalar', scalar, minScalar, maxScalar);
        const k = scalar;
        const x_1 = u;
        let x_2 = _1n$3;
        let z_2 = _0n$2;
        let x_3 = u;
        let z_3 = _1n$3;
        let swap = _0n$2;
        for (let t = BigInt(montgomeryBits - 1); t >= _0n$2; t--) {
            const k_t = (k >> t) & _1n$3;
            swap ^= k_t;
            ({ x_2, x_3 } = cswap(swap, x_2, x_3));
            ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
            swap = k_t;
            const A = x_2 + z_2;
            const AA = modP(A * A);
            const B = x_2 - z_2;
            const BB = modP(B * B);
            const E = AA - BB;
            const C = x_3 + z_3;
            const D = x_3 - z_3;
            const DA = modP(D * A);
            const CB = modP(C * B);
            const dacb = DA + CB;
            const da_cb = DA - CB;
            x_3 = modP(dacb * dacb);
            z_3 = modP(x_1 * modP(da_cb * da_cb));
            x_2 = modP(AA * BB);
            z_2 = modP(E * (AA + modP(a24 * E)));
        }
        ({ x_2, x_3 } = cswap(swap, x_2, x_3));
        ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
        const z2 = powPminus2(z_2); // `Fp.pow(x, P - _2n)` is much slower equivalent
        return modP(x_2 * z2); // Return x_2 * (z_2^(p - 2))
    }
    const lengths = {
        secretKey: fieldLen,
        publicKey: fieldLen,
        seed: fieldLen,
    };
    const randomSecretKey = (seed = randomBytes_(fieldLen)) => {
        abytes$2(seed, lengths.seed, 'seed');
        return seed;
    };
    const utils = { randomSecretKey };
    return Object.freeze({
        keygen: createKeygen(randomSecretKey, getPublicKey),
        getSharedSecret,
        getPublicKey,
        scalarMult,
        scalarMultBase,
        utils,
        GuBytes: GuBytes.slice(),
        lengths,
    });
}

/**
 * Short Weierstrass curve methods. The formula is: y² = x³ + ax + b.
 *
 * ### Design rationale for types
 *
 * * Interaction between classes from different curves should fail:
 *   `k256.Point.BASE.add(p256.Point.BASE)`
 * * For this purpose we want to use `instanceof` operator, which is fast and works during runtime
 * * Different calls of `curve()` would return different classes -
 *   `curve(params) !== curve(params)`: if somebody decided to monkey-patch their curve,
 *   it won't affect others
 *
 * TypeScript can't infer types for classes created inside a function. Classes is one instance
 * of nominative types in TypeScript and interfaces only check for shape, so it's hard to create
 * unique type for every function call.
 *
 * We can use generic types via some param, like curve opts, but that would:
 *     1. Enable interaction between `curve(params)` and `curve(params)` (curves of same params)
 *     which is hard to debug.
 *     2. Params can be generic and we can't enforce them to be constant value:
 *     if somebody creates curve from non-constant params,
 *     it would be allowed to interact with other curves with non-constant params
 *
 * @todo https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#unique-symbol
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// We construct basis in such way that den is always positive and equals n, but num sign depends on basis (not on secret value)
const divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n$2) / den;
/**
 * Splits scalar for GLV endomorphism.
 */
function _splitEndoScalar(k, basis, n) {
    // Split scalar into two such that part is ~half bits: `abs(part) < sqrt(N)`
    // Since part can be negative, we need to do this on point.
    // TODO: verifyScalar function which consumes lambda
    const [[a1, b1], [a2, b2]] = basis;
    const c1 = divNearest(b2 * k, n);
    const c2 = divNearest(-b1 * k, n);
    // |k1|/|k2| is < sqrt(N), but can be negative.
    // If we do `k1 mod N`, we'll get big scalar (`> sqrt(N)`): so, we do cheaper negation instead.
    let k1 = k - c1 * a1 - c2 * a2;
    let k2 = -c1 * b1 - c2 * b2;
    const k1neg = k1 < _0n$1;
    const k2neg = k2 < _0n$1;
    if (k1neg)
        k1 = -k1;
    if (k2neg)
        k2 = -k2;
    // Double check that resulting scalar less than half bits of N: otherwise wNAF will fail.
    // This should only happen on wrong basises. Also, math inside is too complex and I don't trust it.
    const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n$2; // Half bits of N
    if (k1 < _0n$1 || k1 >= MAX_NUM || k2 < _0n$1 || k2 >= MAX_NUM) {
        throw new Error('splitScalar (endomorphism): failed, k=' + k);
    }
    return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
    if (!['compact', 'recovered', 'der'].includes(format))
        throw new Error('Signature format must be "compact", "recovered", or "der"');
    return format;
}
function validateSigOpts(opts, def) {
    const optsn = {};
    for (let optName of Object.keys(def)) {
        // @ts-ignore
        optsn[optName] = opts[optName] === undefined ? def[optName] : opts[optName];
    }
    abool(optsn.lowS, 'lowS');
    abool(optsn.prehash, 'prehash');
    if (optsn.format !== undefined)
        validateSigFormat(optsn.format);
    return optsn;
}
class DERErr extends Error {
    constructor(m = '') {
        super(m);
    }
}
/**
 * ASN.1 DER encoding utilities. ASN is very complex & fragile. Format:
 *
 *     [0x30 (SEQUENCE), bytelength, 0x02 (INTEGER), intLength, R, 0x02 (INTEGER), intLength, S]
 *
 * Docs: https://letsencrypt.org/docs/a-warm-welcome-to-asn1-and-der/, https://luca.ntop.org/Teaching/Appunti/asn1.html
 */
const DER = {
    // asn.1 DER encoding utils
    Err: DERErr,
    // Basic building block is TLV (Tag-Length-Value)
    _tlv: {
        encode: (tag, data) => {
            const { Err: E } = DER;
            if (tag < 0 || tag > 256)
                throw new E('tlv.encode: wrong tag');
            if (data.length & 1)
                throw new E('tlv.encode: unpadded data');
            const dataLen = data.length / 2;
            const len = numberToHexUnpadded(dataLen);
            if ((len.length / 2) & 0b1000_0000)
                throw new E('tlv.encode: long form length too big');
            // length of length with long form flag
            const lenLen = dataLen > 127 ? numberToHexUnpadded((len.length / 2) | 0b1000_0000) : '';
            const t = numberToHexUnpadded(tag);
            return t + lenLen + len + data;
        },
        // v - value, l - left bytes (unparsed)
        decode(tag, data) {
            const { Err: E } = DER;
            let pos = 0;
            if (tag < 0 || tag > 256)
                throw new E('tlv.encode: wrong tag');
            if (data.length < 2 || data[pos++] !== tag)
                throw new E('tlv.decode: wrong tlv');
            const first = data[pos++];
            const isLong = !!(first & 0b1000_0000); // First bit of first length byte is flag for short/long form
            let length = 0;
            if (!isLong)
                length = first;
            else {
                // Long form: [longFlag(1bit), lengthLength(7bit), length (BE)]
                const lenLen = first & 0b0111_1111;
                if (!lenLen)
                    throw new E('tlv.decode(long): indefinite length not supported');
                if (lenLen > 4)
                    throw new E('tlv.decode(long): byte length is too big'); // this will overflow u32 in js
                const lengthBytes = data.subarray(pos, pos + lenLen);
                if (lengthBytes.length !== lenLen)
                    throw new E('tlv.decode: length bytes not complete');
                if (lengthBytes[0] === 0)
                    throw new E('tlv.decode(long): zero leftmost byte');
                for (const b of lengthBytes)
                    length = (length << 8) | b;
                pos += lenLen;
                if (length < 128)
                    throw new E('tlv.decode(long): not minimal encoding');
            }
            const v = data.subarray(pos, pos + length);
            if (v.length !== length)
                throw new E('tlv.decode: wrong value length');
            return { v, l: data.subarray(pos + length) };
        },
    },
    // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
    // since we always use positive integers here. It must always be empty:
    // - add zero byte if exists
    // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
    _int: {
        encode(num) {
            const { Err: E } = DER;
            if (num < _0n$1)
                throw new E('integer: negative integers are not allowed');
            let hex = numberToHexUnpadded(num);
            // Pad with zero byte if negative flag is present
            if (Number.parseInt(hex[0], 16) & 0b1000)
                hex = '00' + hex;
            if (hex.length & 1)
                throw new E('unexpected DER parsing assertion: unpadded hex');
            return hex;
        },
        decode(data) {
            const { Err: E } = DER;
            if (data[0] & 0b1000_0000)
                throw new E('invalid signature integer: negative');
            if (data[0] === 0x00 && !(data[1] & 0b1000_0000))
                throw new E('invalid signature integer: unnecessary leading zero');
            return bytesToNumberBE(data);
        },
    },
    toSig(bytes) {
        // parse DER signature
        const { Err: E, _int: int, _tlv: tlv } = DER;
        const data = abytes$2(bytes, undefined, 'signature');
        const { v: seqBytes, l: seqLeftBytes } = tlv.decode(0x30, data);
        if (seqLeftBytes.length)
            throw new E('invalid signature: left bytes after parsing');
        const { v: rBytes, l: rLeftBytes } = tlv.decode(0x02, seqBytes);
        const { v: sBytes, l: sLeftBytes } = tlv.decode(0x02, rLeftBytes);
        if (sLeftBytes.length)
            throw new E('invalid signature: left bytes after parsing');
        return { r: int.decode(rBytes), s: int.decode(sBytes) };
    },
    hexFromSig(sig) {
        const { _tlv: tlv, _int: int } = DER;
        const rs = tlv.encode(0x02, int.encode(sig.r));
        const ss = tlv.encode(0x02, int.encode(sig.s));
        const seq = rs + ss;
        return tlv.encode(0x30, seq);
    },
};
// Be friendly to bad ECMAScript parsers by not using bigint literals
// prettier-ignore
const _0n$1 = BigInt(0), _1n$2 = BigInt(1), _2n$2 = BigInt(2), _3n$1 = BigInt(3), _4n = BigInt(4);
/**
 * Creates weierstrass Point constructor, based on specified curve options.
 *
 * See {@link WeierstrassOpts}.
 *
 * @example
```js
const opts = {
  p: 0xfffffffffffffffffffffffffffffffeffffac73n,
  n: 0x100000000000000000001b8fa16dfab9aca16b6b3n,
  h: 1n,
  a: 0n,
  b: 7n,
  Gx: 0x3b4c382ce37aa192a4019e763036f4f5dd4d7ebbn,
  Gy: 0x938cf935318fdced6bc28286531733c3f03c4feen,
};
const secp160k1_Point = weierstrass(opts);
```
 */
function weierstrass(params, extraOpts = {}) {
    const validated = createCurveFields('weierstrass', params, extraOpts);
    const { Fp, Fn } = validated;
    let CURVE = validated.CURVE;
    const { h: cofactor, n: CURVE_ORDER } = CURVE;
    validateObject(extraOpts, {}, {
        allowInfinityPoint: 'boolean',
        clearCofactor: 'function',
        isTorsionFree: 'function',
        fromBytes: 'function',
        toBytes: 'function',
        endo: 'object',
    });
    const { endo } = extraOpts;
    if (endo) {
        // validateObject(endo, { beta: 'bigint', splitScalar: 'function' });
        if (!Fp.is0(CURVE.a) || typeof endo.beta !== 'bigint' || !Array.isArray(endo.basises)) {
            throw new Error('invalid endo: expected "beta": bigint and "basises": array');
        }
    }
    const lengths = getWLengths(Fp, Fn);
    function assertCompressionIsSupported() {
        if (!Fp.isOdd)
            throw new Error('compression is not supported: Field does not have .isOdd()');
    }
    // Implements IEEE P1363 point encoding
    function pointToBytes(_c, point, isCompressed) {
        const { x, y } = point.toAffine();
        const bx = Fp.toBytes(x);
        abool(isCompressed, 'isCompressed');
        if (isCompressed) {
            assertCompressionIsSupported();
            const hasEvenY = !Fp.isOdd(y);
            return concatBytes(pprefix(hasEvenY), bx);
        }
        else {
            return concatBytes(Uint8Array.of(0x04), bx, Fp.toBytes(y));
        }
    }
    function pointFromBytes(bytes) {
        abytes$2(bytes, undefined, 'Point');
        const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths; // e.g. for 32-byte: 33, 65
        const length = bytes.length;
        const head = bytes[0];
        const tail = bytes.subarray(1);
        // No actual validation is done here: use .assertValidity()
        if (length === comp && (head === 0x02 || head === 0x03)) {
            const x = Fp.fromBytes(tail);
            if (!Fp.isValid(x))
                throw new Error('bad point: is not on curve, wrong x');
            const y2 = weierstrassEquation(x); // y² = x³ + ax + b
            let y;
            try {
                y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
            }
            catch (sqrtError) {
                const err = sqrtError instanceof Error ? ': ' + sqrtError.message : '';
                throw new Error('bad point: is not on curve, sqrt error' + err);
            }
            assertCompressionIsSupported();
            const evenY = Fp.isOdd(y);
            const evenH = (head & 1) === 1; // ECDSA-specific
            if (evenH !== evenY)
                y = Fp.neg(y);
            return { x, y };
        }
        else if (length === uncomp && head === 0x04) {
            // TODO: more checks
            const L = Fp.BYTES;
            const x = Fp.fromBytes(tail.subarray(0, L));
            const y = Fp.fromBytes(tail.subarray(L, L * 2));
            if (!isValidXY(x, y))
                throw new Error('bad point: is not on curve');
            return { x, y };
        }
        else {
            throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
        }
    }
    const encodePoint = extraOpts.toBytes || pointToBytes;
    const decodePoint = extraOpts.fromBytes || pointFromBytes;
    function weierstrassEquation(x) {
        const x2 = Fp.sqr(x); // x * x
        const x3 = Fp.mul(x2, x); // x² * x
        return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b); // x³ + a * x + b
    }
    // TODO: move top-level
    /** Checks whether equation holds for given x, y: y² == x³ + ax + b */
    function isValidXY(x, y) {
        const left = Fp.sqr(y); // y²
        const right = weierstrassEquation(x); // x³ + ax + b
        return Fp.eql(left, right);
    }
    // Validate whether the passed curve params are valid.
    // Test 1: equation y² = x³ + ax + b should work for generator point.
    if (!isValidXY(CURVE.Gx, CURVE.Gy))
        throw new Error('bad curve params: generator point');
    // Test 2: discriminant Δ part should be non-zero: 4a³ + 27b² != 0.
    // Guarantees curve is genus-1, smooth (non-singular).
    const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n$1), _4n);
    const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
    if (Fp.is0(Fp.add(_4a3, _27b2)))
        throw new Error('bad curve params: a or b');
    /** Asserts coordinate is valid: 0 <= n < Fp.ORDER. */
    function acoord(title, n, banZero = false) {
        if (!Fp.isValid(n) || (banZero && Fp.is0(n)))
            throw new Error(`bad point coordinate ${title}`);
        return n;
    }
    function aprjpoint(other) {
        if (!(other instanceof Point))
            throw new Error('Weierstrass Point expected');
    }
    function splitEndoScalarN(k) {
        if (!endo || !endo.basises)
            throw new Error('no endo');
        return _splitEndoScalar(k, endo.basises, Fn.ORDER);
    }
    // Memoized toAffine / validity check. They are heavy. Points are immutable.
    // Converts Projective point to affine (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    // (X, Y, Z) ∋ (x=X/Z, y=Y/Z)
    const toAffineMemo = memoized((p, iz) => {
        const { X, Y, Z } = p;
        // Fast-path for normalized points
        if (Fp.eql(Z, Fp.ONE))
            return { x: X, y: Y };
        const is0 = p.is0();
        // If invZ was 0, we return zero point. However we still want to execute
        // all operations, so we replace invZ with a random number, 1.
        if (iz == null)
            iz = is0 ? Fp.ONE : Fp.inv(Z);
        const x = Fp.mul(X, iz);
        const y = Fp.mul(Y, iz);
        const zz = Fp.mul(Z, iz);
        if (is0)
            return { x: Fp.ZERO, y: Fp.ZERO };
        if (!Fp.eql(zz, Fp.ONE))
            throw new Error('invZ was invalid');
        return { x, y };
    });
    // NOTE: on exception this will crash 'cached' and no value will be set.
    // Otherwise true will be return
    const assertValidMemo = memoized((p) => {
        if (p.is0()) {
            // (0, 1, 0) aka ZERO is invalid in most contexts.
            // In BLS, ZERO can be serialized, so we allow it.
            // (0, 0, 0) is invalid representation of ZERO.
            if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
                return;
            throw new Error('bad point: ZERO');
        }
        // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
        const { x, y } = p.toAffine();
        if (!Fp.isValid(x) || !Fp.isValid(y))
            throw new Error('bad point: x or y not field elements');
        if (!isValidXY(x, y))
            throw new Error('bad point: equation left != right');
        if (!p.isTorsionFree())
            throw new Error('bad point: not in prime-order subgroup');
        return true;
    });
    function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
        k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
        k1p = negateCt(k1neg, k1p);
        k2p = negateCt(k2neg, k2p);
        return k1p.add(k2p);
    }
    /**
     * Projective Point works in 3d / projective (homogeneous) coordinates:(X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * Default Point works in 2d / affine coordinates: (x, y).
     * We're doing calculations in projective, because its operations don't require costly inversion.
     */
    class Point {
        // base / generator point
        static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
        // zero / infinity / identity point
        static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO); // 0, 1, 0
        // math field
        static Fp = Fp;
        // scalar field
        static Fn = Fn;
        X;
        Y;
        Z;
        /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
        constructor(X, Y, Z) {
            this.X = acoord('x', X);
            this.Y = acoord('y', Y, true);
            this.Z = acoord('z', Z);
            Object.freeze(this);
        }
        static CURVE() {
            return CURVE;
        }
        /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
        static fromAffine(p) {
            const { x, y } = p || {};
            if (!p || !Fp.isValid(x) || !Fp.isValid(y))
                throw new Error('invalid affine point');
            if (p instanceof Point)
                throw new Error('projective point not allowed');
            // (0, 0) would've produced (0, 0, 1) - instead, we need (0, 1, 0)
            if (Fp.is0(x) && Fp.is0(y))
                return Point.ZERO;
            return new Point(x, y, Fp.ONE);
        }
        static fromBytes(bytes) {
            const P = Point.fromAffine(decodePoint(abytes$2(bytes, undefined, 'point')));
            P.assertValidity();
            return P;
        }
        static fromHex(hex) {
            return Point.fromBytes(hexToBytes(hex));
        }
        get x() {
            return this.toAffine().x;
        }
        get y() {
            return this.toAffine().y;
        }
        /**
         *
         * @param windowSize
         * @param isLazy true will defer table computation until the first multiplication
         * @returns
         */
        precompute(windowSize = 8, isLazy = true) {
            wnaf.createCache(this, windowSize);
            if (!isLazy)
                this.multiply(_3n$1); // random number
            return this;
        }
        // TODO: return `this`
        /** A point on curve is valid if it conforms to equation. */
        assertValidity() {
            assertValidMemo(this);
        }
        hasEvenY() {
            const { y } = this.toAffine();
            if (!Fp.isOdd)
                throw new Error("Field doesn't support isOdd");
            return !Fp.isOdd(y);
        }
        /** Compare one point to another. */
        equals(other) {
            aprjpoint(other);
            const { X: X1, Y: Y1, Z: Z1 } = this;
            const { X: X2, Y: Y2, Z: Z2 } = other;
            const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
            const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
            return U1 && U2;
        }
        /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
        negate() {
            return new Point(this.X, Fp.neg(this.Y), this.Z);
        }
        // Renes-Costello-Batina exception-free doubling formula.
        // There is 30% faster Jacobian formula, but it is not complete.
        // https://eprint.iacr.org/2015/1060, algorithm 3
        // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
        double() {
            const { a, b } = CURVE;
            const b3 = Fp.mul(b, _3n$1);
            const { X: X1, Y: Y1, Z: Z1 } = this;
            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
            let t0 = Fp.mul(X1, X1); // step 1
            let t1 = Fp.mul(Y1, Y1);
            let t2 = Fp.mul(Z1, Z1);
            let t3 = Fp.mul(X1, Y1);
            t3 = Fp.add(t3, t3); // step 5
            Z3 = Fp.mul(X1, Z1);
            Z3 = Fp.add(Z3, Z3);
            X3 = Fp.mul(a, Z3);
            Y3 = Fp.mul(b3, t2);
            Y3 = Fp.add(X3, Y3); // step 10
            X3 = Fp.sub(t1, Y3);
            Y3 = Fp.add(t1, Y3);
            Y3 = Fp.mul(X3, Y3);
            X3 = Fp.mul(t3, X3);
            Z3 = Fp.mul(b3, Z3); // step 15
            t2 = Fp.mul(a, t2);
            t3 = Fp.sub(t0, t2);
            t3 = Fp.mul(a, t3);
            t3 = Fp.add(t3, Z3);
            Z3 = Fp.add(t0, t0); // step 20
            t0 = Fp.add(Z3, t0);
            t0 = Fp.add(t0, t2);
            t0 = Fp.mul(t0, t3);
            Y3 = Fp.add(Y3, t0);
            t2 = Fp.mul(Y1, Z1); // step 25
            t2 = Fp.add(t2, t2);
            t0 = Fp.mul(t2, t3);
            X3 = Fp.sub(X3, t0);
            Z3 = Fp.mul(t2, t1);
            Z3 = Fp.add(Z3, Z3); // step 30
            Z3 = Fp.add(Z3, Z3);
            return new Point(X3, Y3, Z3);
        }
        // Renes-Costello-Batina exception-free addition formula.
        // There is 30% faster Jacobian formula, but it is not complete.
        // https://eprint.iacr.org/2015/1060, algorithm 1
        // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
        add(other) {
            aprjpoint(other);
            const { X: X1, Y: Y1, Z: Z1 } = this;
            const { X: X2, Y: Y2, Z: Z2 } = other;
            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
            const a = CURVE.a;
            const b3 = Fp.mul(CURVE.b, _3n$1);
            let t0 = Fp.mul(X1, X2); // step 1
            let t1 = Fp.mul(Y1, Y2);
            let t2 = Fp.mul(Z1, Z2);
            let t3 = Fp.add(X1, Y1);
            let t4 = Fp.add(X2, Y2); // step 5
            t3 = Fp.mul(t3, t4);
            t4 = Fp.add(t0, t1);
            t3 = Fp.sub(t3, t4);
            t4 = Fp.add(X1, Z1);
            let t5 = Fp.add(X2, Z2); // step 10
            t4 = Fp.mul(t4, t5);
            t5 = Fp.add(t0, t2);
            t4 = Fp.sub(t4, t5);
            t5 = Fp.add(Y1, Z1);
            X3 = Fp.add(Y2, Z2); // step 15
            t5 = Fp.mul(t5, X3);
            X3 = Fp.add(t1, t2);
            t5 = Fp.sub(t5, X3);
            Z3 = Fp.mul(a, t4);
            X3 = Fp.mul(b3, t2); // step 20
            Z3 = Fp.add(X3, Z3);
            X3 = Fp.sub(t1, Z3);
            Z3 = Fp.add(t1, Z3);
            Y3 = Fp.mul(X3, Z3);
            t1 = Fp.add(t0, t0); // step 25
            t1 = Fp.add(t1, t0);
            t2 = Fp.mul(a, t2);
            t4 = Fp.mul(b3, t4);
            t1 = Fp.add(t1, t2);
            t2 = Fp.sub(t0, t2); // step 30
            t2 = Fp.mul(a, t2);
            t4 = Fp.add(t4, t2);
            t0 = Fp.mul(t1, t4);
            Y3 = Fp.add(Y3, t0);
            t0 = Fp.mul(t5, t4); // step 35
            X3 = Fp.mul(t3, X3);
            X3 = Fp.sub(X3, t0);
            t0 = Fp.mul(t3, t1);
            Z3 = Fp.mul(t5, Z3);
            Z3 = Fp.add(Z3, t0); // step 40
            return new Point(X3, Y3, Z3);
        }
        subtract(other) {
            return this.add(other.negate());
        }
        is0() {
            return this.equals(Point.ZERO);
        }
        /**
         * Constant time multiplication.
         * Uses wNAF method. Windowed method may be 10% faster,
         * but takes 2x longer to generate and consumes 2x memory.
         * Uses precomputes when available.
         * Uses endomorphism for Koblitz curves.
         * @param scalar by which the point would be multiplied
         * @returns New point
         */
        multiply(scalar) {
            const { endo } = extraOpts;
            if (!Fn.isValidNot0(scalar))
                throw new Error('invalid scalar: out of range'); // 0 is invalid
            let point, fake; // Fake point is used to const-time mult
            const mul = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
            /** See docs for {@link EndomorphismOpts} */
            if (endo) {
                const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
                const { p: k1p, f: k1f } = mul(k1);
                const { p: k2p, f: k2f } = mul(k2);
                fake = k1f.add(k2f);
                point = finishEndo(endo.beta, k1p, k2p, k1neg, k2neg);
            }
            else {
                const { p, f } = mul(scalar);
                point = p;
                fake = f;
            }
            // Normalize `z` for both points, but return only real one
            return normalizeZ(Point, [point, fake])[0];
        }
        /**
         * Non-constant-time multiplication. Uses double-and-add algorithm.
         * It's faster, but should only be used when you don't care about
         * an exposed secret key e.g. sig verification, which works over *public* keys.
         */
        multiplyUnsafe(sc) {
            const { endo } = extraOpts;
            const p = this;
            if (!Fn.isValid(sc))
                throw new Error('invalid scalar: out of range'); // 0 is valid
            if (sc === _0n$1 || p.is0())
                return Point.ZERO; // 0
            if (sc === _1n$2)
                return p; // 1
            if (wnaf.hasCache(this))
                return this.multiply(sc); // precomputes
            // We don't have method for double scalar multiplication (aP + bQ):
            // Even with using Strauss-Shamir trick, it's 35% slower than naïve mul+add.
            if (endo) {
                const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
                const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2); // 30% faster vs wnaf.unsafe
                return finishEndo(endo.beta, p1, p2, k1neg, k2neg);
            }
            else {
                return wnaf.unsafe(p, sc);
            }
        }
        /**
         * Converts Projective point to affine (x, y) coordinates.
         * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
         */
        toAffine(invertedZ) {
            return toAffineMemo(this, invertedZ);
        }
        /**
         * Checks whether Point is free of torsion elements (is in prime subgroup).
         * Always torsion-free for cofactor=1 curves.
         */
        isTorsionFree() {
            const { isTorsionFree } = extraOpts;
            if (cofactor === _1n$2)
                return true;
            if (isTorsionFree)
                return isTorsionFree(Point, this);
            return wnaf.unsafe(this, CURVE_ORDER).is0();
        }
        clearCofactor() {
            const { clearCofactor } = extraOpts;
            if (cofactor === _1n$2)
                return this; // Fast-path
            if (clearCofactor)
                return clearCofactor(Point, this);
            return this.multiplyUnsafe(cofactor);
        }
        isSmallOrder() {
            // can we use this.clearCofactor()?
            return this.multiplyUnsafe(cofactor).is0();
        }
        toBytes(isCompressed = true) {
            abool(isCompressed, 'isCompressed');
            this.assertValidity();
            return encodePoint(Point, this, isCompressed);
        }
        toHex(isCompressed = true) {
            return bytesToHex(this.toBytes(isCompressed));
        }
        toString() {
            return `<Point ${this.is0() ? 'ZERO' : this.toHex()}>`;
        }
    }
    const bits = Fn.BITS;
    const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
    Point.BASE.precompute(8); // Enable precomputes. Slows down first publicKey computation by 20ms.
    return Point;
}
// Points start with byte 0x02 when y is even; otherwise 0x03
function pprefix(hasEvenY) {
    return Uint8Array.of(hasEvenY ? 0x02 : 0x03);
}
function getWLengths(Fp, Fn) {
    return {
        secretKey: Fn.BYTES,
        publicKey: 1 + Fp.BYTES,
        publicKeyUncompressed: 1 + 2 * Fp.BYTES,
        publicKeyHasPrefix: true,
        signature: 2 * Fn.BYTES,
    };
}
/**
 * Sometimes users only need getPublicKey, getSharedSecret, and secret key handling.
 * This helper ensures no signature functionality is present. Less code, smaller bundle size.
 */
function ecdh(Point, ecdhOpts = {}) {
    const { Fn } = Point;
    const randomBytes_ = ecdhOpts.randomBytes || randomBytes$1;
    const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
    function isValidSecretKey(secretKey) {
        try {
            const num = Fn.fromBytes(secretKey);
            return Fn.isValidNot0(num);
        }
        catch (error) {
            return false;
        }
    }
    function isValidPublicKey(publicKey, isCompressed) {
        const { publicKey: comp, publicKeyUncompressed } = lengths;
        try {
            const l = publicKey.length;
            if (isCompressed === true && l !== comp)
                return false;
            if (isCompressed === false && l !== publicKeyUncompressed)
                return false;
            return !!Point.fromBytes(publicKey);
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Produces cryptographically secure secret key from random of size
     * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
     */
    function randomSecretKey(seed = randomBytes_(lengths.seed)) {
        return mapHashToField(abytes$2(seed, lengths.seed, 'seed'), Fn.ORDER);
    }
    /**
     * Computes public key for a secret key. Checks for validity of the secret key.
     * @param isCompressed whether to return compact (default), or full key
     * @returns Public key, full when isCompressed=false; short when isCompressed=true
     */
    function getPublicKey(secretKey, isCompressed = true) {
        return Point.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
    }
    /**
     * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
     */
    function isProbPub(item) {
        const { secretKey, publicKey, publicKeyUncompressed } = lengths;
        if (!isBytes$2(item))
            return undefined;
        if (('_lengths' in Fn && Fn._lengths) || secretKey === publicKey)
            return undefined;
        const l = abytes$2(item, undefined, 'key').length;
        return l === publicKey || l === publicKeyUncompressed;
    }
    /**
     * ECDH (Elliptic Curve Diffie Hellman).
     * Computes shared public key from secret key A and public key B.
     * Checks: 1) secret key validity 2) shared key is on-curve.
     * Does NOT hash the result.
     * @param isCompressed whether to return compact (default), or full key
     * @returns shared public key
     */
    function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
        if (isProbPub(secretKeyA) === true)
            throw new Error('first arg must be private key');
        if (isProbPub(publicKeyB) === false)
            throw new Error('second arg must be public key');
        const s = Fn.fromBytes(secretKeyA);
        const b = Point.fromBytes(publicKeyB); // checks for being on-curve
        return b.multiply(s).toBytes(isCompressed);
    }
    const utils = {
        isValidSecretKey,
        isValidPublicKey,
        randomSecretKey,
    };
    const keygen = createKeygen(randomSecretKey, getPublicKey);
    return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
}
/**
 * Creates ECDSA signing interface for given elliptic curve `Point` and `hash` function.
 *
 * @param Point created using {@link weierstrass} function
 * @param hash used for 1) message prehash-ing 2) k generation in `sign`, using hmac_drbg(hash)
 * @param ecdsaOpts rarely needed, see {@link ECDSAOpts}
 *
 * @example
 * ```js
 * const p256_Point = weierstrass(...);
 * const p256_sha256 = ecdsa(p256_Point, sha256);
 * const p256_sha224 = ecdsa(p256_Point, sha224);
 * const p256_sha224_r = ecdsa(p256_Point, sha224, { randomBytes: (length) => { ... } });
 * ```
 */
function ecdsa(Point, hash, ecdsaOpts = {}) {
    ahash(hash);
    validateObject(ecdsaOpts, {}, {
        hmac: 'function',
        lowS: 'boolean',
        randomBytes: 'function',
        bits2int: 'function',
        bits2int_modN: 'function',
    });
    ecdsaOpts = Object.assign({}, ecdsaOpts);
    const randomBytes = ecdsaOpts.randomBytes || randomBytes$1;
    const hmac$1 = ecdsaOpts.hmac || ((key, msg) => hmac(hash, key, msg));
    const { Fp, Fn } = Point;
    const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
    const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
    const defaultSigOpts = {
        prehash: true,
        lowS: typeof ecdsaOpts.lowS === 'boolean' ? ecdsaOpts.lowS : true,
        format: 'compact',
        extraEntropy: false,
    };
    const hasLargeCofactor = CURVE_ORDER * _2n$2 < Fp.ORDER; // Won't CURVE().h > 2n be more effective?
    function isBiggerThanHalfOrder(number) {
        const HALF = CURVE_ORDER >> _1n$2;
        return number > HALF;
    }
    function validateRS(title, num) {
        if (!Fn.isValidNot0(num))
            throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
        return num;
    }
    function assertSmallCofactor() {
        // ECDSA recovery is hard for cofactor > 1 curves.
        // In sign, `r = q.x mod n`, and here we recover q.x from r.
        // While recovering q.x >= n, we need to add r+n for cofactor=1 curves.
        // However, for cofactor>1, r+n may not get q.x:
        // r+n*i would need to be done instead where i is unknown.
        // To easily get i, we either need to:
        // a. increase amount of valid recid values (4, 5...); OR
        // b. prohibit non-prime-order signatures (recid > 1).
        if (hasLargeCofactor)
            throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
    }
    function validateSigLength(bytes, format) {
        validateSigFormat(format);
        const size = lengths.signature;
        const sizer = format === 'compact' ? size : format === 'recovered' ? size + 1 : undefined;
        return abytes$2(bytes, sizer);
    }
    /**
     * ECDSA signature with its (r, s) properties. Supports compact, recovered & DER representations.
     */
    class Signature {
        r;
        s;
        recovery;
        constructor(r, s, recovery) {
            this.r = validateRS('r', r); // r in [1..N-1];
            this.s = validateRS('s', s); // s in [1..N-1];
            if (recovery != null) {
                assertSmallCofactor();
                if (![0, 1, 2, 3].includes(recovery))
                    throw new Error('invalid recovery id');
                this.recovery = recovery;
            }
            Object.freeze(this);
        }
        static fromBytes(bytes, format = defaultSigOpts.format) {
            validateSigLength(bytes, format);
            let recid;
            if (format === 'der') {
                const { r, s } = DER.toSig(abytes$2(bytes));
                return new Signature(r, s);
            }
            if (format === 'recovered') {
                recid = bytes[0];
                format = 'compact';
                bytes = bytes.subarray(1);
            }
            const L = lengths.signature / 2;
            const r = bytes.subarray(0, L);
            const s = bytes.subarray(L, L * 2);
            return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
        }
        static fromHex(hex, format) {
            return this.fromBytes(hexToBytes(hex), format);
        }
        assertRecovery() {
            const { recovery } = this;
            if (recovery == null)
                throw new Error('invalid recovery id: must be present');
            return recovery;
        }
        addRecoveryBit(recovery) {
            return new Signature(this.r, this.s, recovery);
        }
        recoverPublicKey(messageHash) {
            const { r, s } = this;
            const recovery = this.assertRecovery();
            const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
            if (!Fp.isValid(radj))
                throw new Error('invalid recovery id: sig.r+curve.n != R.x');
            const x = Fp.toBytes(radj);
            const R = Point.fromBytes(concatBytes(pprefix((recovery & 1) === 0), x));
            const ir = Fn.inv(radj); // r^-1
            const h = bits2int_modN(abytes$2(messageHash, undefined, 'msgHash')); // Truncate hash
            const u1 = Fn.create(-h * ir); // -hr^-1
            const u2 = Fn.create(s * ir); // sr^-1
            // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1). unsafe is fine: there is no private data.
            const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
            if (Q.is0())
                throw new Error('invalid recovery: point at infinify');
            Q.assertValidity();
            return Q;
        }
        // Signatures should be low-s, to prevent malleability.
        hasHighS() {
            return isBiggerThanHalfOrder(this.s);
        }
        toBytes(format = defaultSigOpts.format) {
            validateSigFormat(format);
            if (format === 'der')
                return hexToBytes(DER.hexFromSig(this));
            const { r, s } = this;
            const rb = Fn.toBytes(r);
            const sb = Fn.toBytes(s);
            if (format === 'recovered') {
                assertSmallCofactor();
                return concatBytes(Uint8Array.of(this.assertRecovery()), rb, sb);
            }
            return concatBytes(rb, sb);
        }
        toHex(format) {
            return bytesToHex(this.toBytes(format));
        }
    }
    // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
    // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
    // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
    // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
    const bits2int = ecdsaOpts.bits2int ||
        function bits2int_def(bytes) {
            // Our custom check "just in case", for protection against DoS
            if (bytes.length > 8192)
                throw new Error('input is too large');
            // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
            // for some cases, since bytes.length * 8 is not actual bitLength.
            const num = bytesToNumberBE(bytes); // check for == u8 done here
            const delta = bytes.length * 8 - fnBits; // truncate to nBitLength leftmost bits
            return delta > 0 ? num >> BigInt(delta) : num;
        };
    const bits2int_modN = ecdsaOpts.bits2int_modN ||
        function bits2int_modN_def(bytes) {
            return Fn.create(bits2int(bytes)); // can't use bytesToNumberBE here
        };
    // Pads output with zero as per spec
    const ORDER_MASK = bitMask(fnBits);
    /** Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`. */
    function int2octets(num) {
        // IMPORTANT: the check ensures working for case `Fn.BYTES != Fn.BITS * 8`
        aInRange('num < 2^' + fnBits, num, _0n$1, ORDER_MASK);
        return Fn.toBytes(num);
    }
    function validateMsgAndHash(message, prehash) {
        abytes$2(message, undefined, 'message');
        return prehash ? abytes$2(hash(message), undefined, 'prehashed message') : message;
    }
    /**
     * Steps A, D of RFC6979 3.2.
     * Creates RFC6979 seed; converts msg/privKey to numbers.
     * Used only in sign, not in verify.
     *
     * Warning: we cannot assume here that message has same amount of bytes as curve order,
     * this will be invalid at least for P521. Also it can be bigger for P224 + SHA256.
     */
    function prepSig(message, secretKey, opts) {
        const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
        message = validateMsgAndHash(message, prehash); // RFC6979 3.2 A: h1 = H(m)
        // We can't later call bits2octets, since nested bits2int is broken for curves
        // with fnBits % 8 !== 0. Because of that, we unwrap it here as int2octets call.
        // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
        const h1int = bits2int_modN(message);
        const d = Fn.fromBytes(secretKey); // validate secret key, convert to bigint
        if (!Fn.isValidNot0(d))
            throw new Error('invalid private key');
        const seedArgs = [int2octets(d), int2octets(h1int)];
        // extraEntropy. RFC6979 3.6: additional k' (optional).
        if (extraEntropy != null && extraEntropy !== false) {
            // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
            // gen random bytes OR pass as-is
            const e = extraEntropy === true ? randomBytes(lengths.secretKey) : extraEntropy;
            seedArgs.push(abytes$2(e, undefined, 'extraEntropy')); // check for being bytes
        }
        const seed = concatBytes(...seedArgs); // Step D of RFC6979 3.2
        const m = h1int; // no need to call bits2int second time here, it is inside truncateHash!
        // Converts signature params into point w r/s, checks result for validity.
        // To transform k => Signature:
        // q = k⋅G
        // r = q.x mod n
        // s = k^-1(m + rd) mod n
        // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
        // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
        // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
        function k2sig(kBytes) {
            // RFC 6979 Section 3.2, step 3: k = bits2int(T)
            // Important: all mod() calls here must be done over N
            const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
            if (!Fn.isValidNot0(k))
                return; // Valid scalars (including k) must be in 1..N-1
            const ik = Fn.inv(k); // k^-1 mod n
            const q = Point.BASE.multiply(k).toAffine(); // q = k⋅G
            const r = Fn.create(q.x); // r = q.x mod n
            if (r === _0n$1)
                return;
            const s = Fn.create(ik * Fn.create(m + r * d)); // s = k^-1(m + rd) mod n
            if (s === _0n$1)
                return;
            let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n$2); // recovery bit (2 or 3 when q.x>n)
            let normS = s;
            if (lowS && isBiggerThanHalfOrder(s)) {
                normS = Fn.neg(s); // if lowS was passed, ensure s is always in the bottom half of N
                recovery ^= 1;
            }
            return new Signature(r, normS, hasLargeCofactor ? undefined : recovery);
        }
        return { seed, k2sig };
    }
    /**
     * Signs message hash with a secret key.
     *
     * ```
     * sign(m, d) where
     *   k = rfc6979_hmac_drbg(m, d)
     *   (x, y) = G × k
     *   r = x mod n
     *   s = (m + dr) / k mod n
     * ```
     */
    function sign(message, secretKey, opts = {}) {
        const { seed, k2sig } = prepSig(message, secretKey, opts); // Steps A, D of RFC6979 3.2.
        const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac$1);
        const sig = drbg(seed, k2sig); // Steps B, C, D, E, F, G
        return sig.toBytes(opts.format);
    }
    /**
     * Verifies a signature against message and public key.
     * Rejects lowS signatures by default: see {@link ECDSAVerifyOpts}.
     * Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
     *
     * ```
     * verify(r, s, h, P) where
     *   u1 = hs^-1 mod n
     *   u2 = rs^-1 mod n
     *   R = u1⋅G + u2⋅P
     *   mod(R.x, n) == r
     * ```
     */
    function verify(signature, message, publicKey, opts = {}) {
        const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
        publicKey = abytes$2(publicKey, undefined, 'publicKey');
        message = validateMsgAndHash(message, prehash);
        if (!isBytes$2(signature)) {
            const end = signature instanceof Signature ? ', use sig.toBytes()' : '';
            throw new Error('verify expects Uint8Array signature' + end);
        }
        validateSigLength(signature, format); // execute this twice because we want loud error
        try {
            const sig = Signature.fromBytes(signature, format);
            const P = Point.fromBytes(publicKey);
            if (lowS && sig.hasHighS())
                return false;
            const { r, s } = sig;
            const h = bits2int_modN(message); // mod n, not mod p
            const is = Fn.inv(s); // s^-1 mod n
            const u1 = Fn.create(h * is); // u1 = hs^-1 mod n
            const u2 = Fn.create(r * is); // u2 = rs^-1 mod n
            const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2)); // u1⋅G + u2⋅P
            if (R.is0())
                return false;
            const v = Fn.create(R.x); // v = r.x mod n
            return v === r;
        }
        catch (e) {
            return false;
        }
    }
    function recoverPublicKey(signature, message, opts = {}) {
        const { prehash } = validateSigOpts(opts, defaultSigOpts);
        message = validateMsgAndHash(message, prehash);
        return Signature.fromBytes(signature, 'recovered').recoverPublicKey(message).toBytes();
    }
    return Object.freeze({
        keygen,
        getPublicKey,
        getSharedSecret,
        utils,
        lengths,
        Point,
        sign,
        verify,
        recoverPublicKey,
        Signature,
        hash,
    });
}

/**
 * ed25519 Twisted Edwards curve with following addons:
 * - X25519 ECDH
 * - Ristretto cofactor elimination
 * - Elligator hash-to-group / point indistinguishability
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// prettier-ignore
const _1n$1 = BigInt(1), _2n$1 = BigInt(2), _3n = /* @__PURE__ */ BigInt(3);
// prettier-ignore
const _5n = BigInt(5); BigInt(8);
// P = 2n**255n - 19n
const ed25519_CURVE_p = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed');
function ed25519_pow_2_252_3(x) {
    // prettier-ignore
    const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
    const P = ed25519_CURVE_p;
    const x2 = (x * x) % P;
    const b2 = (x2 * x) % P; // x^3, 11
    const b4 = (pow2(b2, _2n$1, P) * b2) % P; // x^15, 1111
    const b5 = (pow2(b4, _1n$1, P) * x) % P; // x^31
    const b10 = (pow2(b5, _5n, P) * b5) % P;
    const b20 = (pow2(b10, _10n, P) * b10) % P;
    const b40 = (pow2(b20, _20n, P) * b20) % P;
    const b80 = (pow2(b40, _40n, P) * b40) % P;
    const b160 = (pow2(b80, _80n, P) * b80) % P;
    const b240 = (pow2(b160, _80n, P) * b80) % P;
    const b250 = (pow2(b240, _10n, P) * b10) % P;
    const pow_p_5_8 = (pow2(b250, _2n$1, P) * x) % P;
    // ^ To pow to (p+3)/8, multiply it by x.
    return { pow_p_5_8, b2 };
}
function adjustScalarBytes(bytes) {
    // Section 5: For X25519, in order to decode 32 random bytes as an integer scalar,
    // set the three least significant bits of the first byte
    bytes[0] &= 248; // 0b1111_1000
    // and the most significant bit of the last to zero,
    bytes[31] &= 127; // 0b0111_1111
    // set the second most significant bit of the last byte to 1
    bytes[31] |= 64; // 0b0100_0000
    return bytes;
}
/**
 * ECDH using curve25519 aka x25519.
 * @example
 * ```js
 * import { x25519 } from '@noble/curves/ed25519.js';
 * const alice = x25519.keygen();
 * const bob = x25519.keygen();
 * const shared = x25519.getSharedSecret(alice.secretKey, bob.publicKey);
 * ```
 */
const x25519 = /* @__PURE__ */ (() => {
    const P = ed25519_CURVE_p;
    return montgomery({
        P,
        type: 'x25519',
        powPminus2: (x) => {
            // x^(p-2) aka x^(2^255-21)
            const { pow_p_5_8, b2 } = ed25519_pow_2_252_3(x);
            return mod$1(pow2(pow_p_5_8, _3n, P) * b2, P);
        },
        adjustScalarBytes,
    });
})();

/**
 * Internal module for NIST P256, P384, P521 curves.
 * Do not use for now.
 * @module
 */
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// p = 2n**224n * (2n**32n-1n) + 2n**192n + 2n**96n - 1n
// a = Fp256.create(BigInt('-3'));
const p256_CURVE = /* @__PURE__ */ (() => ({
    p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    h: BigInt(1),
    a: BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc'),
    b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
    Gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    Gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
}))();
// p = 2n**384n - 2n**128n - 2n**96n + 2n**32n - 1n
const p384_CURVE = /* @__PURE__ */ (() => ({
    p: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff'),
    n: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973'),
    h: BigInt(1),
    a: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffc'),
    b: BigInt('0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef'),
    Gx: BigInt('0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7'),
    Gy: BigInt('0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f'),
}))();
// NIST P256
const p256_Point = /* @__PURE__ */ weierstrass(p256_CURVE);
/**
 * NIST P256 (aka secp256r1, prime256v1) curve, ECDSA and ECDH methods.
 * Hashes inputs with sha256 by default.
 *
 * @example
 * ```js
 * import { p256 } from '@noble/curves/nist.js';
 * const { secretKey, publicKey } = p256.keygen();
 * // const publicKey = p256.getPublicKey(secretKey);
 * const msg = new TextEncoder().encode('hello noble');
 * const sig = p256.sign(msg, secretKey);
 * const isValid = p256.verify(sig, msg, publicKey);
 * // const sigKeccak = p256.sign(keccak256(msg), secretKey, { prehash: false });
 * ```
 */
const p256 = /* @__PURE__ */ ecdsa(p256_Point, sha256);
// NIST P384
const p384_Point = /* @__PURE__ */ weierstrass(p384_CURVE);
/** NIST P384 (aka secp384r1) curve, ECDSA and ECDH methods. Hashes inputs with sha384 by default. */
const p384 = /* @__PURE__ */ ecdsa(p384_Point, sha384);

/**
 * SHA3 (keccak) hash function, based on a new "Sponge function" design.
 * Different from older hashes, the internal state is bigger than output size.
 *
 * Check out [FIPS-202](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.202.pdf),
 * [Website](https://keccak.team/keccak.html),
 * [the differences between SHA-3 and Keccak](https://crypto.stackexchange.com/questions/15727/what-are-the-key-differences-between-the-draft-sha-3-standard-and-the-keccak-sub).
 *
 * Check out `sha3-addons` module for cSHAKE, k12, and others.
 * @module
 */
// No __PURE__ annotations in sha3 header:
// EVERYTHING is in fact used on every export.
// Various per round constants calculations
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _7n = BigInt(7);
const _256n = BigInt(256);
const _0x71n = BigInt(0x71);
const SHA3_PI = [];
const SHA3_ROTL = [];
const _SHA3_IOTA = []; // no pure annotation: var is always used
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const IOTAS = split(_SHA3_IOTA, true);
const SHA3_IOTA_H = IOTAS[0];
const SHA3_IOTA_L = IOTAS[1];
// Left rotation (without 0, 32, 64)
const rotlH = (h, l, s) => (s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s));
const rotlL = (h, l, s) => (s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s));
/** `keccakf1600` internal function, additionally allows to adjust round count. */
function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        for (let y = 0; y < 50; y += 10) {
            for (let x = 0; x < 10; x++)
                B[x] = s[y + x];
            for (let x = 0; x < 10; x++)
                s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    clean$1(B);
}
/** Keccak sponge function. */
class Keccak {
    state;
    pos = 0;
    posOut = 0;
    finished = false;
    state32;
    destroyed = false;
    blockLen;
    suffix;
    outputLen;
    enableXOF = false;
    rounds;
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        // Can be passed from user as dkLen
        anumber$2(outputLen, 'outputLen');
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        // 0 < blockLen < 200
        if (!(0 < blockLen && blockLen < 200))
            throw new Error('only keccak-f1600 function is supported');
        this.state = new Uint8Array(200);
        this.state32 = u32$1(this.state);
    }
    clone() {
        return this._cloneInto();
    }
    keccak() {
        swap32IfBE(this.state32);
        keccakP(this.state32, this.rounds);
        swap32IfBE(this.state32);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        aexists$1(this);
        abytes$2(data);
        const { blockLen, state } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        aexists$1(this, false);
        abytes$2(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        anumber$2(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        aoutput$1(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        clean$1(this.state);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to ||= new Keccak(blockLen, suffix, outputLen, enableXOF, rounds);
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
const genKeccak = (suffix, blockLen, outputLen, info = {}) => createHasher(() => new Keccak(blockLen, suffix, outputLen), info);
/** SHA3-256 hash function. Different from keccak-256. */
const sha3_256 = /* @__PURE__ */ genKeccak(0x06, 136, 32, 
/* @__PURE__ */ oidNist(0x08));
/** SHA3-512 hash function. */
const sha3_512 = /* @__PURE__ */ genKeccak(0x06, 72, 64, 
/* @__PURE__ */ oidNist(0x0a));
const genShake = (suffix, blockLen, outputLen, info = {}) => createHasher((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === undefined ? outputLen : opts.dkLen, true), info);
/** SHAKE128 XOF with 128-bit security. */
const shake128 = 
/* @__PURE__ */
genShake(0x1f, 168, 16, /* @__PURE__ */ oidNist(0x0b));
/** SHAKE256 XOF with 256-bit security. */
const shake256 = 
/* @__PURE__ */
genShake(0x1f, 136, 32, /* @__PURE__ */ oidNist(0x0c));

function checkU32(n) {
    // 0xff_ff_ff_ff
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff)
        throw new Error('wrong u32 integer:' + n);
    return n;
}
/** Checks if integer is in form of `1 << X` */
function isPowerOfTwo(x) {
    checkU32(x);
    return (x & (x - 1)) === 0 && x !== 0;
}
function reverseBits(n, bits) {
    checkU32(n);
    let reversed = 0;
    for (let i = 0; i < bits; i++, n >>>= 1)
        reversed = (reversed << 1) | (n & 1);
    return reversed;
}
/** Similar to `bitLen(x)-1` but much faster for small integers, like indices */
function log2(n) {
    checkU32(n);
    return 31 - Math.clz32(n);
}
/**
 * Moves lowest bit to highest position, which at first step splits
 * array on even and odd indices, then it applied again to each part,
 * which is core of fft
 */
function bitReversalInplace(values) {
    const n = values.length;
    if (n < 2 || !isPowerOfTwo(n))
        throw new Error('n must be a power of 2 and greater than 1. Got ' + n);
    const bits = log2(n);
    for (let i = 0; i < n; i++) {
        const j = reverseBits(i, bits);
        if (i < j) {
            const tmp = values[i];
            values[i] = values[j];
            values[j] = tmp;
        }
    }
    return values;
}
/**
 * Constructs different flavors of FFT. radix2 implementation of low level mutating API. Flavors:
 *
 * - DIT (Decimation-in-Time): Bottom-Up (leaves -> root), Cool-Turkey
 * - DIF (Decimation-in-Frequency): Top-Down (root -> leaves), Gentleman–Sande
 *
 * DIT takes brp input, returns natural output.
 * DIF takes natural input, returns brp output.
 *
 * The output is actually identical. Time / frequence distinction is not meaningful
 * for Polynomial multiplication in fields.
 * Which means if protocol supports/needs brp output/inputs, then we can skip this step.
 *
 * Cyclic NTT: Rq = Zq[x]/(x^n-1). butterfly_DIT+loop_DIT OR butterfly_DIF+loop_DIT, roots are omega
 * Negacyclic NTT: Rq = Zq[x]/(x^n+1). butterfly_DIT+loop_DIF, at least for mlkem / mldsa
 */
const FFTCore = (F, coreOpts) => {
    const { N, roots, dit, invertButterflies = false, skipStages = 0, brp = true } = coreOpts;
    const bits = log2(N);
    if (!isPowerOfTwo(N))
        throw new Error('FFT: Polynomial size should be power of two');
    const isDit = dit !== invertButterflies;
    return (values) => {
        if (values.length !== N)
            throw new Error('FFT: wrong Polynomial length');
        if (dit && brp)
            bitReversalInplace(values);
        for (let i = 0, g = 1; i < bits - skipStages; i++) {
            // For each stage s (sub-FFT length m = 2^s)
            const s = dit ? i + 1 + skipStages : bits - i;
            const m = 1 << s;
            const m2 = m >> 1;
            const stride = N >> s;
            // Loop over each subarray of length m
            for (let k = 0; k < N; k += m) {
                // Loop over each butterfly within the subarray
                for (let j = 0, grp = g++; j < m2; j++) {
                    const rootPos = invertButterflies ? (dit ? N - grp : grp) : j * stride;
                    const i0 = k + j;
                    const i1 = k + j + m2;
                    const omega = roots[rootPos];
                    const b = values[i1];
                    const a = values[i0];
                    // Inlining gives us 10% perf in kyber vs functions
                    if (isDit) {
                        const t = F.mul(b, omega); // Standard DIT butterfly
                        values[i0] = F.add(a, t);
                        values[i1] = F.sub(a, t);
                    }
                    else if (invertButterflies) {
                        values[i0] = F.add(b, a); // DIT loop + inverted butterflies (Kyber decode)
                        values[i1] = F.mul(F.sub(b, a), omega);
                    }
                    else {
                        values[i0] = F.add(a, b); // Standard DIF butterfly
                        values[i1] = F.mul(F.sub(a, b), omega);
                    }
                }
            }
        }
        if (!dit && brp)
            bitReversalInplace(values);
        return values;
    };
};

/**
 * Utilities for hex, bytearray and number handling.
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
const randomBytes = randomBytes$1;
// Compares 2 u8a-s in kinda constant time
function equalBytes(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
// copy bytes to new u8a (aligned). Because Buffer.slice is broken.
function copyBytes(bytes) {
    return Uint8Array.from(bytes);
}
function splitCoder(label, ...lengths) {
    const getLength = (c) => (typeof c === 'number' ? c : c.bytesLen);
    const bytesLen = lengths.reduce((sum, a) => sum + getLength(a), 0);
    return {
        bytesLen,
        encode: (bufs) => {
            const res = new Uint8Array(bytesLen);
            for (let i = 0, pos = 0; i < lengths.length; i++) {
                const c = lengths[i];
                const l = getLength(c);
                const b = typeof c === 'number' ? bufs[i] : c.encode(bufs[i]);
                abytes$2(b, l, label);
                res.set(b, pos);
                if (typeof c !== 'number')
                    b.fill(0); // clean
                pos += l;
            }
            return res;
        },
        decode: (buf) => {
            abytes$2(buf, bytesLen, label);
            const res = [];
            for (const c of lengths) {
                const l = getLength(c);
                const b = buf.subarray(0, l);
                res.push(typeof c === 'number' ? b : c.decode(b));
                buf = buf.subarray(l);
            }
            return res;
        },
    };
}
// nano-packed.array (fixed size)
function vecCoder(c, vecLen) {
    const bytesLen = vecLen * c.bytesLen;
    return {
        bytesLen,
        encode: (u) => {
            if (u.length !== vecLen)
                throw new Error(`vecCoder.encode: wrong length=${u.length}. Expected: ${vecLen}`);
            const res = new Uint8Array(bytesLen);
            for (let i = 0, pos = 0; i < u.length; i++) {
                const b = c.encode(u[i]);
                res.set(b, pos);
                b.fill(0); // clean
                pos += b.length;
            }
            return res;
        },
        decode: (a) => {
            abytes$2(a, bytesLen);
            const r = [];
            for (let i = 0; i < a.length; i += c.bytesLen)
                r.push(c.decode(a.subarray(i, i + c.bytesLen)));
            return r;
        },
    };
}
// cleanBytes(Uint8Array.of(), [Uint16Array.of(), Uint32Array.of()])
function cleanBytes(...list) {
    for (const t of list) {
        if (Array.isArray(t))
            for (const b of t)
                b.fill(0);
        else
            t.fill(0);
    }
}
function getMask(bits) {
    return (1 << bits) - 1; // 4 -> 0b1111
}

/**
 * Internal methods for lattice-based ML-KEM and ML-DSA.
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
const genCrystals = (opts) => {
    // isKyber: true means Kyber, false means Dilithium
    const { newPoly, N, Q, F, ROOT_OF_UNITY, brvBits} = opts;
    const mod = (a, modulo = Q) => {
        const result = a % modulo | 0;
        return (result >= 0 ? result | 0 : (modulo + result) | 0) | 0;
    };
    // -(Q-1)/2 < a <= (Q-1)/2
    const smod = (a, modulo = Q) => {
        const r = mod(a, modulo) | 0;
        return (r > modulo >> 1 ? (r - modulo) | 0 : r) | 0;
    };
    // Generate zettas (different from roots of unity, negacyclic uses phi, where acyclic uses omega)
    function getZettas() {
        const out = newPoly(N);
        for (let i = 0; i < N; i++) {
            const b = reverseBits(i, brvBits);
            const p = BigInt(ROOT_OF_UNITY) ** BigInt(b) % BigInt(Q);
            out[i] = Number(p) | 0;
        }
        return out;
    }
    const nttZetas = getZettas();
    // Number-Theoretic Transform
    // Explained: https://electricdusk.com/ntt.html
    // Kyber has slightly different params, since there is no 512th primitive root of unity mod q,
    // only 256th primitive root of unity mod. Which also complicates MultiplyNTT.
    const field = {
        add: (a, b) => mod((a | 0) + (b | 0)) | 0,
        sub: (a, b) => mod((a | 0) - (b | 0)) | 0,
        mul: (a, b) => mod((a | 0) * (b | 0)) | 0,
        inv: (_a) => {
            throw new Error('not implemented');
        },
    };
    const nttOpts = {
        N,
        roots: nttZetas,
        invertButterflies: true,
        skipStages: 1 ,
        brp: false,
    };
    const dif = FFTCore(field, { dit: false, ...nttOpts });
    const dit = FFTCore(field, { dit: true, ...nttOpts });
    const NTT = {
        encode: (r) => {
            return dif(r);
        },
        decode: (r) => {
            dit(r);
            // kyber uses 128 here, because brv && stuff
            for (let i = 0; i < r.length; i++)
                r[i] = mod(F * r[i]);
            return r;
        },
    };
    // Encode polynominal as bits
    const bitsCoder = (d, c) => {
        const mask = getMask(d);
        const bytesLen = d * (N / 8);
        return {
            bytesLen,
            encode: (poly) => {
                const r = new Uint8Array(bytesLen);
                for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < poly.length; i++) {
                    buf |= (c.encode(poly[i]) & mask) << bufLen;
                    bufLen += d;
                    for (; bufLen >= 8; bufLen -= 8, buf >>= 8)
                        r[pos++] = buf & getMask(bufLen);
                }
                return r;
            },
            decode: (bytes) => {
                const r = newPoly(N);
                for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < bytes.length; i++) {
                    buf |= bytes[i] << bufLen;
                    bufLen += 8;
                    for (; bufLen >= d; bufLen -= d, buf >>= d)
                        r[pos++] = c.decode(buf & mask);
                }
                return r;
            },
        };
    };
    return { mod, smod, nttZetas, NTT, bitsCoder };
};
const createXofShake = (shake) => (seed, blockLen) => {
    if (!blockLen)
        blockLen = shake.blockLen;
    // Optimizations that won't mater:
    // - cached seed update (two .update(), on start and on the end)
    // - another cache which cloned into working copy
    // Faster than multiple updates, since seed less than blockLen
    const _seed = new Uint8Array(seed.length + 2);
    _seed.set(seed);
    const seedLen = seed.length;
    const buf = new Uint8Array(blockLen); // == shake128.blockLen
    let h = shake.create({});
    let calls = 0;
    let xofs = 0;
    return {
        stats: () => ({ calls, xofs }),
        get: (x, y) => {
            _seed[seedLen + 0] = x;
            _seed[seedLen + 1] = y;
            h.destroy();
            h = shake.create({}).update(_seed);
            calls++;
            return () => {
                xofs++;
                return h.xofInto(buf);
            };
        },
        clean: () => {
            h.destroy();
            cleanBytes(buf, _seed);
        },
    };
};
const XOF128 = /* @__PURE__ */ createXofShake(shake128);

/**
 * ML-KEM: Module Lattice-based Key Encapsulation Mechanism from
 * [FIPS-203](https://csrc.nist.gov/pubs/fips/203/ipd). A.k.a. CRYSTALS-Kyber.
 *
 * Key encapsulation is similar to DH / ECDH (think X25519), with important differences:
 * * Unlike in ECDH, we can't verify if it was "Bob" who've sent the shared secret
 * * Unlike ECDH, it is probabalistic and relies on quality of randomness (CSPRNG).
 * * Decapsulation never throws an error, even when shared secret was
 *   encrypted by a different public key. It will just return a different shared secret.
 *
 * There are some concerns with regards to security: see
 * [djb blog](https://blog.cr.yp.to/20231003-countcorrectly.html) and
 * [mailing list](https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/W2VOzy0wz_E).
 *
 * Has similar internals to ML-DSA, but their keys and params are different.
 *
 * Check out [official site](https://www.pq-crystals.org/kyber/resources.shtml),
 * [repo](https://github.com/pq-crystals/kyber),
 * [spec](https://datatracker.ietf.org/doc/draft-cfrg-schwabe-kyber/).
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
/** Key encapsulation mechanism interface */
const N = 256; // Kyber (not FIPS-203) supports different lengths, but all std modes were using 256
const Q = 3329; // 13*(2**8)+1, modulo prime
const F = 3303; // 3303 ≡ 128**(−1) mod q (FIPS-203)
const ROOT_OF_UNITY = 17; // ζ = 17 ∈ Zq is a primitive 256-th root of unity modulo Q. ζ**128 ≡−1
const { mod, nttZetas, NTT, bitsCoder } = genCrystals({
    N,
    Q,
    F,
    ROOT_OF_UNITY,
    newPoly: (n) => new Uint16Array(n),
    brvBits: 7});
/** Internal params of ML-KEM versions */
// prettier-ignore
const PARAMS = {
    768: { N, Q, K: 3, ETA1: 2, ETA2: 2, du: 10, dv: 4, RBGstrength: 192 },
    1024: { N, Q, K: 4, ETA1: 2, ETA2: 2, du: 11, dv: 5, RBGstrength: 256 },
};
// FIPS-203: compress/decompress
const compress = (d) => {
    // Special case, no need to compress, pass as is, but strip high bytes on compression
    if (d >= 12)
        return { encode: (i) => i, decode: (i) => i };
    // NOTE: we don't use float arithmetic (forbidden by FIPS-203 and high chance of bugs).
    // Comments map to python implementation in RFC (draft-cfrg-schwabe-kyber)
    // const round = (i: number) => Math.floor(i + 0.5) | 0;
    const a = 2 ** (d - 1);
    return {
        // const compress = (i: number) => round((2 ** d / Q) * i) % 2 ** d;
        encode: (i) => ((i << d) + Q / 2) / Q,
        // const decompress = (i: number) => round((Q / 2 ** d) * i);
        decode: (i) => (i * Q + a) >>> d,
    };
};
// NOTE: we merge encoding and compress because it is faster, also both require same d param
// Converts between bytes and d-bits compressed representation. Kinda like convertRadix2 from @scure/base
// decode(encode(t)) == t, but there is loss of information on encode(decode(t))
const polyCoder = (d) => bitsCoder(d, compress(d));
function polyAdd(a, b) {
    for (let i = 0; i < N; i++)
        a[i] = mod(a[i] + b[i]); // a += b
}
function polySub(a, b) {
    for (let i = 0; i < N; i++)
        a[i] = mod(a[i] - b[i]); // a -= b
}
// FIPS-203: Computes the product of two degree-one polynomials with respect to a quadratic modulus
function BaseCaseMultiply(a0, a1, b0, b1, zeta) {
    const c0 = mod(a1 * b1 * zeta + a0 * b0);
    const c1 = mod(a0 * b1 + a1 * b0);
    return { c0, c1 };
}
// FIPS-203: Computes the product (in the ring Tq) of two NTT representations. NOTE: works inplace for f
// NOTE: since multiply defined only for NTT representation, we need to convert to NTT, multiply and convert back
function MultiplyNTTs(f, g) {
    for (let i = 0; i < N / 2; i++) {
        let z = nttZetas[64 + (i >> 1)];
        if (i & 1)
            z = -z;
        const { c0, c1 } = BaseCaseMultiply(f[2 * i + 0], f[2 * i + 1], g[2 * i + 0], g[2 * i + 1], z);
        f[2 * i + 0] = c0;
        f[2 * i + 1] = c1;
    }
    return f;
}
// Return poly in NTT representation
function SampleNTT(xof) {
    const r = new Uint16Array(N);
    for (let j = 0; j < N;) {
        const b = xof();
        if (b.length % 3)
            throw new Error('SampleNTT: unaligned block');
        for (let i = 0; j < N && i + 3 <= b.length; i += 3) {
            const d1 = ((b[i + 0] >> 0) | (b[i + 1] << 8)) & 0xfff;
            const d2 = ((b[i + 1] >> 4) | (b[i + 2] << 4)) & 0xfff;
            if (d1 < Q)
                r[j++] = d1;
            if (j < N && d2 < Q)
                r[j++] = d2;
        }
    }
    return r;
}
// Sampling from the centered binomial distribution
// Returns poly with small coefficients (noise/errors)
function sampleCBD(PRF, seed, nonce, eta) {
    const buf = PRF((eta * N) / 4, seed, nonce);
    const r = new Uint16Array(N);
    const b32 = u32$1(buf);
    let len = 0;
    for (let i = 0, p = 0, bb = 0, t0 = 0; i < b32.length; i++) {
        let b = b32[i];
        for (let j = 0; j < 32; j++) {
            bb += b & 1;
            b >>= 1;
            len += 1;
            if (len === eta) {
                t0 = bb;
                bb = 0;
            }
            else if (len === 2 * eta) {
                r[p++] = mod(t0 - bb);
                bb = 0;
                len = 0;
            }
        }
    }
    if (len)
        throw new Error(`sampleCBD: leftover bits: ${len}`);
    return r;
}
// K-PKE
// As per FIPS-203, it doesn't perform any input validation and can't be used in standalone fashion.
const genKPKE = (opts) => {
    const { K, PRF, XOF, HASH512, ETA1, ETA2, du, dv } = opts;
    const poly1 = polyCoder(1);
    const polyV = polyCoder(dv);
    const polyU = polyCoder(du);
    const publicCoder = splitCoder('publicKey', vecCoder(polyCoder(12), K), 32);
    const secretCoder = vecCoder(polyCoder(12), K);
    const cipherCoder = splitCoder('ciphertext', vecCoder(polyU, K), polyV);
    const seedCoder = splitCoder('seed', 32, 32);
    return {
        secretCoder,
        lengths: {
            secretKey: secretCoder.bytesLen,
            publicKey: publicCoder.bytesLen,
            cipherText: cipherCoder.bytesLen,
        },
        keygen: (seed) => {
            abytes$2(seed, 32, 'seed');
            const seedDst = new Uint8Array(33);
            seedDst.set(seed);
            seedDst[32] = K;
            const seedHash = HASH512(seedDst);
            const [rho, sigma] = seedCoder.decode(seedHash);
            const sHat = [];
            const tHat = [];
            for (let i = 0; i < K; i++)
                sHat.push(NTT.encode(sampleCBD(PRF, sigma, i, ETA1)));
            const x = XOF(rho);
            for (let i = 0; i < K; i++) {
                const e = NTT.encode(sampleCBD(PRF, sigma, K + i, ETA1));
                for (let j = 0; j < K; j++) {
                    const aji = SampleNTT(x.get(j, i)); // A[j][i], inplace
                    polyAdd(e, MultiplyNTTs(aji, sHat[j]));
                }
                tHat.push(e); // t ← A ◦ s + e
            }
            x.clean();
            const res = {
                publicKey: publicCoder.encode([tHat, rho]),
                secretKey: secretCoder.encode(sHat),
            };
            cleanBytes(rho, sigma, sHat, tHat, seedDst, seedHash);
            return res;
        },
        encrypt: (publicKey, msg, seed) => {
            const [tHat, rho] = publicCoder.decode(publicKey);
            const rHat = [];
            for (let i = 0; i < K; i++)
                rHat.push(NTT.encode(sampleCBD(PRF, seed, i, ETA1)));
            const x = XOF(rho);
            const tmp2 = new Uint16Array(N);
            const u = [];
            for (let i = 0; i < K; i++) {
                const e1 = sampleCBD(PRF, seed, K + i, ETA2);
                const tmp = new Uint16Array(N);
                for (let j = 0; j < K; j++) {
                    const aij = SampleNTT(x.get(i, j)); // A[i][j], inplace
                    polyAdd(tmp, MultiplyNTTs(aij, rHat[j])); // t += aij * rHat[j]
                }
                polyAdd(e1, NTT.decode(tmp)); // e1 += tmp
                u.push(e1);
                polyAdd(tmp2, MultiplyNTTs(tHat[i], rHat[i])); // t2 += tHat[i] * rHat[i]
                cleanBytes(tmp);
            }
            x.clean();
            const e2 = sampleCBD(PRF, seed, 2 * K, ETA2);
            polyAdd(e2, NTT.decode(tmp2)); // e2 += tmp2
            const v = poly1.decode(msg); // encode plaintext m into polynomial v
            polyAdd(v, e2); // v += e2
            cleanBytes(tHat, rHat, tmp2, e2);
            return cipherCoder.encode([u, v]);
        },
        decrypt: (cipherText, privateKey) => {
            const [u, v] = cipherCoder.decode(cipherText);
            const sk = secretCoder.decode(privateKey); // s  ← ByteDecode_12(dkPKE)
            const tmp = new Uint16Array(N);
            for (let i = 0; i < K; i++)
                polyAdd(tmp, MultiplyNTTs(sk[i], NTT.encode(u[i]))); // tmp += sk[i] * u[i]
            polySub(v, NTT.decode(tmp)); // v += tmp
            cleanBytes(tmp, sk, u);
            return poly1.encode(v);
        },
    };
};
function createKyber(opts) {
    const KPKE = genKPKE(opts);
    const { HASH256, HASH512, KDF } = opts;
    const { secretCoder: KPKESecretCoder, lengths } = KPKE;
    const secretCoder = splitCoder('secretKey', lengths.secretKey, lengths.publicKey, 32, 32);
    const msgLen = 32;
    const seedLen = 64;
    return {
        info: { type: 'ml-kem' },
        lengths: {
            ...lengths,
            seed: 64,
            msg: msgLen,
            msgRand: msgLen,
            secretKey: secretCoder.bytesLen,
        },
        keygen: (seed = randomBytes(seedLen)) => {
            abytes$2(seed, seedLen, 'seed');
            const { publicKey, secretKey: sk } = KPKE.keygen(seed.subarray(0, 32));
            const publicKeyHash = HASH256(publicKey);
            // (dkPKE||ek||H(ek)||z)
            const secretKey = secretCoder.encode([sk, publicKey, publicKeyHash, seed.subarray(32)]);
            cleanBytes(sk, publicKeyHash);
            return { publicKey, secretKey };
        },
        getPublicKey: (secretKey) => {
            const [_sk, publicKey, _publicKeyHash, _z] = secretCoder.decode(secretKey);
            return Uint8Array.from(publicKey);
        },
        encapsulate: (publicKey, msg = randomBytes(msgLen)) => {
            abytes$2(publicKey, lengths.publicKey, 'publicKey');
            abytes$2(msg, msgLen, 'message');
            // FIPS-203 includes additional verification check for modulus
            const eke = publicKey.subarray(0, 384 * opts.K);
            const ek = KPKESecretCoder.encode(KPKESecretCoder.decode(copyBytes(eke))); // Copy because of inplace encoding
            // (Modulus check.) Perform the computation ek ← ByteEncode12(ByteDecode12(eke)).
            // If ek = ̸ eke, the input is invalid. (See Section 4.2.1.)
            if (!equalBytes(ek, eke)) {
                cleanBytes(ek);
                throw new Error('ML-KEM.encapsulate: wrong publicKey modulus');
            }
            cleanBytes(ek);
            const kr = HASH512.create().update(msg).update(HASH256(publicKey)).digest(); // derive randomness
            const cipherText = KPKE.encrypt(publicKey, msg, kr.subarray(32, 64));
            cleanBytes(kr.subarray(32));
            return { cipherText, sharedSecret: kr.subarray(0, 32) };
        },
        decapsulate: (cipherText, secretKey) => {
            abytes$2(secretKey, secretCoder.bytesLen, 'secretKey'); // 768*k + 96
            abytes$2(cipherText, lengths.cipherText, 'cipherText'); // 32(du*k + dv)
            // test ← H(dk[384𝑘 ∶ 768𝑘 + 32])) .
            const k768 = secretCoder.bytesLen - 96;
            const start = k768 + 32;
            const test = HASH256(secretKey.subarray(k768 / 2, start));
            // If test ≠ dk[768𝑘 + 32 ∶ 768𝑘 + 64], then input checking has failed.
            if (!equalBytes(test, secretKey.subarray(start, start + 32)))
                throw new Error('invalid secretKey: hash check failed');
            const [sk, publicKey, publicKeyHash, z] = secretCoder.decode(secretKey);
            const msg = KPKE.decrypt(cipherText, sk);
            const kr = HASH512.create().update(msg).update(publicKeyHash).digest(); // derive randomness, Khat, rHat = G(mHat || h)
            const Khat = kr.subarray(0, 32);
            const cipherText2 = KPKE.encrypt(publicKey, msg, kr.subarray(32, 64)); // re-encrypt using the derived randomness
            const isValid = equalBytes(cipherText, cipherText2); // if ciphertexts do not match, “implicitly reject”
            const Kbar = KDF.create({ dkLen: 32 }).update(z).update(cipherText).digest();
            cleanBytes(msg, cipherText2, !isValid ? Khat : Kbar);
            return isValid ? Khat : Kbar;
        },
    };
}
function shakePRF(dkLen, key, nonce) {
    return shake256
        .create({ dkLen })
        .update(key)
        .update(new Uint8Array([nonce]))
        .digest();
}
const opts = {
    HASH256: sha3_256,
    HASH512: sha3_512,
    KDF: shake256,
    XOF: XOF128,
    PRF: shakePRF,
};
/** ML-KEM-768, for 192-bit security level. Not recommended after 2030, as per ASD. */
const ml_kem768 = /* @__PURE__ */ createKyber({
    ...opts,
    ...PARAMS[768],
});
/** ML-KEM-1024 for 256-bit security level. OK after 2030, as per ASD. */
const ml_kem1024 = /* @__PURE__ */ createKyber({
    ...opts,
    ...PARAMS[1024],
});

/**
 * Post-Quantum Hybrid Cryptography
 *
 * The current implementation is flawed and likely redundant. We should offer
 * a small, generic API to compose hybrid schemes instead of reimplementing
 * protocol-specific logic (SSH, GPG, etc.) with ad hoc encodings.
 *
 * 1. Core Issues
 *    - sign/verify: implemented as two separate operations with different keys.
 *    - EC getSharedSecret: could be refactored into a proper KEM.
 *    - Multiple calls: keys, signatures, and shared secrets could be
 *      concatenated to reduce the number of API invocations.
 *    - Reinvention: most libraries add strange domain separations and
 *      encodings instead of simple byte concatenation.
 *
 * 2. API Goals
 *    - Provide primitives to build hybrids generically.
 *    - Avoid embedding SSH- or GPG-specific formats in the core API.
 *
 * 3. Edge Cases
 *    • Variable-length signatures:
 *      - DER-encoded (Weierstrass curves).
 *      - Falcon (unpadded).
 *      - Concatenation works only if length is fixed; otherwise a length
 *        prefix is required (but that breaks compatibility).
 *
 *    • getSharedSecret:
 *      - Default: non-KEM (authenticated ECDH).
 *      - KEM conversion: generate a random SK to remove implicit auth.
 *
 * 4. Common Pitfalls
 *    - Seed expansion:
 *      • Expanding a small seed into multiple keys reduces entropy.
 *      • API should allow identity mapping (no expansion).
 *
 *    - Skipping full point encoding:
 *      • Some omit the compression byte (parity) for WebCrypto compatibility.
 *      • Better: hash the raw secret; coordinate output is already non-uniform.
 *      • Some curves (e.g., X448) produce secrets that must be re-hashed to match
 *        symmetric-key lengths.
 *
 *    - Combiner inconsistencies:
 *      • Different domain separations and encodings across libraries.
 *      • Should live at the application layer, since key lengths vary.
 *
 * 5. Protocol Examples
 *    - SSH:
 *      • Concatenate keys.
 *      • Combiner: SHA-512.
 *
 *    - GPG:
 *      • Concatenate keys.
 *      • Combiner: SHA3-256(kemShare || ecdhShare || ciphertext || pubKey || algId || domSep || len(domSep))
 *
 *    - TLS:
 *      • Transcript-based derivation (HKDF).
 *
 * 6. Relevant Specs & Implementations
 *    - IETF Hybrid KEM drafts:
 *      • draft-irtf-cfrg-hybrid-kems
 *      • draft-connolly-cfrg-xwing-kem
 *      • draft-westerbaan-tls-xyber768d00
 *
 *    - PQC Libraries:
 *      • superdilithium (cyph/pqcrypto.js) – low adoption.
 *      • hybrid-pqc (DogeProtocol, quantumcoinproject) – complex encodings.
 *
 * 7. Signatures
 *    - Ed25519: fixed-size, easy to support.
 *    - Variable-size: introduces custom format requirements; best left to
 *      higher-level code.
 *
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
// Can re-use if decide to signatures support, on other hand getSecretKey is specific and ugly
function ecKeygen(curve, allowZeroKey = false) {
    const lengths = curve.lengths;
    let keygen = curve.keygen;
    if (allowZeroKey) {
        // This is ugly, but we need to return exact results here.
        const wCurve = curve;
        const Fn = wCurve.Point.Fn;
        if (!Fn)
            throw new Error('No Point.Fn');
        keygen = (seed = randomBytes(lengths.seed)) => {
            abytes$2(seed, lengths.seed, 'seed');
            const seedScalar = Fn.isLE ? bytesToNumberLE(seed) : bytesToNumberBE(seed);
            const secretKey = Fn.toBytes(Fn.create(seedScalar)); // Fixes modulo bias, but not zero
            return { secretKey, publicKey: curve.getPublicKey(secretKey) };
        };
    }
    return {
        lengths: { secretKey: lengths.secretKey, publicKey: lengths.publicKey, seed: lengths.seed },
        keygen,
        getPublicKey: (secretKey) => curve.getPublicKey(secretKey),
    };
}
function ecdhKem(curve, allowZeroKey = false) {
    const kg = ecKeygen(curve, allowZeroKey);
    if (!curve.getSharedSecret)
        throw new Error('wrong curve'); // ed25519 doesn't have one!
    return {
        lengths: { ...kg.lengths, msg: kg.lengths.seed, cipherText: kg.lengths.publicKey },
        keygen: kg.keygen,
        getPublicKey: kg.getPublicKey,
        encapsulate(publicKey, rand = randomBytes(curve.lengths.seed)) {
            const ek = this.keygen(rand).secretKey;
            const sharedSecret = this.decapsulate(publicKey, ek);
            const cipherText = curve.getPublicKey(ek);
            cleanBytes(ek);
            return { sharedSecret, cipherText };
        },
        decapsulate(cipherText, secretKey) {
            const res = curve.getSharedSecret(secretKey, cipherText);
            return curve.lengths.publicKeyHasPrefix ? res.subarray(1) : res;
        },
    };
}
function splitLengths(lst, name) {
    return splitCoder(name, ...lst.map((i) => {
        if (typeof i.lengths[name] !== 'number')
            throw new Error('wrong length: ' + name);
        return i.lengths[name];
    }));
}
// It is XOF for most cases, but can be more complex!
function expandSeedXof(xof) {
    return (seed, seedLen) => xof(seed, { dkLen: seedLen });
}
function combineKeys(realSeedLen, // how much bytes expandSeed expects
expandSeed, ...ck) {
    const seedCoder = splitLengths(ck, 'seed');
    const pkCoder = splitLengths(ck, 'publicKey');
    anumber$2(realSeedLen);
    function expandDecapsulationKey(seed) {
        abytes$2(seed, realSeedLen);
        const expanded = seedCoder.decode(expandSeed(seed, seedCoder.bytesLen));
        const keys = ck.map((i, j) => i.keygen(expanded[j]));
        const secretKey = keys.map((i) => i.secretKey);
        const publicKey = keys.map((i) => i.publicKey);
        return { secretKey, publicKey };
    }
    return {
        info: { lengths: { seed: realSeedLen, publicKey: pkCoder.bytesLen, secretKey: realSeedLen } },
        getPublicKey(secretKey) {
            return this.keygen(secretKey).publicKey;
        },
        keygen(seed = randomBytes(realSeedLen)) {
            const { publicKey: pk, secretKey } = expandDecapsulationKey(seed);
            const publicKey = pkCoder.encode(pk);
            cleanBytes(pk);
            cleanBytes(secretKey);
            return { secretKey: seed, publicKey };
        },
        expandDecapsulationKey,
        realSeedLen,
    };
}
// This generic function that combines multiple KEMs into single one
function combineKEMS(realSeedLen, // how much bytes expandSeed expects
realMsgLen, // how much bytes combiner returns
expandSeed, combiner, ...kems) {
    const keys = combineKeys(realSeedLen, expandSeed, ...kems);
    const ctCoder = splitLengths(kems, 'cipherText');
    const pkCoder = splitLengths(kems, 'publicKey');
    const msgCoder = splitLengths(kems, 'msg');
    anumber$2(realMsgLen);
    return {
        lengths: {
            ...keys.info.lengths,
            msg: realMsgLen,
            msgRand: msgCoder.bytesLen,
            cipherText: ctCoder.bytesLen,
        },
        getPublicKey: keys.getPublicKey,
        keygen: keys.keygen,
        encapsulate(pk, randomness = randomBytes(msgCoder.bytesLen)) {
            const pks = pkCoder.decode(pk);
            const rand = msgCoder.decode(randomness);
            const enc = kems.map((i, j) => i.encapsulate(pks[j], rand[j]));
            const sharedSecret = enc.map((i) => i.sharedSecret);
            const cipherText = enc.map((i) => i.cipherText);
            const res = {
                sharedSecret: combiner(pks, cipherText, sharedSecret),
                cipherText: ctCoder.encode(cipherText),
            };
            cleanBytes(sharedSecret, cipherText);
            return res;
        },
        decapsulate(ct, seed) {
            const cts = ctCoder.decode(ct);
            const { publicKey, secretKey } = keys.expandDecapsulationKey(seed);
            const sharedSecret = kems.map((i, j) => i.decapsulate(cts[j], secretKey[j]));
            return combiner(publicKey, cts, sharedSecret);
        },
    };
}
function QSF(label, pqc, curveKEM, xof, kdf) {
    ahash(xof);
    ahash(kdf);
    return combineKEMS(32, 32, expandSeedXof(xof), (pk, ct, ss) => kdf(concatBytes(ss[0], ss[1], ct[1], pk[1], asciiToBytes(label))), pqc, curveKEM);
}
QSF('QSF-KEM(ML-KEM-768,P-256)-XOF(SHAKE256)-KDF(SHA3-256)', ml_kem768, ecdhKem(p256, true), shake256, sha3_256);
QSF('QSF-KEM(ML-KEM-1024,P-384)-XOF(SHAKE256)-KDF(SHA3-256)', ml_kem1024, ecdhKem(p384, true), shake256, sha3_256);
function createKitchenSink(label, pqc, curveKEM, xof, hash) {
    ahash(xof);
    ahash(hash);
    return combineKEMS(32, 32, expandSeedXof(xof), (pk, ct, ss) => {
        const preimage = concatBytes(ss[0], ss[1], ct[0], pk[0], ct[1], pk[1], asciiToBytes(label));
        const len = 32;
        const ikm = concatBytes(asciiToBytes('hybrid_prk'), preimage);
        const prk = extract(hash, ikm);
        const info = concatBytes(numberToBytesBE(len, 2), asciiToBytes('shared_secret'), asciiToBytes(''));
        const res = expand(hash, prk, info, len);
        cleanBytes(prk, info, ikm, preimage);
        return res;
    }, pqc, curveKEM);
}
const x25519kem = ecdhKem(x25519);
createKitchenSink('KitchenSink-KEM(ML-KEM-768,X25519)-XOF(SHAKE256)-KDF(HKDF-SHA-256)', ml_kem768, x25519kem, shake256, sha256);
// Always X25519 and ML-KEM - 768, no point to export
const ml_kem768_x25519 = /* @__PURE__ */ (() => combineKEMS(32, 32, expandSeedXof(shake256), 
// Awesome label, so much escaping hell in a single line.
(pk, ct, ss) => sha3_256(concatBytes(ss[0], ss[1], ct[1], pk[1], asciiToBytes('\\.//^\\'))), ml_kem768, x25519kem))();
function nistCurveKem(curve, scalarLen, elemLen, nseed) {
    const Fn = curve.Point.Fn;
    if (!Fn)
        throw new Error('no Point.Fn');
    function rejectionSampling(seed) {
        let sk;
        for (let start = 0, end = scalarLen;; start = end, end += scalarLen) {
            if (end > seed.length)
                throw new Error('rejection sampling failed');
            sk = Fn.fromBytes(seed.subarray(start, end), true);
            if (Fn.isValidNot0(sk))
                break;
        }
        const secretKey = Fn.toBytes(Fn.create(sk));
        const publicKey = curve.getPublicKey(secretKey, false);
        return { secretKey, publicKey };
    }
    return {
        lengths: {
            secretKey: scalarLen,
            publicKey: elemLen,
            seed: nseed,
            msg: nseed,
            cipherText: elemLen,
        },
        keygen(seed = randomBytes(nseed)) {
            abytes$2(seed, nseed, 'seed');
            return rejectionSampling(seed);
        },
        getPublicKey(secretKey) {
            return curve.getPublicKey(secretKey, false);
        },
        encapsulate(publicKey, rand = randomBytes(nseed)) {
            abytes$2(rand, nseed, 'rand');
            const { secretKey: ek } = rejectionSampling(rand);
            const sharedSecret = this.decapsulate(publicKey, ek);
            const cipherText = curve.getPublicKey(ek, false);
            cleanBytes(ek);
            return { sharedSecret, cipherText };
        },
        decapsulate(cipherText, secretKey) {
            const full = curve.getSharedSecret(secretKey, cipherText);
            return full.subarray(1);
        },
    };
}
function concreteHybridKem(label, mlkem, curve, nseed) {
    const { secretKey: scalarLen, publicKeyUncompressed: elemLen } = curve.lengths;
    if (!scalarLen || !elemLen)
        throw new Error('wrong curve');
    const curveKem = nistCurveKem(curve, scalarLen, elemLen, nseed);
    const mlkemSeedLen = 64;
    const totalSeedLen = mlkemSeedLen + nseed;
    return combineKEMS(32, 32, (seed) => {
        abytes$2(seed, 32);
        const expanded = shake256(seed, { dkLen: totalSeedLen });
        const mlkemSeed = expanded.subarray(0, mlkemSeedLen);
        const curveSeed = expanded.subarray(mlkemSeedLen, totalSeedLen);
        return concatBytes(mlkemSeed, curveSeed);
    }, (pk, ct, ss) => sha3_256(concatBytes(ss[0], ss[1], ct[1], pk[1], asciiToBytes(label))), mlkem, curveKem);
}
const ml_kem768_p256 = /* @__PURE__ */ (() => concreteHybridKem('MLKEM768-P256', ml_kem768, p256, 128))();
const MLKEM768X25519 = ml_kem768_x25519;
const MLKEM768P256 = ml_kem768_p256;

const exportable = false;
async function webCryptoFallback(func, fallback) {
    // We can't reliably detect X25519 support in WebCrypto in a performant way
    // because Bun implemented importKey, but not deriveBits.
    // https://github.com/oven-sh/bun/issues/20148
    try {
        return await func();
    }
    catch (error) {
        if (error instanceof ReferenceError ||
            error instanceof DOMException && error.name === "NotSupportedError") {
            return await fallback();
        }
        else {
            throw error;
        }
    }
}
async function scalarMult(scalar, u) {
    return await webCryptoFallback(async () => {
        const key = isCryptoKey$2(scalar) ? scalar : await importX25519Key(scalar);
        const peer = await crypto.subtle.importKey("raw", domBuffer$1(u), { name: "X25519" }, exportable, []);
        // 256 bits is the fixed size of a X25519 shared secret. It's kind of
        // worrying that the WebCrypto API encourages truncating it.
        return new Uint8Array(await crypto.subtle.deriveBits({ name: "X25519", public: peer }, key, 256));
    }, () => {
        if (isCryptoKey$2(scalar)) {
            throw new Error("CryptoKey provided but X25519 WebCrypto is not supported");
        }
        return x25519.scalarMult(scalar, u);
    });
}
async function scalarMultBase(scalar) {
    return await webCryptoFallback(async () => {
        // The WebCrypto API simply doesn't support deriving public keys from
        // private keys. importKey returns only a CryptoKey (unlike generateKey
        // which returns a CryptoKeyPair) despite deriving the public key internally
        // (judging from the banchmarks, at least on Node.js). Our options are
        // exporting as JWK, deleting jwk.d, and re-importing (which only works for
        // exportable keys), or (re-)doing a scalar multiplication by the basepoint
        // manually. Here we do the latter.
        return scalarMult(scalar, x25519.GuBytes);
    }, () => {
        if (isCryptoKey$2(scalar)) {
            throw new Error("CryptoKey provided but X25519 WebCrypto is not supported");
        }
        return x25519.scalarMultBase(scalar);
    });
}
const pkcs8Prefix = /* @__PURE__ */ new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20
]);
async function importX25519Key(key) {
    // For some reason, the WebCrypto API only supports importing X25519 private
    // keys as PKCS #8 or JWK (even if it supports importing public keys as raw).
    // Thankfully since they are always the same length, we can just prepend a
    // fixed ASN.1 prefix for PKCS #8.
    if (key.length !== 32) {
        throw new Error("X25519 private key must be 32 bytes");
    }
    const pkcs8 = new Uint8Array([...pkcs8Prefix, ...key]);
    // Annoyingly, importKey (at least on Node.js) computes the public key, which
    // is a waste if we're only going to run deriveBits.
    return crypto.subtle.importKey("pkcs8", pkcs8, { name: "X25519" }, exportable, ["deriveBits"]);
}
function isCryptoKey$2(key) {
    return typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
}
// TypeScript 5.9+ made Uint8Array generic, defaulting to Uint8Array<ArrayBufferLike>.
// DOM APIs like crypto.subtle require Uint8Array<ArrayBuffer> (no SharedArrayBuffer).
// This helper narrows the type while still catching non-Uint8Array arguments.
function domBuffer$1(arr) {
    return arr;
}

class LineReader {
    s;
    transcript = [];
    buf = new Uint8Array(0);
    constructor(stream) {
        this.s = stream.getReader();
    }
    async readLine() {
        const line = [];
        while (true) {
            const i = this.buf.indexOf("\n".charCodeAt(0));
            if (i >= 0) {
                line.push(this.buf.subarray(0, i));
                this.transcript.push(this.buf.subarray(0, i + 1));
                this.buf = this.buf.subarray(i + 1);
                return asciiString(flatten(line));
            }
            if (this.buf.length > 0) {
                line.push(this.buf);
                this.transcript.push(this.buf);
            }
            const next = await this.s.read();
            if (next.done) {
                this.buf = flatten(line);
                return null;
            }
            this.buf = next.value;
        }
    }
    close() {
        this.s.releaseLock();
        return { rest: this.buf, transcript: flatten(this.transcript) };
    }
}
function asciiString(bytes) {
    bytes.forEach((b) => {
        if (b < 32 || b > 126) {
            throw Error("invalid non-ASCII byte in header");
        }
    });
    return new TextDecoder().decode(bytes);
}
function flatten(arr) {
    const len = arr.reduce(((sum, line) => sum + line.length), 0);
    const out = new Uint8Array(len);
    let n = 0;
    for (const a of arr) {
        out.set(a, n);
        n += a.length;
    }
    return out;
}
function prepend(s, ...prefixes) {
    return s.pipeThrough(new TransformStream({
        start(controller) {
            for (const p of prefixes) {
                controller.enqueue(p);
            }
        }
    }));
}
function stream(a) {
    // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/from_static
    return new ReadableStream({
        start(controller) {
            controller.enqueue(a);
            controller.close();
        }
    });
}
async function readAll(stream) {
    if (!(stream instanceof ReadableStream)) {
        throw new Error("readAll expects a ReadableStream<Uint8Array>");
    }
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readAllString(stream) {
    if (!(stream instanceof ReadableStream)) {
        throw new Error("readAllString expects a ReadableStream<Uint8Array>");
    }
    return await new Response(stream).text();
}
async function read(stream, n) {
    const reader = stream.getReader();
    const chunks = [];
    let readBytes = 0;
    while (readBytes < n) {
        const { done, value } = await reader.read();
        if (done) {
            throw Error("stream ended before reading " + n.toString() + " bytes");
        }
        chunks.push(value);
        readBytes += value.length;
    }
    reader.releaseLock();
    const buf = flatten(chunks);
    const data = buf.subarray(0, n);
    const rest = prepend(stream, buf.subarray(n));
    return { data, rest };
}

/**
 * A stanza is a section of an age header. This is part of the low-level
 * {@link Recipient} and {@link Identity} APIs.
 */
class Stanza {
    /**
     * All space-separated arguments on the first line of the stanza.
     * Each argument is a string that does not contain spaces.
     * The first argument is often a recipient type, which should look like
     * `example.com/...` to avoid collisions.
     */
    args;
    /**
     * The raw body of the stanza. This is automatically base64-encoded and
     * split into lines of 48 characters each.
     */
    body;
    constructor(args, body) {
        this.args = args;
        this.body = body;
    }
}
async function parseNextStanza(hdr) {
    const argsLine = await hdr.readLine();
    if (argsLine === null) {
        throw Error("invalid stanza");
    }
    const args = argsLine.split(" ");
    if (args.length < 2 || args.shift() !== "->") {
        return { next: argsLine };
    }
    for (const arg of args) {
        if (arg.length === 0) {
            throw Error("invalid stanza");
        }
    }
    const bodyLines = [];
    for (;;) {
        const nextLine = await hdr.readLine();
        if (nextLine === null) {
            throw Error("invalid stanza");
        }
        const line = base64nopad.decode(nextLine);
        if (line.length > 48) {
            throw Error("invalid stanza");
        }
        bodyLines.push(line);
        if (line.length < 48) {
            break;
        }
    }
    const body = flatten(bodyLines);
    return { s: new Stanza(args, body) };
}
async function parseHeader(header) {
    const hdr = new LineReader(header);
    const versionLine = await hdr.readLine();
    if (versionLine !== "age-encryption.org/v1") {
        throw Error("invalid version " + (versionLine ?? "line"));
    }
    const stanzas = [];
    for (;;) {
        const { s, next: macLine } = await parseNextStanza(hdr);
        if (s !== undefined) {
            stanzas.push(s);
            continue;
        }
        if (!macLine.startsWith("--- ")) {
            throw Error("invalid header");
        }
        const MAC = base64nopad.decode(macLine.slice(4));
        const { rest, transcript } = hdr.close();
        const headerNoMAC = transcript.slice(0, transcript.length - 1 - macLine.length + 3);
        return { stanzas, headerNoMAC, MAC, headerSize: transcript.length, rest: prepend(header, rest) };
    }
}
function encodeHeaderNoMAC(recipients) {
    const lines = [];
    lines.push("age-encryption.org/v1\n");
    for (const s of recipients) {
        lines.push("-> " + s.args.join(" ") + "\n");
        for (let i = 0; i < s.body.length; i += 48) {
            let end = i + 48;
            if (end > s.body.length)
                end = s.body.length;
            lines.push(base64nopad.encode(s.body.subarray(i, end)) + "\n");
        }
        if (s.body.length % 48 === 0)
            lines.push("\n");
    }
    lines.push("---");
    return new TextEncoder().encode(lines.join(""));
}
function encodeHeader(recipients, MAC) {
    return flatten([
        encodeHeaderNoMAC(recipients),
        new TextEncoder().encode(" " + base64nopad.encode(MAC) + "\n")
    ]);
}

/**
 * Generate a new native age identity.
 *
 * Currently, this returns an X25519 identity. In the future, this may return a
 * post-quantum hybrid identity like {@link generateHybridIdentity}. To
 * explicitly generate an X25519 identity, use {@link generateX25519Identity}.
 *
 * @returns A promise that resolves to the new identity, a string starting with
 * `AGE-SECRET-KEY-1...`. Use {@link identityToRecipient} to produce the
 * corresponding recipient.
 */
function generateIdentity() {
    return generateX25519Identity();
}
/**
 * Generate a new X25519 native age identity.
 *
 * @returns A promise that resolves to the new identity, a string starting with
 * `AGE-SECRET-KEY-1...`. Use {@link identityToRecipient} to produce the
 * corresponding recipient.
 */
function generateX25519Identity() {
    const scalar = randomBytes$1(32);
    const identity = bech32.encodeFromBytes("AGE-SECRET-KEY-", scalar).toUpperCase();
    return Promise.resolve(identity);
}
/**
 * Generate a new post-quantum hybrid native age identity.
 *
 * @returns A promise that resolves to the new identity, a string starting with
 * `AGE-SECRET-KEY-PQ-1...`. Use {@link identityToRecipient} to produce the
 * corresponding recipient.
 */
function generateHybridIdentity() {
    const scalar = randomBytes$1(32);
    const identity = bech32.encodeFromBytes("AGE-SECRET-KEY-PQ-", scalar).toUpperCase();
    return Promise.resolve(identity);
}
/**
 * Convert an age identity to a recipient.
 *
 * @param identity - An age identity, a string starting with
 * `AGE-SECRET-KEY-PQ-1...` or `AGE-SECRET-KEY-1...` or an X25519 private
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey | CryptoKey}
 * object.
 *
 * @returns A promise that resolves to the corresponding recipient, a string
 * starting with `age1...`.
 *
 * @see {@link generateIdentity}
 * @see {@link Decrypter.addIdentity}
 */
async function identityToRecipient(identity) {
    let scalar;
    if (isCryptoKey$1(identity)) {
        scalar = identity;
    }
    else if (identity.startsWith("AGE-SECRET-KEY-PQ-1")) {
        const res = bech32.decodeToBytes(identity);
        if (res.prefix.toUpperCase() !== "AGE-SECRET-KEY-PQ-" ||
            res.bytes.length !== 32) {
            throw Error("invalid identity");
        }
        const recipient = MLKEM768X25519.getPublicKey(res.bytes);
        // Use encode directly to disable the 90 character bech32 limit.
        return bech32.encode("age1pq", bech32.toWords(recipient), false);
    }
    else {
        const res = bech32.decodeToBytes(identity);
        if (!identity.startsWith("AGE-SECRET-KEY-1") ||
            res.prefix.toUpperCase() !== "AGE-SECRET-KEY-" ||
            res.bytes.length !== 32) {
            throw Error("invalid identity");
        }
        scalar = res.bytes;
    }
    const recipient = await scalarMultBase(scalar);
    return bech32.encodeFromBytes("age", recipient);
}
class HybridRecipient {
    recipient;
    constructor(s) {
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("age1pq1") ||
            res.prefix.toLowerCase() !== "age1pq" ||
            res.bytes.length !== 1216) {
            throw Error("invalid recipient");
        }
        this.recipient = res.bytes;
    }
    wrapFileKey(fileKey) {
        const { cipherText: encapsulatedKey, sharedSecret } = MLKEM768X25519.encapsulate(this.recipient);
        const label = new TextEncoder().encode("age-encryption.org/mlkem768x25519");
        const { key, nonce } = hpkeContext(hpkeMLKEM768X25519, sharedSecret, label);
        const ciphertext = chacha20poly1305(key, nonce).encrypt(fileKey);
        return [new Stanza(["mlkem768x25519", base64nopad.encode(encapsulatedKey)], ciphertext)];
    }
}
class HybridIdentity {
    identity;
    constructor(s) {
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("AGE-SECRET-KEY-PQ-1") ||
            res.prefix.toUpperCase() !== "AGE-SECRET-KEY-PQ-" ||
            res.bytes.length !== 32) {
            throw Error("invalid identity");
        }
        this.identity = res.bytes;
    }
    unwrapFileKey(stanzas) {
        for (const s of stanzas) {
            if (s.args.length < 1 || s.args[0] !== "mlkem768x25519") {
                continue;
            }
            if (s.args.length !== 2) {
                throw Error("invalid mlkem768x25519 stanza");
            }
            const share = base64nopad.decode(s.args[1]);
            if (share.length !== 1120) {
                throw Error("invalid mlkem768x25519 stanza");
            }
            if (s.body.length !== 32) {
                throw Error("invalid mlkem768x25519 stanza");
            }
            const sharedSecret = MLKEM768X25519.decapsulate(share, this.identity);
            const label = new TextEncoder().encode("age-encryption.org/mlkem768x25519");
            const { key, nonce } = hpkeContext(hpkeMLKEM768X25519, sharedSecret, label);
            try {
                return chacha20poly1305(key, nonce).decrypt(s.body);
            }
            catch {
                continue;
            }
        }
        return null;
    }
}
const hpkeMLKEM768X25519 = 0x647a;
const hpkeMLKEM768P256 = 0x0050;
const hpkeDHKEMP256 = 0x0010;
function hpkeContext(kemID, sharedSecret, info) {
    const suiteID = hpkeSuiteID(kemID);
    const pskIDHash = hpkeLabeledExtract(suiteID, undefined, "psk_id_hash", new Uint8Array(0));
    const infoHash = hpkeLabeledExtract(suiteID, undefined, "info_hash", info);
    const ksContext = new Uint8Array(1 + pskIDHash.length + infoHash.length);
    ksContext[0] = 0x00; // mode_base
    ksContext.set(pskIDHash, 1);
    ksContext.set(infoHash, 1 + pskIDHash.length);
    const secret = hpkeLabeledExtract(suiteID, sharedSecret, "secret", new Uint8Array(0));
    const key = hpkeLabeledExpand(suiteID, secret, "key", ksContext, 32);
    const nonce = hpkeLabeledExpand(suiteID, secret, "base_nonce", ksContext, 12);
    return { key, nonce };
}
function hpkeSuiteID(kemID) {
    const suiteID = new Uint8Array(10);
    suiteID.set(new TextEncoder().encode("HPKE"), 0);
    suiteID[4] = (kemID >> 8) & 0xff;
    suiteID[5] = kemID & 0xff;
    // KDF ID for HKDF-SHA256 is 0x0001
    suiteID[6] = 0x00;
    suiteID[7] = 0x01;
    // AEAD ID for ChaCha20Poly1305 is 0x0003
    suiteID[8] = 0x00;
    suiteID[9] = 0x03;
    return suiteID;
}
function hpkeLabeledExtract(suiteID, salt, label, ikm) {
    const labeledIKM = new Uint8Array(7 + suiteID.length + label.length + ikm.length);
    let offset = 0;
    labeledIKM.set(new TextEncoder().encode("HPKE-v1"), offset);
    offset += "HPKE-v1".length;
    labeledIKM.set(suiteID, offset);
    offset += suiteID.length;
    labeledIKM.set(new TextEncoder().encode(label), offset);
    offset += label.length;
    labeledIKM.set(ikm, offset);
    return extract(sha256, labeledIKM, salt);
}
function hpkeLabeledExpand(suiteID, prk, label, info, length) {
    const labeledInfo = new Uint8Array(2 + 7 + suiteID.length + label.length + info.length);
    let offset = 0;
    labeledInfo[offset] = (length >> 8) & 0xff;
    labeledInfo[offset + 1] = length & 0xff;
    offset += 2;
    labeledInfo.set(new TextEncoder().encode("HPKE-v1"), offset);
    offset += "HPKE-v1".length;
    labeledInfo.set(suiteID, offset);
    offset += suiteID.length;
    labeledInfo.set(new TextEncoder().encode(label), offset);
    offset += label.length;
    labeledInfo.set(info, offset);
    return expand(sha256, prk, labeledInfo, length);
}
function hpkeDHKEMP256Encapsulate(recipient) {
    if (recipient.length !== p256.lengths.publicKeyUncompressed) {
        recipient = p256.Point.fromBytes(recipient).toBytes(false);
    }
    const ephemeral = p256.utils.randomSecretKey();
    const encapsulatedKey = p256.getPublicKey(ephemeral, false);
    const ss = p256.getSharedSecret(ephemeral, recipient, true).subarray(1);
    const kemContext = new Uint8Array(encapsulatedKey.length + recipient.length);
    kemContext.set(encapsulatedKey, 0);
    kemContext.set(recipient, encapsulatedKey.length);
    const suiteID = new Uint8Array(5);
    suiteID.set(new TextEncoder().encode("KEM"), 0);
    suiteID[3] = hpkeDHKEMP256 >> 8;
    suiteID[4] = hpkeDHKEMP256 & 0xff;
    const eaePRK = hpkeLabeledExtract(suiteID, undefined, "eae_prk", ss);
    const sharedSecret = hpkeLabeledExpand(suiteID, eaePRK, "shared_secret", kemContext, 32);
    return { encapsulatedKey, sharedSecret };
}
class TagRecipient {
    recipient;
    constructor(s) {
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("age1tag1") ||
            res.prefix.toLowerCase() !== "age1tag" ||
            res.bytes.length !== 33) {
            throw Error("invalid recipient");
        }
        this.recipient = res.bytes;
    }
    wrapFileKey(fileKey) {
        const { encapsulatedKey, sharedSecret } = hpkeDHKEMP256Encapsulate(this.recipient);
        const label = new TextEncoder().encode("age-encryption.org/p256tag");
        const tag = (() => {
            const recipientHash = sha256(this.recipient).subarray(0, 4);
            const ikm = new Uint8Array(encapsulatedKey.length + recipientHash.length);
            ikm.set(encapsulatedKey, 0);
            ikm.set(recipientHash, encapsulatedKey.length);
            return extract(sha256, ikm, label).subarray(0, 4);
        })();
        const { key, nonce } = hpkeContext(hpkeDHKEMP256, sharedSecret, label);
        const ciphertext = chacha20poly1305(key, nonce).encrypt(fileKey);
        return [new Stanza(["p256tag", base64nopad.encode(tag), base64nopad.encode(encapsulatedKey)], ciphertext)];
    }
}
class HybridTagRecipient {
    recipient;
    constructor(s) {
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("age1tagpq1") ||
            res.prefix.toLowerCase() !== "age1tagpq" ||
            res.bytes.length !== 1249) {
            throw Error("invalid recipient");
        }
        this.recipient = res.bytes;
    }
    wrapFileKey(fileKey) {
        const { cipherText: encapsulatedKey, sharedSecret } = MLKEM768P256.encapsulate(this.recipient);
        const label = new TextEncoder().encode("age-encryption.org/mlkem768p256tag");
        const tag = (() => {
            const recipientHash = sha256(this.recipient.subarray(1184)).subarray(0, 4);
            const ikm = new Uint8Array(encapsulatedKey.length + recipientHash.length);
            ikm.set(encapsulatedKey, 0);
            ikm.set(recipientHash, encapsulatedKey.length);
            return extract(sha256, ikm, label).subarray(0, 4);
        })();
        const { key, nonce } = hpkeContext(hpkeMLKEM768P256, sharedSecret, label);
        const ciphertext = chacha20poly1305(key, nonce).encrypt(fileKey);
        return [new Stanza(["mlkem768p256tag", base64nopad.encode(tag), base64nopad.encode(encapsulatedKey)], ciphertext)];
    }
}
class X25519Recipient {
    recipient;
    constructor(s) {
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("age1") ||
            res.prefix.toLowerCase() !== "age" ||
            res.bytes.length !== 32) {
            throw Error("invalid recipient");
        }
        this.recipient = res.bytes;
    }
    async wrapFileKey(fileKey) {
        const ephemeral = randomBytes$1(32);
        const share = await scalarMultBase(ephemeral);
        const secret = await scalarMult(ephemeral, this.recipient);
        const salt = new Uint8Array(share.length + this.recipient.length);
        salt.set(share);
        salt.set(this.recipient, share.length);
        const label = new TextEncoder().encode("age-encryption.org/v1/X25519");
        const key = hkdf(sha256, secret, salt, label, 32);
        return [new Stanza(["X25519", base64nopad.encode(share)], encryptFileKey(fileKey, key))];
    }
}
class X25519Identity {
    identity;
    recipient;
    constructor(s) {
        if (isCryptoKey$1(s)) {
            this.identity = s;
            this.recipient = scalarMultBase(s);
            return;
        }
        const res = bech32.decodeToBytes(s);
        if (!s.startsWith("AGE-SECRET-KEY-1") ||
            res.prefix.toUpperCase() !== "AGE-SECRET-KEY-" ||
            res.bytes.length !== 32) {
            throw Error("invalid identity");
        }
        this.identity = res.bytes;
        this.recipient = scalarMultBase(res.bytes);
    }
    async unwrapFileKey(stanzas) {
        for (const s of stanzas) {
            if (s.args.length < 1 || s.args[0] !== "X25519") {
                continue;
            }
            if (s.args.length !== 2) {
                throw Error("invalid X25519 stanza");
            }
            const share = base64nopad.decode(s.args[1]);
            if (share.length !== 32) {
                throw Error("invalid X25519 stanza");
            }
            const secret = await scalarMult(this.identity, share);
            const recipient = await this.recipient;
            const salt = new Uint8Array(share.length + recipient.length);
            salt.set(share);
            salt.set(recipient, share.length);
            const label = new TextEncoder().encode("age-encryption.org/v1/X25519");
            const key = hkdf(sha256, secret, salt, label, 32);
            const fileKey = decryptFileKey(s.body, key);
            if (fileKey !== null)
                return fileKey;
        }
        return null;
    }
}
class ScryptRecipient {
    passphrase;
    logN;
    constructor(passphrase, logN) {
        this.passphrase = passphrase;
        this.logN = logN;
    }
    wrapFileKey(fileKey) {
        const salt = randomBytes$1(16);
        const label = "age-encryption.org/v1/scrypt";
        const labelAndSalt = new Uint8Array(label.length + 16);
        labelAndSalt.set(new TextEncoder().encode(label));
        labelAndSalt.set(salt, label.length);
        const key = scrypt(this.passphrase, labelAndSalt, { N: 2 ** this.logN, r: 8, p: 1, dkLen: 32 });
        return [new Stanza(["scrypt", base64nopad.encode(salt), this.logN.toString()], encryptFileKey(fileKey, key))];
    }
}
class ScryptIdentity {
    passphrase;
    constructor(passphrase) {
        this.passphrase = passphrase;
    }
    unwrapFileKey(stanzas) {
        for (const s of stanzas) {
            if (s.args.length < 1 || s.args[0] !== "scrypt") {
                continue;
            }
            if (stanzas.length !== 1) {
                throw Error("scrypt recipient is not the only one in the header");
            }
            if (s.args.length !== 3) {
                throw Error("invalid scrypt stanza");
            }
            if (!/^[1-9][0-9]*$/.test(s.args[2])) {
                throw Error("invalid scrypt stanza");
            }
            const salt = base64nopad.decode(s.args[1]);
            if (salt.length !== 16) {
                throw Error("invalid scrypt stanza");
            }
            const logN = Number(s.args[2]);
            if (logN > 20) {
                throw Error("scrypt work factor is too high");
            }
            const label = "age-encryption.org/v1/scrypt";
            const labelAndSalt = new Uint8Array(label.length + 16);
            labelAndSalt.set(new TextEncoder().encode(label));
            labelAndSalt.set(salt, label.length);
            const key = scrypt(this.passphrase, labelAndSalt, { N: 2 ** logN, r: 8, p: 1, dkLen: 32 });
            const fileKey = decryptFileKey(s.body, key);
            if (fileKey !== null)
                return fileKey;
        }
        return null;
    }
}
function encryptFileKey(fileKey, key) {
    const nonce = new Uint8Array(12);
    return chacha20poly1305(key, nonce).encrypt(fileKey);
}
function decryptFileKey(body, key) {
    if (body.length !== 32) {
        throw Error("invalid stanza");
    }
    const nonce = new Uint8Array(12);
    try {
        return chacha20poly1305(key, nonce).decrypt(body);
    }
    catch {
        return null;
    }
}
function isCryptoKey$1(key) {
    return typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
}

const chacha20poly1305Overhead = 16;
const chunkSize = /* @__PURE__ */ (() => 64 * 1024)();
const chunkSizeWithOverhead = /* @__PURE__ */ (() => chunkSize + chacha20poly1305Overhead)();
function decryptSTREAM(key) {
    const streamNonce = new Uint8Array(12);
    const incNonce = () => {
        for (let i = streamNonce.length - 2; i >= 0; i--) {
            streamNonce[i]++;
            if (streamNonce[i] !== 0)
                break;
        }
    };
    let firstChunk = true;
    const ciphertextBuffer = new Uint8Array(chunkSizeWithOverhead);
    let ciphertextBufferUsed = 0;
    return new TransformStream({
        transform(chunk, controller) {
            while (chunk.length > 0) {
                if (ciphertextBufferUsed === ciphertextBuffer.length) {
                    const decryptedChunk = chacha20poly1305(key, streamNonce)
                        .decrypt(ciphertextBuffer);
                    controller.enqueue(decryptedChunk);
                    incNonce();
                    ciphertextBufferUsed = 0;
                    firstChunk = false;
                }
                const n = Math.min(ciphertextBuffer.length - ciphertextBufferUsed, chunk.length);
                ciphertextBuffer.set(chunk.subarray(0, n), ciphertextBufferUsed);
                ciphertextBufferUsed += n;
                chunk = chunk.subarray(n);
            }
        },
        flush(controller) {
            streamNonce[11] = 1; // Last chunk flag.
            const decryptedChunk = chacha20poly1305(key, streamNonce)
                .decrypt(ciphertextBuffer.subarray(0, ciphertextBufferUsed));
            if (!firstChunk && decryptedChunk.length === 0) {
                // The final chunk can only be empty if it's the first one.
                throw new Error("final chunk is empty");
            }
            controller.enqueue(decryptedChunk);
        },
    });
}
function plaintextSize(ciphertextSize) {
    if (ciphertextSize < chacha20poly1305Overhead) {
        throw Error("ciphertext is too small");
    }
    if (ciphertextSize === chacha20poly1305Overhead) {
        return 0; // Empty plaintext.
    }
    const fullChunks = Math.floor(ciphertextSize / chunkSizeWithOverhead);
    const lastChunk = ciphertextSize % chunkSizeWithOverhead;
    if (0 < lastChunk && lastChunk <= chacha20poly1305Overhead) {
        throw Error("ciphertext size is invalid");
    }
    let size = ciphertextSize;
    size -= fullChunks * chacha20poly1305Overhead;
    size -= lastChunk > 0 ? chacha20poly1305Overhead : 0;
    return size;
}
function encryptSTREAM(key) {
    const streamNonce = new Uint8Array(12);
    const incNonce = () => {
        for (let i = streamNonce.length - 2; i >= 0; i--) {
            streamNonce[i]++;
            if (streamNonce[i] !== 0)
                break;
        }
    };
    const plaintextBuffer = new Uint8Array(chunkSize);
    let plaintextBufferUsed = 0;
    return new TransformStream({
        transform(chunk, controller) {
            while (chunk.length > 0) {
                if (plaintextBufferUsed === plaintextBuffer.length) {
                    const encryptedChunk = chacha20poly1305(key, streamNonce)
                        .encrypt(plaintextBuffer);
                    controller.enqueue(encryptedChunk);
                    incNonce();
                    plaintextBufferUsed = 0;
                }
                const n = Math.min(plaintextBuffer.length - plaintextBufferUsed, chunk.length);
                plaintextBuffer.set(chunk.subarray(0, n), plaintextBufferUsed);
                plaintextBufferUsed += n;
                chunk = chunk.subarray(n);
            }
        },
        flush(controller) {
            streamNonce[11] = 1; // Last chunk flag.
            const encryptedChunk = chacha20poly1305(key, streamNonce)
                .encrypt(plaintextBuffer.subarray(0, plaintextBufferUsed));
            controller.enqueue(encryptedChunk);
        },
    });
}
function ciphertextSize(plaintextSize) {
    const chunks = Math.max(1, Math.ceil(plaintextSize / chunkSize));
    return plaintextSize + chacha20poly1305Overhead * chunks;
}

/**
 * Encode an age encrypted file using the ASCII armor format, a strict subset of
 * PEM that starts with `-----BEGIN AGE ENCRYPTED FILE-----`.
 *
 * @param file - The raw encrypted file (returned by {@link Encrypter.encrypt}).
 *
 * @returns The ASCII armored file, with a final newline.
 */
function encode(file) {
    const lines = [];
    lines.push("-----BEGIN AGE ENCRYPTED FILE-----\n");
    for (let i = 0; i < file.length; i += 48) {
        let end = i + 48;
        if (end > file.length)
            end = file.length;
        lines.push(base64.encode(file.subarray(i, end)) + "\n");
    }
    lines.push("-----END AGE ENCRYPTED FILE-----\n");
    return lines.join("");
}
/**
 * Decode an age encrypted file from the ASCII armor format, a strict subset of
 * PEM that starts with `-----BEGIN AGE ENCRYPTED FILE-----`.
 *
 * Extra whitespace before and after the file is ignored, and newlines can be
 * CRLF or LF, but otherwise the format is parsed strictly.
 *
 * @param file - The ASCII armored file.
 *
 * @returns The raw encrypted file (to be passed to {@link Decrypter.decrypt}).
 */
function decode(file) {
    const lines = file.trim().replaceAll("\r\n", "\n").split("\n");
    if (lines.shift() !== "-----BEGIN AGE ENCRYPTED FILE-----") {
        throw Error("invalid header");
    }
    if (lines.pop() !== "-----END AGE ENCRYPTED FILE-----") {
        throw Error("invalid footer");
    }
    function isLineLengthValid(i, l) {
        if (i === lines.length - 1) {
            return l.length > 0 && l.length <= 64 && l.length % 4 === 0;
        }
        return l.length === 64;
    }
    if (!lines.every((l, i) => isLineLengthValid(i, l))) {
        throw Error("invalid line length");
    }
    if (!lines.every((l) => /^[A-Za-z0-9+/=]+$/.test(l))) {
        throw Error("invalid base64");
    }
    return base64.decode(lines.join(""));
}

var armor = /*#__PURE__*/Object.freeze({
    __proto__: null,
    decode: decode,
    encode: encode
});

// This file implements a tiny subset of CTAP2's subset of CBOR, in order to
// encode and decode WebAuthn identities.
//
// Only major types 0 (unsigned integer), 2 (byte strings), 3 (text strings),
// and 4 (arrays, only containing text strings) are supported. Arguments are
// limited to 16-bit values.
//
// See https://www.imperialviolet.org/tourofwebauthn/tourofwebauthn.html#cbor.
function readTypeAndArgument(b) {
    if (b.length === 0) {
        throw Error("cbor: unexpected EOF");
    }
    const major = b[0] >> 5;
    const minor = b[0] & 0x1f;
    if (minor <= 23) {
        return [major, minor, b.subarray(1)];
    }
    if (minor === 24) {
        if (b.length < 2) {
            throw Error("cbor: unexpected EOF");
        }
        return [major, b[1], b.subarray(2)];
    }
    if (minor === 25) {
        if (b.length < 3) {
            throw Error("cbor: unexpected EOF");
        }
        return [major, (b[1] << 8) | b[2], b.subarray(3)];
    }
    throw Error("cbor: unsupported argument encoding");
}
function readUint(b) {
    const [major, minor, rest] = readTypeAndArgument(b);
    if (major !== 0) {
        throw Error("cbor: expected unsigned integer");
    }
    return [minor, rest];
}
function readByteString(b) {
    const [major, minor, rest] = readTypeAndArgument(b);
    if (major !== 2) {
        throw Error("cbor: expected byte string");
    }
    if (minor > rest.length) {
        throw Error("cbor: unexpected EOF");
    }
    return [rest.subarray(0, minor), rest.subarray(minor)];
}
function readTextString(b) {
    const [major, minor, rest] = readTypeAndArgument(b);
    if (major !== 3) {
        throw Error("cbor: expected text string");
    }
    if (minor > rest.length) {
        throw Error("cbor: unexpected EOF");
    }
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    return [decoder.decode(rest.subarray(0, minor)), rest.subarray(minor)];
}
function readArray(b) {
    const [major, minor, r] = readTypeAndArgument(b);
    if (major !== 4) {
        throw Error("cbor: expected array");
    }
    let rest = r;
    const args = [];
    for (let i = 0; i < minor; i++) {
        let arg;
        [arg, rest] = readTextString(rest);
        args.push(arg);
    }
    return [args, rest];
}
function encodeUint(n) {
    {
        return new Uint8Array([n]);
    }
}
function encodeByteString(b) {
    if (b.length <= 23) {
        return new Uint8Array([2 << 5 | b.length, ...b]);
    }
    if (b.length <= 0xff) {
        return new Uint8Array([2 << 5 | 24, b.length, ...b]);
    }
    if (b.length <= 0xffff) {
        return new Uint8Array([2 << 5 | 25, b.length >> 8, b.length & 0xff, ...b]);
    }
    throw Error("cbor: byte string too long");
}
function encodeTextString(s) {
    const b = new TextEncoder().encode(s);
    if (b.length <= 23) {
        return new Uint8Array([3 << 5 | b.length, ...b]);
    }
    if (b.length <= 0xff) {
        return new Uint8Array([3 << 5 | 24, b.length, ...b]);
    }
    if (b.length <= 0xffff) {
        return new Uint8Array([3 << 5 | 25, b.length >> 8, b.length & 0xff, ...b]);
    }
    throw Error("cbor: text string too long");
}
function encodeArray(args) {
    const body = args.flatMap(x => [...encodeTextString(x)]);
    if (args.length <= 23) {
        return new Uint8Array([4 << 5 | args.length, ...body]);
    }
    if (args.length <= 0xff) {
        return new Uint8Array([4 << 5 | 24, args.length, ...body]);
    }
    if (args.length <= 0xffff) {
        return new Uint8Array([4 << 5 | 25, args.length >> 8, args.length & 0xff, ...body]);
    }
    throw Error("cbor: array too long");
}

// We don't actually use the public key, so declare support for all default
// algorithms that might be supported by authenticators.
const defaultAlgorithms = [
    { type: "public-key", alg: -8 }, // Ed25519
    { type: "public-key", alg: -7 }, // ECDSA with P-256 and SHA-256
    { type: "public-key", alg: -257 }, // RSA PKCS#1 v1.5 with SHA-256
];
/**
 * Creates a new WebAuthn credential which can be used for encryption and
 * decryption.
 *
 * @returns The identity string to use for encryption or decryption.
 *
 * This string begins with `AGE-PLUGIN-FIDO2PRF-1...` and encodes the credential ID,
 * the relying party ID, and the transport hint.
 *
 * If the credential was created with {@link CreationOptions."type"} set to the
 * default `passkey`, this string is mostly a hint to make selecting the
 * credential easier. If the credential was created with `security-key`, this
 * string is required to encrypt and decrypt files, and can't be regenerated if
 * lost.
 *
 * @see {@link Options.identity}
 * @experimental
 */
async function createCredential(options) {
    const cred = await navigator.credentials.create({
        publicKey: {
            rp: { name: "", id: options.rpId },
            user: {
                name: options.keyName,
                id: domBuffer(randomBytes$1(8)), // avoid overwriting existing keys
                displayName: "",
            },
            pubKeyCredParams: defaultAlgorithms,
            authenticatorSelection: {
                requireResidentKey: options.type !== "security-key",
                residentKey: options.type !== "security-key" ? "required" : "discouraged",
                userVerification: "required", // prf requires UV
            },
            hints: options.type === "security-key" ? ["security-key"] : [],
            extensions: { prf: {} },
            challenge: new Uint8Array([0]).buffer, // unused without attestation
        },
    });
    if (!cred.getClientExtensionResults().prf?.enabled) {
        throw Error("PRF extension not available (need macOS 15+, Chrome 132+)");
    }
    // Annoyingly, it doesn't seem possible to get the RP ID from the
    // credential, so we have to hope we get the default right.
    const rpId = options.rpId ?? new URL(window.origin).hostname;
    return encodeIdentity(cred, rpId);
}
const prefix = "AGE-PLUGIN-FIDO2PRF-";
function encodeIdentity(credential, rpId) {
    const res = credential.response;
    const version = encodeUint(1);
    const credId = encodeByteString(new Uint8Array(credential.rawId));
    const rp = encodeTextString(rpId);
    const transports = encodeArray(res.getTransports());
    const identityData = new Uint8Array([...version, ...credId, ...rp, ...transports]);
    return bech32.encode(prefix, bech32.toWords(identityData), false).toUpperCase();
}
function decodeIdentity(identity) {
    const res = bech32.decodeToBytes(identity);
    if (!identity.startsWith(prefix + "1")) {
        throw Error("invalid identity");
    }
    const [version, rest1] = readUint(res.bytes);
    if (version !== 1) {
        throw Error("unsupported identity version");
    }
    const [credId, rest2] = readByteString(rest1);
    const [rpId, rest3] = readTextString(rest2);
    const [transports,] = readArray(rest3);
    return [credId, rpId, transports];
}
const label = "age-encryption.org/fido2prf";
class WebAuthnInternal {
    credId;
    transports;
    rpId;
    constructor(options) {
        if (options?.identity) {
            const [credId, rpId, transports] = decodeIdentity(options.identity);
            this.credId = credId;
            this.transports = transports;
            this.rpId = rpId;
        }
        else {
            this.rpId = options?.rpId;
        }
    }
    async getCredential(nonce) {
        const assertion = await navigator.credentials.get({
            publicKey: {
                allowCredentials: this.credId ? [{
                        id: domBuffer(this.credId),
                        transports: this.transports,
                        type: "public-key"
                    }] : [],
                challenge: domBuffer(randomBytes$1(16)),
                extensions: { prf: { eval: prfInputs(nonce) } },
                userVerification: "required", // prf requires UV
                rpId: this.rpId,
            },
        });
        const results = assertion.getClientExtensionResults().prf?.results;
        if (results === undefined) {
            throw Error("PRF extension not available (need macOS 15+, Chrome 132+)");
        }
        return results;
    }
}
/**
 * A {@link Recipient} that symmetrically encrypts file keys using a WebAuthn
 * credential, such as a passkey or a security key.
 *
 * The credential needs to already exist, and support the PRF extension.
 * Usually, it would have been created with {@link createCredential}.
 *
 * @see {@link Encrypter.addRecipient}
 * @experimental
 */
class WebAuthnRecipient extends WebAuthnInternal {
    /**
     * Implements {@link Recipient.wrapFileKey}.
     */
    async wrapFileKey(fileKey) {
        const nonce = randomBytes$1(16);
        const results = await this.getCredential(nonce);
        const key = deriveKey(results);
        return [new Stanza([label, base64nopad.encode(nonce)], encryptFileKey(fileKey, key))];
    }
}
/**
 * An {@link Identity} that symmetrically decrypts file keys using a WebAuthn
 * credential, such as a passkey or a security key.
 *
 * The credential needs to already exist, and support the PRF extension.
 * Usually, it would have been created with {@link createCredential}.
 *
 * @see {@link Decrypter.addIdentity}
 * @experimental
 */
class WebAuthnIdentity extends WebAuthnInternal {
    /**
     * Implements {@link Identity.unwrapFileKey}.
     */
    async unwrapFileKey(stanzas) {
        for (const s of stanzas) {
            if (s.args.length < 1 || s.args[0] !== label) {
                continue;
            }
            if (s.args.length !== 2) {
                throw Error("invalid prf stanza");
            }
            const nonce = base64nopad.decode(s.args[1]);
            if (nonce.length !== 16) {
                throw Error("invalid prf stanza");
            }
            const results = await this.getCredential(nonce);
            const key = deriveKey(results);
            const fileKey = decryptFileKey(s.body, key);
            if (fileKey !== null)
                return fileKey;
        }
        return null;
    }
}
// We use both first and second to prevent an attacker from decrypting two files
// at once with a single user presence check.
function prfInputs(nonce) {
    const prefix = new TextEncoder().encode(label);
    const first = new Uint8Array(prefix.length + nonce.length + 1);
    first.set(prefix, 0);
    first[prefix.length] = 0x01;
    first.set(nonce, prefix.length + 1);
    const second = new Uint8Array(prefix.length + nonce.length + 1);
    second.set(prefix, 0);
    second[prefix.length] = 0x02;
    second.set(nonce, prefix.length + 1);
    return { first, second };
}
function deriveKey(results) {
    if (results.second === undefined) {
        throw Error("Missing second PRF result");
    }
    const prf = new Uint8Array(results.first.byteLength + results.second.byteLength);
    prf.set(new Uint8Array(results.first), 0);
    prf.set(new Uint8Array(results.second), results.first.byteLength);
    return extract(sha256, prf, new TextEncoder().encode(label));
}
// TypeScript 5.9+ made Uint8Array generic, defaulting to Uint8Array<ArrayBufferLike>.
// DOM APIs like WebAuthn require Uint8Array<ArrayBuffer> (no SharedArrayBuffer).
// This helper narrows the type while still catching non-Uint8Array arguments.
function domBuffer(arr) {
    return arr;
}

var webauthn = /*#__PURE__*/Object.freeze({
    __proto__: null,
    WebAuthnIdentity: WebAuthnIdentity,
    WebAuthnRecipient: WebAuthnRecipient,
    createCredential: createCredential
});

/**
 * Encrypts a file using the given passphrase or recipients.
 *
 * First, call {@link Encrypter.setPassphrase} to set a passphrase for symmetric
 * encryption, or {@link Encrypter.addRecipient} to specify one or more
 * recipients. Then, call {@link Encrypter.encrypt} one or more times to encrypt
 * files using the configured passphrase or recipients.
 */
class Encrypter {
    passphrase = null;
    scryptWorkFactor = 18;
    recipients = [];
    /**
     * Set the passphrase to encrypt the file(s) with. This method can only be
     * called once, and can't be called if {@link Encrypter.addRecipient} has
     * been called.
     *
     * The passphrase is passed through the scrypt key derivation function, but
     * it needs to have enough entropy to resist offline brute-force attacks.
     * You should use at least 8-10 random alphanumeric characters, or 4-5
     * random words from a list of at least 2000 words.
     *
     * @param s - The passphrase to encrypt the file with.
     */
    setPassphrase(s) {
        if (this.passphrase !== null) {
            throw new Error("can encrypt to at most one passphrase");
        }
        if (this.recipients.length !== 0) {
            throw new Error("can't encrypt to both recipients and passphrases");
        }
        this.passphrase = s;
    }
    /**
     * Set the scrypt work factor to use when encrypting the file(s) with a
     * passphrase. The default is 18. Using a lower value will require stronger
     * passphrases to resist offline brute-force attacks.
     *
     * @param logN - The base-2 logarithm of the scrypt work factor.
     */
    setScryptWorkFactor(logN) {
        this.scryptWorkFactor = logN;
    }
    /**
     * Add a recipient to encrypt the file(s) for. This method can be called
     * multiple times to encrypt the file(s) for multiple recipients.
     *
     * This version supports native X25519 recipients (`age1...`), hybrid
     * post-quantum recipients (`age1pq1...`), tag recipients (`age1tag1...`),
     * and hybrid tag recipients (`age1tagpq1...`).
     *
     * @param s - The recipient to encrypt the file for. Either a string
     * beginning with `age1...` or an object implementing the {@link Recipient}
     * interface.
     */
    addRecipient(s) {
        if (this.passphrase !== null) {
            throw new Error("can't encrypt to both recipients and passphrases");
        }
        if (typeof s === "string") {
            if (s.startsWith("age1pq1")) {
                this.recipients.push(new HybridRecipient(s));
            }
            else if (s.startsWith("age1tag1")) {
                this.recipients.push(new TagRecipient(s));
            }
            else if (s.startsWith("age1tagpq1")) {
                this.recipients.push(new HybridTagRecipient(s));
            }
            else if (s.startsWith("age1")) {
                this.recipients.push(new X25519Recipient(s));
            }
            else {
                throw new Error("unrecognized recipient type");
            }
        }
        else {
            this.recipients.push(s);
        }
    }
    async encrypt(file) {
        const fileKey = randomBytes$1(16);
        const stanzas = [];
        let recipients = this.recipients;
        if (this.passphrase !== null) {
            recipients = [new ScryptRecipient(this.passphrase, this.scryptWorkFactor)];
        }
        for (const recipient of recipients) {
            stanzas.push(...await recipient.wrapFileKey(fileKey));
        }
        const labelHeader = new TextEncoder().encode("header");
        const hmacKey = hkdf(sha256, fileKey, undefined, labelHeader, 32);
        const mac = hmac(sha256, hmacKey, encodeHeaderNoMAC(stanzas));
        const header = encodeHeader(stanzas, mac);
        const nonce = randomBytes$1(16);
        const labelPayload = new TextEncoder().encode("payload");
        const streamKey = hkdf(sha256, fileKey, nonce, labelPayload, 32);
        const encrypter = encryptSTREAM(streamKey);
        if (!(file instanceof ReadableStream)) {
            if (typeof file === "string")
                file = new TextEncoder().encode(file);
            return await readAll(prepend(stream(file).pipeThrough(encrypter), header, nonce));
        }
        return Object.assign(prepend(file.pipeThrough(encrypter), header, nonce), {
            size: (size) => ciphertextSize(size) + header.length + nonce.length
        });
    }
}
/**
 * Decrypts a file using the given identities.
 *
 * First, call {@link Decrypter.addPassphrase} to set a passphrase for symmetric
 * decryption, and/or {@link Decrypter.addIdentity} to specify one or more
 * identities. All passphrases and/or identities are tried in parallel for each
 * file. Then, call {@link Decrypter.decrypt} one or more times to decrypt files
 * using the configured passphrase and/or identities.
 */
class Decrypter {
    identities = [];
    /**
     * Add a passphrase to decrypt password-encrypted file(s) with. This method
     * can be called multiple times to try multiple passphrases.
     *
     * @param s - The passphrase to decrypt the file with.
     */
    addPassphrase(s) {
        this.identities.push(new ScryptIdentity(s));
    }
    /**
     * Add an identity to decrypt file(s) with. This method can be called
     * multiple times to try multiple identities.
     *
     * @param s - The identity to decrypt the file with. Either a string
     * beginning with `AGE-SECRET-KEY-PQ-1...` or `AGE-SECRET-KEY-1...`, an
     * X25519 private
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey | CryptoKey}
     * object, or an object implementing the {@link Identity} interface.
     *
     * A CryptoKey object must have
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/type | type}
     * `private`,
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/algorithm | algorithm}
     * `{name: 'X25519'}`, and
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/usages | usages}
     * `["deriveBits"]`. For example:
     * ```js
     * const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])
     * decrypter.addIdentity(key.privateKey)
     * ```
     */
    addIdentity(s) {
        if (isCryptoKey(s)) {
            this.identities.push(new X25519Identity(s));
        }
        else if (typeof s === "string") {
            if (s.startsWith("AGE-SECRET-KEY-1")) {
                this.identities.push(new X25519Identity(s));
            }
            else if (s.startsWith("AGE-SECRET-KEY-PQ-1")) {
                this.identities.push(new HybridIdentity(s));
            }
            else {
                throw new Error("unrecognized identity type");
            }
        }
        else {
            this.identities.push(s);
        }
    }
    async decrypt(file, outputFormat) {
        const s = file instanceof ReadableStream ? file : stream(file);
        const { fileKey, headerSize, rest } = await this.decryptHeaderInternal(s);
        const { data: nonce, rest: payload } = await read(rest, 16);
        const label = new TextEncoder().encode("payload");
        const streamKey = hkdf(sha256, fileKey, nonce, label, 32);
        const decrypter = decryptSTREAM(streamKey);
        const out = payload.pipeThrough(decrypter);
        const outWithSize = Object.assign(out, {
            size: (size) => plaintextSize(size - headerSize - nonce.length)
        });
        if (file instanceof ReadableStream)
            return outWithSize;
        if (outputFormat === "text")
            return await readAllString(out);
        return await readAll(out);
    }
    /**
     * Decrypt the file key from a detached header. This is a low-level
     * function that can be used to implement delegated decryption logic.
     * Most users won't need this.
     *
     * It is the caller's responsibility to keep track of what file the
     * returned file key decrypts, and to ensure the file key is not used
     * for any other purpose.
     *
     * @param header - The file's textual header, including the MAC.
     *
     * @returns The file key used to encrypt the file.
     */
    async decryptHeader(header) {
        return (await this.decryptHeaderInternal(stream(header))).fileKey;
    }
    async decryptHeaderInternal(file) {
        const h = await parseHeader(file);
        const fileKey = await this.unwrapFileKey(h.stanzas);
        if (fileKey === null)
            throw Error("no identity matched any of the file's recipients");
        const label = new TextEncoder().encode("header");
        const hmacKey = hkdf(sha256, fileKey, undefined, label, 32);
        const mac = hmac(sha256, hmacKey, h.headerNoMAC);
        if (!compareBytes(h.MAC, mac))
            throw Error("invalid header HMAC");
        return { fileKey, headerSize: h.headerSize, rest: h.rest };
    }
    async unwrapFileKey(stanzas) {
        for (const identity of this.identities) {
            const fileKey = await identity.unwrapFileKey(stanzas);
            if (fileKey !== null)
                return fileKey;
        }
        return null;
    }
}
function compareBytes(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    let acc = 0;
    for (let i = 0; i < a.length; i++) {
        acc |= a[i] ^ b[i];
    }
    return acc === 0;
}
function isCryptoKey(key) {
    return typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
}

export { Decrypter, Encrypter, Stanza, armor, generateHybridIdentity, generateIdentity, generateX25519Identity, identityToRecipient, webauthn };
