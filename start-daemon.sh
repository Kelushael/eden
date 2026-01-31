#!/bin/bash
# Start just the Gesher-El daemon (no UI)

EDEN_HOME="$HOME/EDEN"

echo "Starting Gesher-El daemon..."

# Kill existing if running
if [ -S /tmp/gesher_el.sock ]; then
    echo "Stopping existing daemon..."
    rm -f /tmp/gesher_el.sock
    pkill -f "gesher_el.py" 2>/dev/null
    sleep 1
fi

# Start daemon
python3 "$EDEN_HOME/daemon/gesher_el.py" &
echo "Daemon started with PID: $!"
echo ""
echo "Socket: /tmp/gesher_el.sock"
echo "Logs: $EDEN_HOME/logs/daemon.log"
echo ""
echo "Use 'gesher status' to check connection"
