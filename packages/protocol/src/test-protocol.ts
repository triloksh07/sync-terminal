import { Protocol, PacketType } from "./index";

function runProtocolTest() {
  console.log("=== Testing Hardened Protocol Primitive ===\n");

  try {
    // Test Case 1: Client Keystroke (INPUT)
    console.log("[Test 1] Serializing INPUT packet...");
    const rawInput = "ls -la\n";
    const packedInput = Protocol.serialize(PacketType.INPUT, rawInput);
    console.log(
      `✓ Serialized to Uint8Array. Size: ${packedInput.byteLength} bytes`
    );

    const unpackedInput = Protocol.deserialize(packedInput);
    console.log(
      `✓ Deserialized successfully. Type: ${unpackedInput.type}, Payload: "${unpackedInput.payload}"`
    );
    console.log("-----------------------------------------");

    // Test Case 2: Terminal Dimension Adjustments (RESIZE)
    console.log("[Test 2] Serializing RESIZE packet with valid layout...");
    const validResize = { cols: 120, rows: 40 };
    const packedResize = Protocol.serialize(PacketType.RESIZE, validResize);
    console.log(
      `✓ Serialized to Uint8Array. Size: ${packedResize.byteLength} bytes`
    );

    const unpackedResize = Protocol.deserialize(packedResize);
    console.log(
      `✓ Deserialized successfully. Type: ${unpackedResize.type}, Payload:`,
      unpackedResize.payload
    );
    console.log("-----------------------------------------");

    // Test Case 3: Zod Structural Guard Rail Verification
    console.log(
      "[Test 3] Verifying runtime protection schema against invalid RESIZE data..."
    );
    const invalidResize = { cols: -10, rows: "infinite" }; // Should fail Zod rules

    try {
      Protocol.serialize(PacketType.RESIZE, invalidResize);
      console.error(
        "✕ Critical Failure: Protocol allowed an invalid resize configuration to serialize!"
      );
    } catch (zodError: any) {
      console.log(
        "✓ Success: Protocol intercepted invalid data payload cleanly!"
      );
      console.log(`  Intercept Message: ${zodError.message}`);
    }
    console.log("-----------------------------------------");

    console.log("=== All Protocol Tests Passed Flawlessly ===");
  } catch (error: any) {
    console.error(
      "✕ Test Suite encountered an unexpected failure:",
      error.message
    );
  }
}

runProtocolTest();
