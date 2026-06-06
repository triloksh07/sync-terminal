import { PacketType } from "./packet-types";

export interface BasePacket<T extends PacketType, P> {
  type: T;
  payload: P;
  timestamp: number;
}

export type AuthZRequestPacket = BasePacket<
  PacketType.AUTHZ_REQUEST,
  {
    clientId: string;
  }
>;

export type AuthZResponsePacket = BasePacket<
  PacketType.AUTHZ_RESPONSE,
  {
    approved: boolean;
    reason?: string;
  }
>;

export type PtyInputPacket = BasePacket<
  PacketType.PTY_INPUT,
  {
    data: string;
  }
>;

export type PtyOutputPacket = BasePacket<
  PacketType.PTY_OUTPUT,
  {
    data: string;
  }
>;

export type ResizePacket = BasePacket<
  PacketType.RESIZE,
  {
    cols: number;
    rows: number;
  }
>;

export type SessionClosePacket = BasePacket<
  PacketType.SESSION_CLOSE,
  {
    reason?: string;
    exitCode?: number;
  }
>;

export type HeartbeatPacket = BasePacket<
  PacketType.HEARTBEAT,
  {
    nonce: string;
  }
>;

export type SyncPTYPacket =
  | AuthZRequestPacket
  | AuthZResponsePacket
  | PtyInputPacket
  | PtyOutputPacket
  | ResizePacket
  | SessionClosePacket
  | HeartbeatPacket;
  
// ======================================================
// import { SyncPTYPacket } from "./packets";

// export class ProtocolSerializer {
//   static serialize(packet: SyncPTYPacket): Buffer {
//     return Buffer.from(JSON.stringify(packet), "utf8");
//   }

//   static deserialize(buffer: Buffer): SyncPTYPacket {
//     const parsed = JSON.parse(buffer.toString("utf8"));

//     if (!parsed?.type) {
//       throw new Error("Invalid packet");
//     }

//     return parsed;
//   }
// }
