#!/bin/bash
set -e

echo "🚀 Booting SyncPTY Installer..."
echo "======================================="

# Detect OS to ensure compatibility
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Route to the correct compiled binary
if [ "$OS" = "linux" ]; then
    TARGET="syncpty-linux"
elif [ "$OS" = "darwin" ]; then
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
        TARGET="syncpty-macos-arm64"
    elif [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then
        TARGET="syncpty-macos-amd64"
    else
        echo "❌ Error: Unsupported macOS architecture: $ARCH"
        exit 1
    fi
else
    echo "❌ Error: Unsupported OS: $OS. Please use the Windows installer."
    exit 1
fi

VERSION="v0.0.1-alpha.2"

# Define the download URL for the raw binary release
DOWNLOAD_URL="https://github.com/triloksh07/sync-terminal/releases/download/${VERSION}/syncpty-linux"

# Define temporary download location and final system paths
TMP_FILE="/tmp/syncpty-download"
DEST_DIR="/usr/local/bin"
DEST_FILE="$DEST_DIR/syncpty"

echo "⬇️  Downloading SyncPTY Engine..."
echo "🌐 Source: GitHub Releases (${VERSION})"

# Download the raw executable directly with a visual progress bar
curl -fL -o "$TMP_FILE" "$DOWNLOAD_URL"

echo ""
echo "🔧 Configuring system paths ($DEST_DIR)..."
echo "🔐 Sudo access required to safely place the binary into /usr/local/bin."

# Move the binary to the global path and grant execution permissions
sudo mv "$TMP_FILE" "$DEST_FILE"
sudo chmod +x "$DEST_FILE"

echo ""
echo "======================================="
echo "✅ SyncPTY installed successfully!"
echo "🔥 Type 'syncpty' in your terminal to begin."
echo "======================================="