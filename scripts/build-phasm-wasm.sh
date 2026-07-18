#!/usr/bin/env bash
# Rebuild vendor/phasm WASM from phasm-core + congrats-phasm-wasm bridge.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHASM_SRC="${PHASM_SRC:-/tmp/phasmcore}"
BRIDGE="$ROOT/native/congrats-phasm-wasm"
OUT="$ROOT/vendor/phasm"

if [[ ! -d "$PHASM_SRC" ]]; then
  git clone --depth 1 https://github.com/cgaffga/phasmcore.git "$PHASM_SRC"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required (cargo install wasm-pack)" >&2
  exit 1
fi

# Cargo.toml path must point at PHASM_SRC (edit if you use a different checkout).
cd "$BRIDGE"
wasm-pack build --target web --release --out-dir "$OUT"
cp "$PHASM_SRC/LICENSE" "$OUT/LICENSE.phasm-core"
# Restore allowlist gitignore (wasm-pack may overwrite).
cat > "$OUT/.gitignore" <<'EOF'
*
!congrats_phasm_wasm.js
!congrats_phasm_wasm.d.ts
!congrats_phasm_wasm_bg.wasm
!congrats_phasm_wasm_bg.wasm.d.ts
!package.json
!README.md
!LICENSE.phasm-core
!.gitignore
EOF

echo "Wrote $OUT"
