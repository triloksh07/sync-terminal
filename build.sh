#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

echo "🧹 1. Cleaning old payload..."
rm -rf payload
mkdir -p payload/node_modules/@syncpty

echo "📦 2. Copying internal monorepo packages..."

# Helper function to copy internal modules safely
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

echo "🚀 3. Setting up the CLI Entry Point..."
cp apps/cli/dist/index.js payload/syncpty.js

echo "⚙️ 4. Generating OS-Agnostic dependencies..."
cd payload

# We use a Here-Doc to create a temporary Node script.
# This prevents Bash quote-escaping nightmares and ensures it runs perfectly on Windows runners.
cat << 'EOF' > build_pkg.js
const fs = require("fs");
const path = require("path");

// Recursively find package.json files, ignoring dist and node_modules
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

// Start search from the root of the project (one level up from /payload)
const files = [...findPackages("../apps"), ...findPackages("../packages")];

let allDeps = {};

files.forEach(file => {
  try {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pkg.dependencies) {
      Object.assign(allDeps, pkg.dependencies);
    }
  } catch(e) {
    console.error(`Error reading ${file}:`, e.message);
  }
});

// Remove internal workspace modules from the final list
Object.keys(allDeps).forEach(key => {
  if (key.startsWith("@syncpty/") || allDeps[key].includes("workspace:")) {
    delete allDeps[key];
  }
});

// Force specific strict versions for native binary packages
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

# Execute the script to generate package.json, then clean it up
node build_pkg.js
rm build_pkg.js

echo "📥 5. Installing External Dependencies & Native Bindings..."
# Install everything extracted using the generated package.json
pnpm install --ignore-workspace --prod

# echo "🔨 6. Compiling C++ Native Addons (Optional overrides)..."
# pnpm rebuild node-datachannel
# cd node_modules/node-pty
# npx node-gyp rebuild

echo "✅ Payload built successfully."
