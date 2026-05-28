#!/usr/bin/env node

import { Command } from "commander";
import { Protocol, PacketType } from "@syncpty/protocol";
import { LocalTransport } from "@syncpty/transport";
import { saveTerminalState, restoreTerminalState } from "@syncpty/pty-core";

const program = new Command();

program
  .name("syncpty-client")
  .description("SyncPTY Client: Live remote terminal rendering proxy")
  .version("0.0.5");

program
  .command("connect")
  .description("Connect to an active remote terminal session using its 6-digit code")
  .argument("<code>", "The 6-digit session connection key")
  .action(async (code) => {
    if (!/^\d{6}$/.test(code)) {
      console.error("\x1b[31mError: Connection code must be exactly 6 digits.\x1b[0m");
      process.exit(1);
    }

    const computedPort = parseInt(code, 10);
    console.log(`\x1b[36m[SyncPTY Client]\x1b[0m Connecting via local proxy port: ${computedPort}...`);

    const transport = new LocalTransport({ isHost: false, port: computedPort });

    try {
      await transport.connect();
      console.log(`[➔] Network channel secured. Transmitting identity handshake...`);

      // Send the initial authentication handshake block across the wire
      const clientIdentity = "trilok@asus-tuf-gaming-f15";
      transport.send(Protocol.serialize(PacketType.INPUT, `KNOCK:${clientIdentity}`));

      console.log(`\x1b[90mWaiting for host to approve access query...\x1b[0m`);

      let isConsoleRawMode = false;

      // Listen for incoming screen render byte chunks from the host
      transport.onData((array) => {
        try {
          const packet = Protocol.deserialize(array);

          if (packet.type === PacketType.OUTPUT) {
            if (!isConsoleRawMode) {
              saveTerminalState("client_session"); // Protect client screen profile
              process.stdin.setRawMode(true);      // Drop into raw terminal input proxy mode
              process.stdin.resume();
              isConsoleRawMode = true;
            }
            process.stdout.write(packet.payload); // Write raw PTY bytes straight to display
          } else if (packet.type === PacketType.CLOSE) {
            cleanExit();
            console.log("\n\r\x1b[31m[!] Remote session closed or terminated by host.\x1b[0m\n");
            process.exit(0);
          }
        } catch (e) {}
      });

      // Forward client keystrokes natively straight up the network wire
      process.stdin.on("data", (chunk) => {
        const inputStr = chunk.toString();

        // Hard Break Safe Detach Sequence: Ctrl+] (\u001d) sever network pipe, protect states
        if (inputStr === "\u001d") {
          cleanExit();
          console.log("\n\r\x1b[33m[Client] Detached cleanly from remote session proxy.\x1b[0m\n");
          process.exit(0);
        }

        transport.send(Protocol.serialize(PacketType.INPUT, inputStr));
      });

      transport.onClose(() => {
        cleanExit();
        console.log("\n\r\x1b[31m[!] Network connection severed unexpectedly.\x1b[0m\n");
        process.exit(0);
      });

      function cleanExit() {
        if (isConsoleRawMode) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          restoreTerminalState("client_session"); // Unconditionally restore client cursor line
        }
        transport.close();
      }

    } catch (err: any) {
      console.error(`\x1b[31mConnection Pipeline Failed:\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);