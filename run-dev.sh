#!/bin/bash
set -e
cd "$(dirname "$0")"
source "$HOME/.cargo/env"
export PATH="/opt/homebrew/bin:$PATH"
npm run tauri dev
