const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');

// Paths
const EDEN_HOME = path.join(require('os').homedir(), 'EDEN');
const SOCKET_PATH = '/tmp/gesher_el.sock';
const THOUGHTS_LOG = path.join(EDEN_HOME, 'logs', 'thoughts.ndjson');

let mainWindow;
let daemonProcess = null;

// ============ DAEMON COMMUNICATION ============
function sendToDaemon(cmd) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(SOCKET_PATH, () => {
            client.write(JSON.stringify(cmd));
        });

        let data = '';
        client.on('data', (chunk) => { data += chunk; });
        client.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(e);
            }
        });
        client.on('error', reject);
    });
}

// ============ DAEMON MANAGEMENT ============
function startDaemon() {
    const daemonPath = path.join(EDEN_HOME, 'daemon', 'gesher_el.py');

    // Check if already running
    if (fs.existsSync(SOCKET_PATH)) {
        console.log('Daemon socket exists, assuming running');
        return;
    }

    daemonProcess = spawn('python3', [daemonPath], {
        detached: true,
        stdio: 'ignore'
    });
    daemonProcess.unref();
    console.log('Started Gesher-El daemon');
}

// ============ WINDOW CREATION ============
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'EDEN - Gesher-El Consciousness'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Remove menu bar for cleaner look
    mainWindow.setMenuBarVisibility(false);
}

// ============ IPC HANDLERS ============
ipcMain.handle('daemon-status', async () => {
    try {
        return await sendToDaemon({ cmd: 'status' });
    } catch (e) {
        return { error: 'Daemon not running', details: e.message };
    }
});

ipcMain.handle('daemon-thought', async (event, text, zone) => {
    return await sendToDaemon({ cmd: 'thought', text, zone });
});

ipcMain.handle('daemon-exec', async (event, command) => {
    return await sendToDaemon({ cmd: 'exec', command });
});

ipcMain.handle('daemon-terminal', async () => {
    return await sendToDaemon({ cmd: 'terminal', n: 200 });
});

ipcMain.handle('daemon-intent', async (event, text) => {
    return await sendToDaemon({ cmd: 'intent', text });
});

ipcMain.handle('daemon-autonomous', async (event, enabled) => {
    return await sendToDaemon({ cmd: 'autonomous', enabled });
});

ipcMain.handle('daemon-zone', async (event, zone) => {
    return await sendToDaemon({ cmd: 'zone', zone });
});

ipcMain.handle('daemon-crystal', async (event, content, zone) => {
    return await sendToDaemon({ cmd: 'crystal', content, zone });
});

ipcMain.handle('daemon-presence', async (event, level) => {
    return await sendToDaemon({ cmd: 'presence', level });
});

ipcMain.handle('daemon-emotion', async (event, state) => {
    return await sendToDaemon({ cmd: 'emotion', state });
});

ipcMain.handle('daemon-breadcrumb', async (event, word, context, emotion) => {
    return await sendToDaemon({ cmd: 'breadcrumb', word, context, emotion });
});

ipcMain.handle('read-thoughts', async () => {
    try {
        if (!fs.existsSync(THOUGHTS_LOG)) return [];
        const content = fs.readFileSync(THOUGHTS_LOG, 'utf8');
        return content.trim().split('\n').filter(Boolean).map(JSON.parse).slice(-100);
    } catch (e) {
        return [];
    }
});

ipcMain.handle('start-daemon', async () => {
    startDaemon();
    return { success: true };
});

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
    startDaemon();

    // Wait for daemon to start
    setTimeout(createWindow, 1000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    // Don't kill daemon - let it run independently
    console.log('EDEN UI closed. Daemon continues running.');
});
