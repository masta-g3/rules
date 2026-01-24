#!/bin/bash
# Install pv/fv - Portfolio & Feature Viewer
# Usage: ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"

# Create install directory if needed
mkdir -p "$INSTALL_DIR"

# Install pv
cp "$SCRIPT_DIR/pv" "$INSTALL_DIR/pv"
chmod +x "$INSTALL_DIR/pv"

# Create fv symlink
rm -f "$INSTALL_DIR/fv"
ln -sf pv "$INSTALL_DIR/fv"

echo "Installed:"
echo "  $INSTALL_DIR/pv"
echo "  $INSTALL_DIR/fv -> pv"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "Warning: $INSTALL_DIR is not in your PATH"
    echo "Add this to your ~/.zshrc or ~/.bashrc:"
    echo ""
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo ""
echo "Usage:"
echo "  pv                    # Portfolio view (scan ~/Code)"
echo "  pv /path/to/dir       # Portfolio view (scan specific dir)"
echo "  pv features.json      # Project view (specific file)"
echo "  fv                    # Project view (./features.json)"
echo ""
echo "Navigation: j/k move, Enter drill down, Esc back, q quit"
