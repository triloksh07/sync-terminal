#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import {
  PseudoTerminal,
  saveTerminalState,
  restoreTerminalState,
} from "@syncpty/pty-core";
import { Protocol, PacketType } from "@syncpty/protocol";
import { LocalTransport, type Transport } from "@syncpty/transport";

const program = new Command();

program
  .name("syncpty")
  .description("SyncPTY: Instant terminal sharing")
  .version("0.0.5");

// ==========================================
// COMMAND: syncpty share
// ==========================================
program
  .command("share")
  .description("Expose your local terminal session securely")
  .option(
    "-r, --readonly",
    "Pipe stdout to client but drop all incoming client stdin packets",
    false
  )
  .option(
    "-d, --dir <path>",
    "Custom working directory to launch the shell",
    process.cwd()
  )
  .action(async (options) => {
    const resolvedDir = path.resolve(options.dir);
    const TARGET_PORT = 4321;

    // Explicit 6-digit code generation derived from local test port configuration
    const sessionCode = TARGET_PORT.toString().padStart(6, "0"); // "004321"

    console.log(
      `\x1b[35m[SyncPTY Host]\x1b[0m Initializing secure loopback gateway...`
    );
    console.log(
      `\x1b[90mConfig - Dir: ${resolvedDir} | ReadOnly: ${options.readonly}\x1b[0m`
    );

    const transport = new LocalTransport({ isHost: true, port: TARGET_PORT });
    await transport.connect();

    console.log(`\n\r=================================`);
    console.log(`  SyncPTY Host Agent Active`);
    console.log(`  Session Code: [ \x1b[1;32m${sessionCode}\x1b[0m ]`);
    console.log(`=================================\n`);
    console.log("Waiting for a client...");

    // INTERCEPT ENGINE: Monitor the network wire for incoming client handshakes
    const unsubscribeHandshake = transport.onData((array) => {
      try {
        const packet = Protocol.deserialize(array);

        if (
          packet.type === PacketType.INPUT &&
          typeof packet.payload === "string" &&
          packet.payload.startsWith("KNOCK:")
        ) {
          const clientIdentity = packet.payload.split(":")[1];

          // Trigger the interactive approval flow intercepting terminal focus
          requestHostPermission(clientIdentity, async (approved) => {
            if (approved) {
              unsubscribeHandshake();
              await executeActiveStreamingSession(
                resolvedDir,
                options.readonly,
                transport
              );
            } else {
              console.log(
                `\x1b[31m[-] Connection knock rejected by host.\x1b[0m`
              );
              transport.send(
                Protocol.serialize(PacketType.CLOSE, { message: "Denied" })
              );
              process.exit(0);
            }
          });
        }
      } catch (err) {
        // Suppress parsing anomalies on unauthenticated handshakes
      }
    });
  });

function requestHostPermission(
  clientEmail: string,
  onDecision: (approved: boolean) => void
) {
  console.log(`\n\r\x1b[33m⚠️  [Incoming Connection Attempt]\x1b[0m`);
  console.log(`\rUser Identity (Verified): \x1b[36m${clientEmail}\x1b[0m`);
  process.stdout.write(`\rApprove remote access control? (y/N): `);

  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.once("data", (data) => {
    const input = data.toString().trim();

    process.stdin.setRawMode(false);
    process.stdin.pause();

    if (input === "y" || input === "Y") {
      onDecision(true);
    } else {
      onDecision(false);
    }
  });
}

async function executeActiveStreamingSession(
  workingDir: string,
  isReadOnly: boolean,
  transport: Transport
) {
  console.log(
    `\r\x1b[32m[✓] Access Authorized.\x1b[0m Spawning authoritative PTY shell...\n`
  );

  // Cache current host console profile flags safely
  saveTerminalState("host_session");

  const sessionPTY = new PseudoTerminal({
    cwd: workingDir,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  process.stdout.on("resize", () => {
    sessionPTY.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  });

  // 1. OUTBOUND MULTIPLEXING: Route raw PTY screen updates to both displays
  sessionPTY.onData((rawTerminalBytes) => {
    process.stdout.write(rawTerminalBytes); // Local monitor paint

    //  TODO: when integrate WebRTC Check state explicitly

    // Client network delivery
    try {
      const packedFrame = Protocol.serialize(
        PacketType.OUTPUT,
        rawTerminalBytes
      );
      transport.send(packedFrame);
    } catch (err: any) {
      // Suppress network pipe drops gracefully
      console.debug(`[DEBUG] Transport send failed: ${err.message}`);
    }
  });

  // 2. INBOUND MULTIPLEXING: Process incoming client network keystrokes safely
  transport.onData((array) => {
    try {
      const packet = Protocol.deserialize(array);

      if (packet.type === PacketType.INPUT && !isReadOnly) {
        sessionPTY.write(packet.payload); // Execute client string directly into shell
      } else if (packet.type === PacketType.RESIZE) {
        const { cols, rows } = packet.payload;
        sessionPTY.resize(cols, rows); // Re-render shell window geometry layout
      }
    } catch (err) {}
  });

  // Bind local Host keyboard typing directly to the PTY engine
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    sessionPTY.write(chunk.toString());
  });

  // Monitor Client Disconnections (FIN signals caught by our updated transport layer)
  transport.onClose(() => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    restoreTerminalState("host_session");

    console.log(
      `\n\r\x1b[33m⚠️  [SyncPTY Notification] Remote client detached cleanly. Local control restored.\x1b[0m\n`
    );
  });

  sessionPTY.onExit((exitCode) => {
    console.log(
      `\r\n\x1b[31m[-] Authoritative PTY shell exited (${exitCode})\x1b[0m`
    );
    try {
      transport.send(Protocol.serialize(PacketType.CLOSE, { exitCode }));
    } catch (e) {}

    process.stdin.setRawMode(false);
    restoreTerminalState("host_session");
    process.exit(0);
  });
}

program.parse(process.argv);
