import { PseudoTerminal, saveTerminalState, restoreTerminalState } from "./index";

async function runTest() {
  console.log("=== Testing Hardened PTY Core Primitive ===");
  
  const pty = new PseudoTerminal({
    cols: 80,
    rows: 24
  });

  console.log(`Generated Instance Identity ID: ${pty.instanceId}`);
  
  // 1. Save local state parameters before raw manipulations
  saveTerminalState("test_session");
  
  pty.spawn();
  console.log(`Successfully spawned native child shell process. PID: ${pty.getPid()}`);

  pty.onData((bytes) => {
    // Print whatever the background terminal emits straight to our screen
    process.stdout.write(bytes);
  });

  // Write a simple test command down the stream pipe followed by a carriage return
  console.log("Sending 'echo Hello SyncPTY' to background process...");
  pty.write("echo Hello SyncPTY\n");

  // Keep alive for 2 seconds to watch output stream execute, then clean up
  setTimeout(() => {
    console.log("\nKilling PTY process cleanly...");
    pty.kill();
    
    // 2. Restore state flags to verify terminal formatting returns cleanly
    restoreTerminalState("test_session");
    console.log("=== Test Completed Cleanly ===");
    process.exit(0);
  }, 2000);
}

runTest();