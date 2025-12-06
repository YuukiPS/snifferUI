import type { Packet } from '../types';

const PACKET_NAMES = [
    'DENMPHBJNNH', 'BHIFBAMBKKH', 'FEFOILNDBLG', 'KNHNBCNKIJA',
    'PFEIFBJBKEM', 'HBBKELIHHNF', 'JIHHPCCGGID', 'TowerAllDataRsp',
    'NHKDOODELPP', 'CJCHKIDKEFL', 'FFHDBMOGLC', 'HGJNPEFOMOJ',
    'MIECMABJJHNB', 'CJMNMIMLPGD', 'KAMAPCGEPE', 'HAIFGAGHBGK'
];

const SAMPLE_JSON_DATA = [
    { "status": 2 },
    { "status": -2 },
    { "activityId": 5304, "scheduleId": 5304001, "beginTime": 176471 },
    { "HMHKKEEONG": 900 },
    { "uid": 835713121, "nickname": "Yuuki", "level": 56, "signature": "aya..." },
    { "ODNIHNOMMHE": 3658493 },
    { "towerFloorRecordList": [{ "floorId": 1001 }, { "floorId": 1002 }] },
    { "NJLMNLNKCBF": [1023, 1043, 1091] },
    { "KKMNHCIIJHJ": { "KONMLAEBDDG": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } },
    { "peerId": 1, "MCFIKDJFMKL": 3, "ODNIHNOMMHE": 3032703, "PBBNECJEKMH": 1 }
];

export const generateMockPackets = (count: number = 50): Packet[] => {
    const packets: Packet[] = [];
    let currentTime = 1765008075344;
    let currentId = 241;

    for (let i = 0; i < count; i++) {
        const isClient = Math.random() > 0.5;
        const packetName = PACKET_NAMES[Math.floor(Math.random() * PACKET_NAMES.length)];
        const data = SAMPLE_JSON_DATA[Math.floor(Math.random() * SAMPLE_JSON_DATA.length)];
        const length = JSON.stringify(data).length + Math.floor(Math.random() * 50);

        packets.push({
            timestamp: currentTime.toString(),
            source: isClient ? 'CLIENT' : 'SERVER',
            id: Math.floor(Math.random() * 30000), // Protocol ID? or just Packet ID? Screenshot shows small ids for client, large for server sometimes, or mixed.
            packetName: packetName,
            length: length,
            data: data
        });

        currentTime += Math.floor(Math.random() * 100);
        currentId++;
    }
    return packets;
};
