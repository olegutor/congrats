# Congrats Steg

Browser-only steganography on generated greeting cards (открытки).

**License:** [GPL-3.0-only](LICENSE) (see [NOTICE](NOTICE)).

**Pipeline:**
- **PNG:** postcard/cover → optional gcmwrap/GPG → Feistel → HILL+STC in pixels → PNG
- **JPEG:** postcard/cover → framed payload as Ghost message → **J-UNIWARD + STC** via [phasm-core](https://github.com/cgaffga/phasmcore) (vendored WASM in `vendor/phasm/`) → JPEG

No backend. Suitable for GitHub Pages.

**Live:** https://olegutor.github.io/congrats/

## Run

```bash
./run_server.sh
# or
npm install && npm run dev
```

Open http://localhost:5174/

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
- Ghost password mode uses phasm AES-GCM-SIV; “no encryption” / GPG use a public Ghost passphrase plus our framing layer.
- J-UNIWARD resists detection better than naïve LSB/F5 — it is **not** undetectable under all modern CNN steganalysis.
- PNG cover positions use a public keyed permutation; HILL weights which LSBs flip.
