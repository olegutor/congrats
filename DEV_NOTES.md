# Dev notes

## Glossary

### JPEG block-grid reset (сброс сетки блоков JPEG)

Mild pre-stego cover processing: a few randomized micro-crops (offsets that are not multiples of 8) plus high-quality JPEG round-trips, then scale back to the original size. Purpose: shift the JPEG 8×8 DCT block lattice so a public internet original is no longer a matching pre-stego cover for JPEG steganalysis / calibration.

**Informal synonym:** шакализация — the same operation; the UI uses the formal name because “shakalization” is ambiguous slang.

Default: enabled for uploaded covers, disabled for generated postcards. Strength is intentionally low (2–4 iterations, 1–7 px alignment shift, JPEG quality ≈ 0.90–0.94).

### Why public-key GPG is PNG-only (for now)

Fixed RSA-3072 OpenPGP containers are several kibibytes (profiles 4–32 KiB). JPEG Ghost / J-UNIWARD capacity on compact/medium cards is often too small for those containers, and passphrase-less extraction needs a fixed-length spatial channel keyed by the public key. PNG capacity is large enough; JPEG support needs a separate capacity/profile design.
