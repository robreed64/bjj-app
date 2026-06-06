#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  BJJ Mat Timer — build.sh
#  Run this on your Linux workspace to set up and build the app.
#
#  Usage:
#    ./build.sh setup        Install all dependencies
#    ./build.sh dev          Run in dev mode (node server only, no Electron)
#    ./build.sh electron     Launch with Electron locally (test before build)
#    ./build.sh linux        Build Linux .AppImage + .deb → dist/
#    ./build.sh android      Print Android APK build instructions
#    ./build.sh all          Build Linux packages
# ─────────────────────────────────────────────────────────────────

set -e
CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

banner() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }
ok()     { echo -e "${GREEN}✓${NC} $1"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $1"; }
err()    { echo -e "${RED}✗${NC}  $1"; exit 1; }

# ─── Check Node.js ────────────────────────────────────────────────
check_node() {
  command -v node >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org (v18+)"
  NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  [ "$NODE_MAJOR" -ge 18 ] || warn "Node.js $NODE_VER detected — v18+ recommended"
  ok "Node.js $NODE_VER"
}

# ─── SETUP ────────────────────────────────────────────────────────
cmd_setup() {
  banner "Setup"
  check_node
  echo "Installing npm dependencies..."
  npm install
  ok "Dependencies installed"

  # Linux build deps
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing Linux system build dependencies..."
    sudo apt-get install -y --no-install-recommends \
      libgtk-3-0 libxss1 libnss3 libasound2 \
      libgbm1 libxkbfile1 libsecret-1-0 \
      fakeroot rpm 2>/dev/null || warn "Some system deps failed — build may still work"
    ok "System dependencies installed"
  fi

  echo ""
  echo -e "${GREEN}Setup complete!${NC}"
  echo "  Run the app:        ./build.sh dev"
  echo "  Launch in Electron: ./build.sh electron"
  echo "  Build Linux app:    ./build.sh linux"
}

# ─── DEV (node server only) ───────────────────────────────────────
cmd_dev() {
  banner "Starting dev server"
  check_node
  echo -e "Server starting... open ${CYAN}http://localhost:3000${NC} in your browser\n"
  node src/server.js
}

# ─── ELECTRON LOCAL TEST ──────────────────────────────────────────
cmd_electron() {
  banner "Launching Electron"
  check_node
  npx electron . --no-sandbox
}

# ─── BUILD LINUX ──────────────────────────────────────────────────
cmd_linux() {
  banner "Building Linux packages"
  check_node
  echo "Building .AppImage and .deb → dist/"
  npm run build:linux
  ok "Linux build complete → dist/"
  ls -lh dist/*.AppImage dist/*.deb 2>/dev/null || true
  echo ""
  echo "To run the AppImage on any Linux machine:"
  echo "  chmod +x dist/*.AppImage && ./dist/*.AppImage"
}

# ─── ANDROID INSTRUCTIONS ─────────────────────────────────────────
cmd_android() {
  banner "Android Build Instructions"
  cat << 'EOF'
Android builds use Capacitor to wrap the web app in a native container.
This requires Android Studio installed on Linux or Mac.

── Prerequisites ──────────────────────────────────────────────────
1. Install Android Studio: https://developer.android.com/studio
2. Install JDK 17:  sudo apt install openjdk-17-jdk
3. Set ANDROID_HOME in ~/.bashrc:
     export ANDROID_HOME=$HOME/Android/Sdk
     export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools

── Steps ──────────────────────────────────────────────────────────
# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize Capacitor (one time)
npx cap init "BJJ Mat Timer" "com.yourgymnasium.bjjtimer" --web-dir public

# Add Android platform
npx cap add android

# IMPORTANT: The app needs a server to run.
# For the Android APK, you have two options:

Option A — Point to your gym's server (simplest for internal use):
  Edit android/app/src/main/assets/public/index.html
  Change the socket.io connect line to your server's static IP:
    const socket = io('http://192.168.1.42:3000');

Option B — Bundle the server inside the APK using a local HTTP server lib.
  This is more complex. Contact a dev for this path.

# Open in Android Studio and build APK
npx cap open android
# In Android Studio: Build → Build Bundle(s)/APK(s) → Build APK(s)
# The APK will be in: android/app/build/outputs/apk/debug/

── For sideloading (no Play Store needed) ─────────────────────────
  Enable "Install from unknown sources" on the Android device
  Transfer the APK via USB or share link and install directly

EOF
}

# ─── IOS INSTRUCTIONS ─────────────────────────────────────────────
cmd_ios() {
  banner "iOS / iPhone / iPad"
  cat << 'EOF'
iOS builds REQUIRE a Mac with Xcode — this is an Apple hard requirement,
it cannot be worked around on Linux.

── Easiest option for your gym (no Mac needed) ──────────────────
Use the PWA (Progressive Web App) — already built in:

  1. Make sure the server is running on your gym network
  2. On the iPhone/iPad, open Safari and go to:
       http://192.168.1.42:3000
  3. Tap the Share button (□↑) → "Add to Home Screen"
  4. Tap Add

The app will install with a full-screen icon, no browser chrome,
and works exactly like a native app. This is the recommended approach
for gym use — no App Store, no Apple Developer account needed.

── For a proper iOS .ipa (requires Mac + Xcode) ─────────────────
  1. On a Mac: install Xcode from the App Store
  2. Copy this project to the Mac
  3. Run: npm install && npx cap add ios && npx cap open ios
  4. In Xcode: sign with your Apple Developer account and build

EOF
}

# ─── ALL ──────────────────────────────────────────────────────────
cmd_all() {
  cmd_linux
}

# ─── DISPATCH ─────────────────────────────────────────────────────
case "${1:-help}" in
  setup)    cmd_setup    ;;
  dev)      cmd_dev      ;;
  electron) cmd_electron ;;
  linux)    cmd_linux    ;;
  android)  cmd_android  ;;
  ios)      cmd_ios      ;;
  all)      cmd_all      ;;
  *)
    echo ""
    echo "BJJ Mat Timer — Build Tool"
    echo ""
    echo "Usage: ./build.sh <command>"
    echo ""
    echo "  setup       Install all dependencies"
    echo "  dev         Run server only (open localhost:3000 in browser)"
    echo "  electron    Launch Electron app locally for testing"
    echo "  linux       Build Linux .AppImage + .deb"
    echo "  android     Show Android APK build instructions"
    echo "  ios         Show iOS / PWA instructions"
    echo "  all         Build all available packages"
    echo ""
    ;;
esac
