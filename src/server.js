// src/server.js
// Express + Socket.io server.
// When required by Electron it starts listening and exports { port, config }.
// Can also be run standalone:  node src/server.js

'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');

// ─── Resolve paths robustly ───────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR   = path.join(PROJECT_ROOT, 'public');
const PORT         = parseInt(process.env.PORT || '3000', 10);

// Config directory:
//   - Inside Electron (packaged): BJJ_USER_DATA env var = app.getPath('userData')
//     e.g. ~/.config/BJJ Mat Timer/  — writable, survives updates
//   - Dev mode (node src/server.js): project root — easy to inspect
const CONFIG_DIR  = process.env.BJJ_USER_DATA || PROJECT_ROOT;
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure the config directory exists (userData may not exist on first launch)
if (!fs.existsSync(CONFIG_DIR)) {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) {}
}

console.log('[config] storage dir:', CONFIG_DIR);
console.log('[config] file path:  ', CONFIG_FILE);

// ─── Persistent config ────────────────────────────────────────────
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log('[config] no config.json found — will create one');
    return null;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    console.log('[config] loaded TV codes:', parsed.tvCodes);
    return parsed;
  } catch (e) {
    console.error('[config] ERROR reading config.json:', e.message);
    return null;
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('[config] saved TV codes:', cfg.tvCodes);
  } catch (e) {
    console.error('[config] ERROR saving config.json:', e.message);
    console.error('[config] Check that the folder is writable:', PROJECT_ROOT);
  }
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SETTINGS = {
  roundDuration: 300, restDuration: 60, totalRounds: 10,
  warningEnabled: true, warningThreshold: 30, showRound: false,
};

const PROFILE_COLORS = ['#3B82F6','#10B981','#F59E0B','#EC4899','#8B5CF6','#EF4444','#06B6D4','#F97316'];

let config = loadConfig();

if (!config) {
  config = {
    tvCodes:  [makeCode(), makeCode(), makeCode(), makeCode()],
    profiles: [],
    branding: { appName: 'BJJ Mat Timer', tagline: 'Competition · Training · Sparring', logoDataUrl: '' },
  };
  saveConfig(config);
} else {
  let changed = false;
  while (config.tvCodes.length < 4) { config.tvCodes.push(makeCode()); changed = true; }
  if (!config.profiles) { config.profiles = []; changed = true; }
  // Migrate old slotPins to empty profiles list (just drop slotPins)
  if (config.slotPins) { delete config.slotPins; changed = true; }
  if (changed) saveConfig(config);
}

// Verify the file was actually written and can be read back
try {
  const verify = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (JSON.stringify(verify.tvCodes) !== JSON.stringify(config.tvCodes)) {
    console.error('[config] WARNING: written config does not match in-memory config!');
  } else {
    console.log('[config] verified OK');
  }
} catch (e) {
  console.error('[config] WARNING: could not verify config.json after write:', e.message);
}

// ─── Express app ──────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Audio storage directory — writable, alongside config.json
const AUDIO_DIR = path.join(CONFIG_DIR, 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
  try { fs.mkdirSync(AUDIO_DIR, { recursive: true }); } catch(e) {}
}

app.use(express.json({ limit: '10mb' }));
// Serve saved audio files so browser can load them by URL
app.use('/audio', express.static(AUDIO_DIR));
app.use(express.static(PUBLIC_DIR));

app.get('/', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
);

// ─── REST endpoints ───────────────────────────────────────────────
// Return config including which audio slots have saved files
app.get('/api/config', (_req, res) => {
  const audioSlots = {};
  for (const slot of ['start', 'stop', 'rest']) {
    const files = fs.existsSync(AUDIO_DIR)
      ? fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith(slot + '.'))
      : [];
    if (files.length) audioSlots[slot] = { name: files[0], url: '/audio/' + files[0] };
  }
  res.json({ ...config, audioSlots });
});

app.post('/api/branding', (req, res) => {
  const { mdnsName, ...brandingFields } = req.body;
  config.branding = { ...config.branding, ...brandingFields };
  if (mdnsName) config.mdnsName = mdnsName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  saveConfig(config);
  io.emit('branding', config.branding);
  res.json({ ok: true });
});

// ─── Profile endpoints ────────────────────────────────────────────
// GET all profiles (without PINs for security)
app.get('/api/profiles', (_req, res) => {
  const safe = config.profiles.map(({ pin, ...p }) => ({ ...p, hasPin: !!pin }));
  res.json(safe);
});

// POST create profile
app.post('/api/profiles', (req, res) => {
  const { name, pin, settings } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const usedColors = config.profiles.map(p => p.color);
  const color = PROFILE_COLORS.find(c => !usedColors.includes(c)) || PROFILE_COLORS[config.profiles.length % PROFILE_COLORS.length];
  const profile = {
    id:       makeId(),
    name:     name.trim(),
    pin:      pin || '',
    color,
    settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
  };
  config.profiles.push(profile);
  saveConfig(config);
  io.emit('profiles:updated', config.profiles.map(({ pin, ...p }) => ({ ...p, hasPin: !!p.pin })));
  console.log(`[profile] created: ${profile.name}`);
  res.json({ ok: true, id: profile.id, color });
});

// PUT update profile settings
app.put('/api/profiles/:id', (req, res) => {
  const { pin, settings, name } = req.body;
  const profile = config.profiles.find(p => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (name !== undefined) profile.name = name.trim() || profile.name;
  if (pin  !== undefined) profile.pin  = pin;
  if (settings) profile.settings = { ...profile.settings, ...settings };
  saveConfig(config);
  io.emit('profiles:updated', config.profiles.map(({ pin, ...p }) => ({ ...p, hasPin: !!p.pin })));
  console.log(`[profile] updated: ${profile.name}`);
  res.json({ ok: true });
});

// DELETE profile
app.delete('/api/profiles/:id', (req, res) => {
  const idx = config.profiles.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const name = config.profiles[idx].name;
  config.profiles.splice(idx, 1);
  saveConfig(config);
  io.emit('profiles:updated', config.profiles.map(({ pin, ...p }) => ({ ...p, hasPin: !!p.pin })));
  console.log(`[profile] deleted: ${name}`);
  res.json({ ok: true });
});

// POST verify PIN and return profile settings
app.post('/api/profiles/:id/login', (req, res) => {
  const profile = config.profiles.find(p => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  const { pin } = req.body;
  if (profile.pin && profile.pin !== pin) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  // Return full profile including settings (but not PIN)
  const { pin: _, ...safe } = profile;
  res.json({ ok: true, profile: safe });
});

// Upload audio file for a slot
app.post('/api/audio/:slot', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  const slot = req.params.slot;
  if (!['start', 'stop', 'rest'].includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }
  const filename = req.headers['x-filename'] || (slot + '.mp3');
  const ext      = path.extname(filename) || '.mp3';
  const savePath = path.join(AUDIO_DIR, slot + ext);

  // Remove any existing file for this slot
  try {
    fs.readdirSync(AUDIO_DIR)
      .filter(f => f.startsWith(slot + '.'))
      .forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
  } catch(e) {}

  try {
    fs.writeFileSync(savePath, req.body);
    console.log(`[audio] saved ${slot}: ${filename} (${req.body.length} bytes)`);
    res.json({ ok: true, url: '/audio/' + slot + ext, name: filename });
  } catch(e) {
    console.error('[audio] save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Delete saved audio for a slot
app.delete('/api/audio/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['start', 'stop', 'rest'].includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }
  try {
    const existing = fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith(slot + '.'));
    existing.forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
    console.log(`[audio] deleted ${slot}`);
  } catch(e) {}
  res.json({ ok: true });
});

app.get('/api/network', (_req, res) => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  // Prefer the mDNS .local name for QR codes; fall back to first IP
  const mdnsUrl  = `http://${MDNS_NAME}.local:${PORT}`;
  const ipUrl    = ips.length ? `http://${ips[0]}:${PORT}` : null;
  res.json({ ips, port: PORT, mdnsUrl, ipUrl, mdnsName: MDNS_NAME });
});

// ─── Socket.io ────────────────────────────────────────────────────
// Controller registry: up to 4 simultaneous controllers
// Each controller has a color slot 1-4 assigned on join
const CTRL_COLORS  = { 1: 'blue', 2: 'green', 3: 'amber', 4: 'pink' };
const controllers  = {};   // socketId → { slot, color, name }
const ctrlSlots    = {};   // slot(1-4) → socketId | null
const ctrlNames    = {};   // slot(1-4) → session name
for (let i = 1; i <= 4; i++) { ctrlSlots[i] = null; ctrlNames[i] = ''; }

// TV ownership: tvOwner[tvSlot] = ctrlSlot | null
const tvOwner      = { 1: null, 2: null, 3: null, 4: null };
// TV display connections: tvDisplays[tvSlot] = count
const tvDisplays   = { 1: 0,    2: 0,    3: 0,    4: 0    };
let   floatingCount = 0;

// Room name for a TV's displays: 'tv-display-1' … 'tv-display-4'
const tvRoom = (tvSlot) => `tv-display-${tvSlot}`;

function broadcastMonitorStatus() {
  const status = {
    tvOwner:    { ...tvOwner    },
    tvDisplays: { ...tvDisplays },
    floating:     floatingCount,
    ctrlSlots:    {},
    ctrlNames:  { ...ctrlNames  },
  };
  for (let i = 1; i <= 4; i++) {
    status.ctrlSlots[i] = ctrlSlots[i] ? { connected: true, color: CTRL_COLORS[i], name: ctrlNames[i] } : null;
  }
  io.to('controllers').emit('monitor:status', status);
}

function nextFreeCtrlSlot() {
  for (let i = 1; i <= 4; i++) if (!ctrlSlots[i]) return i;
  return null;
}

io.on('connection', (socket) => {

  // ── Join as controller ───────────────────────────────────────────
  socket.on('join:controller', ({ name, color, profileId } = {}) => {
    const slot = nextFreeCtrlSlot();
    if (!slot) { socket.emit('error', 'All 4 controller slots are full'); return; }
    ctrlSlots[slot] = socket.id;
    ctrlNames[slot] = name || 'Unnamed Class';
    // Use profile color if provided, otherwise fall back to slot color
    const ctrlColor = color || CTRL_COLORS[slot];
    controllers[socket.id] = { slot, color: ctrlColor, name: ctrlNames[slot], profileId };
    socket.join('controllers');
    socket.emit('config', { ...config, ctrlSlot: slot, ctrlColor, ctrlName: ctrlNames[slot] });
    socket.emit('monitor:status', {
      tvOwner: { ...tvOwner }, tvDisplays: { ...tvDisplays },
      floating: floatingCount, ctrlNames: { ...ctrlNames },
      ctrlSlots: Object.fromEntries(
        Object.entries(ctrlSlots).map(([k,v]) => [k, v ? { connected: true, color: controllers[v]?.color || CTRL_COLORS[k], name: ctrlNames[k] } : null])
      ),
    });
    broadcastMonitorStatus();
    console.log(`[ctrl] Controller ${slot} joined as "${ctrlNames[slot]}" (${ctrlColor})`);

    socket.on('disconnect', () => {
      const s = controllers[socket.id]?.slot;
      if (s) {
        ctrlSlots[s]  = null;
        ctrlNames[s]  = '';
        delete controllers[socket.id];
        for (const tv of [1,2,3,4]) {
          if (tvOwner[tv] === s) {
            tvOwner[tv] = null;
            io.to(tvRoom(tv)).emit('ctrl:color', { color: null, name: null });
          }
        }
        broadcastMonitorStatus();
        console.log(`[ctrl] Controller ${s} disconnected`);
      }
    });
  });

  // Controller saves its settings back to profile
  socket.on('profile:save', ({ profileId, settings }) => {
    const profile = config.profiles.find(p => p.id === profileId);
    if (!profile) return;
    profile.settings = { ...profile.settings, ...settings };
    saveConfig(config);
    console.log(`[profile] settings saved for ${profile.name}`);
  });

  // Controller renames their session mid-session
  socket.on('ctrl:rename', ({ name }) => {
    const ctrl = controllers[socket.id];
    if (!ctrl) return;
    ctrlNames[ctrl.slot] = name || 'Unnamed Class';
    controllers[socket.id].name = ctrlNames[ctrl.slot];
    // Update all TVs this controller owns
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) {
        io.to(tvRoom(tv)).emit('ctrl:color', { color: ctrl.color, name: ctrlNames[ctrl.slot] });
      }
    }
    broadcastMonitorStatus();
    console.log(`[ctrl] Controller ${ctrl.slot} renamed to "${ctrlNames[ctrl.slot]}"`);
  });

  // ── Controller claims / releases a TV ───────────────────────────
  socket.on('tv:claim', ({ tvSlot }) => {
    const ctrl = controllers[socket.id];
    if (!ctrl) return;
    if (tvSlot < 1 || tvSlot > 4) return;
    tvOwner[tvSlot] = ctrl.slot;
    io.to(tvRoom(tvSlot)).emit('ctrl:color', { color: ctrl.color, name: ctrlNames[ctrl.slot] });
    broadcastMonitorStatus();
    console.log(`[ctrl] Controller ${ctrl.slot} ("${ctrlNames[ctrl.slot]}") claimed TV ${tvSlot}`);
  });

  socket.on('tv:release', ({ tvSlot }) => {
    const ctrl = controllers[socket.id];
    if (!ctrl) return;
    if (tvOwner[tvSlot] !== ctrl.slot) return;
    tvOwner[tvSlot] = null;
    io.to(tvRoom(tvSlot)).emit('ctrl:color', { color: null, name: null });
    broadcastMonitorStatus();
    console.log(`[ctrl] Controller ${ctrl.slot} released TV ${tvSlot}`);
  });

  // ── Join as TV display ───────────────────────────────────────────
  socket.on('join:tv', ({ code }) => {
    const idx = config.tvCodes.indexOf((code || '').toUpperCase());
    if (idx === -1) { socket.emit('error', 'Invalid TV code: ' + code); return; }
    const tvSlot = idx + 1;
    // Block if this TV slot already has a display connected
    if (tvDisplays[tvSlot] > 0) {
      socket.emit('error', `TV ${tvSlot} is already connected to another device`);
      socket.emit('tv:taken', { slot: tvSlot });
      return;
    }
    // Only join the specific TV room — NOT the catch-all 'displays' room
    socket.join(tvRoom(tvSlot));
    socket.tvSlot = tvSlot;
    socket.emit('branding', config.branding);
    // Tell display which controller owns it (if any)
    const ownerSlot = tvOwner[tvSlot];
    socket.emit('ctrl:color', ownerSlot
      ? { color: CTRL_COLORS[ownerSlot], name: ctrlNames[ownerSlot] }
      : { color: null, name: null }
    );
    tvDisplays[tvSlot]++;
    broadcastMonitorStatus();
    socket.on('disconnect', () => {
      tvDisplays[tvSlot] = Math.max(0, tvDisplays[tvSlot] - 1);
      broadcastMonitorStatus();
    });
  });

  // ── Join as floating display ─────────────────────────────────────
  socket.on('join:display', () => {
    socket.join('displays');
    socket.emit('branding', config.branding);
    floatingCount++;
    broadcastMonitorStatus();
    socket.on('disconnect', () => {
      floatingCount = Math.max(0, floatingCount - 1);
      broadcastMonitorStatus();
    });
  });

  // ── Controller → its claimed TVs only ───────────────────────────
  // State ONLY goes to TV rooms this controller has explicitly claimed.
  // No catch-all to 'displays' — that caused controllers to overwrite each other.
  socket.on('state', (data) => {
    const ctrl = controllers[socket.id];
    if (!ctrl) return;
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) io.to(tvRoom(tv)).emit('state', data);
    }
  });

  socket.on('overlay', (msg) => {
    const ctrl = controllers[socket.id];
    if (!ctrl) return;
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) io.to(tvRoom(tv)).emit('overlay', msg);
    }
  });

  socket.on('tab', (tab) => {
    const ctrl = controllers[socket.id]; if (!ctrl) return;
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) io.to(tvRoom(tv)).emit('tab', tab);
    }
  });

  socket.on('sw:state', (data) => {
    const ctrl = controllers[socket.id]; if (!ctrl) return;
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) io.to(tvRoom(tv)).emit('sw:state', data);
    }
  });

  socket.on('sound', (type) => {
    const ctrl = controllers[socket.id]; if (!ctrl) return;
    for (const tv of [1,2,3,4]) {
      if (tvOwner[tv] === ctrl.slot) io.to(tvRoom(tv)).emit('sound', type);
    }
  });

  socket.on('audio:clear', ({ slot }) => {
    // Broadcast to all connected clients so they clear their local copy
    socket.broadcast.emit('audio:clear', { slot });
  });

  socket.on('disconnect', () => {
    // handled per-role above
  });
});

// ─── Start listening ──────────────────────────────────────────────
// mDNS hostname — devices on the same network can reach the server at
// http://bjjtimer.local:PORT without knowing the IP address.
const MDNS_NAME = (config.mdnsName || 'bjjtimer').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }

  // ── Advertise via mDNS (Bonjour/Zeroconf) ────────────────────────
  // This makes the server reachable at http://bjjtimer.local:PORT
  // on any device on the same WiFi network.
  let mdnsHostname = null;
  try {
    const mdns = require('mdns-js');
    mdns.excludeInterface('0.0.0.0');
    const ad = mdns.createAdvertisement(
      mdns.tcp('http'),
      PORT,
      { name: 'BJJ Mat Timer', host: MDNS_NAME }
    );
    ad.start();
    mdnsHostname = `${MDNS_NAME}.local`;
    console.log(`[mdns] Advertising as http://${mdnsHostname}:${PORT}`);
  } catch(e) {
    console.log('[mdns] Not available on this system:', e.message);
  }

  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│            BJJ Mat Timer — Running             │');
  console.log('├─────────────────────────────────────────────────┤');
  if (mdnsHostname) {
    const named = `http://${mdnsHostname}:${PORT}`;
    console.log('│  Named URL: ' + named.padEnd(36) + '│');
    console.log('├─────────────────────────────────────────────────┤');
  }
  ips.forEach(ip => console.log(('│  IP URL:    http://' + ip + ':' + PORT).padEnd(50) + '│'));
  console.log('├─────────────────────────────────────────────────┤');
  console.log('│  TV Codes:                                      │');
  config.tvCodes.forEach((c, i) =>
    console.log((`│    TV ${i+1}:  ${c}`).padEnd(50) + '│')
  );
  console.log('└─────────────────────────────────────────────────┘\n');
});

// Export for Electron main process — include mdnsName for QR generation
module.exports = { port: PORT, config, mdnsName: MDNS_NAME };
