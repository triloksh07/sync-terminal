#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import { PseudoTerminal } from "@syncpty/pty-core";
import { Protocol, PacketType } from "@syncpty/protocol";
import { LocalTransport } from "@syncpty/transport";

const program = new Command();

program
  .name("syncpty")
  .description("SyncPTY: Instant trusted terminal sharing")
  .version("0.0.5");

// ==========================================
// 1. COMMAND: syncpty share
// ==========================================
program
  .command("share")
  .description("Expose your local terminal session securely")
  .option(
    "-r, --readonly",
    "Pipe stdout to client but drop all incoming stdin packets",
    false
  ) // Spec v5 Sec 21
  .option(
    "-d, --dir <path>",
    "Custom working directory to launch the shell",
    process.cwd()
  ) // Spec v5 Sec 23
  .option(
    "-t, --timeout <duration>",
    "Custom maximum session timeout duration",
    "15m"
  ) // Spec v5 Sec 25
  .action((options) => {
    const resolvedDir = path.resolve(options.dir);

    console.log(`\x1b[35m[SyncPTY Host]\x1b[0m Starting signaling lobby...`);
    console.log(
      `\x1b[90mConfig - Dir: ${resolvedDir} | ReadOnly: ${options.readonly} | Timeout: ${options.timeout}\x1b[0m`
    );

    // Simulated "Lobby Waiting Room" - generating our ephemeral code
    const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`\n\r=================================`);
    console.log(`  SyncPTY Host Agent Active`);
    console.log(`  Session Code: [ \x1b[1;32m${mockCode}\x1b[0m ]`);
    console.log(`=================================\n`);
    console.log("Waiting for client connection knock...");

    // MOCK KNOCK: Simulating an incoming remote connection from your signaling server
    setTimeout(() => {
      const mockIncomingUser = "mentor@gmail.com";

      // Execute the 2-step host authorization prompt
      requestHostPermission(mockIncomingUser, (approved) => {
        if (approved) {
          // Launch the authoritative PTY session
          launchHostPTY(resolvedDir, options.readonly);
        } else {
          console.log(
            `\x1b[31m[-] Request rejected. Continuing to wait in lobby...\x1b[0m`
          );
          process.exit(0);
        }
      });
    }, 3000); // Knocks after 3 seconds for testing
  });

// ==========================================
// 2. COMMAND: syncpty connect <code>
// ==========================================
program
  .command("connect")
  .description("Connect to a remote shared terminal session proxy")
  .argument("<code>", "The 6-digit ephemeral connection room code") // Spec v5 Sec 23
  .action((code) => {
    // Validate argument structure before doing heavy lifting
    if (!/^\d{6}$/.test(code)) {
      console.error(
        "\x1b[31mError: Connection code must be exactly 6 digits.\x1b[0m"
      );
      process.exit(1);
    }

    console.log(
      `\x1b[36m[SyncPTY Client]\x1b[0m Initiating connection sequence to room: ${code}`
    );
    console.log(`Sending authenticated OIDC token to Matchmaker server...`);

    // Switch client terminal to Raw Mode to become a terminal proxy renderer
    console.log(`\x1b[90mWaiting for host to accept your knock...\x1b[0m`);

    // In Phase 3/4, this will kick off the WebRTC DataChannel connection stream
  });

// ==========================================
// HELPER FUNCTIONS FOR WORKFLOW
// ==========================================

function requestHostPermission(
  clientEmail: string,
  onDecision: (approved: boolean) => void
) {
  console.log(`\n\r\x1b[33m⚠️  [Incoming Connection Attempt]\x1b[0m`);
  console.log(`\rUser Identity (Verified): \x1b[36m${clientEmail}\x1b[0m`);
  process.stdout.write(`\rApprove remote access control? (y/N): `);

  // Take over standard input stream
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.once("data", (data) => {
    const input = data.toString().trim();

    // Immediately drop out of raw mode to hand control over to the PTY later
    process.stdin.setRawMode(false);
    process.stdin.pause();

    // Strict validation: Default is "No". Anything other than 'y' or 'Y' fails.
    if (input === "y" || input === "Y") {
      onDecision(true);
    } else {
      onDecision(false);
    }
  });
}

async function handleApprovedSession(workingDir: string, isReadOnly: boolean) {
  console.log(
    `\x1b[34m[Host]\x1b[0m Initializing streaming socket transport layer...`
  );

  const transport = new LocalTransport({ isHost: true });
  await transport.connect();

  console.log(
    `[Transport] TCP Broker active. Awaiting proxy initialization packet...`
  );

  const sessionPTY = new PseudoTerminal(undefined, {
    cwd: workingDir,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  // 1. OUTBOUND STREAM MULTIPLEXING
  // Pipe raw terminal stdout bytes into a type-safe binary packet envelope and send
  sessionPTY.onData((rawTerminalBytes) => {
    // Echo locally to Host screen so they see all action [cite: 42]
    process.stdout.write(rawTerminalBytes);

    const packedOutput = Protocol.serialize(
      PacketType.OUTPUT,
      rawTerminalBytes
    );
    transport.send(packedOutput);
  });

  // 2. INBOUND STREAM MULTIPLEXING
  // Process incoming binary packets sent from the remote client over the socket
  transport.onData((buffer) => {
    try {
      const packet = Protocol.deserialize(buffer);

      if (packet.type === PacketType.INPUT && !isReadOnly) {
        // Feed remote client keystroke directly into authoritative PTY [cite: 3, 29]
        sessionPTY.write(packet.payload);
      } else if (packet.type === PacketType.RESIZE) {
        // Adjust PTY scale dynamically to match client console size [cite: 16, 38]
        const { cols, rows } = packet.payload;
        sessionPTY.resize(cols, rows);
      }
    } catch (err: any) {
      // Log format validation errors or drop broken packets safely
    }
  });

  // Host local keyboard typing also feeds into the same PTY [cite: 3]
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    sessionPTY.write(chunk.toString());
  });

  sessionPTY.onExit((exitCode) => {
    console.log(`\r\n\x1b[31m[-] Shell session exited (${exitCode})\x1b[0m`);
    transport.send(Protocol.serialize(PacketType.CLOSE, { exitCode }));
    process.exit(0);
  });
}

function launchHostPTY(workingDir: string, isReadOnly: boolean) {
  console.log(`\rSpawning local backend shell layout...\n`);

  const sessionPTY = new PseudoTerminal(undefined, {
    cwd: workingDir,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  // Pipe output to local display
  sessionPTY.onData((data) => {
    process.stdout.write(data);
  });

  // Re-enable raw input capture so local keystrokes type directly into the shell
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on("data", (chunk) => {
    // If read-only mode is active, the host can type, but later we will drop client inputs
    sessionPTY.write(chunk.toString());
  });

  sessionPTY.onExit((exitCode) => {
    console.log(
      `\r\n\x1b[31m[-] Pseudo-terminal session terminated (Exit Code: ${exitCode})\x1b[0m`
    );
    process.exit(0);
  });
}

// Parse incoming execution arguments
program.parse(process.argv);
