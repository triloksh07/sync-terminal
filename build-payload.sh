#!/bin/bash

echo "🧹 1. Cleaning old payload..."
rm -rf payload
mkdir -p payload/node_modules/@syncpty

echo "📦 2. Copying internal monorepo packages..."
# We copy the dist folders and package.json files directly into the payload's node_modules
# This perfectly tricks Node into resolving them natively without symlinks.

# Transport
mkdir -p payload/node_modules/@syncpty/transport
cp -r packages/transport/dist payload/node_modules/@syncpty/transport/
cp packages/transport/package.json payload/node_modules/@syncpty/transport/

# Client Core
mkdir -p payload/node_modules/@syncpty/client-core
cp -r packages/client-core/dist payload/node_modules/@syncpty/client-core/
cp packages/client-core/package.json payload/node_modules/@syncpty/client-core/

# PTY Core
mkdir -p payload/node_modules/@syncpty/pty-core
cp -r packages/pty-core/dist payload/node_modules/@syncpty/pty-core/
cp packages/pty-core/package.json payload/node_modules/@syncpty/pty-core/

# Host Agent
mkdir -p payload/node_modules/@syncpty/host-agent
cp -r apps/host-agent/dist payload/node_modules/@syncpty/host-agent/
cp apps/host-agent/package.json payload/node_modules/@syncpty/host-agent/

# CLI Client
mkdir -p payload/node_modules/@syncpty/cli-client
cp -r apps/cli-client/dist payload/node_modules/@syncpty/cli-client/
cp apps/cli-client/package.json payload/node_modules/@syncpty/cli-client/

echo "🚀 3. Setting up the CLI Entry Point..."
cp apps/cli/dist/index.js payload/syncpty.js

echo "⚙️ 4. Installing External Dependencies & Native Bindings..."
# We run a fresh, isolated install INSIDE the payload folder.
# This forces the package manager to download the real files and compile the C++ 
# bindings specifically for this folder, ensuring absolutely zero symlinks.
cd payload

# Create a minimal package.json just for the external dependencies
cat <<EOF > package.json
{
  "name": "syncpty-payload",
  "private": true,
  "dependencies": {
    "node-datachannel": "^0.32.3",
    "node-pty": "^1.0.0",
    "ws": "^8.16.0",
    "commander": "^12.0.0"
  }
}
EOF

# Install ONLY production dependencies (Modify the package versions above if yours differ)
pnpm install --ignore-workspace --prod

echo "✅ Payload built successfully."