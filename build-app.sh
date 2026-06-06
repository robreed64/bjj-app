#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  BJJ Mat Timer — One-command build script
#  Run this on your Linux/Mac machine to compile the app.
#  
#  Usage:
#    chmod +x build-app.sh
#    ./build-app.sh          # builds for current platform
#    ./build-app.sh linux    # Linux AppImage + deb
#    ./build-app.sh mac      # Mac dmg
#    ./build-app.sh windows  # Windows installer (.exe)
#    ./build-app.sh all      # all platforms
# ─────────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1"; exit 1; }

# Check Node.js
command -v node >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org (v18+)"
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
ok "Node.js $NODE_VER"

# Install dependencies
info "Installing dependencies..."
npm install
ok "Dependencies installed"

TARGET="${1:-$(uname -s | tr '[:upper:]' '[:lower:]')}"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  BJJ Mat Timer — Building for: $TARGET${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

case "$TARGET" in
  linux)
    info "Building Linux AppImage + deb..."
    npx electron-builder --linux AppImage deb --publish never
    ok "Linux build complete → dist/"
    ls -lh dist/*.AppImage dist/*.deb 2>/dev/null || true
    echo ""
    echo "To install on Linux:"
    echo "  chmod +x dist/*.AppImage && ./dist/*.AppImage"
    ;;
  mac|darwin)
    info "Building macOS dmg..."
    npx electron-builder --mac dmg --publish never
    ok "Mac build complete → dist/"
    ls -lh dist/*.dmg 2>/dev/null || true
    echo ""
    echo "To install on Mac:"
    echo "  Open dist/*.dmg and drag to Applications"
    ;;
  windows|win32)
    info "Building Windows installer..."
    npx electron-builder --win nsis --publish never
    ok "Windows build complete → dist/"
    ls -lh "dist/"*.exe 2>/dev/null || true
    echo ""
    echo "To install on Windows:"
    echo "  Run dist/*Setup*.exe"
    ;;
  all)
    info "Building all platforms..."
    npx electron-builder --linux AppImage deb --mac dmg --win nsis --publish never
    ok "All builds complete → dist/"
    ls -lh dist/ 2>/dev/null || true
    ;;
  *)
    # Auto-detect
    OS=$(uname -s)
    case "$OS" in
      Linux)  ./build-app.sh linux ;;
      Darwin) ./build-app.sh mac ;;
      *)      err "Unknown OS: $OS. Run: ./build-app.sh [linux|mac|windows]" ;;
    esac
    ;;
esac

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Build complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
