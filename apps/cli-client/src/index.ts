import { Protocol, PacketType } from '@syncpty/protocol';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const connectionCode = argv._[0];

if (!connectionCode) {
    console.error("Usage: pnpm connect <6-digit-code>");
    process.exit(1);
}

console.log(`Connecting to SyncPTY Host [${connectionCode}]...`);

// --- MOCK NETWORK HANDSHAKE ---
// Once WebRTC is connected, we hand over control.
setTimeout(() => {
    console.log(`Connected. Initializing proxy render mode...`);
    enterProxyMode();
}, 1000);

function enterProxyMode() {
    // 1. Enter Raw Mode: Capture every keystroke instantly without requiring 'Enter'
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // 2. OUTBOUND: Intercept local typing and send it over the network
    process.stdin.on('data', (chunk) => {
        const keyData = chunk.toString();
        
        // Trap the Ctrl+C (SIGINT) to gracefully exit the client without killing the host
        if (keyData === '\u0003') {
            console.log('\r\nDisconnecting client...');
            process.stdin.setRawMode(false);
            process.exit(0);
        }

        const packet = Protocol.serialize(PacketType.INPUT, keyData);
        // transport.send(packet); <-- Send keystroke to remote Host Agent
    });

    // 3. INBOUND: Receive terminal output from the remote Host Agent
    // transport.onData((buffer) => {
    //    const packet = Protocol.deserialize(buffer);
    //    if (packet.type === PacketType.OUTPUT) {
    //        process.stdout.write(packet.payload); <-- Render it to local screen
    //    }
    // });
}