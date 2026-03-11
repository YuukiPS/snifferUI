export type ProtobufWireType = 0 | 1 | 2 | 3 | 4 | 5;

export interface UnknownProtobufField {
  field: number;
  wireType: ProtobufWireType;
  start: number;
  end: number;
  varint?: number | string;
  sint?: number | string;
  bool?: boolean;
  fixed32?: string;
  fixed32Uint?: number;
  fixed32Int?: number;
  fixed32Float?: number;
  fixed64?: string;
  fixed64Uint?: string;
  fixed64Int?: string;
  fixed64Double?: number;
  length?: number;
  bytesHex?: string;
  bytesBase64?: string;
  string?: string;
  nested?: UnknownProtobufField[];
}

const textDecoder = new TextDecoder('utf-8', { fatal: false });

const bytesToHex = (bytes: Uint8Array) => {
  let h = '';
  for (let i = 0; i < bytes.length; i++) h += bytes[i].toString(16).padStart(2, '0');
  return h;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const isMostlyPrintable = (s: string) => {
  if (!s) return false;
  let printable = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) printable++;
    else if (c >= 32 && c <= 126) printable++;
  }
  return printable / s.length >= 0.85;
};

const zigZagDecode = (n: bigint) => (n >> 1n) ^ (-(n & 1n));

const bigintToMaybeNumber = (n: bigint): number | null => {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const min = -max;
  if (n > max || n < min) return null;
  return Number(n);
};

const bigintToStringOrNumber = (n: bigint): number | string => {
  const maybe = bigintToMaybeNumber(n);
  return maybe === null ? n.toString() : maybe;
};

const readVarint = (buf: Uint8Array, offset: number) => {
  let result = 0n;
  let shift = 0n;
  let i = offset;

  for (let count = 0; count < 10; count++) {
    if (i >= buf.length) throw new Error('Truncated varint');
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result, offset: i };
    shift += 7n;
  }

  throw new Error('Varint too long');
};

const tryDecodeNested = (bytes: Uint8Array, depth: number) => {
  if (depth >= 6) return undefined;
  try {
    const res = decodeUnknownProtobuf(bytes, depth + 1);
    if (res.length === 0) return undefined;
    return res;
  } catch {
    return undefined;
  }
};

export const decodeUnknownProtobuf = (buf: Uint8Array, depth = 0): UnknownProtobufField[] => {
  const out: UnknownProtobufField[] = [];
  let o = 0;

  while (o < buf.length) {
    const fieldStart = o;
    const { value: key, offset: o1 } = readVarint(buf, o);
    o = o1;

    const wireType = Number(key & 0x7n) as ProtobufWireType;
    const fieldNumber = Number(key >> 3n);

    if (fieldNumber <= 0) throw new Error('Invalid field number');

    if (wireType === 0) {
      const { value: v, offset: o2 } = readVarint(buf, o);
      o = o2;
      const sint = zigZagDecode(v);
      const asBool = v === 0n ? false : v === 1n ? true : undefined;
      out.push({
        field: fieldNumber,
        wireType,
        start: fieldStart,
        end: o,
        varint: bigintToStringOrNumber(v),
        sint: bigintToStringOrNumber(sint),
        bool: asBool,
      });
      continue;
    }

    if (wireType === 1) {
      if (o + 8 > buf.length) throw new Error('Truncated fixed64');
      const bytes = buf.slice(o, o + 8);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const u = dv.getBigUint64(0, true);
      const s = dv.getBigInt64(0, true);
      const d = dv.getFloat64(0, true);
      o += 8;
      out.push({
        field: fieldNumber,
        wireType,
        start: fieldStart,
        end: o,
        fixed64: bytesToHex(bytes),
        fixed64Uint: u.toString(),
        fixed64Int: s.toString(),
        fixed64Double: Number.isFinite(d) ? d : undefined,
        bytesBase64: bytesToBase64(bytes),
      });
      continue;
    }

    if (wireType === 2) {
      const { value: lenBig, offset: o2 } = readVarint(buf, o);
      const lenNum = bigintToMaybeNumber(lenBig);
      if (lenNum === null || lenNum < 0) throw new Error('Invalid length');
      o = o2;
      if (o + lenNum > buf.length) throw new Error('Truncated length-delimited');
      const bytes = buf.slice(o, o + lenNum);
      o += lenNum;

      const str = textDecoder.decode(bytes);
      const strValue = isMostlyPrintable(str) ? str : undefined;
      const nested = tryDecodeNested(bytes, depth);

      out.push({
        field: fieldNumber,
        wireType,
        start: fieldStart,
        end: o,
        length: lenNum,
        bytesHex: bytesToHex(bytes),
        bytesBase64: bytesToBase64(bytes),
        string: strValue,
        nested,
      });
      continue;
    }

    if (wireType === 5) {
      if (o + 4 > buf.length) throw new Error('Truncated fixed32');
      const bytes = buf.slice(o, o + 4);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const u = dv.getUint32(0, true);
      const s = dv.getInt32(0, true);
      const f = dv.getFloat32(0, true);
      o += 4;
      out.push({
        field: fieldNumber,
        wireType,
        start: fieldStart,
        end: o,
        fixed32: bytesToHex(bytes),
        fixed32Uint: u,
        fixed32Int: s,
        fixed32Float: Number.isFinite(f) ? f : undefined,
        bytesBase64: bytesToBase64(bytes),
      });
      continue;
    }

    throw new Error(`Unsupported wire type: ${wireType}`);
  }

  return out;
};

export const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export const hexToBytes = (hex: string) => {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
