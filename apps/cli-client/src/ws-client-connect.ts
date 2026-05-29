import { Command } from "commander";
import WebSocket from "ws";
import { LocalTransport } from "@syncpty/transport";
import { saveTerminalState, restoreTerminalState } from "@syncpty/pty-core";
import { ClientSession, ApprovalState } from "@syncpty/client-core";

const program = new Command();

enum SignalType {
  CLIENT_LOOKUP = "CLIENT_LOOKUP",
  MATCH_SUCCESS = "MATCH_SUCCESS",
  MATCH_FAILED = "MATCH_FAILED",
  APPROVAL_REQUEST = "APPROVAL_REQUEST",
  APPROVAL_RESPONSE = "APPROVAL_RESPONSE",
}

program
  .command("connect")
  .argument("<code>", "The 6-digit session key")
  .action(async (code) => {
    console.log(`[➔] Looking up session ${code}...`);

    const ws = new WebSocket("ws://localhost:8080");

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: SignalType.CLIENT_LOOKUP,
          payload: { code },
        })
      );
    });

    ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case SignalType.MATCH_FAILED:
          console.error(
            `\x1b[31m[!] Match Failed:\x1b[0m ${msg.payload.reason}`
          );
          process.exit(1);
          break;

        case SignalType.MATCH_SUCCESS:
          console.log("[➔] Match found. Sending identity for approval...");
          const identity = `${process.env.USER ?? "user"}@${
            process.env.HOSTNAME ?? "unknown"
          }`;

          ws.send(
            JSON.stringify({
              type: SignalType.APPROVAL_REQUEST,
              payload: { identity },
            })
          );
          break;

        case SignalType.APPROVAL_RESPONSE:
          if (!msg.payload.approved) {
            console.log("\x1b[31m[✗] Session denied by host.\x1b[0m");
            process.exit(0);
          }

          console.log("[✓] Session approved! Bridging transport...");

          // Close WS, we don't need it anymore. Hand off to Transport.
          ws.close();

          await startBinarySession();
          break;
      }
    });
  });

async function startBinarySession() {
  let isConsoleRawMode = false;
  const cleanExit = () => {
    if (isConsoleRawMode) {
      process.stdin.setRawMode(false);
      process.stdin.pause();

      restoreTerminalState("client_session");

      isConsoleRawMode = false;
    }
  };

  // Fall back to Local Transport on hardcoded 4321 for testing
  const transport = new LocalTransport({ isHost: false, port: 4321 });
  await transport.connect();

  const session = new ClientSession({
    transport,
    callbacks: {
      onApprovalStatus: () => {}, // Handled by WS now!
      onOutput: (payload) => {
        if (!isConsoleRawMode) {
          saveTerminalState("client_session");
          process.stdin.setRawMode(true);
          process.stdin.resume();
          isConsoleRawMode = true;
        }
        process.stdout.write(payload as string);
      },
      onDisconnect: (reason) => {
        cleanExit();
        console.log(`\n\r\x1b[31m[!] Session Disconnected: ${reason}\x1b[0m\n`);
        process.exit(0);
      },
    },
  });

  session.startApproved();

  process.stdin.on("data", (chunk) => {
    const input = chunk.toString();
    if (input === "\u001d") {
      session.close("Client detached");
      cleanExit();
      console.log(
        "\n\r\x1b[33m[Client] Detached cleanly from remote session.\x1b[0m\n"
      );
      process.exit(0);
    }
    session.sendInput(input);
  });

  process.stdout.on("resize", () =>
    session.sendResize(process.stdout.columns, process.stdout.rows)
  );
}

program.parse(process.argv);
