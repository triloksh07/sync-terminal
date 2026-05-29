#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import WebSocket from "ws";
import {
  PseudoTerminal,
  saveTerminalState,
  restoreTerminalState,
} from "@syncpty/pty-core";
import { Protocol, PacketType } from "@syncpty/protocol";
import { LocalTransport, type Transport } from "@syncpty/transport";

const program = new Command();
program.name("syncpty").version("0.0.6");

// The explicit Signaling types
enum SignalType {
  HOST_REGISTER = "HOST_REGISTER",
  HOST_REGISTERED = "HOST_REGISTERED",
  MATCH_SUCCESS = "MATCH_SUCCESS",
  APPROVAL_REQUEST = "APPROVAL_REQUEST",
  APPROVAL_RESPONSE = "APPROVAL_RESPONSE",
}

program
  .command("share")
  .option(
    "-r, --readonly",
    "Pipe stdout to client but drop all incoming client stdin packets",
    false
  )
  .option("-d, --dir <path>", "Custom working directory", process.cwd())
  .action(async (options) => {
    let isApproving = false;

    const resolvedDir = path.resolve(options.dir);
    console.log(`\x1b[35m[SyncPTY Host]\x1b[0m Connecting to Matchmaker...`);

    const ws = new WebSocket("ws://localhost:8080");

    ws.on("open", () => {
      // 1. Ask Server for a unique code
      ws.send(JSON.stringify({ type: SignalType.HOST_REGISTER }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case SignalType.HOST_REGISTERED:
          console.log(`\n\r=================================`);
          console.log(`  SyncPTY Host Agent Active`);
          console.log(
            `  Session Code: [ \x1b[1;32m${msg.payload.code}\x1b[0m ]`
          );
          console.log(`=================================\n`);
          console.log("Waiting for a client...");
          break;

        case SignalType.MATCH_SUCCESS:
          console.log(
            `\x1b[90m[Signal] Client matched. Awaiting identity...\x1b[0m`
          );
          break;

        case SignalType.APPROVAL_REQUEST:
          // Mutex Lock: Prevent concurrent approval prompts
          if (isApproving) {
            ws.send(
              JSON.stringify({
                type: SignalType.APPROVAL_RESPONSE,
                payload: { approved: false, reason: "Host is busy" },
              })
            );
            return;
          }

          isApproving = true;
          // 2. Out-of-band Approval via WS
          requestHostPermission(msg.payload.identity, async (approved) => {
            ws.send(
              JSON.stringify({
                type: SignalType.APPROVAL_RESPONSE,
                payload: { approved },
              })
            );

            if (approved) {
              // 3. Handshake complete! NOW we spin up the binary transport.
              const TARGET_PORT = 4321;
              const transport = new LocalTransport({
                isHost: true,
                port: TARGET_PORT,
              });
              await transport.connect();

              await executeActiveStreamingSession(
                resolvedDir,
                options.readonly,
                transport
              );
            } else {
              console.log(`\x1b[31m[-] Connection rejected by host.\x1b[0m`);
            }
          });
          break;
      }
    });

    ws.on("error", () =>
      console.error("Could not reach Signaling Server on port 8080")
    );
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
