#!/usr/bin/env node

const command = process.argv[2];

if (command === "share") {
  console.log("🚀 Booting SyncPTY Host...");
  require("@syncpty/host-agent/dist/index.js"); 
} else if (command === "connect") {
  console.log("🚀 Booting SyncPTY Client...");
  require("@syncpty/cli-client/dist/index.js");
} else {
  console.log(`
Usage:
  syncpty share      - Start a host session
  syncpty connect    - Join a host session
  `);
  process.exit(1);
}