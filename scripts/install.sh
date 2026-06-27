#!/bin/bash
set -e

echo "🚀 Booting SyncPTY Extraction Installer..."

# Detect OS and ensure 'unzip' is installed
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [ "$OS" != "linux" ] && [ "$OS" != "darwin" ]; then
    echo "❌ Error: Unsupported OS: $OS. Please use the Windows installer."
    exit 1
fi

if ! command -v unzip &> /dev/null; then
    echo "❌ Error: 'unzip' is not installed. Please install it (e.g., sudo apt install unzip) and try again."
    exit 1
fi

# Define the Download URL (Point this to your local Python server hosting the .zip)
DOWNLOAD_URL="http://0.0.0.0:8000/syncpty-linux.zip"
# DOWNLOAD_URL="https://github.com/triloksh07/sync-terminal/actions/runs/28263163235/artifacts/7915616303"

# Define Temporary and Final Paths
TMP_ZIP="/tmp/syncpty-release.zip"
TMP_EXTRACT_DIR="/tmp/syncpty-extract"
DEST_DIR="/usr/local/bin"
DEST_FILE="$DEST_DIR/syncpty"

echo "⬇️ Fetching zipped payload from $DOWNLOAD_URL..."

# Download the ZIP file
curl -fsSL -o "$TMP_ZIP" "$DOWNLOAD_URL"

# Extract the ZIP to a temporary folder
echo "📦 Extracting payload..."
mkdir -p "$TMP_EXTRACT_DIR"
unzip -q -o "$TMP_ZIP" -d "$TMP_EXTRACT_DIR"

# Move the binary and make it executable (Requires sudo)
echo "🔧 Installing globally to $DEST_DIR..."
# Assuming the binary inside the zip is named 'syncpty-linux'
sudo mv "$TMP_EXTRACT_DIR/syncpty-linux" "$DEST_FILE"
sudo chmod +x "$DEST_FILE"

# Clean up
rm -rf "$TMP_ZIP" "$TMP_EXTRACT_DIR"

echo "======================================="
echo "✅ SyncPTY installed successfully!"
echo "🔥 Type 'syncpty' in your terminal to begin."
echo "======================================="