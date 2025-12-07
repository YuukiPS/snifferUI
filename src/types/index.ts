export interface Packet {
    timestamp: string;
    source: 'CLIENT' | 'SERVER';
    id: number;
    packetName: string;
    length: number;
    index: number;
    data: string; // JSON string (decode proto data from server side)
    binary: string; // raw network data with base64 (need decode proto in client side)
    dataSource?: 'BINARY' | 'JSON';
}

export type PacketSource = Packet['source'];
