import { PeerConnection, DataChannel } from "node-datachannel";
import type { WebSocket } from "ws";
import { Transport } from "./types";

export interface RTCTransportOptions {
  ws: WebSocket;
  isHost: boolean;
}

export class RTCTransport implements Transport {
  private peerConnection: PeerConnection | null = null;
  private dataChannel: DataChannel | null = null;

  private readonly dataListeners = new Set<(data: Uint8Array) => void>();
  private readonly closeListeners = new Set<() => void>();
  private terminated = false;

  constructor(private readonly options: RTCTransportOptions) {}

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 1. Initialize WebRTC Peer with public Google STUN servers for NAT traversal
      this.peerConnection = new PeerConnection("syncpty", {
        iceServers: ["stun:stun.l.google.com:19302"],
      });

      // 2. Outbound Signaling: When WebRTC generates keys/IPs, forward them via WebSocket
      this.peerConnection.onLocalDescription((sdp, type) => {
        this.signal({ sdp, type });
      });

      this.peerConnection.onLocalCandidate((candidate, mid) => {
        this.signal({ candidate, mid });
      });

      // 3. Inbound Signaling: Listen to WebSocket for the other peer's keys/IPs
      this.options.ws.on("message", (rawMessage) => {
        try {
          const msg = JSON.parse(rawMessage.toString());
          if (msg.type === "SIGNAL_FORWARD") {
            const payload = msg.payload;
            if (payload.sdp) {
              this.peerConnection?.setRemoteDescription(
                payload.sdp,
                payload.type
              );
            } else if (payload.candidate) {
              this.peerConnection?.addRemoteCandidate(
                payload.candidate,
                payload.mid
              );
            }
          }
        } catch (err) {}
      });

      // 4. Role-Specific Negotiation Setup
      if (this.options.isHost) {
        // Host CREATES the channel and initiates the Offer
        this.dataChannel = this.peerConnection.createDataChannel("pty-stream");
        this.setupDataChannel(resolve);
      } else {
        // Client WAITS for the data channel to arrive after answering
        this.peerConnection.onDataChannel((dc) => {
          this.dataChannel = dc;
          this.setupDataChannel(resolve);
        });
      }
    });
  }

  private setupDataChannel(onReady: () => void) {
    if (!this.dataChannel) return;

    this.dataChannel.onOpen(() => {
      console.log(
        "\x1b[32m[WebRTC] Peer-to-Peer DataChannel established!\x1b[0m"
      );
      onReady();
    });

    this.dataChannel.onMessage((msg) => {
      // node-datachannel receives strings or Buffers. Normalize to Uint8Array.
      const payload =
        typeof msg === "string"
          ? new TextEncoder().encode(msg)
          : new Uint8Array(msg);
      for (const listener of this.dataListeners) {
        listener(payload);
      }
    });

    this.dataChannel.onClosed(() => this.handleTermination());
    this.dataChannel.onError((err) => console.error("[WebRTC Error]:", err));
  }

  private signal(payload: any) {
    if (this.options.ws.readyState === 1 /* OPEN */) {
      this.options.ws.send(
        JSON.stringify({
          type: "SIGNAL_FORWARD",
          payload,
        })
      );
    }
  }

  public send(array: Uint8Array): void {
    if (this.dataChannel && this.dataChannel.isOpen()) {
      // Send as binary buffer directly over WebRTC
      this.dataChannel.sendMessageBinary(
        Buffer.from(array.buffer, array.byteOffset, array.byteLength)
      );
    }
  }

  public onData(callback: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  public onClose(callback: () => void): () => void {
    this.closeListeners.add(callback);
    return () => this.closeListeners.delete(callback);
  }

  private handleTermination(): void {
    if (this.terminated) return;
    this.terminated = true;
    for (const listener of this.closeListeners) listener();
    this.close();
  }

  public close(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();

    // this.dataChannel = null;
    // this.peerConnection = null;

    this.dataListeners.clear();
    this.closeListeners.clear();
  }
}
