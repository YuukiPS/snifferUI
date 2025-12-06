export interface Packet {
    timestamp: string;
    source: 'CLIENT' | 'SERVER';
    id: number;
    packetName: string;
    length: number;
    data: any; // JSON object
}

export type PacketSource = Packet['source'];
