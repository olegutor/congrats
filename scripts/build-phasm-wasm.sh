#!/usr/bin/env bash
# Rebuild vendor/phasm WASM from phasm-core + congrats-phasm-wasm bridge.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHASM_SRC="${PHASM_SRC:-/tmp/phasmcore}"
BRIDGE="$ROOT/native/congrats-phasm-wasm"
OUT="$ROOT/vendor/phasm"
PATCH_DIR="$ROOT/native/phasm-patches"
EXPECTED_COMMIT="$(tr -d '[:space:]' < "$PATCH_DIR/PHASM_SRC_COMMIT.txt")"

if [[ ! -d "$PHASM_SRC/.git" ]]; then
  git clone https://github.com/cgaffga/phasmcore.git "$PHASM_SRC"
fi

git -C "$PHASM_SRC" fetch --depth 1 origin "$EXPECTED_COMMIT"
git -C "$PHASM_SRC" checkout --force "$EXPECTED_COMMIT"
git -C "$PHASM_SRC" reset --hard "$EXPECTED_COMMIT"
git -C "$PHASM_SRC" clean -fd

for patch_file in "$PATCH_DIR"/*.patch; do
  echo "Applying $(basename "$patch_file")"
  git -C "$PHASM_SRC" apply "$patch_file"
done

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

cat > "$OUT/README.md" <<'EOF'
# Vendored phasm-core Ghost WASM

Built from [phasm-core](https://github.com/cgaffga/phasmcore) via
[`native/congrats-phasm-wasm`](../../native/congrats-phasm-wasm) (thin bridge, no phasm.app domain lock),
with local patches from [`native/phasm-patches/`](../../native/phasm-patches/)
(`ghost_embed_raw` / `ghost_extract_raw` / `ghost_capacity_raw`).

License: GPL-3.0-only (see `LICENSE.phasm-core` and repo root `LICENSE` / `NOTICE`).

Rebuild (requires Rust + wasm-pack):

```bash
./scripts/build-phasm-wasm.sh
```
EOF

echo "Wrote $OUT"
