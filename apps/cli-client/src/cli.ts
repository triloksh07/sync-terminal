import { Command } from "commander";
import path from "path";

const program = new Command();

program
  .name("syncpty")
  // .description("Instant trusted terminal sharing via WebRTC")
  .description("SyncPTY - realtime terminal sharing system")
  .version("0.1.0");

program
  .command("share")
  .description("Expose your local pseudo-terminal shell context securely")
  .option(
    "-r, --readonly",
    "Pipe stdout to client but drop all incoming stdin  packets",
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
  .action((options) => {
    const resolvedDir = path.resolve(options.dir);
    console.log(`[HOST] Launching SyncPTY Share...`);
    console.log(`[Config] Directory: ${resolvedDir}`);
    console.log(`[Config] Read-Only Mode: ${options.readOnly}`);
    console.log(`[Config] Timeout Window: ${options.timeout}`);

    // TODO: Invoke Host Agent module passing these validated options
  });

program
  .command("connect")
  .description("Connect to a remote shared terminal session proxy")
  .argument("<code>", "The 6-digit ephemeral connection room code")
  .action((code) => {
    if (!/^\d{6}$/.test(code)) {
      console.error("Error: Connection code must be exactly 6 digits.");
      process.exit(1);
    }
    console.log(
      `[Client] Initializing proxy connection sequence to room: ${code}`
    );

    // TODO: Invoke CLI Client module passing the code
  });
