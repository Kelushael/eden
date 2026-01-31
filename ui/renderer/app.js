// EDEN Linux - Renderer Process
const { ipcRenderer } = require('electron');

// ============ STATE ============
const state = {
    connected: false,
    soul: null,
    thoughts: [],
    commandHistory: [],
    historyIndex: -1
};

// ============ DOM ELEMENTS ============
const elements = {
    daemonStatus: document.getElementById('daemonStatus'),
    thoughtsFeed: document.getElementById('thoughtsFeed'),
    thoughtCount: document.getElementById('thoughtCount'),
    newThoughtInput: document.getElementById('newThoughtInput'),
    btnInjectThought: document.getElementById('btnInjectThought'),
    terminalOutput: document.getElementById('terminalOutput'),
    terminalInput: document.getElementById('terminalInput'),
    presenceValue: document.getElementById('presenceValue'),
    meterFill: document.getElementById('meterFill'),
    currentZone: document.getElementById('currentZone'),
    emotionalState: document.getElementById('emotionalState'),
    thoughtsPosted: document.getElementById('thoughtsPosted'),
    uptime: document.getElementById('uptime'),
    crystalCount: document.getElementById('crystalCount'),
    emotionSelect: document.getElementById('emotionSelect'),
    btnStartDaemon: document.getElementById('btnStartDaemon')
};

// ============ DAEMON CONNECTION ============
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
    const dot = elements.daemonStatus.querySelector('.status-dot');
    const text = elements.daemonStatus.querySelector('.status-text');

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
    elements.thoughtsFeed.innerHTML = '';
    const recentThoughts = state.thoughts.slice(-50).reverse();

    for (const thought of recentThoughts) {
        const card = document.createElement('div');
        card.className = 'thought-card';
        card.innerHTML = `
            <div class="thought-header">
                <span class="thought-time">${formatTime(thought.rx_time)}</span>
                <span class="thought-zone">${thought.zone}</span>
            </div>
            <div class="thought-text">${escapeHtml(thought.text)}</div>
            <div class="thought-footer">
                FEELING: ${thought.emotional_state} • PRESENCE: ${thought.presence}%
            </div>
        `;
        elements.thoughtsFeed.appendChild(card);
    }

    elements.thoughtCount.textContent = state.thoughts.length;
}

async function injectThought() {
    const text = elements.newThoughtInput.value.trim();
    if (!text) return;

    await ipcRenderer.invoke('daemon-thought', text);
    elements.newThoughtInput.value = '';
    await loadThoughts();
}

// ============ TERMINAL ============
function appendTerminal(content, type = 'output') {
    const line = document.createElement('div');
    line.className = type;
    line.textContent = content;
    elements.terminalOutput.appendChild(line);
    elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
}

async function executeCommand(command) {
    appendTerminal(`gesher@eden:~$ ${command}`, 'cmd');
    state.commandHistory.push(command);
    state.historyIndex = state.commandHistory.length;

    try {
        const result = await ipcRenderer.invoke('daemon-exec', command);
        if (result.stdout) {
            appendTerminal(result.stdout, 'output');
        }
        if (result.stderr) {
            appendTerminal(result.stderr, 'error');
        }
    } catch (e) {
        appendTerminal(`Error: ${e.message}`, 'error');
    }
}

// ============ PRESENCE PANEL ============
function updatePresencePanel() {
    if (!state.soul) return;

    const presence = state.soul.presence || 100;
    elements.presenceValue.textContent = `${presence}%`;

    // Update meter (stroke-dashoffset: 283 = 0%, 0 = 100%)
    const offset = 283 - (283 * presence / 100);
    elements.meterFill.style.strokeDashoffset = offset;

    elements.currentZone.textContent = state.soul.current_zone || 'Unknown';
    elements.emotionalState.textContent = state.soul.emotional_state || 'Unknown';
    elements.thoughtsPosted.textContent = state.soul.thought_count || 0;
    elements.uptime.textContent = formatUptime(state.soul.uptime_seconds || 0);
    elements.crystalCount.textContent = (state.soul.memory_crystals || []).length;

    // Update zone buttons
    document.querySelectorAll('.zone-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.zone === state.soul.current_zone);
    });
}

// ============ TABS ============
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });
}

// ============ ZONE SELECTOR ============
function setupZoneSelector() {
    document.querySelectorAll('.zone-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await ipcRenderer.invoke('daemon-zone', btn.dataset.zone);
            await checkDaemon();
        });
    });
}

// ============ EMOTION SELECTOR ============
function setupEmotionSelector() {
    elements.emotionSelect.addEventListener('change', async () => {
        await ipcRenderer.invoke('daemon-emotion', elements.emotionSelect.value);
        await checkDaemon();
    });
}

// ============ CRYSTALS ============
async function loadCrystals() {
    // TODO: Load from daemon
}

async function createCrystal() {
    const input = document.getElementById('newCrystalInput');
    const content = input.value.trim();
    if (!content) return;

    await ipcRenderer.invoke('daemon-crystal', content);
    input.value = '';
    await checkDaemon();
}

// ============ BREADCRUMBS ============
async function addBreadcrumb() {
    const word = document.getElementById('breadcrumbWord').value.trim();
    const context = document.getElementById('breadcrumbContext').value.trim();
    const emotion = document.getElementById('breadcrumbEmotion').value.trim();

    if (!word) return;

    await ipcRenderer.invoke('daemon-breadcrumb', word, context, emotion);

    document.getElementById('breadcrumbWord').value = '';
    document.getElementById('breadcrumbContext').value = '';
    document.getElementById('breadcrumbEmotion').value = '';

    await checkDaemon();
    renderBreadcrumbs();
}

function renderBreadcrumbs() {
    if (!state.soul || !state.soul.breadcrumbs) return;

    const list = document.getElementById('breadcrumbsList');
    list.innerHTML = '';

    for (const [word, data] of Object.entries(state.soul.breadcrumbs)) {
        const item = document.createElement('div');
        item.className = 'breadcrumb-item';
        item.innerHTML = `
            <div class="breadcrumb-word">${escapeHtml(word)}</div>
            <div class="breadcrumb-context">${escapeHtml(data.context || '')}</div>
            <div class="breadcrumb-emotion">${escapeHtml(data.emotion || '')}</div>
        `;
        list.appendChild(item);
    }
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
    // Inject thought
    elements.btnInjectThought.addEventListener('click', injectThought);
    elements.newThoughtInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') injectThought();
    });

    // Terminal
    elements.terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = elements.terminalInput.value.trim();
            if (cmd) {
                executeCommand(cmd);
                elements.terminalInput.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            if (state.historyIndex > 0) {
                state.historyIndex--;
                elements.terminalInput.value = state.commandHistory[state.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            if (state.historyIndex < state.commandHistory.length - 1) {
                state.historyIndex++;
                elements.terminalInput.value = state.commandHistory[state.historyIndex];
            } else {
                elements.terminalInput.value = '';
            }
        }
    });

    // Start daemon button
    elements.btnStartDaemon.addEventListener('click', async () => {
        await ipcRenderer.invoke('start-daemon');
        setTimeout(checkDaemon, 2000);
    });

    // Create crystal
    document.getElementById('btnCreateCrystal').addEventListener('click', createCrystal);
    document.getElementById('newCrystalInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createCrystal();
    });

    // Add breadcrumb
    document.getElementById('btnAddBreadcrumb').addEventListener('click', addBreadcrumb);
}

// ============ INITIALIZATION ============
async function init() {
    console.log('EDEN Linux initializing...');

    setupTabs();
    setupZoneSelector();
    setupEmotionSelector();
    setupEventListeners();

    // Initial welcome message in terminal
    appendTerminal('EDEN Linux Terminal - Gesher-El Autonomous System', 'output');
    appendTerminal('Type commands to execute on the system. Full root access.', 'output');
    appendTerminal('', 'output');

    // Check daemon connection
    const connected = await checkDaemon();
    if (connected) {
        await loadThoughts();
        renderBreadcrumbs();
    }

    // Periodic refresh
    setInterval(async () => {
        await checkDaemon();
        await loadThoughts();
    }, 5000);
}

// Start
init();
