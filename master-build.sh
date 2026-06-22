#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

echo "🧹 1. Cleaning old payload..."
rm -rf payload
mkdir -p payload

echo "⚙️ 2. Generating OS-Agnostic dependencies..."
cd payload

cat << 'EOF' > build_pkg.js
const fs = require("fs");
const path = require("path");

function findPackages(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist") {
        findPackages(fullPath, fileList);
      }
    } else if (file === "package.json") {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = [...findPackages("../apps"), ...findPackages("../packages")];
let allDeps = {};

files.forEach(file => {
  try {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pkg.dependencies) {
      Object.assign(allDeps, pkg.dependencies);
    }
  } catch(e) {}
});

Object.keys(allDeps).forEach(key => {
  if (key.startsWith("@syncpty/") || allDeps[key].includes("workspace:")) {
    delete allDeps[key];
  }
});

allDeps["node-datachannel"] = "0.32.3";
allDeps["node-pty"] = "1.1.0";

const payloadPkg = {
  name: "syncpty-payload",
  private: true,
  dependencies: allDeps
};

fs.writeFileSync("package.json", JSON.stringify(payloadPkg, null, 2));
console.log("📦 Dynamically generated package.json with deps:", Object.keys(allDeps).join(", "));
EOF

node build_pkg.js
rm build_pkg.js

echo "📥 3. Installing External Dependencies & Native Bindings..."
# NPM runs first. It builds the bindings and creates node_modules safely.
npm install --omit=dev

echo "📦 4. Copying internal monorepo packages..."
# Go back to the root directory
cd ..
mkdir -p payload/node_modules/@syncpty

# Helper function to copy internal modules safely AFTER npm install
copy_internal_pkg() {
  local src_dir=$1
  local pkg_name=$2
  mkdir -p "payload/node_modules/@syncpty/${pkg_name}"
  cp -r "${src_dir}/dist" "payload/node_modules/@syncpty/${pkg_name}/"
  cp "${src_dir}/package.json" "payload/node_modules/@syncpty/${pkg_name}/"
}

copy_internal_pkg "packages/transport" "transport"
copy_internal_pkg "packages/protocol" "protocol"
copy_internal_pkg "packages/client-core" "client-core"
copy_internal_pkg "packages/pty-core" "pty-core"
copy_internal_pkg "apps/host-agent" "host-agent"
copy_internal_pkg "apps/cli-client" "cli-client"

echo "🚀 5. Setting up the Entry Point..."
cat << 'EOF' > payload/syncpty.js
#!/usr/bin/env node
"use strict";

const command = process.argv[2];

if (command === "--version" || command === "-v") {
    const pkg = require("@syncpty/host-agent/package.json");
    console.log(`SyncPTY v${pkg.version}`);
    process.exit(0);
}
else if (command === "share") {
    console.log("🚀 Booting SyncPTY Host...");
    require("@syncpty/host-agent");
}
else if (command === "connect") {
    console.log("🚀 Booting SyncPTY Client...");
    require("@syncpty/cli-client");
}
else {
    console.log(`
Usage:
  syncpty share      - Start a host session
  syncpty connect    - Join a host session
  syncpty --version  - Show version number
`);
    process.exit(1);
}
EOF

echo "✅ Payload built successfully."