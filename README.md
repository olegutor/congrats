# Congrats Steg

Browser-only steganography on generated greeting cards (открытки).

**License:** [GPL-3.0-only](LICENSE) (see [NOTICE](NOTICE)).

**Pipeline:**
- **PNG:** postcard/cover → password (gcmwrap) through passphrase-keyed HILL+STC, or fixed-size RSA-3072 OpenPGP through a public-key-derived channel → PNG
- **JPEG:** postcard/cover → passphrase-keyed **J-UNIWARD + STC** via [phasm-core](https://github.com/cgaffga/phasmcore) (vendored WASM in `vendor/phasm/`) → JPEG

No backend. Suitable for GitHub Pages.

**Live:** https://olegutor.github.io/congrats/

## Run

```bash
./run_server.sh
# or
npm install && npm run dev
```

Open http://localhost:5174/

## PWA release (GitHub Pages)

`npm run build` produces `docs/` (and root copies) and writes `docs/release.json` (SHA-256 of assets). Detach-sign that file with **olegutor-sign** as `docs/release.json.asc` (see `npm run sign-release` for the exact command), copy to `release.json.asc`, then commit/push. Clients update only when the signature verifies. Public key: `olegutor-sign.pub`.

## Test

```bash
npm test
```

## Rebuild Ghost WASM

Requires Rust + [wasm-pack](https://rustwasm.github.io/wasm-pack/):

```bash
npm run build:phasm
```

## Notes

- Choose **PNG** (spatial HILL+STC) or **JPEG** (J-UNIWARD / Ghost). Upload your own cover if you want.
- JPEG stego must be extracted from the **downloaded file** (clipboard pastes often re-encode and destroy DCT stego).
- Password mode requires a secret stego passphrase that also encrypts the payload. Optional **«Проверять наличие стего»** (default on): turn off for a fixed-length channel so a weak/shared stego passphrase is not a presence oracle (PNG fixed HILL+STC; JPEG raw Ghost without AES/CRC). Public-key mode needs only the recipient's RSA-3072 public key (PNG spatial or JPEG raw Ghost); the private key stays in Kleopatra/GnuPG.
- J-UNIWARD resists detection better than naïve LSB/F5 — it is **not** undetectable under all modern CNN steganalysis.
- PNG carries no public magic/version/salt field. A salt derived from unmodified cover bits conceals the length and keys the RGB carrier permutation, STC matrix, and variable embedding rate together with the passphrase.
- Public-key PNG uses fixed-size markerless containers (`x || SEIPD`) with RFC 9580 Padding Packets. No OpenPGP headers, key IDs, versions, lengths, or profile IDs are embedded. Extraction rebuilds a standard binary `.pgp` for Kleopatra/GnuPG.
- Postcard size → container profile (from `benchmarks/gpg-profiles/`): compact `4096` B (max payload `3633`), medium `8192` B (`7729`), full `32768` B (`32302`). Profile is chosen only from cover capacity.
- Optional **JPEG block-grid reset** (informal: шакализация): mild random crops + JPEG resaves before stego to shift the 8×8 DCT lattice. Default on for uploads, off for generated cards. See [DEV_NOTES.md](DEV_NOTES.md).

For public-key PNG decoding, select the same saved public certificate used for encoding. The browser needs no private key: it extracts the fixed container and downloads `congrats_steg_message.pgp`. Decrypt externally (`gpg --decrypt` / Kleopatra); the Literal Data packet yields the original payload after padding is skipped.
