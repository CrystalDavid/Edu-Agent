# Self-hosted font attribution

Only browser-ready font files used by the web application are committed. No font source
repository, CDN stylesheet, remote runtime request, or Base64 font is
included.

## HarmonyOS Sans SC / 鸿蒙黑体

- Publisher: Huawei Device Co., Ltd.
- Official source:
  `https://developer.huawei.com/consumer/cn/design/resource/?catalogVersion=V1`
- Official package date shown by the source page: 2026-06-12
- Font internal version: 2.040
- Local file:
  `harmonyos-sans-sc/HarmonyOS_Sans_SC.ttf`
- SHA-256:
  `8978E05044E7089AD6A9DE38C505C8148305607983487435A916D2610700A7CA`
- Delivery decision: the original variable TTF is redistributed unchanged.
  It covers the 400, 500, 600 and 700 weights used by the application.
- Why no WOFF2/subset: the bundled licence prohibits modifying the font.
- Licence: HarmonyOS Sans Fonts License Agreement
- Licence copy: `licenses/HarmonyOS-Sans-License.txt`
- Required notice: this software uses HarmonyOS Sans Fonts.

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
  `licenses/chiron-goround-tc-ofl-1.1.md`
