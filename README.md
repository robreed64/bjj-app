# BJJ Mat Timer

Multi-screen BJJ training timer. One server, every device in the gym connects via browser.

---

## Quick Start

```bash
# 1. Install dependencies
./build.sh setup

# 2. Run it (browser mode — works on any device right now)
./build.sh dev
# Open http://localhost:3000 in your browser
```

---

## Platform Guide

### Linux Desktop App
Build a native `.AppImage` that runs with a double-click on any Linux machine — no install needed.

```bash
./build.sh linux
# Output: dist/BJJ Mat Timer-1.0.0.AppImage
#         dist/bjj-mat-timer_1.0.0_amd64.deb

# Run it:
chmod +x "dist/BJJ Mat Timer-1.0.0.AppImage"
./"dist/BJJ Mat Timer-1.0.0.AppImage"
```

### Mac Desktop App
Build a `.dmg` from your Linux box (cross-compile):

```bash
npm run build:mac
# Output: dist/BJJ Mat Timer-1.0.0.dmg
```

> **Note:** The binary will run fine but Apple code-signing requires a Mac.
> For gym-internal use without notarization this works — just right-click → Open.

### Android
See full instructions: `./build.sh android`

Short version:
1. Install Android Studio on Linux
2. `npm install @capacitor/core @capacitor/cli @capacitor/android`
3. `npx cap add android && npx cap open android`
4. Build APK in Android Studio, sideload to devices

### iOS (iPhone / iPad)
**Recommended — no Mac needed:**

1. Run the server on your gym network
2. On iPhone/iPad: open **Safari** → go to `http://YOUR-SERVER-IP:3000`
3. Tap **Share (□↑)** → **Add to Home Screen**
4. Done — runs full-screen like a native app

For a proper App Store build you need a Mac with Xcode. See `./build.sh ios`.

---

## Project Structure

```
bjj-app/
├── build.sh              ← One-command build tool
├── package.json          ← Dependencies + electron-builder config
├── config.json           ← Auto-generated: TV codes + branding (persistent)
├── src/
│   └── server.js         ← Express + Socket.io server
├── electron/
│   ├── main.js           ← Electron main process
│   └── preload.js        ← Electron IPC bridge
└── public/
    ├── index.html        ← Full client app (controller + display)
    ├── manifest.json     ← PWA install manifest
    ├── sw.js             ← Service worker (offline cache)
    └── icons/
        ├── icon.svg      ← Source icon (replace with your logo)
        ├── icon.png      ← 256px (Electron)
        ├── icon-192.png  ← 192px (PWA / Android)
        └── icon-512.png  ← 512px (PWA splash)
```

---

## How Devices Connect

```
┌─────────────────────────────────────────────────┐
│  Server runs on the controller Mac/Linux         │
│  (Electron app or  node src/server.js)           │
└────────────────┬────────────────────────────────┘
                 │  local WiFi network
        ┌────────┴──────────────────────────┐
        │                                   │
   ┌────┴────┐                    ┌─────────┴──────┐
   │ 4 TVs   │                    │ Phones/Tablets │
   │ fixed   │                    │ floating       │
   │ codes   │                    │ display link   │
   └─────────┘                    └────────────────┘
```

**TV bookmark URLs** (never change, stored in config.json):
```
http://192.168.1.42:3000?tv=AB3X7K   ← TV 1
http://192.168.1.42:3000?tv=MN8P2Q   ← TV 2
```

**Phone/tablet display link:**
```
http://192.168.1.42:3000?display=1
```

---

## White Label / Branding

1. Open the controller
2. Click **⚙** in the top-left
3. Change app name, tagline, and logo
4. Hit **Save & Apply** — persisted to `config.json` and broadcast to all displays

---

## Custom Icons

Replace the files in `public/icons/`:
- `icon-192.png` — 192×192 PNG
- `icon-512.png` — 512×512 PNG  
- `icon.png`     — 256×256 PNG (Electron window icon)
- `icon.icns`    — Mac app icon (optional, for App Store polish)

Then rebuild: `./build.sh linux`

---

## Changing the Port

```bash
PORT=8080 node src/server.js
# or
PORT=8080 ./build.sh dev
```

---

## Requirements

- **Node.js** v18+  →  https://nodejs.org
- **npm** v8+
- Linux x64 workspace (for building)
- Android Studio (optional, for APK)
- Mac + Xcode (optional, for iOS .ipa)
#bjj-app
# bjj-app
# bjj-app
