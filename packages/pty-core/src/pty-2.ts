import * as pty from 'node-pty';
import os from 'os';

export interface PtyOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export class PseudoTerminal {
  private ptyInstance: pty.IPty | null = null;
  private isAlive: boolean = false;

  constructor(private shell: string = '', private options: PtyOptions = {}) {
    if (!this.shell) {
      // Platform fallback identification
      this.shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    }
  }

  /**
   * Spawns the authoritative native pseudo-terminal instance
   */
  public spawn(): void {
    this.ptyInstance = pty.spawn(this.shell, [], {
      name: 'xterm-256color', // Enforces alternate screen buffer / standard color fidelity
      cols: this.options.cols || 80,
      rows: this.options.rows || 24,
      cwd: this.options.cwd || process.env.HOME || process.cwd(),
      env: this.options.env || process.env
    });

    this.isAlive = true;
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

  public kill(): void {
    if (this.ptyInstance) {
      try {
        this.ptyInstance.kill();
      } catch (e) {
        // Silently catch if process was terminated abruptly by external signal
      }
      this.isAlive = false;
    }
  }
}