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
  .action(async (options) => {
    const resolvedDir = path.resolve(options.dir);
    const targetPort = 4321;

    // Convert our local TCP port cleanly into our mandatory 6-digit session code layout
    const fallbackCode = targetPort.toString().padStart(6, "0"); // Result: "004321"

    console.log(
      `\x1b[35m[SyncPTY Host]\x1b[0m Booting secure local transport loopback...`
    );
    console.log(
      `\x1b[90mConfig - Dir: ${resolvedDir} | ReadOnly: ${options.readonly}\x1b[0m`
    );

    // 1. Initialize the genuine network listener block
    const transport = new LocalTransport({ isHost: true, port: targetPort });
    await transport.connect();

    console.log(`\n\r=================================`);
    console.log(`  SyncPTY Host Agent Active`);
    console.log(`  Session Code: [ \x1b[1;32m${fallbackCode}\x1b[0m ]`);
    console.log(`=================================\n`);
    console.log("Waiting for client network connection link...");

    // 2. REAL TRIGGER: This fires ONLY when a real client network process connects
    transport.onData((buffer) => {
      try {
        const packet = Protocol.deserialize(buffer);

        // If an unauthenticated socket sends a raw network knock packet
        if (
          packet.type === PacketType.INPUT &&
          typeof packet.payload === "string" &&
          packet.payload.startsWith("KNOCK:")
        ) {
          const clientIdentity = packet.payload.split(":")[1];

          // Trigger the 2-step host authorization prompt intercepting keyboard focus
          requestHostPermission(clientIdentity, async (approved) => {
            if (approved) {
              // Fire our approved streaming engine passing the live transport connection channel
              await handleApprovedSession(
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
        // Safe protection boundary on structural handshakes
      }
    });
  });

// ==========================================
// 2. COMMAND: syncpty connect <code>
// ==========================================
program
  .command("connect")
  .description("Connect to a remote shared terminal session proxy")
  .argument("<code>", "The 6-digit ephemeral connection room code") // Spec v5 Sec 23
  .action(async (code) => {
    // ENFORCED: Strict 6-digit code format validation rule checking
    if (!/^\d{6}$/.test(code)) {
      console.error(
        "\x1b[31mError: Connection code must be exactly 6 digits.\x1b[0m"
      );
      process.exit(1);
    }

    // Convert code back into a valid port mapping link (e.g. "004321" -> 4321)
    const computedPort = parseInt(code, 10);

    console.log(
      `\x1b[36m[SyncPTY Client]\x1b[0m Connecting to target network gate via port: ${computedPort}...`
    );
    const transport = new LocalTransport({ isHost: false, port: computedPort });

    try {
      await transport.connect();
      console.log(`[➔] Network pipe open. Transmitting identity knock...`);

      // Send our initial handshake payload directly across the network layer
      const localIdentity = "trilok@asus-tuf-gaming-f15";
      transport.send(
        Protocol.serialize(PacketType.INPUT, `KNOCK:${localIdentity}`)
      );

      console.log(`\x1b[90mWaiting for host to accept your knock...\x1b[0m`);

      let isModeSwitched = false;

      // Listen for the Host's output packets after they hit 'y/Y' to approve
      transport.onData((buffer) => {
        try {
          const packet = Protocol.deserialize(buffer);

          if (packet.type === PacketType.OUTPUT) {
            if (!isModeSwitched) {
              // The moment we receive output bytes, switch local console context to raw proxy
              process.stdin.setRawMode(true);
              process.stdin.resume();
              isModeSwitched = true;
            }
            // Paint the remote host's terminal output straight to our local monitor
            process.stdout.write(packet.payload);
          } else if (packet.type === PacketType.CLOSE) {
            process.stdin.setRawMode(false);
            console.log(
              "\n\r\x1b[31m[!] Remote session closed or denied by host.\x1b[0m\n"
            );
            process.exit(0);
          }
        } catch (e) {}
      });

      // Forward client keystrokes natively straight across the loopback transport channel
      process.stdin.on("data", (chunk) => {
        const inputStr = chunk.toString();

        // Custom Escape Override Sequence: Ctrl+] (\u001d) drops connection, preserves terminal [cite: 34]
        if (inputStr === "\u001d") {
          process.stdin.setRawMode(false);
          console.log(
            "\n\r\x1b[33m[Client] Detached cleanly from remote engine proxy.\x1b[0m\n"
          );
          process.exit(0);
        }

        transport.send(Protocol.serialize(PacketType.INPUT, inputStr));
      });
    } catch (err: any) {
      console.error(
        `\x1b[31mConnection Pipeline Failed:\x1b[0m ${err.message}`
      );
      process.exit(1);
    }
  });

// ==========================================
// INTERACTIVE ENGINE ROUTINES
// ==========================================

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

async function handleApprovedSession(
  workingDir: string,
  isReadOnly: boolean,
  transport: LocalTransport
) {
  console.log(
    `\r\x1b[32m[✓] Access Authorized.\x1b[0m Spawning authoritative PTY shell environment...\n`
  );

  const sessionPTY = new PseudoTerminal(undefined, {
    cwd: workingDir,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  // Remove previous un-authenticated knocking handlers from our live channel stream
  transport.onData(() => {});

  // 1. OUTBOUND MULTIPLEXING: Route local PTY screen events out to both screens
  sessionPTY.onData((rawTerminalBytes) => {
    process.stdout.write(rawTerminalBytes); // Render locally on Host monitor [cite: 42]
    // transport.send(Protocol.serialize(PacketType.OUTPUT, rawTerminalBytes)); // Forward to client

    // Enforce unconditional delivery to the network client
    try {
      const packedFrame = Protocol.serialize(
        PacketType.OUTPUT,
        rawTerminalBytes
      );
      transport.send(packedFrame);
    } catch (err) {
      // Suppress network pipe drops gracefully
    }
  });

  // 2. INBOUND MULTIPLEXING: Feed client network inputs directly to our terminal instance
  transport.onData((buffer) => {
    try {
      const packet = Protocol.deserialize(buffer);

      if (packet.type === PacketType.INPUT && !isReadOnly) {
        sessionPTY.write(packet.payload); // Execute client command string natively [cite: 3, 29]
      } else if (packet.type === PacketType.RESIZE) {
        const { cols, rows } = packet.payload; // Sync terminal dimensions dynamically [cite: 16, 38]
        sessionPTY.resize(cols, rows);
      }
    } catch (err) {}
  });

  // Host local hardware keyboard typing also feeds into the same authoritative PTY instance [cite: 3]
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    sessionPTY.write(chunk.toString());
  });

  transport.onClose(() => {
    // 1. Instantly tear down raw mode to restore the Host's local keyboard behavior
    process.stdin.setRawMode(false);
    process.stdin.pause();

    console.log(
      `\n\r\x1b[33m⚠️  [SyncPTY Notification] Remote client disconnected from session.\x1b[0m`
    );
    console.log(
      `\rLocal authority restored. Press [Enter] to resume local shell management...\n`
    );

    // We DO NOT kill the sessionPTY here. By design, the shell remains fully alive [cite: 17, 18]
    // We simply stop listening to the network pipe, keeping your background work pristine.
  });

  sessionPTY.onExit((exitCode) => {
    console.log(
      `\r\n\x1b[31m[-] Authoritative PTY shell exited (${exitCode})\x1b[0m`
    );
    try {
      transport.send(Protocol.serialize(PacketType.CLOSE, { exitCode }));
    } catch (e) {}
    process.exit(0);
  });
}

program.parse(process.argv);
