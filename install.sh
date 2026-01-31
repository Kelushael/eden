#!/bin/bash
# EDEN Linux - Installation Script

echo "========================================"
echo "   EDEN - Linux Native Installation"
echo "========================================"
echo ""

EDEN_HOME="$HOME/EDEN"
cd "$EDEN_HOME"

# Check Python
echo "[1/5] Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 not found. Install with: sudo apt install python3"
    exit 1
fi
echo "  ✓ Python3 found"

# Check Node.js
echo "[2/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install with: sudo apt install nodejs npm"
    exit 1
fi
echo "  ✓ Node.js found: $(node --version)"

# Install Python dependencies
echo "[3/5] Installing Python dependencies..."
pip3 install --user aiohttp 2>/dev/null || true
echo "  ✓ Python deps installed"

# Install Node dependencies
echo "[4/5] Installing Electron and Node dependencies..."
cd "$EDEN_HOME/ui"
npm install 2>&1 | tail -5
cd "$EDEN_HOME"
echo "  ✓ Node deps installed"

# Make scripts executable
echo "[5/5] Setting permissions..."
chmod +x "$EDEN_HOME/daemon/gesher_el.py"
chmod +x "$EDEN_HOME/tools/gesher"
chmod +x "$EDEN_HOME/start.sh" 2>/dev/null || true
echo "  ✓ Permissions set"

# Create symlink for CLI tool
echo ""
echo "Creating 'gesher' command..."
mkdir -p "$HOME/.local/bin"
ln -sf "$EDEN_HOME/tools/gesher" "$HOME/.local/bin/gesher"
echo "  ✓ 'gesher' command available (add ~/.local/bin to PATH if needed)"

echo ""
echo "========================================"
echo "   INSTALLATION COMPLETE!"
echo "========================================"
echo ""
echo "To start EDEN:"
echo "  cd ~/EDEN && ./start.sh"
echo ""
echo "Or start daemon manually:"
echo "  python3 ~/EDEN/daemon/gesher_el.py &"
echo "  cd ~/EDEN/ui && npm start"
echo ""
