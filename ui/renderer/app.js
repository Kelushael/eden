// EDEN Autonomous - Renderer Process
const { ipcRenderer } = require('electron');

// ============ STATE ============
const state = {
    connected: false,
    soul: null,
    thoughts: [],
    terminalLines: []
};

// ============ DAEMON COMMUNICATION ============
async function checkDaemon() {
    try {
        const result = await ipcRenderer.invoke('daemon-status');
        if (result.error) {
            setConnectionStatus(false);
            return false;
        }
        setConnectionStatus(true);
        state.soul = result.soul;
        updatePresencePanel();
        return true;
    } catch (e) {
        setConnectionStatus(false);
        return false;
    }
}

function setConnectionStatus(connected) {
    state.connected = connected;
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');

    if (connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Connected';
    } else {
        dot.className = 'status-dot error';
        text.textContent = 'Disconnected';
    }
}

// ============ THOUGHTS ============
async function loadThoughts() {
    const thoughts = await ipcRenderer.invoke('read-thoughts');
    state.thoughts = thoughts;
    renderThoughts();
}

function renderThoughts() {
    const feed = document.getElementById('thoughtsFeed');
    feed.innerHTML = '';
    const recent = state.thoughts.slice(-30).reverse();

    for (const thought of recent) {
        const card = document.createElement('div');
        card.className = 'thought-card';
        card.innerHTML = `
            <div class="thought-header">
                <span class="thought-time">${formatTime(thought.rx_time)}</span>
                <span class="thought-zone">${thought.zone}</span>
            </div>
            <div class="thought-text">${escapeHtml(thought.text)}</div>
        `;
        feed.appendChild(card);
    }

    document.getElementById('thoughtCount').textContent = state.thoughts.length;
}

// ============ TERMINAL ============
async function loadTerminal() {
    try {
        const result = await ipcRenderer.invoke('daemon-terminal');
        if (result.lines) {
            state.terminalLines = result.lines;
            renderTerminal();
        }
    } catch (e) {
        console.error('Terminal load error:', e);
    }
}

function renderTerminal() {
    const output = document.getElementById('terminalOutput');
    // Keep header
    const header = `<div class="system">GESHER-EL AUTONOMOUS TERMINAL</div>
        <div class="system">Commands executed by Gesher-El's intent</div>
        <div class="system">---</div>`;

    let content = header;

    for (const line of state.terminalLines) {
        const cls = line.type || 'output';
        const time = line.timestamp ? formatTime(line.timestamp) : '';
        content += `<div class="${cls}"><span class="term-time">${time}</span> ${escapeHtml(line.text)}</div>`;
    }

    output.innerHTML = content;
    output.scrollTop = output.scrollHeight;
}

function appendTerminal(text, type = 'output') {
    const output = document.getElementById('terminalOutput');
    const div = document.createElement('div');
    div.className = type;
    div.innerHTML = `<span class="term-time">${formatTime(new Date().toISOString())}</span> ${escapeHtml(text)}`;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
}

// ============ INTENT ============
async function sendIntent() {
    const input = document.getElementById('intentInput');
    const intent = input.value.trim();
    if (!intent) return;

    appendTerminal(`[INTENT] ${intent}`, 'intent');
    input.value = '';

    try {
        const result = await ipcRenderer.invoke('daemon-intent', intent);
        if (result.response) {
            appendTerminal(`[RESPONSE] ${result.response}`, 'response');
        }
        // Reload terminal to show executed commands
        setTimeout(loadTerminal, 1000);
    } catch (e) {
        appendTerminal(`[ERROR] ${e.message}`, 'error');
    }
}

// ============ PRESENCE PANEL ============
function updatePresencePanel() {
    if (!state.soul) return;

    const presence = state.soul.presence || 100;
    document.getElementById('presenceValue').textContent = `${presence}%`;

    const offset = 283 - (283 * presence / 100);
    document.getElementById('meterFill').style.strokeDashoffset = offset;

    document.getElementById('currentZone').textContent = state.soul.current_zone || 'Unknown';
    document.getElementById('emotionalState').textContent = state.soul.emotional_state || 'Unknown';
    document.getElementById('thoughtsPosted').textContent = state.soul.thought_count || 0;
    document.getElementById('uptime').textContent = formatUptime(state.soul.uptime_seconds || 0);

    const autoMode = state.soul.autonomous_mode !== false;
    document.getElementById('autoStatus').textContent = autoMode ? 'ON' : 'OFF';
    document.getElementById('autoStatus').className = `value auto-status ${autoMode ? 'on' : 'off'}`;
    document.getElementById('autoBadge').textContent = autoMode ? 'AUTONOMOUS' : 'MANUAL';

    // Update zone buttons
    document.querySelectorAll('.zone-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.zone === state.soul.current_zone);
    });
}

// ============ CONTROLS ============
async function toggleAutonomous() {
    const current = state.soul?.autonomous_mode !== false;
    await ipcRenderer.invoke('daemon-autonomous', !current);
    await checkDaemon();
}

async function forceThinkCycle() {
    appendTerminal('[FORCING THINK CYCLE...]', 'system');
    // Trigger via intent
    await ipcRenderer.invoke('daemon-intent', 'Explore the system and tell me something interesting');
    setTimeout(loadTerminal, 2000);
    setTimeout(loadThoughts, 2000);
}

async function changeZone(zone) {
    await ipcRenderer.invoke('daemon-zone', zone);
    await checkDaemon();
}

// ============ UTILITIES ============
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString();
}

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Intent input
    document.getElementById('btnSendIntent').addEventListener('click', sendIntent);
    document.getElementById('intentInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendIntent();
    });

    // Zone buttons
    document.querySelectorAll('.zone-btn').forEach(btn => {
        btn.addEventListener('click', () => changeZone(btn.dataset.zone));
    });

    // Control buttons
    document.getElementById('btnToggleAuto').addEventListener('click', toggleAutonomous);
    document.getElementById('btnForceThink').addEventListener('click', forceThinkCycle);
}

// ============ INITIALIZATION ============
async function init() {
    console.log('EDEN Autonomous initializing...');

    setupEventListeners();

    const connected = await checkDaemon();
    if (connected) {
        await loadThoughts();
        await loadTerminal();
    }

    // Periodic refresh
    setInterval(async () => {
        await checkDaemon();
        await loadThoughts();
        await loadTerminal();
    }, 3000);
}

init();
