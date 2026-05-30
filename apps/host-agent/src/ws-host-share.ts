#!/usr/bin/env node

import { Command } from "commander";
// import { select, isCancel } from "@clack/prompts";
import path from "path";
import WebSocket from "ws";
import {
  PseudoTerminal,
  saveTerminalState,
  restoreTerminalState,
} from "@syncpty/pty-core";
import { Protocol, PacketType } from "@syncpty/protocol";
import { LocalTransport, type Transport } from "@syncpty/transport";

const approvalQueue: { identity: string; clientId: string }[] = [];
let isApproving = false;
let currentLobby: DynamicLobby | null = null; // Track the active lobby

const program = new Command();
program.name("syncpty").version("0.0.6");

// The explicit Signaling types
enum SignalType {
  HOST_REGISTER = "HOST_REGISTER",
  HOST_REGISTERED = "HOST_REGISTERED",
  MATCH_SUCCESS = "MATCH_SUCCESS",
  APPROVAL_REQUEST = "APPROVAL_REQUEST",
  APPROVAL_RESPONSE = "APPROVAL_RESPONSE",
  CLIENT_DISCONNECT = "CLIENT_DISCONNECT",
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

        // case SignalType.APPROVAL_REQUEST:
        //   // Mutex Lock: Prevent concurrent approval prompts
        //   if (isApproving) {
        //     ws.send(
        //       JSON.stringify({
        //         type: SignalType.APPROVAL_RESPONSE,
        //         payload: { approved: false, reason: "Host is busy" },
        //       })
        //     );
        //     return;
        //   }

        //   isApproving = true;
        //   // 2. Out-of-band Approval via WS
        //   requestHostPermission(msg.payload.identity, async (approved) => {
        //     ws.send(
        //       JSON.stringify({
        //         type: SignalType.APPROVAL_RESPONSE,
        //         payload: { approved },
        //       })
        //     );

        //     if (approved) {
        //       // 3. Handshake complete! NOW we spin up the binary transport.
        //       const TARGET_PORT = 4321;
        //       const transport = new LocalTransport({
        //         isHost: true,
        //         port: TARGET_PORT,
        //       });
        //       await transport.connect();

        //       await executeActiveStreamingSession(
        //         resolvedDir,
        //         options.readonly,
        //         transport
        //       );
        //     } else {
        //       console.log(`\x1b[31m[-] Connection rejected by host.\x1b[0m`);
        //     }
        //   });
        //   break;

        // case SignalType.APPROVAL_REQUEST:
        //   approvalQueue.push(msg.payload);
        //   processQueue(ws, resolvedDir, options.readonly);
        //   break;

        case SignalType.APPROVAL_REQUEST:
          approvalQueue.push(msg.payload);
          if (isApproving && currentLobby) {
            currentLobby.redraw(); // Instantly update the UI!
          } else {
            processQueue(ws, resolvedDir, options.readonly);
          }
          break;

        case SignalType.CLIENT_DISCONNECT:
          const dropId = msg.payload.clientId;
          const idx = approvalQueue.findIndex((c) => c.clientId === dropId);
          if (idx !== -1) {
            approvalQueue.splice(idx, 1); // Remove the dead client
            if (isApproving && currentLobby) {
              if (approvalQueue.length === 0) {
                currentLobby.cancel();
                console.log(
                  `\n\r\x1b[90m[Lobby] All pending requests disconnected. Waiting...\x1b[0m`
                );
              } else {
                currentLobby.redraw(); // Shrink the list instantly
              }
            }
          }
          break;
      }
    });

    ws.on("error", () =>
      console.error("Could not reach Signaling Server on port 8080")
    );
  });

// function processQueue(ws: WebSocket, resolvedDir: string, isReadOnly: boolean) {
//   if (isApproving || approvalQueue.length === 0) return;

//   isApproving = true;
//   const nextClient = approvalQueue.shift()!;

//   requestHostPermission(nextClient.identity, async (approved) => {
//     isApproving = false;

//     // Reply specifically to the client we just evaluated
//     ws.send(
//       JSON.stringify({
//         type: SignalType.APPROVAL_RESPONSE,
//         payload: { approved, clientId: nextClient.clientId },
//       })
//     );

//     if (approved) {
//       // If approved, automatically reject anyone else waiting in the queue
//       approvalQueue.forEach((pending) => {
//         ws.send(
//           JSON.stringify({
//             type: SignalType.APPROVAL_RESPONSE,
//             payload: { approved: false, clientId: pending.clientId },
//           })
//         );
//       });
//       approvalQueue.length = 0; // Empty the queue

//       // Boot the binary transport
//       const TARGET_PORT = 4321;
//       const transport = new LocalTransport({ isHost: true, port: TARGET_PORT });
//       await transport.connect();
//       await executeActiveStreamingSession(resolvedDir, isReadOnly, transport);
//     } else {
//       console.log(`\x1b[31m[-] Connection rejected by host.\x1b[0m`);
//       // Recursively process the next knock in line
//       processQueue(ws, resolvedDir, isReadOnly);
//     }
//   });
// }

// function requestHostPermission(
//   clientEmail: string,
//   onDecision: (approved: boolean) => void
// ) {
//   console.log(`\n\r\x1b[33m⚠️  [Incoming Connection Attempt]\x1b[0m`);
//   console.log(`\rUser Identity (Verified): \x1b[36m${clientEmail}\x1b[0m`);
//   process.stdout.write(`\rApprove remote access control? (y/N): `);

//   process.stdin.setRawMode(true);
//   process.stdin.resume();

//   process.stdin.once("data", (data) => {
//     const input = data.toString().trim();

//     process.stdin.setRawMode(false);
//     process.stdin.pause();

//     if (input === "y" || input === "Y") {
//       onDecision(true);
//     } else {
//       onDecision(false);
//     }
//   });
// }

// Custom Reactive UI Class
class DynamicLobby {
  public selectedIndex = 0;
  private active = false;
  private resolveFn: ((id: string | null) => void) | null = null;

  async prompt(): Promise<string | null> {
    this.active = true;
    this.selectedIndex = 0;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    this.render();

    return new Promise((resolve) => {
      this.resolveFn = resolve;
      process.stdin.on("data", this.handleInput);
    });
  }

  private handleInput = (data: Buffer) => {
    const key = data.toString();
    if (key === "\u0003") {
      // Ctrl+C
      this.finish("EXIT");
    } else if (key === "\u001b[A") {
      // Up Arrow
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.render();
    } else if (key === "\u001b[B") {
      // Down Arrow
      this.selectedIndex = Math.min(
        approvalQueue.length,
        this.selectedIndex + 1
      );
      this.render();
    } else if (key === "\r") {
      // Enter
      if (this.selectedIndex === approvalQueue.length) {
        this.finish("REJECT_ALL");
      } else {
        this.finish(approvalQueue[this.selectedIndex].clientId);
      }
    }
  };

  private finish(result: string | null) {
    this.active = false;
    process.stdin.off("data", this.handleInput);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    if (this.resolveFn) this.resolveFn(result);
  }

  public cancel() {
    if (this.active) this.finish(null);
  }

  public redraw() {
    if (this.active) {
      // Prevent cursor from going out of bounds if clients dropped
      if (this.selectedIndex > approvalQueue.length) {
        this.selectedIndex = approvalQueue.length;
      }
      this.render();
    }
  }

  private render() {
    console.clear();
    console.log(
      "\r\n\x1b[35m[SyncPTY Lobby]\x1b[0m Incoming connection requests:"
    );
    approvalQueue.forEach((c, i) => {
      const prefix = i === this.selectedIndex ? "\x1b[36m> \x1b[0m" : "  ";
      console.log(`\r${prefix}👤 ${c.identity}`);
    });
    const exitPrefix =
      this.selectedIndex === approvalQueue.length ? "\x1b[31m> \x1b[0m" : "  ";
    console.log(`\r${exitPrefix}❌ Deny All & Clear Queue\n\r`);
    console.log("\r\x1b[90m(Use arrow keys and hit Enter)\x1b[0m");
  }
}
// Update processQueue to use the new Lobby

async function processQueue(
  ws: WebSocket,
  resolvedDir: string,
  isReadOnly: boolean
) {
  if (isApproving || approvalQueue.length === 0) return;
  isApproving = true;

  currentLobby = new DynamicLobby();
  const selectedId = await currentLobby.prompt();
  currentLobby = null;

  if (selectedId === "EXIT") {
    process.exit(0);
  }

  // Handle Cancellation / Reject All
  if (!selectedId || selectedId === "REJECT_ALL") {
    approvalQueue.forEach((pending) => {
      ws.send(
        JSON.stringify({
          type: SignalType.APPROVAL_RESPONSE,
          payload: { approved: false, clientId: pending.clientId },
        })
      );
    });
    approvalQueue.length = 0;
    isApproving = false;
    console.log(`\r\n\x1b[90m[Lobby] Requests cleared. Waiting...\x1b[0m\r\n`);
    return;
  }

  // Handle Selection
  const selectedClient = approvalQueue.find((c) => c.clientId === selectedId);

  // Deny everyone else
  approvalQueue.forEach((pending) => {
    if (pending.clientId !== selectedId) {
      ws.send(
        JSON.stringify({
          type: SignalType.APPROVAL_RESPONSE,
          payload: { approved: false, clientId: pending.clientId },
        })
      );
    }
  });
  approvalQueue.length = 0;

  if (selectedClient) {
    ws.send(
      JSON.stringify({
        type: SignalType.APPROVAL_RESPONSE,
        payload: { approved: true, clientId: selectedClient.clientId },
      })
    );

    const TARGET_PORT = 4321;
    const transport = new LocalTransport({ isHost: true, port: TARGET_PORT });
    await transport.connect();

    await executeActiveStreamingSession(resolvedDir, isReadOnly, transport);
  } else {
    // Failsafe: They were removed from the queue right as you hit Enter
    console.log(
      "\r\n\x1b[31m[-] Client disconnected while deciding.\x1b[0m\r\n"
    );
    isApproving = false;
    processQueue(ws, resolvedDir, isReadOnly); // Loop back if others remain
  }
}

// --- TUI via clack/prompts ---
// async function processQueue(
//   ws: WebSocket,
//   resolvedDir: string,
//   isReadOnly: boolean
// ) {
//   // Only show the lobby if we aren't currently streaming and there are clients waiting
//   if (isApproving || approvalQueue.length === 0) return;

//   isApproving = true;

//   // 1. Build the dynamic list of choices from the queue
//   const options = approvalQueue.map((client) => ({
//     value: client.clientId,
//     label: `👤 ${client.identity}`,
//   }));

//   options.push({ value: "REJECT_ALL", label: "❌ Deny All & Clear Queue" });

//   console.log("\n"); // Add spacing for the TUI

//   // 2. Render the interactive Arrow-Key UI
//   const selectedId = await select({
//     message: `Incoming connection requests (${approvalQueue.length} pending):`,
//     options: options,
//   });

//   // 3. Handle Cancellation / Reject All
//   if (isCancel(selectedId) || selectedId === "REJECT_ALL") {
//     approvalQueue.forEach((pending) => {
//       ws.send(
//         JSON.stringify({
//           type: SignalType.APPROVAL_RESPONSE,
//           payload: { approved: false, clientId: pending.clientId },
//         })
//       );
//     });
//     approvalQueue.length = 0; // Empty queue
//     isApproving = false;
//     console.log(`\x1b[90m[Lobby] All requests cleared. Waiting...\x1b[0m`);
//     return;
//   }

//   // 4. Handle Selection
//   const selectedClient = approvalQueue.find((c) => c.clientId === selectedId);

//   // Send DENIED to everyone who wasn't selected
//   approvalQueue.forEach((pending) => {
//     if (pending.clientId !== selectedId) {
//       ws.send(
//         JSON.stringify({
//           type: SignalType.APPROVAL_RESPONSE,
//           payload: { approved: false, clientId: pending.clientId },
//         })
//       );
//     }
//   });

//   // Empty the queue since we made a decision
//   approvalQueue.length = 0;

//   if (selectedClient) {
//     // Send APPROVED to the winner
//     ws.send(
//       JSON.stringify({
//         type: SignalType.APPROVAL_RESPONSE,
//         payload: { approved: true, clientId: selectedClient.clientId },
//       })
//     );

//     // Boot the binary transport
//     const TARGET_PORT = 4321;
//     const transport = new LocalTransport({ isHost: true, port: TARGET_PORT });
//     await transport.connect();

//     await executeActiveStreamingSession(resolvedDir, isReadOnly, transport);
//   }
// }
// --- TUI ---

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

    // FIX 1: Explicitly destroy the TCP Server and kill the ghost shell
    transport.close();
    // sessionPTY.kill();

    console.log(
      `\n\r\x1b[33m⚠️  [SyncPTY Notification] Remote client detached cleanly. Local control restored.\x1b[0m\n`
    );

    // Unlock the Host so it can accept new connections again
    isApproving = false;

    // Check if anyone else knocked while we were in the session
    // processQueue(ws, workingDir, isReadOnly);
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
