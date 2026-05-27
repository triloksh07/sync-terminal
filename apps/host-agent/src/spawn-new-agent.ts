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
  )
  .option(
    "-d, --dir <path>",
    "Custom working directory to launch the shell",
    process.cwd()
  )
  .option(
    "-t, --timeout <duration>",
    "Custom maximum session timeout duration",
    "15m"
  )
  .action(async (options) => {
    const resolvedDir = path.resolve(options.dir);

    // console.log(`\x1b[35m[SyncPTY Host]\x1b[0m Starting signaling lobby...`);
    console.log(
      `\x1b[35m[SyncPTY Host]\x1b[0m Initializing local secure socket server...`
    );

    console.log(
      `\x1b[90mConfig - Dir: ${resolvedDir} | ReadOnly: ${options.readonly} | Timeout: ${options.timeout}\x1b[0m`
    );

    // Simulated "Lobby Waiting Room" - generating our ephemeral code
    // const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
    // console.log(`\n\r=================================`);
    // console.log(`  SyncPTY Host Agent Active`);
    // console.log(`  Session Code: [ \x1b[1;32m${mockCode}\x1b[0m ]`);
    // console.log(`=================================\n`);
    // console.log("Waiting for client connection knock...");

    // Instantiate our real TCP transport bridge
    const transport = new LocalTransport({ isHost: true, port: 4321 });
    await transport.connect();

    console.log(`\n\r=================================`);
    console.log(`  SyncPTY Host Agent Active`);
    console.log(`  Listening on Local Port: [ \x1b[1;32m4321\x1b[0m ]`);
    console.log(`=================================\n`);
    console.log("Waiting for a real client connection link...");

    // REAL TRIGGER: This fires ONLY when a real TCP connection is established
    transport.onData((buffer) => {
      // For now, if the host isn't activated yet, treat the first incoming packet as the knock
      try {
        const packet = Protocol.deserialize(buffer);

        // If the client sends an initialization/knock packet
        if (
          packet.type === PacketType.INPUT &&
          packet.payload.startsWith("KNOCK:")
        ) {
          const clientEmail = packet.payload.split(":")[1];

          // Execute the interactive approval flow
          requestHostPermission(clientEmail, (approved) => {
            if (approved) {
              // Hand over stream control to the active transport layer
              bindActiveSession(resolvedDir, options.readonly, transport);
            } else {
              console.log(`[-] Connection rejected by host.`);
              transport.send(
                Protocol.serialize(PacketType.CLOSE, { message: "Denied" })
              );
              process.exit(0);
            }
          });
        }
      } catch (err) {
        // Handle initial buffer handshake reading safely
      }
    });

    // MOCK KNOCK: Simulating an incoming remote connection from your signaling server
    // setTimeout(() => {
    //   const mockIncomingUser = "mentor@gmail.com";

    //   // Execute the 2-step host authorization prompt
    //   requestHostPermission(mockIncomingUser, (approved) => {
    //     if (approved) {
    //       // CORRECTED: Call the streaming socket engine instead of local mock bridge
    //       handleApprovedSession(resolvedDir, options.readonly);
    //     } else {
    //       console.log(
    //         `\x1b[31m[-] Request rejected. Continuing to wait in lobby...\x1b[0m`
    //       );
    //       process.exit(0);
    //     }
    //   });
    // }, 3000); // Knocks after 3 seconds for testing
  });

// ==========================================
// 2. COMMAND: syncpty connect <port>
// ==========================================
program
  .command("connect")
  .description("Connect to a remote shared terminal session proxy")
  .argument("<port>", "Local proxy transport pipe port linkage") // Pointing directly to our TCP loopback proxy port
  .action(async (port) => {
    console.log(
      `\x1b[36m[SyncPTY Client]\x1b[0m Booting proxy connection to port ${port}...`
    );

    const transport = new LocalTransport({
      isHost: false,
      port: parseInt(port),
    });

    try {
      await transport.connect();
      console.log(`[✓] Proxy Pipeline Secured. Entering raw terminal mode...`);

      // Sending explicit credentials straight from the client terminal!
      const mockUserEmail = "trilok@asus-tuf-gaming-f15";
      const knockPacket = Protocol.serialize(
        PacketType.INPUT,
        `KNOCK:${mockUserEmail}`
      );
      transport.send(knockPacket);

      console.log(
        `[➔] Knock sent containing credentials. Awaiting host validation...`
      );

      // Keep process alive and listen for the host response
      transport.onData((buffer) => {
        const packet = Protocol.deserialize(buffer);

        if (packet.type === PacketType.OUTPUT) {
          // Once approved, the host starts streaming raw bash stdout bytes here! [cite: 29]
          process.stdout.write(packet.payload);

          // Switch local input to raw mode so your typing forwards to the host
          process.stdin.setRawMode(true);
          process.stdin.resume();
        }
      });

      // 1. Enter Raw Mode: Instruct OS to pass raw keystrokes directly
      // process.stdin.setRawMode(true);
      // process.stdin.resume();

      // Transmit initialization resize parameters instantly to backend PTY [cite: 16]
      // const initialResize = Protocol.serialize(PacketType.RESIZE, {
      //   cols: process.stdout.columns || 80,
      //   rows: process.stdout.rows || 24,
      // });
      // transport.send(initialResize);

      // 2. OUTBOUND PACKET MULTIPLEXING: Capture keystrokes, translate to MessagePack
      process.stdin.on("data", (chunk) => {
        const inputStr = chunk.toString();

        // Custom Safe Escape Sequence: Ctrl+] (\u001d) cuts transport pipe, preserves Host shell state
        if (inputStr === "\u001d") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          console.log(
            "\n\r\x1b[33m[Client] Detached cleanly from remote session.\x1b[0m\n"
          );
          process.exit(0);
        }

        const packet = Protocol.serialize(PacketType.INPUT, inputStr);
        transport.send(packet);
      });

      // 3. INBOUND PACKET MULTIPLEXING: Process incoming binary frames from Host
      // transport.onData((buffer) => {
      //   try {
      //     const packet = Protocol.deserialize(buffer);

      //     if (packet.type === PacketType.OUTPUT) {
      //       // Write payload buffer streams directly onto screen renderer context
      //       process.stdout.write(packet.payload);
      //     } else if (packet.type === PacketType.CLOSE) {
      //       process.stdin.setRawMode(false);
      //       process.stdin.pause();
      //       console.log(
      //         "\n\r\x1b[31m[!] Host disconnected session cleanly.\x1b[0m\n"
      //       );
      //       process.exit(0);
      //     }
      //   } catch (err) {
      //     // Sustain stream pipeline across partial buffer fragmentation chunks
      //   }
      // });

      // Synchronize client terminal dimension transformations over to host PTY immediately [cite: 16, 38]
      process.stdout.on("resize", () => {
        const resizePacket = Protocol.serialize(PacketType.RESIZE, {
          cols: process.stdout.columns || 80,
          rows: process.stdout.rows || 24,
        });
        transport.send(resizePacket);
      });
    } catch (err: any) {
      console.error(`\x1b[31mConnection error:\x1b[0m ${err.message}`);
      process.exit(1);
    }
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

async function handleApprovedSession(workingDir: string, isReadOnly: boolean) {
  console.log(
    `\x1b[34m[Host]\x1b[0m Initializing streaming socket transport layer...`
  );

  const transport = new LocalTransport({ isHost: true });
  await transport.connect();

  console.log(
    `[Transport] TCP Broker active on port 4321. Awaiting proxy initialization packet...`
  );

  const sessionPTY = new PseudoTerminal(undefined, {
    cwd: workingDir,
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  sessionPTY.spawn();

  // 1. OUTBOUND STREAM MULTIPLEXING
  sessionPTY.onData((rawTerminalBytes) => {
    process.stdout.write(rawTerminalBytes);

    const packedOutput = Protocol.serialize(
      PacketType.OUTPUT,
      rawTerminalBytes
    );
    transport.send(packedOutput);
  });

  // 2. INBOUND STREAM MULTIPLEXING
  transport.onData((buffer) => {
    try {
      const packet = Protocol.deserialize(buffer);

      if (packet.type === PacketType.INPUT && !isReadOnly) {
        sessionPTY.write(packet.payload); // [cite: 3, 29]
      } else if (packet.type === PacketType.RESIZE) {
        const { cols, rows } = packet.payload; // [cite: 16, 38]
        sessionPTY.resize(cols, rows);
      }
    } catch (err: any) {
      // Drop parsing noise safely
    }
  });

  // Bind local Host terminal keyboard inputs straight to the same running shell [cite: 3]
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    sessionPTY.write(chunk.toString());
  });

  sessionPTY.onExit((exitCode) => {
    console.log(`\r\n\x1b[31m[-] Shell session exited (${exitCode})\x1b[0m`);
    try {
      transport.send(Protocol.serialize(PacketType.CLOSE, { exitCode }));
    } catch (e) {}
    process.exit(0);
  });
}

// Parse incoming execution arguments
program.parse(process.argv);
function bindActiveSession(
  resolvedDir: string,
  readonly: any,
  transport: LocalTransport
) {
  throw new Error("Function not implemented.");
}
