import { pack, unpack } from 'msgpackr';
import { z } from 'zod';

// 1. Declare explicit Packet Type Boundaries (Spec v5)
export enum PacketType {
  INPUT = 0,       // Client keystrokes
  OUTPUT = 1,      // PTY screen updates
  RESIZE = 2,      // Terminal dimension change
  HEARTBEAT = 3,   // Connection keep-alive
  CLOSE = 4        // Clean disconnect signal
}

// 2. Define strict Zod Schemas for complex payloads (Compile-time + Runtime safety)
export const ResizePayloadSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export type ResizePayload = z.infer<typeof ResizePayloadSchema>;

// 3. The Base Envelope Structure
export interface SyncPtyPacket {
  type: PacketType;
  payload: any;
}

/**
 * Universal Binary Protocol Serializer
 */
export class Protocol {
  /**
   * Encapsulates and serializes data into a MessagePack binary buffer
   */
  public static serialize(type: PacketType, payload: any): Buffer {
    // Run optional runtime enforcement for critical procedures
    if (type === PacketType.RESIZE) {
      ResizePayloadSchema.parse(payload);
    }

    const packet: SyncPtyPacket = { type, payload };
    return pack(packet) as Buffer;
  }

  /**
   * Deserializes a MessagePack binary buffer back into an explicit type-safe packet
   */
  public static deserialize(buffer: Buffer): SyncPtyPacket {
    try {
      const decoded = unpack(buffer) as SyncPtyPacket;
      if (typeof decoded.type !== 'number') {
        throw new Error("Malformed packet envelope: Missing type marker.");
      }
      return decoded;
    } catch (err: any) {
      throw new Error(`Protocol Deserialization Failure: ${err.message}`);
    }
  }
}
