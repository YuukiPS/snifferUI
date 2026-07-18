export interface Packet {
    timestamp: number; // Unix time in milliseconds
    source: 'CLIENT' | 'SERVER' | 'SUB_CLIENT' | 'SUB_SERVER';
    id: number;
    packetName: string;
    length: number;
    index: number;
    data: string; // JSON string (decode proto data from server side)
    binary: string; // raw network data with base64 (need decode proto in client side)
    dataSource?: 'BINARY' | 'JSON';
    subPackets?: Packet[];
}

export type PacketSource = Packet['source'];

/**
 * Format Unix timestamp (ms) to HH:MM:SS for UI display.
 * Falls back to current time if timestamp is invalid (0, NaN, negative).
 */
export const formatTime = (ts: number): string => {
    if (!ts || !Number.isFinite(ts) || ts <= 0) {
        return new Date().toLocaleTimeString();
    }
    return new Date(ts).toLocaleTimeString();
};

/**
 * Normalize a raw timestamp value to a valid Unix ms number.
 * Handles:
 *   - number (already Unix ms)
 *   - numeric string (e.g. "1765008059022")
 *   - legacy formatted string (e.g. "04.51.02" or "2:34:19 PM") -> fallback to Date.now()
 *   - 0 / NaN / negative -> Date.now()
 */
export const normalizeTimestamp = (raw: unknown): number => {
    if (typeof raw === 'number') {
        return raw > 0 && Number.isFinite(raw) ? raw : Date.now();
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        // Pure numeric string -> Unix ms
        if (/^\d+$/.test(trimmed)) {
            const n = Number(trimmed);
            return n > 0 && Number.isFinite(n) ? n : Date.now();
        }
        // Try Date.parse for ISO-like strings; accept if it returns a valid ms
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
        // Legacy formatted time strings (HH.MM.SS, HH:MM:SS, etc.) -> no date component -> fallback
        return Date.now();
    }
    return Date.now();
};
