import React, { useEffect, useMemo, useState } from 'react';
import './PacketDetail.css';
import type { UnknownProtobufField } from '../utils/unknownProtobuf';
import { base64ToBytes, decodeUnknownProtobuf, hexToBytes } from '../utils/unknownProtobuf';

type InputMode = 'base64' | 'hex';

interface UnknownProtobufDecoderProps {
  initialBase64?: string;
  showInput?: boolean;
}

const formatRange = (start: number, end: number) => `${start}-${Math.max(end - 1, start)}`;

const stringifyMaybe = (v: unknown) => {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
};

const wireTypeName = (wt: number) => {
  if (wt === 0) return 'varint';
  if (wt === 1) return 'fixed64';
  if (wt === 2) return 'len';
  if (wt === 5) return 'fixed32';
  return String(wt);
};

const guessType = (f: UnknownProtobufField) => {
  if (f.wireType === 0) return 'varint';
  if (f.wireType === 1) return 'fixed64';
  if (f.wireType === 5) return 'fixed32';
  if (f.wireType === 2) {
    if (typeof f.string === 'string') return 'string';
    if (Array.isArray(f.nested) && f.nested.length > 0) return 'message';
    return 'bytes';
  }
  return 'unknown';
};

const renderValue = (f: UnknownProtobufField) => {
  if (f.wireType === 0) {
    const parts: string[] = [];
    parts.push(`uint: ${stringifyMaybe(f.varint)}`);
    if (f.sint !== undefined) parts.push(`sint: ${stringifyMaybe(f.sint)}`);
    if (f.bool !== undefined) parts.push(`bool: ${f.bool ? 'true' : 'false'}`);
    return parts.join(' | ');
  }

  if (f.wireType === 5) {
    const parts: string[] = [];
    if (f.fixed32) parts.push(`hex: ${f.fixed32}`);
    if (f.fixed32Uint !== undefined) parts.push(`uint: ${f.fixed32Uint}`);
    if (f.fixed32Int !== undefined) parts.push(`int: ${f.fixed32Int}`);
    if (f.fixed32Float !== undefined) parts.push(`float: ${f.fixed32Float}`);
    return parts.join(' | ');
  }

  if (f.wireType === 1) {
    const parts: string[] = [];
    if (f.fixed64) parts.push(`hex: ${f.fixed64}`);
    if (f.fixed64Uint !== undefined) parts.push(`uint: ${f.fixed64Uint}`);
    if (f.fixed64Int !== undefined) parts.push(`int: ${f.fixed64Int}`);
    if (f.fixed64Double !== undefined) parts.push(`double: ${f.fixed64Double}`);
    return parts.join(' | ');
  }

  if (f.wireType === 2) {
    const parts: string[] = [];
    if (f.length !== undefined) parts.push(`len: ${f.length}`);
    if (f.string) parts.push(`string: ${JSON.stringify(f.string)}`);
    if (f.bytesHex) parts.push(`hex: ${f.bytesHex}`);
    return parts.join(' | ');
  }

  return '';
};

const FieldRows = ({
  fields,
  path,
  expanded,
  toggleExpanded,
}: {
  fields: UnknownProtobufField[];
  path: string;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
}) => {
  return (
    <>
      {fields.map((f, idx) => {
        const id = `${path}/${idx}`;
        const hasNested = Array.isArray(f.nested) && f.nested.length > 0;
        const isExpanded = expanded.has(id);
        return (
          <React.Fragment key={id}>
            <tr>
              <td style={{ whiteSpace: 'nowrap' }}>{formatRange(f.start, f.end)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{f.field}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{wireTypeName(f.wireType)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{guessType(f)}</td>
              <td style={{ wordBreak: 'break-word' }}>
                {hasNested && (
                  <button
                    type="button"
                    className="toolbar-btn"
                    style={{ marginRight: 8, padding: '2px 6px' }}
                    onClick={() => toggleExpanded(id)}
                  >
                    {isExpanded ? 'hide' : 'show'}
                  </button>
                )}
                {renderValue(f)}
              </td>
            </tr>
            {hasNested && isExpanded && (
              <tr>
                <td colSpan={5} style={{ padding: 0 }}>
                  <div style={{ padding: '8px 12px' }}>
                    <div className="table-wrapper" style={{ margin: 0 }}>
                      <table className="json-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Byte Range</th>
                            <th>Field</th>
                            <th>Wire</th>
                            <th>Type</th>
                            <th>Content</th>
                          </tr>
                        </thead>
                        <tbody>
                          <FieldRows
                            fields={f.nested ?? []}
                            path={id}
                            expanded={expanded}
                            toggleExpanded={toggleExpanded}
                          />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

export const UnknownProtobufDecoder: React.FC<UnknownProtobufDecoderProps> = ({
  initialBase64,
  showInput = false,
}) => {
  const [inputMode, setInputMode] = useState<InputMode>('base64');
  const [raw, setRaw] = useState<string>(initialBase64 ?? '');
  const [parseLengthDelimited, setParseLengthDelimited] = useState(false);
  const [decodeNonce, setDecodeNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (initialBase64 !== undefined) {
      setInputMode('base64');
      setRaw(initialBase64);
      setDecodeNonce((n) => n + 1);
    }
  }, [initialBase64]);

  const bytesResult = useMemo((): { bytes: Uint8Array | null; error: string | null } => {
    try {
      if (!raw) return { bytes: null, error: null };
      if (inputMode === 'base64') return { bytes: base64ToBytes(raw.trim()), error: null };
      return { bytes: hexToBytes(raw), error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid input';
      return { bytes: null, error: msg };
    }
  }, [raw, inputMode, decodeNonce]);

  const bytes = bytesResult.bytes;
  const bytesError = bytesResult.error;

  const decodedResult = useMemo((): { decoded: UnknownProtobufField[] | null; error: string | null } => {
    if (!bytes) return { decoded: null, error: bytesError };
    if (bytesError) return { decoded: null, error: bytesError };
    try {
      let buf = bytes;
      if (parseLengthDelimited) {
        const { value: len, offset } = (() => {
          let result = 0n;
          let shift = 0n;
          let i = 0;
          for (let count = 0; count < 10; count++) {
            if (i >= buf.length) throw new Error('Truncated varint');
            const b = buf[i++];
            result |= BigInt(b & 0x7f) << shift;
            if ((b & 0x80) === 0) return { value: result, offset: i };
            shift += 7n;
          }
          throw new Error('Varint too long');
        })();
        const lenNum = Number(len);
        if (!Number.isFinite(lenNum) || lenNum < 0) throw new Error('Invalid length');
        buf = buf.slice(offset, offset + lenNum);
      }
      return { decoded: decodeUnknownProtobuf(buf), error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Decode failed';
      return { decoded: null, error: msg };
    }
  }, [bytes, bytesError, parseLengthDelimited]);

  const decoded = decodedResult.decoded;
  const decodeError = decodedResult.error;

  useEffect(() => {
    setError(decodeError);
  }, [decodeError]);

  useEffect(() => {
    setExpanded(new Set());
  }, [decoded]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showInput && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={inputMode}
              onChange={(e) => setInputMode(e.target.value as InputMode)}
              className="search-scope-select"
              style={{ width: 120 }}
            >
              <option value="base64">base64</option>
              <option value="hex">hex</option>
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={parseLengthDelimited}
                onChange={(e) => setParseLengthDelimited(e.target.checked)}
              />
              parse varint length delimited input
            </label>
            <button
              type="button"
              className="toolbar-btn active"
              onClick={() => setDecodeNonce((n) => n + 1)}
            >
              Decode
            </button>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            style={{
              width: '100%',
              minHeight: 110,
              resize: 'vertical',
              background: '#0b1220',
              color: '#e5e7eb',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              padding: 10,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
            }}
            placeholder={inputMode === 'base64' ? 'paste base64...' : 'paste hex (spaces ok)...'}
          />
        </div>
      )}

      {error && (
        <div className="error-msg" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      {decoded && (
        <div className="table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
          <table className="json-table">
            <thead>
              <tr>
                <th>Byte Range</th>
                <th>Field</th>
                <th>Wire</th>
                <th>Type</th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              <FieldRows fields={decoded} path="root" expanded={expanded} toggleExpanded={toggleExpanded} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
