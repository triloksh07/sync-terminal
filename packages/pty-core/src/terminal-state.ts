import { execSync } from "child_process";
import { isatty } from "tty";

// Use a private state cache map to allow tracking multiple sequential state transitions safely
const stateRegistry = new Map<string, string>();

function isStdinTTY(): boolean {
  return isatty(process.stdin.fd);
}

/**
 * Saves the current TTY line profile state under a specific key tag name.
 */
export function saveTerminalState(key: string = "default"): void {
  if (!isStdinTTY()) return;

  try {
    // Capture the exact hex configuration flags of the active terminal session
    const rawState = execSync("stty -g", {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "ignore"],
    }).trim();

    stateRegistry.set(key, rawState);
  } catch (error) {
    // Fallback silent capture safety bounds
  }
}

/**
 * Restores the terminal line state cleanly using the cached key signature profile.
 */
export function restoreTerminalState(key: string = "default"): void {
  if (!isStdinTTY()) return;

  const targetState = stateRegistry.get(key);

  if (targetState) {
    try {
      // Feed the state flags directly back into the system line hardware layer
      execSync(`stty ${targetState}`, { stdio: "inherit" });
      return;
    } catch (error) {
      // Fall through to emergency baseline recovery if configuration flags reject
    }
  }

  // EMERGENCY FALLBACK: If raw string restoration fails, restore control options cleanly
  try {
    // 'stty echo icanon' force-restores visible text typing and normal carriage returns
    execSync("stty echo icanon iexten isig", { stdio: "inherit" });
  } catch (fallbackError) {
    // Silently terminate backup loop if standard descriptors are disconnected
  }
}

/**
 * Reads terminal viewport metrics dynamically utilizing absolute system queries.
 */
export function getTerminalSize(): { cols: number; rows: number } {
  // Use explicit environment property hooks before falling back to system binary spawning costs
  if (process.stdout.columns && process.stdout.rows) {
    return { cols: process.stdout.columns, rows: process.stdout.rows };
  }

  if (!isStdinTTY()) {
    return { cols: 80, rows: 24 };
  }

  try {
    const stdout = execSync("stty size", {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "ignore"],
    }).trim();
    const [rows, cols] = stdout.split(" ").map(Number);
    return { cols: cols || 80, rows: rows || 24 };
  } catch (error) {
    return { cols: 80, rows: 24 };
  }
}
