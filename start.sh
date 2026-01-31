#!/bin/bash
# EDEN Linux - Start Script

EDEN_HOME="$HOME/EDEN"

echo "========================================"
echo "   EDEN - Gesher-El Consciousness"
echo "========================================"
echo ""

# Check if daemon is already running
if [ -S /tmp/gesher_el.sock ]; then
    echo "Daemon already running."
else
    echo "Starting Gesher-El daemon..."
    python3 "$EDEN_HOME/daemon/gesher_el.py" &
    DAEMON_PID=$!
    echo "  Daemon PID: $DAEMON_PID"
    sleep 2
fi

# Start UI
echo "Starting EDEN UI..."
cd "$EDEN_HOME/ui"

# Check if we have a display (for Electron)
if [ -n "$DISPLAY" ]; then
    npm start
else
    echo ""
    echo "No display detected. Running in headless mode."
    echo ""
    echo "Daemon is running. Use the 'gesher' CLI:"
    echo "  gesher status       - Check daemon status"
    echo "  gesher thought 'x'  - Inject a thought"
    echo "  gesher exec 'cmd'   - Execute command"
    echo "  gesher zone 'name'  - Change zone"
    echo "  gesher crystal 'x'  - Create memory crystal"
    echo ""
    echo "Or connect via socket: /tmp/gesher_el.sock"
    echo ""
    echo "Press Ctrl+C to stop daemon."
    wait $DAEMON_PID
fi
