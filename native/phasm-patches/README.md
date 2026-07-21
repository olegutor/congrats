# phasm-core patches for Congrats Steg

Applied by [`scripts/build-phasm-wasm.sh`](../../scripts/build-phasm-wasm.sh) onto a
shallow clone of [phasm-core](https://github.com/cgaffga/phasmcore) at the commit
in `PHASM_SRC_COMMIT.txt`.

## `0001-ghost-raw-fixed-length-api.patch`

Adds:

- `ghost_embed_raw` / `ghost_extract_raw` — fixed-length Ghost STC without AES-GCM-SIV or CRC
- `ghost_capacity_raw` — byte capacity for that channel (no frame overhead)
