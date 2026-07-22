import { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
const BACKEND_PORT = 3001;

function startBackend(): Promise<void> {
    return new Promise((resolve) => {
        const backendPath = path.resolve(__dirname, '..', 'api', 'server.ts');
        backendProcess = spawn('npx', ['tsx', backendPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: String(BACKEND_PORT) },
        });
        backendProcess.stdout?.on('data', (data: Buffer) => {
            if (data.toString().includes('Server ready')) resolve();
        });
        backendProcess.stderr?.on('data', (data: Buffer) => {
            if (data.toString().includes('Server ready')) resolve();
        });
        setTimeout(() => resolve(), 15000);
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        minWidth: 1000, minHeight: 600,
        frame: false,
        backgroundColor: '#0F172A',
        webPreferences: {
            preload: path.resolve(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        await new Promise(r => setTimeout(r, 5000));
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('close', (e) => {
        if (!isDev) { e.preventDefault(); mainWindow?.hide(); }
    });
}

function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.resolve(__dirname, '..', 'public', 'favicon.svg')));
    tray.setToolTip('小红蚁 - 小红书运营助手');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: '打开', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: '退出', click: () => { tray?.destroy(); backendProcess?.kill(); app.quit(); } },
    ]));
    tray.on('double-click', () => mainWindow?.show());
}

function setupIPC() {
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
    ipcMain.on('window:close', () => mainWindow?.close());
    ipcMain.handle('get:backendPort', () => BACKEND_PORT);
    ipcMain.on('notification:show', (_, { title, body }) => new Notification({ title, body }).show());
}

app.whenReady().then(async () => {
    setupIPC();
    createTray();
    console.log('[Electron] Starting backend...');
    await startBackend();
    console.log('[Electron] Backend ready');
    await createWindow();
    globalShortcut.register('CommandOrControl+Shift+X', () => mainWindow?.show());
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { backendProcess?.kill(); app.quit(); } });
app.on('before-quit', () => { backendProcess?.kill(); globalShortcut.unregisterAll(); });