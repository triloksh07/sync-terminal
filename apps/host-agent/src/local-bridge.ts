import { PTY, saveTerminalState, restoreTerminalState, getTerminalSize } from '@syncpty/pty-core';
import * as readline from 'readline';
import { stdin, stdout } from 'process';

export class LocalBridge {
  private pty: PTY | null = null;
  private isRawMode: boolean = false;

  async start(): Promise<void> {
    // Save terminal state before entering raw mode
    saveTerminalState();

    // Get current terminal size
    const { cols, rows } = getTerminalSize();

    // Create PTY
    this.pty = new PTY({
      cols,
      rows,
    });

    // Set up event handlers
    this.pty.on('output', (data: string) => {
      stdout.write(data);
    });

    this.pty.on('exit', (code: number | null, signal: string | null) => {
      this.cleanup();
      console.log(`\nPTY exited: code=${code}, signal=${signal}`);
      process.exit(code || 0);
    });

    this.pty.on('error', (error: Error) => {
      this.cleanup();
      console.error('PTY error:', error);
      process.exit(1);
    });

    // Enter raw mode for stdin
    stdin.setRawMode(true);
    this.isRawMode = true;

    // Forward stdin to PTY
    stdin.on('data', (data) => {
      if (this.pty) {
        this.pty.write(data.toString());
      }
    });

    // Handle terminal resize
    process.on('SIGWINCH', () => {
      const { cols, rows } = getTerminalSize();
      if (this.pty) {
        this.pty.resize(cols, rows);
      }
    });

    // Handle cleanup signals
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });

    // Spawn the PTY
    this.pty.spawn();
  }

  private cleanup(): void {
    if (this.isRawMode) {
      stdin.setRawMode(false);
      this.isRawMode = false;
    }

    if (this.pty) {
      this.pty.dispose();
      this.pty = null;
    }

    restoreTerminalState();
  }
}
