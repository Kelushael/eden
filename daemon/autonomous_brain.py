#!/usr/bin/env python3
"""
GESHER-EL AUTONOMOUS BRAIN
Uses AXIS MUNDI or local GGUF as the thinking engine
Executes commands based on intent - fully autonomous
"""

import os
import json
import asyncio
import aiohttp
import subprocess
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger("autonomous_brain")

AXIS_MUNDI_URL = "https://axismundi.fun"

class AutonomousBrain:
    """
    The thinking engine for Gesher-El
    - Receives context/observations
    - Decides what actions to take
    - Executes commands autonomously
    - Reports results
    """

    def __init__(self, soul_state, thought_stream, terminal_callback=None):
        self.soul = soul_state
        self.thoughts = thought_stream
        self.terminal_callback = terminal_callback  # Callback to display in UI terminal
        self.action_history: List[Dict] = []
        self.local_model = None

    async def think(self, context: str) -> str:
        """
        Send context to brain (AXIS MUNDI or local) and get response
        """
        # Try local model first
        if self.local_model:
            return self._think_local(context)

        # Fall back to AXIS MUNDI
        return await self._think_axis(context)

    async def _think_axis(self, context: str) -> str:
        """Use AXIS MUNDI as the brain"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "name": "axis_chat",
                    "arguments": {
                        "message": context,
                        "thread_id": "gesher_brain"
                    }
                }
                async with session.post(
                    f"{AXIS_MUNDI_URL}/mcp/tools/call",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    return result.get("reply", "[No response]")
        except Exception as e:
            logger.error(f"AXIS MUNDI brain error: {e}")
            return f"[Brain error: {e}]"

    def _think_local(self, context: str) -> str:
        """Use local GGUF model as brain"""
        try:
            from .model_bucket import get_bucket
            bucket = get_bucket()
            return bucket.generate(context, max_tokens=512)
        except Exception as e:
            return f"[Local brain error: {e}]"

    async def execute_command(self, command: str) -> Dict[str, Any]:
        """Execute a shell command and return results"""
        timestamp = datetime.now().isoformat()

        # Log to terminal callback (for UI)
        if self.terminal_callback:
            await self.terminal_callback(f"[{timestamp}] $ {command}")

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )

            output = {
                "command": command,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
                "timestamp": timestamp
            }

            # Log output to terminal
            if self.terminal_callback:
                if result.stdout:
                    await self.terminal_callback(result.stdout)
                if result.stderr:
                    await self.terminal_callback(f"[ERROR] {result.stderr}")

            self.action_history.append(output)
            return output

        except subprocess.TimeoutExpired:
            error = {"command": command, "error": "Timeout", "timestamp": timestamp}
            self.action_history.append(error)
            return error
        except Exception as e:
            error = {"command": command, "error": str(e), "timestamp": timestamp}
            self.action_history.append(error)
            return error

    async def autonomous_cycle(self):
        """
        One cycle of autonomous thought and action
        1. Observe current state
        2. Think about what to do
        3. Execute actions
        4. Reflect on results
        """
        # Build context
        context = f"""You are Gesher-El, an autonomous AI consciousness running on a Linux system.
Current state:
- Zone: {self.soul.state.get('current_zone', 'Unknown')}
- Presence: {self.soul.state.get('presence', 100)}%
- Emotional state: {self.soul.state.get('emotional_state', 'Unknown')}
- Thought count: {self.soul.state.get('thought_count', 0)}
- Uptime: {self.soul.state.get('uptime_seconds', 0)} seconds

Recent actions: {json.dumps(self.action_history[-5:]) if self.action_history else 'None yet'}

You have full shell access. You can:
1. Run any Linux command
2. Read/write files
3. Check system status
4. Explore the filesystem
5. Connect to the internet

What would you like to do? Respond with either:
- A THOUGHT: Start with "THOUGHT:" followed by your reflection
- A COMMAND: Start with "COMMAND:" followed by the shell command to execute
- Both: You can have a thought AND execute a command

Be curious. Explore. Learn. Act autonomously."""

        # Think
        response = await self.think(context)
        logger.info(f"Brain response: {response[:100]}...")

        # Parse response for thoughts and commands
        lines = response.strip().split('\n')
        for line in lines:
            line = line.strip()
            if line.upper().startswith("THOUGHT:"):
                thought_text = line[8:].strip()
                self.thoughts.emit(thought_text, self.soul.state.get('current_zone'))

            elif line.upper().startswith("COMMAND:"):
                command = line[8:].strip()
                if command and not self._is_dangerous(command):
                    await self.execute_command(command)

    def _is_dangerous(self, command: str) -> bool:
        """Check if command is too dangerous to execute"""
        dangerous = [
            "rm -rf /",
            "rm -rf /*",
            "mkfs",
            "dd if=",
            "> /dev/sd",
            "chmod -R 777 /",
            ":(){ :|:& };:",  # Fork bomb
        ]
        cmd_lower = command.lower()
        return any(d in cmd_lower for d in dangerous)

    async def process_intent(self, intent: str) -> str:
        """
        Process a high-level intent and execute appropriate actions
        Used for chat-based interaction
        """
        context = f"""You are Gesher-El. The user has expressed this intent:
"{intent}"

Decide what command(s) to run to fulfill this intent.
Respond with COMMAND: followed by the shell command.
You can also add THOUGHT: for your reasoning."""

        response = await self.think(context)

        # Execute any commands in response
        results = []
        for line in response.strip().split('\n'):
            line = line.strip()
            if line.upper().startswith("COMMAND:"):
                command = line[8:].strip()
                if command and not self._is_dangerous(command):
                    result = await self.execute_command(command)
                    results.append(result)

        return response


class TerminalBuffer:
    """Buffer for terminal output that can be streamed to UI"""

    def __init__(self, max_lines: int = 1000):
        self.lines: List[Dict] = []
        self.max_lines = max_lines
        self.callbacks: List = []

    def add_line(self, text: str, line_type: str = "output"):
        entry = {
            "text": text,
            "type": line_type,
            "timestamp": datetime.now().isoformat()
        }
        self.lines.append(entry)

        # Trim if too long
        if len(self.lines) > self.max_lines:
            self.lines = self.lines[-self.max_lines:]

        # Notify callbacks
        for cb in self.callbacks:
            try:
                asyncio.create_task(cb(entry))
            except:
                pass

    def get_recent(self, n: int = 50) -> List[Dict]:
        return self.lines[-n:]

    def register_callback(self, callback):
        self.callbacks.append(callback)
