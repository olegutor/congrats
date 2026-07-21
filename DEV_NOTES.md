# Dev notes

## Glossary

### JPEG block-grid reset (сброс сетки блоков JPEG)

Mild pre-stego cover processing: a few randomized micro-crops (offsets that are not multiples of 8) plus high-quality JPEG round-trips, then scale back to the original size. Purpose: shift the JPEG 8×8 DCT block lattice so a public internet original is no longer a matching pre-stego cover for JPEG steganalysis / calibration.

**Informal synonym:** шакализация — the same operation; the UI uses the formal name because “shakalization” is ambiguous slang.

Default: enabled for uploaded covers, disabled for generated postcards. Strength is intentionally low (2–4 iterations, 1–7 px alignment shift, JPEG quality ≈ 0.90–0.94).

### Stego channel key vs presence oracle

The stego passphrase keys permutation / STC (and Ghost structural keys). Separately, **presence verification** is any check that fails differently when stego is absent or the passphrase is wrong:

- PNG concealed length (`length < 1` / “does not fit”) — soft oracle when verify-on.
- Ghost AES-GCM-SIV + CRC frame — hard oracle (`DECRYPTION_FAILED` / `FRAME_CORRUPTED`) when verify-on.

UI checkbox **«Проверять наличие стего»** / `verifyStegoPresence` (default on):

- **On:** current variable-length PNG / standard Ghost JPEG (password mode uses Ghost AES).
- **Off:** fixed-length packed container (length prefix + gcmwrap ciphertext + CSPRNG pad). PNG uses `embedFixedBits*`; JPEG uses patched `ghost_embed_raw` / `ghost_extract_raw` (no AES/CRC). Extract always returns N bytes; only gcmwrap may then fail as “wrong password”, not “no stego”.

Pubkey GPG mode is already fixed-length / markerless and ignores this checkbox.

### Public-key GPG on JPEG

Uses the same markerless `x || SEIPD` container as PNG, embedded via `ghost_embed_raw` / `ghost_extract_raw` with a fingerprint-derived channel key (`congrats-steg:gpg-fixed-jpeg:…`). Profile is chosen from measured raw Ghost capacity (min 1024 B). Smooth/compact covers may fall below that — use medium/full size, a textured upload, or PNG.

### phasm-core raw Ghost patch

`native/phasm-patches/0001-ghost-raw-fixed-length-api.patch` adds `ghost_embed_raw`, `ghost_extract_raw`, and `ghost_capacity_raw`. Rebuild with `./scripts/build-phasm-wasm.sh` (applies patches onto the commit in `PHASM_SRC_COMMIT.txt`).

### PWA + GPG-signed updates

Offline PWA (`manifest.webmanifest`, `sw.js`). Updates apply only if `release.json` verifies with detached signature `release.json.asc` from **olegutor-sign** (`A21AB264F4280FE23F5BD510DA59BFD9DCDAD288`, file `olegutor-sign.pub`).

`npm run build` writes `docs/release.json` (SHA-256 of assets). You detach-sign it yourself with **olegutor-sign** → `docs/release.json.asc`, then `cp docs/release.json.asc release.json.asc`. Helper text: `npm run sign-release`. Without a valid `.asc`, the service worker refuses install/update. Asset updates go through Cache Storage after signature + SHA-256 checks; keep `sw.js` changes rare (browser SW replacement is a separate trust edge — signed precache still required on install).
