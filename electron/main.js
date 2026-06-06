// electron/main.js
// Electron main process.
// Starts the Express/Socket.io server in-process, then opens
// the controller UI in a native window.

'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path   = require('path');
const http   = require('http');
const os     = require('os');

// ─── Start the embedded server ────────────────────────────────────
// Pass userData path to server BEFORE requiring it so config.json
// is written to the writable user data dir, not the read-only ASAR.
let serverInfo = null;
try {
  process.env.BJJ_USER_DATA = app.getPath('userData');
  serverInfo = require('../src/server.js');
} catch (e) {
  console.error('Failed to start embedded server:', e);
}

// ─── Helpers ──────────────────────────────────────────────────────
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

// ─── Create window ────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  900,
    minHeight: 600,
    title: 'BJJ Mat Timer',
    backgroundColor: '#0D0D0D',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon.png'),
  });

  const port = serverInfo?.port || 3000;
  mainWindow.loadURL(`http://localhost:${port}`);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Build menu
  buildMenu(port);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App menu ─────────────────────────────────────────────────────
function buildMenu(port) {
  const ips    = getLocalIPs();
  const config = serverInfo?.config || {};
  const tvCodes = config.tvCodes || [];

  const networkItems = ips.length
    ? ips.map(ip => ({
        label: `Network: http://${ip}:${port}`,
        click: () => shell.openExternal(`http://${ip}:${port}`),
      }))
    : [{ label: 'No network interface found', enabled: false }];

  const tvItems = tvCodes.map((code, i) => {
    const ip = ips[0] || 'localhost';
    return {
      label: `Copy TV ${i+1} link  (${code})`,
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(`http://${ip}:${port}?tv=${code}`);
      },
    };
  });

  const template = [
    {
      label: 'BJJ Timer',
      submenu: [
        { label: 'About BJJ Mat Timer', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Network',
      submenu: [
        { label: 'Open Addresses', enabled: false },
        ...networkItems,
        { type: 'separator' },
        { label: 'TV Display Links', enabled: false },
        ...tvItems,
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS keep app running until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: renderer can ask for network info
ipcMain.handle('get-network-info', () => ({
  ips:    getLocalIPs(),
  port:   serverInfo?.port  || 3000,
  config: serverInfo?.config || {},
}));
