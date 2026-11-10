# AGENTS.md: Mascot Booth

Instructions for AI coding agents (Claude Code, Codex) working on this repo.

- The product skill lives in `skills/mascot-booth/SKILL.md`. Keep it the single source of truth for how a film gets made.
- `engine/runtime/*` runs in the browser and must stay a pure function of time: no `Date.now()`, no
  `Math.random()`, no timers, no state carried between frames. Use `motion.js` (`rand`, `noise`, `spring`).
- `engine/*.mjs` is Node: server, renderer, voice, lip sync, sound synthesis, mixing. Node + ffmpeg only, no Python.
- Never print, log or write the ElevenLabs key. It is read from the environment only.
- Verify visual changes with `node bin/mascot-booth.mjs stills <film> --at ... --sheet` and look at the sheet.
  Check presenter changes with `tests/presenter-review` (`?mouth=open`, `?blink=1`).
- Brand files and character art (`app/assets/brand/`, `app/assets/guide/`, `app/assets/sample/`, `docs/`) are all rights reserved (see ASSETS.md). Never use them in templates, tests or new defaults.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`).
