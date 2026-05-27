import { Command } from 'commander';
import { LocalTransport } from '@syncpty/transport';
import { Protocol, PacketType } from '@syncpty/protocol';

const program = new Command();

program
  .name('syncpty-client')
  .argument('<port>', 'Local port to proxy stream link')
  .action(async (port) => {
    console.log(`\x1b[36m[Client]\x1b[0m Booting proxy connection to port ${port}...`);

    const transport = new LocalTransport({ isHost: false, port: parseInt(port) });
    
    try {
      await transport.connect();
      console.log(`[✓] Proxy Pipeline Secured. Entering raw terminal mode...`);
      
      // 1. Enter Raw Mode: Trap terminal state entirely
      process.stdin.setRawMode(true);
      process.stdin.resume();

      // Send an initial resize packet so host syncs console dimension metrics immediately [cite: 16, 38]
      const initialResize = Protocol.serialize(PacketType.RESIZE, {
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24
      });
      transport.send(initialResize);

      // 2. LISTEN FOR LOCAL KEYSTROKES (OUTBOUND)
      process.stdin.on('data', (chunk) => {
        const inputStr = chunk.toString();

        // Custom Escape Sequence: Ctrl+] (\u001d) severing client cleanly without killing host
        if (inputStr === '\u001d') {
          cleanupTerminal();
          console.log('\n\r\x1b[33m[Client] Detached cleanly from remote session.\x1b[0m\n');
          process.exit(0);
        }

        // Serialize keystroke data safely using binary schema
        const packet = Protocol.serialize(PacketType.INPUT, inputStr);
        transport.send(packet);
      });

      // 3. LISTEN FOR INBOUND BINARY TERMINAL STREAM (INBOUND)
      transport.onData((buffer) => {
        try {
          const packet = Protocol.deserialize(buffer);

          if (packet.type === PacketType.OUTPUT) {
            // Draw raw terminal bytes from the host to our local screen
            process.stdout.write(packet.payload);
          } else if (packet.type === PacketType.CLOSE) {
            cleanupTerminal();
            console.log('\n\r\x1b[31m[!] Host disconnected session.\x1b[0m\n');
            process.exit(0);
          }
        } catch (err) {
          // Keep loop streaming on malformed binary fragments
        }
      });

      // Listen for local client terminal resizing while session is active
      process.stdout.on('resize', () => {
        const resizePacket = Protocol.serialize(PacketType.RESIZE, {
          cols: process.stdout.columns || 80,
          rows: process.stdout.rows || 24
        });
        transport.send(resizePacket);
      });

    } catch (err: any) {
      console.error(`\x1b[31mConnection error:\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

function cleanupTerminal() {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  // Clear layout and reset Unix terminal parameters cleanly [cite: 34, 50]
  process.stdout.write('\x1b[0m'); 
}

program.parse(process.argv);