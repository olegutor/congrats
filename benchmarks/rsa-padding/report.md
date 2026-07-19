# RSA-3072 fixed-size padding benchmark

Selected: **Literal Data + RFC 9580 Padding Packet inside SEIPD**.

It reaches every target exactly, has the least structural overhead, decrypts
byte-for-byte with GnuPG 2.2.27, and is parsed by OpenPGP.js 6.1.1. GnuPG labels
tag 21 as an unknown packet because this older GnuPG predates RFC 9580, but
correctly skips it and emits the literal payload. The ZIP alternatives are also
compatible, but require an application-level archive layer; the extra padding
entry has the largest fixed overhead. EOCD comments are limited to 65535 bytes.

Exact sizing must be adaptive: RSA PKESK MPI encoding can occasionally be one
byte shorter, so production code must encrypt, check the final length, adjust
padding by the observed delta, and retry. The benchmark records retry counts.

| variant | target B | padding B | ciphertext overhead B | encrypt median ms | gpg decrypt median ms | gpg peak RSS KiB | exact/parse/decrypt | unzip |
|---|---:|---:|---:|---:|---:|---:|---|---|
| openpgp-padding-packet | 1024 | 302–302 | 466–466 | 0.67 | 26.22 | 6596 | yes | n/a |
| openpgp-padding-packet | 2048 | 1326–1326 | 466–466 | 0.48 | 25.85 | 6576 | yes | n/a |
| openpgp-padding-packet | 4096 | 3374–3374 | 466–466 | 0.43 | 26.29 | 6588 | yes | n/a |
| openpgp-padding-packet | 8192 | 7470–7470 | 466–466 | 0.59 | 26.21 | 6532 | yes | n/a |
| openpgp-padding-packet | 16384 | 15656–15656 | 472–472 | 0.53 | 25.60 | 6592 | yes | n/a |
| openpgp-padding-packet | 32768 | 32040–32040 | 472–472 | 0.71 | 25.91 | 6588 | yes | n/a |
| zip-eocd-comment | 1024 | 185–185 | 583–583 | 0.65 | 26.07 | 6576 | yes | yes |
| zip-eocd-comment | 2048 | 1209–1209 | 583–583 | 0.43 | 26.23 | 6612 | yes | yes |
| zip-eocd-comment | 4096 | 3257–3257 | 583–583 | 0.53 | 26.00 | 6592 | yes | yes |
| zip-eocd-comment | 8192 | 7353–7353 | 583–583 | 0.56 | 25.72 | 6544 | yes | yes |
| zip-eocd-comment | 16384 | 15539–15539 | 589–589 | 0.57 | 26.46 | 6548 | yes | yes |
| zip-eocd-comment | 32768 | 31923–31923 | 589–589 | 0.72 | 26.23 | 6568 | yes | yes |
| zip-padding-entry | 1024 | 87–87 | 681–681 | 0.58 | 25.88 | 6500 | yes | yes |
| zip-padding-entry | 2048 | 1111–1111 | 681–681 | 0.45 | 26.04 | 6576 | yes | yes |
| zip-padding-entry | 4096 | 3159–3159 | 681–681 | 0.48 | 26.14 | 6568 | yes | yes |
| zip-padding-entry | 8192 | 7255–7255 | 681–681 | 0.58 | 26.30 | 6584 | yes | yes |
| zip-padding-entry | 16384 | 15441–15441 | 687–687 | 0.89 | 26.40 | 6580 | yes | yes |
| zip-padding-entry | 32768 | 31825–31825 | 687–687 | 1.17 | 26.18 | 6560 | yes | yes |

Payload: 256 deterministic bytes, SHA-256
`ad0aba6fc61ae75cf9c13df5b2df60416ed1896a4f6dadc954d5447768d34a7e`. Each encryption and GnuPG decryption
timing has 5 samples. Node peak RSS for the complete run:
72436 KiB.

## Reproduce

```bash
cd /home/arqwer/projects/congrats_steg
npm install --no-save --package-lock=false openpgp@6.1.1
/usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M' \
  node scripts/rsa-padding-benchmark.mjs
```

The script uses the public key in `test_rsa3072.pub` and the matching secret
key only through the local `gpg` process. It never exports or reads private-key
material. Full environment, commands, samples, hashes, and artifact paths are
in `results.json`.

The actual primary fingerprint in the supplied public key is
`BD936E1D3FB1C70CC12424329DA588B1824FB0A1`; the encryption subkey
matches the requested `2F976DF8ED92486BCBF11C4BC442F831C422D798`.
