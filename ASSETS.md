# Brand assets and third-party notices

The code in this repository is MIT licensed (see [LICENSE](LICENSE)). The files below are **not** covered by that
license.

## Zeke & Learn brand assets and character art

Copyright (c) 2026 Zeke Espirito Sebulino (Zeke & Learn). **All rights reserved.**

| Folder | What it is |
|---|---|
| `app/assets/brand/` | The Zeke & Learn logo mark, wordmark and icons |
| `app/assets/guide/` | The "Cap Zeke" guide character art |
| `docs/` | The pixel Zeke character in docs and demo renders |
| `app/assets/sample/` | The sample voice (an AI clone of Zeke's voice, made with ElevenLabs) and its timing data |

You may not use these as a presenter, mascot, logo, avatar, voice or training data, or in your own products. They
are included only so this project's own copy of the app works out of the box. If you fork this repository and host or
distribute your own copy, replace them with your own.

## Fonts

The fonts in `app/assets/fonts/` (Space Grotesk, JetBrains Mono, Silkscreen) are licensed under the SIL Open Font
License 1.1. Their license files are next to them (`OFL-*.txt`). The engine installs Space Grotesk, JetBrains Mono and
Pixelify Sans from npm, also under the SIL Open Font License 1.1.

## Bundled third-party code

`app/vendor/` contains mp4-muxer and webm-muxer by Vanilagy, under the MIT license with their own copyright notices
(the `LICENSE-*` files in that folder). The WebM muxer has a small patch to store the alpha channel.

## Speech models

Speech models are not bundled. Sharper lip sync and the `listen` command download them at runtime from Hugging Face,
each under its own license (see the Credits section of the [README](README.md#credits)).

## Original to Mascot Booth

The pixel icons and synthesized sounds in `engine/` are original to Mascot Booth and are covered by the MIT license.
