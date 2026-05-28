import { pack, unpack } from "msgpackr";
import { z } from "zod";

// 1. Declare explicit Packet Type Boundaries (Spec v5)
export enum PacketType {
  INPUT = 0, // Client keystrokes
  OUTPUT = 1, // PTY screen updates
  RESIZE = 2, // Terminal dimension change
  HEARTBEAT = 3, // Connection keep-alive
  CLOSE = 4, // Clean disconnect signal
}

// Strict Payload Validation Boundaries
export const ResizePayloadSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

// Runtime protections for terminal streams ensuring text boundaries are preserved
export const StreamPayloadSchema = z.union([
  z.string(),
  z.instanceof(Uint8Array),
]);

export type ResizePayload = z.infer<typeof ResizePayloadSchema>;

// Transparent Cross-Runtime Envelope Structure
export interface SyncPtyPacket {
  type: PacketType;
  payload: any;
}

/**
 * Universal Binary Protocol Serializer
 * Built using explicit Uint8Array abstractions for complete Node.js & Browser execution fidelity.
 */
export class Protocol {
  /**
   * Encapsulates and serializes data into a portable MessagePack binary Uint8Array
   */
  public static serialize(type: PacketType, payload: any): Uint8Array {
    // Run structural integrity checks based on intent markers
    if (type === PacketType.RESIZE) {
      ResizePayloadSchema.parse(payload);
    } else if (type === PacketType.INPUT || type === PacketType.OUTPUT) {
      StreamPayloadSchema.parse(payload);
    }

    const packet: SyncPtyPacket = { type, payload };
    return pack(packet);
  }

  /**
   * Deserializes a MessagePack binary buffer back into an explicit type-safe packet
   */
  public static deserialize(array: Uint8Array): SyncPtyPacket {
    try {
      const decoded = unpack(array) as SyncPtyPacket;
      if (
        decoded === null ||
        typeof decoded !== "object" ||
        typeof decoded.type !== "number"
      ) {
        throw new Error(
          "Malformed packet structure: Missing standard type marker."
        );
      }
      return decoded;
    } catch (err: any) {
      throw new Error(`Protocol Deserialization Failure: ${err.message}`);
    }
  }
}
