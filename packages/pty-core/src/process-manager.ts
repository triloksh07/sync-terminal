import { execSync } from "child_process";
import pino from "pino";

const logger = pino({ level: "info" });

export interface ActiveProcessInfo {
  pid: number;
  command: string;
  elapsedTime: string;
}

export class PTYProcessManager {
  /**
   * Scans the Linux process tree to verify if a specific PID is still active.
   */
  public static isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 does not kill the process, but checks if it exists in the OS process table
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Forcefully kills an orphaned or unnecessary shell process by its PID.
   */
  public static killProcess(pid: number): boolean {
    try {
      logger.info(`Forcefully terminating process PID: ${pid} via SIGKILL...`);
      process.kill(pid, "SIGKILL"); // Equivalent to kill -9
      return true;
    } catch (error) {
      logger.error(`Failed to terminate process ${pid}:`, error);
      return false;
    }
  }

  /**
   * Advanced: Queries the system to find performance metrics of a specific PTY process.
   * Returns its execution string and how long it has been running.
   */
  public static getProcessDetails(pid: number): ActiveProcessInfo | null {
    try {
      // Use standard Linux ps formatting options to extract data safely
      const output = execSync(`ps -p ${pid} -o pid,comm,time --no-headers`, {
        encoding: "utf-8",
      }).trim();

      if (!output) return null;

      const [parsedPid, command, elapsedTime] = output.split(/\s+/);
      return {
        pid: parseInt(parsedPid, 10),
        command,
        elapsedTime,
      };
    } catch (e) {
      return null; // Process does not exist or access denied
    }
  }

  /**
   * Verifies if a given OS Process ID belongs to SyncPTY by scanning its environment variables.
   */
  public static isOurProcess(pid: number): boolean {
    try {
      // Linux command: read the environment block of the PID and check for our signature key string
      const envBlock = execSync(`cat /proc/${pid}/environ`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return envBlock.includes("SYNCPTY_INSTANCE_ID=");
    } catch (e) {
      // If reading /proc fails (permissions or process died), check via fallback tool ps
      try {
        const fallbackCheck = execSync(`ps -p ${pid} -o env`, {
          encoding: "utf-8",
        });
        return fallbackCheck.includes("SYNCPTY_INSTANCE_ID=");
      } catch (err) {
        return false;
      }
    }
  }

  /**
   * Forcefully kills a process only if it is verified to be an instance of our tool.
   */
  public static safeKill(pid: number): boolean {
    if (this.isOurProcess(pid)) {
      try {
        process.kill(pid, "SIGKILL");
        return true;
      } catch (e) {
        return false;
      }
    }
    return false; // Blocks accidental termination of system processes
  }
}
