import { Protocol, PacketType } from "@syncpty/protocol";
import { Transport } from "@syncpty/transport";

import { ApprovalState, ClientState } from "./state";

import { ClientSessionCallbacks, ClientSessionOptions } from "./types";

/**
 * Runtime-agnostic remote terminal session controller.
 *
 * Designed for:
 * - Node CLI
 * - Browser Client
 *
 * Does NOT know about:
 * - stdin/stdout
 * - xterm
 * - DOM
 * - terminal rendering
 */
export class ClientSession {
  private state = ClientState.IDLE;

  private approvalState = ApprovalState.PENDING;

  private readonly transport: Transport;

  private readonly callbacks: ClientSessionCallbacks;

  private unsubscribeData?: () => void;

  private unsubscribeClose?: () => void;

  constructor(options: ClientSessionOptions) {
    this.transport = options.transport;

    this.callbacks = options.callbacks;
  }

  /**
   * Instantiates session directly into ACTIVE state.
   * Used when approval happens out-of-band (e.g., via Signaling Server).
   */
  public startApproved(): void {
    if (this.state !== ClientState.IDLE) {
      throw new Error("Session already started");
    }

    this.state = ClientState.ACTIVE;
    this.approvalState = ApprovalState.APPROVED;

    // CRITICAL: Actually hook up the transport streams!
    this.unsubscribeData = this.transport.onData((array) =>
      this.handleIncomingPacket(array)
    );

    this.unsubscribeClose = this.transport.onClose(() =>
      this.handleTransportClosure()
    );

    this.callbacks.onApprovalStatus(ApprovalState.APPROVED);
  }

  /**
   * Initiates session startup.
   *
   * Current implementation:
   * Sends KNOCK payload over active transport.
   *
   * Future:
   * Signaling + approval workflow.
   */
  public async start(identity: string): Promise<void> {
    if (this.state !== ClientState.IDLE) {
      throw new Error("Session already started");
    }

    this.state = ClientState.CONNECTING;

    this.unsubscribeData = this.transport.onData((array) =>
      this.handleIncomingPacket(array)
    );

    this.unsubscribeClose = this.transport.onClose(() =>
      this.handleTransportClosure()
    );

    this.approvalState = ApprovalState.PENDING;

    this.callbacks.onApprovalStatus(ApprovalState.PENDING);

    const knockPayload = Protocol.serialize(
      PacketType.INPUT,
      `KNOCK:${identity}`
    );

    this.transport.send(knockPayload);
  }

  /**
   * Sends terminal input upstream.
   */
  public sendInput(input: string | Uint8Array): void {
    if (this.state !== ClientState.ACTIVE) {
      return;
    }

    const packed = Protocol.serialize(PacketType.INPUT, input);

    this.transport.send(packed);
  }

  /**
   * Sends terminal resize updates.
   */
  public sendResize(cols: number, rows: number): void {
    if (this.state !== ClientState.ACTIVE) {
      return;
    }

    const packed = Protocol.serialize(PacketType.RESIZE, {
      cols,
      rows,
    });

    this.transport.send(packed);
  }

  public getState(): ClientState {
    return this.state;
  }

  public getApprovalState(): ApprovalState {
    return this.approvalState;
  }

  public close(reason = "Client disconnected"): void {
    if (this.state === ClientState.CLOSED) {
      return;
    }

    try {
      this.transport.send(
        Protocol.serialize(PacketType.CLOSE, {
          message: reason,
        })
      );
    } catch {}

    this.terminateSession(reason);
  }

  /**
   * Main packet router.
   */
  private handleIncomingPacket(array: Uint8Array): void {
    try {
      const packet = Protocol.deserialize(array);

      switch (packet.type) {
        case PacketType.OUTPUT:
          /**
           * TEMPORARY:
           *
           * Current approval flow is inferred
           * from the first OUTPUT packet.
           *
           * Replace during signaling phase with
           * explicit approval messages.
           */
          if (this.state === ClientState.CONNECTING) {
            this.state = ClientState.ACTIVE;

            this.approvalState = ApprovalState.APPROVED;

            this.callbacks.onApprovalStatus(ApprovalState.APPROVED);
          }

          this.callbacks.onOutput(packet.payload);

          break;

        case PacketType.CLOSE:
          this.terminateSession(
            packet.payload?.message ?? "Remote session closed"
          );
          break;

        case PacketType.HEARTBEAT:
          break;
      }
    } catch {
      // Ignore malformed packets
    }
  }

  private handleTransportClosure(): void {
    this.terminateSession("Transport connection closed");
  }

  private terminateSession(reason: string): void {
    if (this.state === ClientState.CLOSED) {
      return;
    }

    const wasConnecting = this.state === ClientState.CONNECTING;

    this.state = ClientState.CLOSED;

    if (wasConnecting) {
      this.approvalState = ApprovalState.DENIED;

      this.callbacks.onApprovalStatus(ApprovalState.DENIED);
    }

    this.unsubscribeData?.();
    this.unsubscribeClose?.();

    this.transport.close();

    this.callbacks.onDisconnect(reason);
  }
}
