import { execSync } from 'child_process';
import { isatty } from 'tty';

let savedTerminalState: string | null = null;

/**
 * Check if stdin is a TTY
 */
function isStdinTTY(): boolean {
  return isatty(process.stdin.fd);
}

/**
 * Save the current terminal state to restore it later
 */
export function saveTerminalState(): void {
  if (!isStdinTTY()) {
    // Not running in a TTY, skip terminal state management
    return;
  }

  try {
    savedTerminalState = execSync('stty -g', { encoding: 'utf-8' }).trim();
  } catch (error) {
    // If stty fails, we'll try to restore with 'stty sane' later
    // Silently fail - this is expected when not in a proper terminal
  }
}

/**
 * Restore the previously saved terminal state
 */
export function restoreTerminalState(): void {
  if (!isStdinTTY()) {
    // Not running in a TTY, skip terminal state restoration
    return;
  }

  if (savedTerminalState) {
    try {
      execSync(`stty ${savedTerminalState}`, { stdio: 'inherit' });
    } catch (error) {
      // Fallback to stty sane if restoration fails
      try {
        execSync('stty sane', { stdio: 'inherit' });
      } catch (fallbackError) {
        // Silently fail - terminal state restoration is best-effort
      }
    }
  } else {
    // If no saved state, try stty sane as a fallback
    try {
      execSync('stty sane', { stdio: 'inherit' });
    } catch (error) {
      // Silently fail
    }
  }
}

/**
 * Get the current terminal size
 */
export function getTerminalSize(): { cols: number; rows: number } {
  if (!isStdinTTY()) {
    // Not running in a TTY, return default size
    return { cols: 80, rows: 24 };
  }

  try {
    const stdout = execSync('stty size', { encoding: 'utf-8' }).trim();
    const [rows, cols] = stdout.split(' ').map(Number);
    return { cols, rows };
  } catch (error) {
    // Default fallback size
    return { cols: 80, rows: 24 };
  }
}
