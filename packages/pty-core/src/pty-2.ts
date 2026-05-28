import * as pty from "node-pty";
import os from "os";
import crypto from "node:crypto";

export interface PtyOptions {
  shell?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export class PseudoTerminal {
  private ptyInstance: pty.IPty | null = null;
  private isAlive: boolean = false;
  private shell: string;
  public readonly instanceId: string;

  constructor(private options: PtyOptions = {}) {
    // Platform fallback identification
    this.shell =
      options.shell || (os.platform() === "win32" ? "powershell.exe" : "bash");

    // Generate an 8-character compact hex ID unique to this running class instance
    this.instanceId = `syncpty_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Spawns the authoritative native pseudo-terminal instance safely
   */
  public spawn(): void {
    if (this.isAlive || this.ptyInstance) {
      throw new Error("PTY is already active and running.");
    }

    const args = this.options.args || [];
    const cwd = this.options.cwd || process.env.HOME || process.cwd();
    const env = this.options.env || process.env;

    this.ptyInstance = pty.spawn(this.shell, args, {
      name: "xterm-256color", // Enforces alternate screen buffer / standard color fidelity
      cols: this.options.cols || 80,
      rows: this.options.rows || 24,
      cwd,
      env: {
        ...env,
        TERM: "xterm-256color",
        SYNCPTY_INSTANCE_ID: this.instanceId,
      },
    });

    this.isAlive = true;
  }

  /**
   * Returns the native Operating System Process ID (PID) of the spawned shell.
   * Useful for orchestration, metrics monitoring, and stray process pruning.
   */
  public getPid(): number {
    if (!this.ptyInstance || !this.isAlive) {
      throw new Error(
        "Cannot retrieve PID: The pseudo-terminal process is not active."
      );
    }
    return this.ptyInstance.pid;
  }

  public onData(callback: (data: string) => void): void {
    if (!this.ptyInstance) throw new Error("PTY instance not spawned yet.");
    this.ptyInstance.onData(callback);
  }

  public write(data: string): void {
    if (this.ptyInstance && this.isAlive) {
      this.ptyInstance.write(data);
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.ptyInstance && this.isAlive) {
      this.ptyInstance.resize(cols, rows);
    }
  }

  public onExit(callback: (exitCode: number, signal?: number) => void): void {
    if (!this.ptyInstance) throw new Error("PTY instance not spawned yet.");
    this.ptyInstance.onExit((e) => {
      this.isAlive = false;
      callback(e.exitCode, e.signal);
    });
  }

  public isActive(): boolean {
    return this.isAlive;
  }

  /**
   * Clean up and kill native process bindings safely
   */
  public kill(signal?: string): void {
    if (this.ptyInstance) {
      try {
        this.ptyInstance.kill(signal);
      } catch (e) {
        // Silently catch if process was terminated abruptly by external signal
      }
      this.ptyInstance = null;
      this.isAlive = false;
    }
  }
}
