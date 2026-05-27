import net from "net";
// import { Transport } from "./types"; // We'll define this below

export interface LocalTransportOptions {
  port?: number;
  host?: string;
  isHost: boolean;
}

export class LocalTransport {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  constructor(private options: LocalTransportOptions) {}

  public async connect(): Promise<void> {
    const port = this.options.port || 4321;
    const host = this.options.host || "127.0.0.1";

    return new Promise((resolve, reject) => {
      if (this.options.isHost) {
        // 1. HOST MODE: Spin up a local listening server
        this.server = net.createServer((incomingSocket) => {
          if (this.socket) {
            // Enforce our spec resource limit: max 1 client [cite: 45]
            incomingSocket.destroy();
            return;
          }
          this.socket = incomingSocket;
          this.setupSocketListeners();
          console.log(
            "\n\r\x1b[32m[Transport] Local peer linked via TCP proxy.\x1b[0m"
          );
        });

        this.server.listen(port, host, () => {
          resolve();
        });
      } else {
        // 2. CLIENT MODE: Dial into the host server
        this.socket = net.createConnection({ port, host }, () => {
          this.setupSocketListeners();
          resolve();
        });

        this.socket.on("error", (err) => reject(err));
      }
    });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on("data", (chunk) => {
      if (this.onDataCallback) {
        this.onDataCallback(chunk);
      }
    });

    this.socket.on("close", () => {
      if (this.onCloseCallback) this.onCloseCallback();
    });

    this.socket.on("error", (err) => {
      // Silence or log connection resets gracefully
      console.log("error occured while setting-up socket listener: ", err)
    });
  }

  public send(buffer: Buffer): void {
    if (this.socket && this.socket.writable) {
      this.socket.write(buffer);
    }
  }

  public onData(callback: (data: Buffer) => void): void {
    this.onDataCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  public close(): void {
    this.socket?.destroy();
    this.server?.close();
  }
}
