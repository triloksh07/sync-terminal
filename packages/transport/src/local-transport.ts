import net from "net";
import { Transport } from "./types";

export interface LocalTransportOptions {
  port?: number;
  host?: string;
  isHost: boolean;
}

/**
 * Portable Local TCP/UDS Transport Loopback Broker
 * - Manage discrete streaming lifecycle transitions and type boundaries safely.
 */
export class LocalTransport implements Transport {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;

  private readonly dataListeners = new Set<(data: Uint8Array) => void>();

  private readonly closeListeners = new Set<() => void>();

  private terminated = false;

  constructor(private readonly options: LocalTransportOptions) {}

  /**
   * Initializes network pipelines and handles state progression based on execution type markers.
   */
  public async connect(): Promise<void> {
    const port = this.options.port ?? 4321;
    const host = this.options.host ?? "127.0.0.1";

    return new Promise((resolve, reject) => {
      if (this.options.isHost) {
        // HOST MODE: Spin up listening network block
        this.server = net.createServer((incomingSocket) => {
          // Enforce resource limitation boundaries: maximum 1 remote listener
          if (this.socket) {
            incomingSocket.destroy();
            return;
          }

          this.socket = incomingSocket;
          this.setupSocketListeners();

          console.log("\n\r\x1b[32m[Transport] Local peer connected.\x1b[0m");
        });

        this.server.listen(port, host, () => {
          resolve();
        });

        // this.server.on("error", (err) => reject(err));
        this.server.on("error", reject);
      } else {
        // CLIENT MODE: Dial target network gateway
        this.socket = net.createConnection({ port, host }, () => {
          this.setupSocketListeners();
          resolve();
        });

        this.socket.on("error", (err) => reject(err));
      }
    });
  }

  /**
   * Internal Event Loop Aggregator hooking directly into the OS network states
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on("data", (chunk: Buffer) => {
      const payload = new Uint8Array(chunk);

      for (const listener of this.dataListeners) {
        listener(payload);
      }
    });

    // Handle standard connection severance sequence (FIN Packet execution)
    this.socket.on("end", () => {
      this.handleSocketTermination();
    });

    // Handle comprehensive physical file descriptor teardown
    this.socket.on("close", () => {
      this.handleSocketTermination();
    });

    this.socket.on("error", (err: any) => {
      // Suppress unneeded warning cascades for connection resets (ECONNRESET)
      if (err.code !== "ECONNRESET") {
        console.error("\r\n[Transport Error]:", err.message);
      }
    });
  }

  /**
   * Enforces single-execution cleanup loop mechanics during network drops
   */

  private handleSocketTermination(): void {
    if (this.terminated) return;

    this.terminated = true;

    for (const listener of this.closeListeners) {
      listener();
    }
  }

  /**
   * Transmits raw binary streams across the verified connection channel
   */
  public send(array: Uint8Array): void {
    if (this.socket && this.socket.writable) {
      this.socket.write(
        Buffer.from(array.buffer, array.byteOffset, array.byteLength)
      );
    }
  }

  /**
   * Assigns application-level interceptors to incoming transport stream payloads
   */

  public onData(callback: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(callback);

    return () => {
      this.dataListeners.delete(callback);
    };
  }

  /**
   * Assigns application-level cleanup tasks to transport lifecycle dropping events
   */

  public onClose(callback: () => void): () => void {
    this.closeListeners.add(callback);

    return () => {
      this.closeListeners.delete(callback);
    };
  }

  /**
   * Forcefully tears down remaining system network descriptors cleanly
   */
  public close(): void {
    this.socket?.destroy();
    this.server?.close();

    this.socket = null;
    this.server = null;

    this.dataListeners.clear();
    this.closeListeners.clear();
  }
}
