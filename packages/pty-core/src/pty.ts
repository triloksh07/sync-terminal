import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { PTYOptions, PTYEvents } from './types';
import pino from 'pino';

const logger = pino({ level: 'info' });

export class PTY extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private isRunning: boolean = false;

  constructor(private options: PTYOptions) {
    super();
  }

  /**
   * Spawn the PTY process
   */
  spawn(): void {
    if (this.isRunning) {
      throw new Error('PTY is already running');
    }

    const shell = this.options.shell || process.env.SHELL || 'bash';
    const args = this.options.args || [];
    const cwd = this.options.cwd || process.cwd();
    const env = this.options.env || process.env;

    logger.info({ shell, args, cwd }, 'Spawning PTY');

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: this.options.cols,
        rows: this.options.rows,
        cwd,
        env: { ...env, TERM: 'xterm-256color' },
      });

      this.isRunning = true;

      // Handle PTY output
      this.ptyProcess.onData((data) => {
        this.emit('output', data);
      });

      // Handle PTY exit
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        logger.info({ exitCode, signal }, 'PTY exited');
        this.isRunning = false;
        this.emit('exit', exitCode, signal);
      });

      logger.info('PTY spawned successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to spawn PTY');
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Write data to the PTY (stdin forwarding)
   */
  write(data: string): void {
    if (!this.ptyProcess || !this.isRunning) {
      logger.warn('Attempted to write to non-running PTY');
      return;
    }

    this.ptyProcess.write(data);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (!this.ptyProcess || !this.isRunning) {
      logger.warn('Attempted to resize non-running PTY');
      return;
    }

    logger.info({ cols, rows }, 'Resizing PTY');
    this.ptyProcess.resize(cols, rows);
  }

  /**
   * Send a signal to the PTY process
   */
  kill(signal?: string): void {
    if (!this.ptyProcess || !this.isRunning) {
      logger.warn('Attempted to kill non-running PTY');
      return;
    }

    logger.info({ signal }, 'Killing PTY');
    this.ptyProcess.kill(signal);
  }

  /**
   * Get the PID of the PTY process
   */
  getPid(): number | undefined {
    return this.ptyProcess?.pid;
  }

  /**
   * Check if the PTY is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.ptyProcess && this.isRunning) {
      logger.info('Disposing PTY');
      this.kill();
    }
    this.removeAllListeners();
  }
}
