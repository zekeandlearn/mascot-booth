# Changelog

## 0.1.0 (2026-11-11)

First public release. Earlier versions were private, under the working name Cutscene.

- The web app is live on GitHub Pages: https://zekeandlearn.github.io/mascot-booth/

**Web app**

- Five steps: make poses with a ready-made ChatGPT prompt, upload and auto cut-out of a 6-pose sheet, face setup
  with a live preview, voice, animate and export.
- Voice from an audio file, the mic, your own ElevenLabs key, or a sample voice.
- Sharper lip sync: letter-timed mouths for your own recording, by forced alignment in the browser.
- Optional drawn mouth sheet (9 mouths).
- Export a transparent WebM or an MP4 on the background you pick.
- Export for Claude Code: the mascot as a presenter folder for the engine.
- English and Taglish UI.

**Engine (Claude Code / Codex)**

- Word-synced explainer films and mascot-only transparent clips, with letter-timed lip sync from ElevenLabs or your
  own recording.
- `listen` and `prepare --audio` for your own recordings.
- Sync proof: `check`, which also runs after every `render`.
- Motion library, synthesized sound effects and a mastered mix.
- `doctor` setup check and `install.mjs` for the Claude Code / Codex skill.
