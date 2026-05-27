import { PseudoTerminal } from "@syncpty/pty-core";
import minimist from "minimist";
import path from "path";
import { Protocol, PacketType } from "@syncpty/protocol";
// import { Transport } from '@syncpty/transport'; // Coming in Phase 4

const argv = minimist(process.argv.slice(2));
const targetDirectory = argv.dir ? path.resolve(argv.dir) : process.cwd();

console.log(`\x1b[35[SyncPTY Identity\x1b[0m Core runtime: Initialized`);

/**
 * Handles the strict interactive connection confirmation prompt (2-Step Authorization)
 * Rejects implicitly on any fallback key configuration outside of Y/y
 */
function requestHostPermission(
  clientEmail: string,
  onDecision: (approved: boolean) => void
) {
  console.log(`\n\r\x1b[33m⚠️  [Incoming Connection Attempt]\x1b[0m`);
  console.log(`\rUser Identity (Verified): \x1b[36m${clientEmail}\x1b[0m`);

  process.stdout.write(`\rApprove remote assess control? (y/N): `);

  // Turn terminal to raw mode to trap precisely one key stream input
  process.stdin.setRawMode(true);
  process.stdin.resume();

  // FIX: Attach the listener to process.stdin, not the global process
  process.stdin.once("data", (data) => {
    const input = data.toString().trim();

    // Instantly switch out of raw mode to avoid terminal lockups
    process.stdin.setRawMode(false);
    process.stdin.pause();

    if (input === "y" || input === "Y") {
      console.log(
        `\n\r\x1b[32m[✓] Access Authorized.\x1b[0m Initializing local execution matrix...\n`
      );

      onDecision(true);
    } else {
      console.log(`\n\r\x1b[31m[X] Connection Terminated by Host.\x1b[0m\n`);
      onDecision(false);
    }
  });
}

/**
 * Boots the authoritative terminal session loop
 */
function startTerminalSession() {
  // console.log(`\rOpening pesudo-terminal shell context at: ${targetDirectory}`);
  console.log(
    `\n\r\x1b[32m[✓] Session Active. Remote client has control.\x1b[0m\n`
  );

  const sessionPTY = new PseudoTerminal(undefined, {
    cwd: targetDirectory,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  // Link incoming streams
  // 1. OUTBOUND: When the local PTY prints data, format it and send it to the network.
  sessionPTY.onData((rawTerminalBytes: any) => {
    const packet = Protocol.serialize(PacketType.OUTPUT, rawTerminalBytes);
    // transport.send(packet);  <-- This is the target WebRTC layer
    // process.stdout.write(rawTerminalBytes);

    // FOR NOW: Just log that it happened, do NOT write to process.stdout
    console.log(`[Network Tx] -> ${rawTerminalBytes.length} bytes`);
  });

  // 2. INBOUND: The network (transport) will give us binary packets from the remote client.
  // transport.onData((buffer) => {
  //     const packet = Protocol.deserialize(buffer);
  //     if (packet.type === PacketType.INPUT) {
  //         sessionPTY.write(packet.payload);
  //     }
  // });

  // process.stdin.setRawMode(true);
  // process.stdin.resume();

  // process.stdin.on("data", (chunk) => {
  //   sessionPTY.write(chunk.toString());
  // });

  sessionPTY.onExit((exitCode: any) => {
    console.log(
      `\r\n\x1b[31m[-] Runtime shell disconnected (Code: ${exitCode})\x1b[0m`
    );
    // Notify network client that session is dead
    // transport.send(Protocol.serialize(PacketType.CLOSE, { code: exitCode }));
    process.exit(0);
  });
}

// --- SIMULATION RUN ---
// To test out our authorization logic before we bolt on WebRTC network sockets:
const mockIncomingUser = "mentor@gmail.com";

requestHostPermission(mockIncomingUser, (approved) => {
  if (approved) startTerminalSession();
  else process.exit(0);
});
