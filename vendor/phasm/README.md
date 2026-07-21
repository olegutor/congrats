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
