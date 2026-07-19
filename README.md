# Congrats Steg

Browser-only steganography on generated greeting cards (открытки).

**License:** [GPL-3.0-only](LICENSE) (see [NOTICE](NOTICE)).

**Pipeline:**
- **PNG:** postcard/cover → optional gcmwrap/GPG → passphrase-keyed HILL+STC in pixels → PNG
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
- A secret stego passphrase is mandatory in every mode. “No encryption” only disables payload encryption; it does not make the stego channel public.
- J-UNIWARD resists detection better than naïve LSB/F5 — it is **not** undetectable under all modern CNN steganalysis.
- PNG carries no public magic/version/salt field. A salt derived from unmodified cover bits conceals the length and keys the RGB carrier permutation, STC matrix, and variable embedding rate together with the passphrase.
