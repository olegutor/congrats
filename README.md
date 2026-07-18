# Congrats Steg

Browser-only steganography on generated greeting cards (открытки).

**Pipeline:** postcard Canvas render → optional gcmwrap/GPG encryption → Feistel bit diffusion → HILL costs + binary STC → PNG download.

No backend. Suitable for GitHub Pages / future PWA.

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

## Notes

- Export is **PNG only** for stego (JPEG would destroy LSBs).
- Cover positions are a public keyed permutation; HILL weights which LSBs flip.
- Confidentiality is from the crypto layer (password / GPG), not from the stego keys.
