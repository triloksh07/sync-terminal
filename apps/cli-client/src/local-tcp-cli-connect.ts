import { Command } from "commander";
import { LocalTransport } from "@syncpty/transport";
import { saveTerminalState, restoreTerminalState } from "@syncpty/pty-core";

import { ClientSession, ApprovalState } from "@syncpty/client-core";

const program = new Command();

program
  .command("connect")
  .argument("<code>", "The 6-digit session key")
  .action(async (code) => {
    const computedPort = parseInt(code, 10);

    const transport = new LocalTransport({
      isHost: false,
      port: computedPort,
    });

    let isConsoleRawMode = false;

    const cleanExit = () => {
      if (isConsoleRawMode) {
        process.stdin.setRawMode(false);
        process.stdin.pause();

        restoreTerminalState("client_session");

        isConsoleRawMode = false;
      }
    };

    try {
      await transport.connect();

      const session = new ClientSession({
        transport,
        callbacks: {
          onApprovalStatus: (status) => {
            switch (status) {
              case ApprovalState.PENDING:
                console.log(
                  "[➔] Handshake secured. Waiting for host authorization..."
                );
                break;

              case ApprovalState.APPROVED:
                console.log("[✓] Session approved.");
                break;

              case ApprovalState.DENIED:
                console.log("[✗] Session denied.");
                break;
            }
          },

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

            console.log(
              `\n\r\x1b[31m[!] Session Disconnected: ${reason}\x1b[0m\n`
            );

            process.exit(0);
          },
        },
      });

      const identity = `${process.env.USER ?? "user"}@${
        process.env.HOSTNAME ?? "unknown-host"
      }`;

      await session.start(identity);

      process.stdin.on("data", (chunk) => {
        const input = chunk.toString();

        // Ctrl + ]
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

      process.stdout.on("resize", () => {
        session.sendResize(process.stdout.columns, process.stdout.rows);
      });
    } catch (err: any) {
      cleanExit();

      console.error(`\x1b[31mConnection Failed:\x1b[0m ${err.message}`);

      process.exit(1);
    }
  });

program.parse(process.argv);
