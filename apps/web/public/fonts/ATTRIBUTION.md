# Self-hosted font attribution

Only the WOFF2 files used by the browser are committed. No font source
repository, CDN stylesheet, remote runtime request, or Base64 font is
included.

## Nunito

- Upstream: `googlefonts/nunito`
- Pinned commit:
  `8c6a9bb9732545b9ed53f29ec5e1ab0ff53c4e6f`
- Source file: `fonts/variable/Nunito[wght].ttf`
- Local output: `nunito/nunito-latin-variable.woff2`
- Local transformation: WOFF2 conversion and Latin/punctuation subset
  for web delivery; variable weights are retained.
- License: SIL Open Font License 1.1
- License copy: `licenses/Nunito-OFL-1.1.txt`

## Chiron GoRound TC / 昭源環方

- Upstream: `chiron-fonts/chiron-go-round-tc`
- Pinned release: `v1.011` (2026-05-13)
- Upstream commit:
  `9d73676cbea393bf511fec766ab6f56249ba9ea4`
- Local files: unchanged official `WOFF2_TTF/woff2/vf/t0`
  subsets `gf_115.woff2` through `gf_119.woff2`.
- Browser family name: `Chiron GoRound TC WS`
- Scope: selected Traditional Chinese display text only. The upstream
  explicitly does not claim Simplified Chinese support.
- License: SIL Open Font License 1.1
- License copy:
  `licenses/Chiron-GoRound-TC-OFL-1.1.md`
