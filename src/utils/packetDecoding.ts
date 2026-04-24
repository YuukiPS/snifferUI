import type { Root } from 'protobufjs';
import type { Packet } from '../types';
import { decodeUnknownProtobuf, base64ToBytes } from './unknownProtobuf';

export const decodeBase64ToBytes = base64ToBytes;

export const base64ByteLength = (b64?: string) => {
  if (!b64) return 0;
  try {
    return decodeBase64ToBytes(b64).length;
  } catch {
    return b64.length;
  }
};

export const getFirstArrayProp = (obj: unknown, keys: string[]) => {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v;
  }
  return null;
};

export const getBase64String = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return undefined;
  const candidates = ['base64', 'b64', 'data', 'value'];
  for (const k of candidates) {
    const raw = (v as Record<string, unknown>)[k];
    if (typeof raw === 'string') return raw;
  }
  return undefined;
};

export const COMBAT_ARG_TYPE_TO_MESSAGE: Record<string, string> = {
  CombatTypeArgument_COMBAT_EVT_BEING_HIT: 'EvtBeingHitInfo',
  CombatTypeArgument_ENTITY_MOVE: 'EntityMoveInfo',
  CombatTypeArgument_ANIMATOR_PARAMETER_CHANGED: 'EvtAnimatorParameterInfo',
};

export const ABILITY_ARG_TYPE_TO_MESSAGE: Record<string, string> = {
  // Fill in known mappings if available in your proto set
};

const isClientish = (src: Packet['source']) => src === 'CLIENT' || src === 'SUB_CLIENT';

export const buildGiSubPackets = ({
  parent,
  parentName,
  decodedObj,
  cmdIdToMessageMap,
  protoRoot,
  timestamp,
  createIndex,
}: {
  parent: Packet;
  parentName: string;
  decodedObj: any;
  cmdIdToMessageMap: Record<number, string>;
  protoRoot: Root;
  timestamp: string;
  createIndex: (i: number) => number;
 }): Packet[] | undefined => {
  const attachNestedSubPackets = (pkt: Packet) => {
    if (pkt.packetName !== 'UnionCmdNotify' && pkt.packetName !== 'CombatInvocationsNotify' && pkt.packetName !== 'AbilityInvocationsNotify') return;
    try {
      const parsed = JSON.parse(pkt.data);
      const nested = buildGiSubPackets({
        parent: pkt,
        parentName: pkt.packetName,
        decodedObj: parsed,
        cmdIdToMessageMap,
        protoRoot,
        timestamp: pkt.timestamp,
        createIndex: (i) => pkt.index * 1000 + (i + 1),
      });
      if (nested && nested.length > 0) pkt.subPackets = nested;
    } catch {}
  };

  if (parentName === 'UnionCmdNotify') {
    const cmdList = getFirstArrayProp(decodedObj, ['cmdList', 'cmdListList', 'cmd_list']);
    if (!cmdList || cmdList.length === 0) return undefined;
    const subs: Packet[] = [];
    for (let i = 0; i < cmdList.length; i++) {
      const sub = cmdList[i];
      try {
        const subId = Number((sub as any).messageId);
        const subBinary = getBase64String((sub as any).body);
        if (!subBinary) continue;
        const subProtoName = cmdIdToMessageMap[subId];
        let subDataStr = JSON.stringify(sub);
        let subSource: 'BINARY' | 'JSON' = 'JSON';
        if (subProtoName) {
          try {
            const subBuf = decodeBase64ToBytes(subBinary);
            const SubMessage = protoRoot.lookupType(subProtoName);
            const subDecoded = SubMessage.toObject(SubMessage.decode(subBuf), { longs: String, enums: String, bytes: String, defaults: true, arrays: true });
            subDataStr = JSON.stringify(subDecoded);
            subSource = 'BINARY';
          } catch {
            subDataStr = JSON.stringify(sub);
            subSource = 'JSON';
          }
        }
        const pkt: Packet = {
          timestamp,
          source: isClientish(parent.source) ? 'SUB_CLIENT' : 'SUB_SERVER',
          id: subId,
          packetName: subProtoName || 'Unknown',
          length: base64ByteLength(subBinary),
          index: createIndex(i),
          data: subDataStr,
          binary: subBinary,
          dataSource: subSource,
        };
        attachNestedSubPackets(pkt);
        subs.push(pkt);
      } catch {}
    }
    return subs.length > 0 ? subs : undefined;
  }

  if (parentName === 'CombatInvocationsNotify') {
    const list = getFirstArrayProp(decodedObj, ['invokeList', 'invokeListList', 'invoke_list']);
    if (!list || list.length === 0) return undefined;
    const subs: Packet[] = [];
    for (let i = 0; i < list.length; i++) {
      const inv = list[i];
      try {
        const argType: string = String((inv as any).argumentType || '');
        const forwardType: string = String((inv as any).forwardType || '');
        const subBinary = getBase64String((inv as any).combatData);
        if (!subBinary) continue;
        const mappedName = COMBAT_ARG_TYPE_TO_MESSAGE[argType];
        const guessName = mappedName || argType || 'Unknown';
        let decodedPayload: any = inv;
        let subSource: 'BINARY' | 'JSON' = 'JSON';
        try {
          const buf = decodeBase64ToBytes(subBinary);
          if (mappedName) {
            const Msg = protoRoot.lookupType(mappedName);
            decodedPayload = Msg.toObject(Msg.decode(buf), { longs: String, enums: String, bytes: String, defaults: true, arrays: true });
            subSource = 'BINARY';
          } else {
            decodedPayload = { unknownDecoded: decodeUnknownProtobuf(buf) };
            subSource = 'BINARY';
          }
        } catch {
          decodedPayload = inv;
          subSource = 'JSON';
        }
        subs.push({
          timestamp,
          source: isClientish(parent.source) ? 'SUB_CLIENT' : 'SUB_SERVER',
          id: 0,
          packetName: guessName,
          length: base64ByteLength(subBinary),
          index: createIndex(i),
          data: JSON.stringify({ argumentType: argType, forwardType: forwardType, payload: decodedPayload }),
          binary: subBinary,
          dataSource: subSource,
        });
      } catch {}
    }
    return subs.length > 0 ? subs : undefined;
  }

  if (parentName === 'AbilityInvocationsNotify') {
    const list = getFirstArrayProp(decodedObj, ['invokes', 'invokesList', 'invokes_list']);
    if (!list || list.length === 0) return undefined;
    const subs: Packet[] = [];
    for (let i = 0; i < list.length; i++) {
      const inv = list[i] as any;
      try {
        const argType: string = String(inv.argumentType || '');
        const forwardType: string = String(inv.forwardType || '');
        const entityId = inv.entityId !== undefined ? Number(inv.entityId) : undefined;
        const subBinary = getBase64String(inv.abilityData);
        if (!subBinary) continue;
        const mappedName = ABILITY_ARG_TYPE_TO_MESSAGE[argType];
        const guessName = mappedName || argType || 'UnknownAbility';
        let decodedPayload: any = inv;
        let subSource: 'BINARY' | 'JSON' = 'JSON';
        try {
          const buf = decodeBase64ToBytes(subBinary);
          if (mappedName) {
            const Msg = protoRoot.lookupType(mappedName);
            decodedPayload = Msg.toObject(Msg.decode(buf), { longs: String, enums: String, bytes: String, defaults: true, arrays: true });
            subSource = 'BINARY';
          } else {
            decodedPayload = { unknownDecoded: decodeUnknownProtobuf(buf) };
            subSource = 'BINARY';
          }
        } catch {
          decodedPayload = inv;
          subSource = 'JSON';
        }
        const pkt: Packet = {
          timestamp,
          source: isClientish(parent.source) ? 'SUB_CLIENT' : 'SUB_SERVER',
          id: 0,
          packetName: guessName,
          length: base64ByteLength(subBinary),
          index: createIndex(i),
          data: JSON.stringify({
            argumentType: argType,
            forwardType: forwardType,
            entityId,
            payload: decodedPayload,
          }),
          binary: subBinary,
          dataSource: subSource,
        };
        attachNestedSubPackets(pkt);
        subs.push(pkt);
      } catch {}
    }
    return subs.length > 0 ? subs : undefined;
  }

  return undefined;
};
