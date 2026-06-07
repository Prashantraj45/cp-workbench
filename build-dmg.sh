#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CP Workbench — DMG Build Script
# Usage:
#   ./build-dmg.sh           # build with current version
#   ./build-dmg.sh patch     # bump patch version (0.1.0 → 0.1.1)
#   ./build-dmg.sh minor     # bump minor version (0.1.0 → 0.2.0)
#   ./build-dmg.sh major     # bump major version (0.1.0 → 1.0.0)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# ── Environment ───────────────────────────────────────────────────────────────
source "$HOME/.cargo/env"
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"

CONF="src-tauri/tauri.conf.json"
CARGO="src-tauri/Cargo.toml"

# ── Version bump ──────────────────────────────────────────────────────────────
BUMP="${1:-}"
if [[ -n "$BUMP" ]]; then
    CURRENT=$(python3 -c "import json; print(json.load(open('$CONF'))['version'])")
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "$BUMP" in
        major) MAJOR=$((MAJOR+1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR+1)); PATCH=0 ;;
        patch) PATCH=$((PATCH+1)) ;;
        *) echo "Unknown bump: $BUMP. Use patch|minor|major."; exit 1 ;;
    esac
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"

    echo "▶ Bumping version $CURRENT → $NEW_VERSION"

    # Update tauri.conf.json
    python3 - <<EOF
import json, re
with open('$CONF') as f:
    conf = json.load(f)
conf['version'] = '$NEW_VERSION'
with open('$CONF', 'w') as f:
    json.dump(conf, f, indent=2)
print('  tauri.conf.json updated')
EOF

    # Update Cargo.toml
    sed -i '' "s/^version = \"$CURRENT\"/version = \"$NEW_VERSION\"/" "$CARGO"
    echo "  Cargo.toml updated"
fi

# ── Current version ───────────────────────────────────────────────────────────
VERSION=$(python3 -c "import json; print(json.load(open('$CONF'))['version'])")
ARCH=$(uname -m)  # arm64 on Apple Silicon
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo ""
echo "═══════════════════════════════════════"
echo "  CP Workbench v$VERSION  ($ARCH)"
echo "  $(date)"
echo "═══════════════════════════════════════"
echo ""

# ── Regenerate icons ──────────────────────────────────────────────────────────
echo "▶ Regenerating icons..."
python3 scripts/gen_icon.py

# ── Frontend build ────────────────────────────────────────────────────────────
echo ""
echo "▶ Building frontend..."
npm run build

# ── Tauri / Rust build ───────────────────────────────────────────────────────
echo ""
echo "▶ Building Tauri app (this takes ~2 min on first build)..."
npm run tauri -- build 2>&1

# ── Collect artifacts ─────────────────────────────────────────────────────────
BUNDLE_DIR="src-tauri/target/release/bundle"
DMG_SRC="$BUNDLE_DIR/dmg/cp-workbench_${VERSION}_${ARCH}.dmg"
APP_SRC="$BUNDLE_DIR/macos/cp-workbench.app"

RELEASES_DIR="releases"
mkdir -p "$RELEASES_DIR"

DMG_DEST="$RELEASES_DIR/cp-workbench_${VERSION}_${ARCH}_${TIMESTAMP}.dmg"
LATEST_DMG="$RELEASES_DIR/cp-workbench_latest.dmg"

if [[ -f "$DMG_SRC" ]]; then
    cp "$DMG_SRC" "$DMG_DEST"
    cp "$DMG_SRC" "$LATEST_DMG"
    echo ""
    echo "═══════════════════════════════════════"
    echo "  ✓ Build complete!"
    echo ""
    echo "  DMG: $DMG_DEST"
    echo "  Latest: $LATEST_DMG"
    echo ""
    echo "  Install: open the DMG and drag to /Applications"
    echo "  Or run:  open '$LATEST_DMG'"
    echo "═══════════════════════════════════════"

    # Open releases folder
    open "$RELEASES_DIR"
else
    echo "⚠ DMG not found at expected path: $DMG_SRC"
    echo "  Check src-tauri/target/release/bundle/dmg/ manually."
    exit 1
fi

# ── Git tag (optional — only if version was bumped) ──────────────────────────
if [[ -n "$BUMP" ]]; then
    echo ""
    read -r -p "Tag release v$VERSION in git? [y/N] " TAG
    if [[ "$TAG" =~ ^[Yy]$ ]]; then
        git add "$CONF" "$CARGO"
        git commit -m "chore: bump version to v$VERSION"
        git tag -a "v$VERSION" -m "Release v$VERSION"
        echo "  Tagged v$VERSION"
    fi
fi
