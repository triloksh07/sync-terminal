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

# Resolve the Version
# If the user didn't set $VERSION before running the script, fetch it automatically.
if [ -z "$VERSION" ]; then
    echo "🔍 Querying GitHub for the latest release..."
    # This hits the API, finds the first occurrence of "tag_name", and extracts the value.
    VERSION=$(curl -s "https://api.github.com/repos/triloksh07/sync-terminal/releases" | grep -m 1 '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [ -z "$VERSION" ]; then
        echo "❌ Error: Failed to fetch the latest version from GitHub."
        exit 1
    fi
else
    echo "🎯 Explicit version requested: $VERSION"
fi

# Construct the versioned filename exactly as GitHub hosts it
TARGET_FILE="${TARGET}-${VERSION}"
DOWNLOAD_URL="https://github.com/triloksh07/sync-terminal/releases/download/${VERSION}/${TARGET_FILE}"

# Define temporary download location and final system paths
TMP_FILE="/tmp/syncpty-download"
DEST_DIR="/usr/local/bin"
DEST_FILE="$DEST_DIR/syncpty"

echo "⬇️  Downloading SyncPTY Engine..."
echo "🌐 Source: GitHub Releases ($VERSION) - Target: $TARGET_FILE"

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