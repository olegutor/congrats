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

### Why public-key GPG is PNG-only (for now)

Fixed RSA-3072 OpenPGP containers are several kibibytes (profiles 4–32 KiB). JPEG Ghost capacity on compact/medium cards is often too small; passphrase-less GPG also needs a markerless fixed channel keyed by the public key (structure rebuilt after extract). PNG capacity is large enough; JPEG GPG needs a separate capacity/profile design on top of raw Ghost.

### phasm-core raw Ghost patch

`native/phasm-patches/0001-ghost-raw-fixed-length-api.patch` adds `ghost_embed_raw`, `ghost_extract_raw`, and `ghost_capacity_raw`. Rebuild with `./scripts/build-phasm-wasm.sh` (applies patches onto the commit in `PHASM_SRC_COMMIT.txt`).
