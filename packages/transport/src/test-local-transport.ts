import { LocalTransport } from "./index";

async function runTransportTest() {
  console.log("=== Testing Hardened Local Transport Primitive ===\n");

  const TEST_PORT = 4999;
  const TEST_HOST = "127.0.0.1";

  // 1. Instantiate Host Transport Server Layer
  const hostTransport = new LocalTransport({
    isHost: true,
    port: TEST_PORT,
    host: TEST_HOST,
  });

  // 2. Instantiate Client Transport Proxy Layer
  const clientTransport = new LocalTransport({
    isHost: false,
    port: TEST_PORT,
    host: TEST_HOST,
  });

  // Secure connection state indicators
  let hostReceivedData = false;
  let clientReceivedDisconnect = false;

  try {
    // Start the Host Server Gateway listening on port
    await hostTransport.connect();
    console.log("[Host] Listening server loop initialized safely...");

    // Hook up Host incoming event listeners
    hostTransport.onData((array) => {
      const message = new TextDecoder().decode(array);
      console.log(`[Host] Received Byte Stream Chunk: "${message}"`);
      hostReceivedData = true;

      // Echo a response back to the client immediately
      const responseBytes = new TextEncoder().encode("ACK: Handshake Verified");
      hostTransport.send(responseBytes);
    });

    hostTransport.onClose(() => {
      console.log("[Host Notification] Client disconnected from pipe.");
    });

    // 3. Dial the Client into the Host Gateway
    console.log("[Client] Dialing host proxy gate...");
    await clientTransport.connect();
    console.log("[Client] Connection pipeline established successfully!");

    // Hook up Client incoming event listeners
    clientTransport.onData((array) => {
      const reply = new TextDecoder().decode(array);
      console.log(`[Client] Received Host Reply: "${reply}"`);
    });

    clientTransport.onClose(() => {
      console.log("[Client Notification] Socket pipeline severed cleanly.");
      clientReceivedDisconnect = true;
    });

    // 4. TRANSMISSION VERIFICATION: Send raw text packed into Uint8Arrays
    console.log("\n[Client] Transmitting initialization knock payload...");
    const knockPayload = new TextEncoder().encode(
      "KNOCK: trilok@asus-tuf-gaming-f15"
    );
    clientTransport.send(knockPayload);

    // Wait 1 second to watch the bi-directional echo loop execute, then close down
    setTimeout(() => {
      console.log("\n=== Initiating Teardown Lifecycle Verification ===");

      if (!hostReceivedData) {
        console.error(
          "✕ Failure: Host failed to intercept client stream bytes."
        );
        process.exit(1);
      }

      console.log("[Client] Executing explicit close execution loop...");
      clientTransport.close();

      // Give the OS network loop 100ms to process the FIN packet execution
      setTimeout(() => {
        hostTransport.close();
        console.log(
          "\n=== All Transport Verification Tests Passed Flawlessly ==="
        );
        process.exit(0);
      }, 100);
    }, 1000);
  } catch (error: any) {
    console.error("✕ Test Suite encountered network error:", error.message);
    hostTransport.close();
    clientTransport.close();
    process.exit(1);
  }
}

runTransportTest();
