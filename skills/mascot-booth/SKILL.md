---
name: mascot-booth
description: Mascot Booth turns a topic into a cinematic, word-synced explainer video (9:16 Reels/Shorts/TikTok or 16:9) starring the user's OWN talking character, with showreel-grade motion design written as code. The character lip-syncs from the voice's letter timings, changes pose on cue words and blinks; headlines slam in on the exact spoken word; pixel-block wipes, camera pushes, particle bursts, a live waveform and synthesized sound design are all keyed to the voice track. Use when the user says "mascot booth", "use Mascot Booth", "make my mascot talk", "make my character talk", "talking explainer", "talking mascot video", "lip sync my character", "explainer reel with my character", or asks for an explainer video where their character presents. Also covers turning character art into a talking presenter (cut sheets, calibrate mouth and eyes), re-voicing a film, and rendering stills or a contact sheet for review.
---

# Mascot Booth

You are the motion designer and the editor. The user is the director. Make every film look like it belongs in a
motion designer's showreel: one idea per frame, every beat landing on a spoken word, nothing decorative that does
not carry meaning. The voice is the clock.

`<cs>` = the Mascot Booth package folder (the one with `bin/mascot-booth.mjs`). Run commands as `node <cs>/bin/mascot-booth.mjs <cmd>`.
Every command prints what it did; `doctor` first on a new machine.

## The pipeline

| # | Step | Do | Gate |
|---|---|---|---|
| 0 | Setup | `doctor`. If the user has no presenter yet, run **Presenter** below. Get their brand colours and wordmark into `film.json` `brand`. | doctor all OK |
| 1 | Script | Research the topic. Write the script in the user's voice and language. Hook in the first line, one idea per sentence, ~2.4 words/s. Save `script.md` with the plain script, the **performance script** (audio tags on every beat, e.g. `[curious]`, `[excited]`, `[Brief pause]`), and a truth check: every claim, true or cut. | **user approves the wording** |
| 2 | Voice | Ask before any paid call. `voice <film> --script script.md --voice <id> --name take-a` (and a `take-b` with another stability). Send the user the takes to pick by ear. Check no tag was spoken aloud (speech-to-text). Recording their own take instead also works, no key needed: `listen <film> --audio <file> --script script.md --name take-a` times every letter by forced alignment (one-time ~95 MB model download; without `--script` Whisper writes the words down first, add `--lang tl` for Tagalog/Taglish). A match score below -3 means the script and the recording disagree: re-check before going on. `prepare <film> --audio <file> --script script.md` does listen + prepare in one step. | user picks a take |
| 3 | Cues | `prepare <film> --take takes/<pick>` writes `vo.mp3`, `words.json`, `mouth.json` and the duration. `cues <film>` prints the cue sheet. Plan scenes on its pauses. | words match the script |
| 4 | Storyboard | One line per scene: time range, what is on screen, the cue word each beat lands on, the presenter pose, the transition. Cut on pauses (gaps >= 0.3s). Show it to the user. | user says go |
| 5 | Build | Write `film.js` (shape below). Never hard-code a time a word gives you: `cs.at('phrase')`. | `stills --sheet` reads clean |
| 6 | Review | `stills <film> --at <one per beat> --sheet`, look at the sheet, fix, repeat. Then `render <film>`; check a few frames of the MP4 and the loudness line. Render ends with the sync proof (`check <film>` reruns it): it re-times every word in the MP4 against the voice file. On OFF, read the shift it prints and find what moved the voice (audio offset, a trimmed take, a re-prepared take) before handing over. | no overlaps, nothing in the platform UI zones, mix ~-14 LUFS, sync proof IN SYNC |
| 7 | Deliver | Hand over `renders/<slug>.mp4` and say what was not verified (for example: the voice delivery is the user's call). Never post anything. | |

## film.js

```js
export default (cs, lib) => {
  const { M, fx, type, blocks } = lib;
  const at = (p, o) => cs.at(p, o);            // start time of a spoken phrase; throws if it is not in the take
  fx.starfield(cs); fx.gridFloor(cs, { horizon: 1440 });           // the world
  fx.pixelWipe(cs, 5.82);                                           // a cut hidden under pixel blocks
  const host = lib.presenter(cs, { src: '/presenter/', scale: 0.8, res: 2, enter: at('hello') - 0.1,
    poses: [[0, 'wave'], [at('so') - 0.1, 'explain']],             // pose ~0.1s before its word
    moves: [[0, 540, 1790]], zooms: [[15.4, 1], [16, 2]] });        // feet position; push in on the face
  type.captions(cs, { from: 5.8, to: 18, y: 1500 });
  cs.scene({ from: 0, to: 5.82, in: 'cut', out: 'cut' }, s => {
    s.push(0, 5.82, 1, 1.06);                                       // slow camera push
    type.title(s, { text: 'NO CAMERA.', from: 0, y: 300, size: 156, align: 'center', style: 'slam' });
    blocks.icon(s, { name: 'camera', x: 430, y: 560, size: 220, at: at('camera'), strike: true });
  });
  fx.finish(cs);                                                    // grain, vignette, scanlines
};
```

Every element is a pure function of time, so any frame renders on its own and renders match the preview exactly.
Sounds are declared where the visual happens (`cs.sfx('whoosh', t)`; most blocks add their own) and are
synthesized at render time, sample-accurate.

### The library (read the source for options; every function documents its options at the top)

- **Clock + cues** (`core.js`): `cs.at(phrase, {after, n})`, `cs.end(phrase)`, `cs.words`, `cs.scene({from, to, in, out}, s => …)` with in/out `cut | rise | zoom | whip | drop | blur`, `s.push(t0, t1, s0, s1, origin)`, `cs.shake(t)`, `cs.sfx(type, t)`.
- **Motion** (`motion.js`): `spring(t, t0, springs.pop|snap|glide|bounce|soft)`, `tween`, `keys`, `ease.*`, `fbm` noise, `onTwos` (stepped 12fps for the pixel feel).
- **Type** (`type.js`): `title` (words land on their spoken time; styles `rise | slam | scramble | type | pop`; `hl`, `hl2`, `mark` sweeps; `out` + `outStyle`), `kicker` (pixel label that types), `captions` (karaoke chunks), `counter`.
- **Blocks** (`blocks.js`): `icon` (pixel icons, optional strike), `chip`, `panel`, `terminal` (typed commands with key sounds), `code` (syntax lines + highlight), `docLines`, `waveform` (dances only while the voice speaks), `timestampChips` (real word times from the take), `filmstrip`, `roleCard`, `mouthReadout`.
- **FX** (`fx.js`): `starfield`, `gridFloor`, `glows`, `pixelWipe`, `burst` (pixel confetti), `ring` (shockwave), `flash`, `finish`.
- **Icons** (`icons.js`): camera, timeline, mic, script, wave, clapper, spark, check, play, terminal, mouth, clock, code, film, star, person, robot, bolt. Add new ones as text bitmaps.
- **Sounds** (`sfx.mjs`): whoosh, pop, tick, type, impact, riser, coin, blip, shimmer, glitch.

## Motion rules (the showreel bar)

- **Land on the word.** Titles sync to the voice automatically; everything else uses `at()`. A beat that lands 0.1s
  early reads as intentional; late reads as broken.
- **One hero per frame.** If two things move, one is the hero and the other settles first.
- **Every scene moves.** A slow `s.push`, a drift, a pose change. No dead frames longer than ~1.2s.
- **Contrast in rhythm.** Follow a slam with a breath. Three slams in a row only when the script counts ("Every. Single. Frame.").
- **Hide cuts.** Cut on pauses, under a `pixelWipe`, a `whip`, or a flash. Teleport the presenter only while hidden.
- **Real data on screen.** Timestamps, counts and code shown on screen come from the real take and the real engine. Never invent a number.
- **Safe zones (9:16).** Keep text between y 200 and 1540, x 60 to 1020. The bottom ~380px and the right edge carry platform UI.
- **Never mirror a presenter** with text or logos on their clothes (it reverses the logo).

## Mascot-only clips (direction.json)

When the user wants just their character talking (to layer over their own footage, slides or a screen recording),
make a mascot film instead of a full film. Same pipeline steps 1 to 3 (script, voice, cues), then **you direct**:

```bash
node <cs>/bin/mascot-booth.mjs new films/<slug> --mascot --presenter <presenter dir>   # 9:16, 30fps, transparent
node <cs>/bin/mascot-booth.mjs prepare films/<slug> --take takes/<pick> --tail 1
# write films/<slug>/direction.json (below), then:
node <cs>/bin/mascot-booth.mjs direction films/<slug>        # validates it, prints the resolved timeline + warnings
node <cs>/bin/mascot-booth.mjs stills films/<slug> --at <one per beat> --sheet
node <cs>/bin/mascot-booth.mjs render films/<slug>           # -> renders/<slug>.webm (VP9 + alpha); --alpha mov for ProRes 4444
```

`film.js` is the fixed mascot template; never edit it. All directing is data in `direction.json`:

```json
{
  "background": "clear",
  "size": "medium", "place": "center", "pose": "idle",
  "enter": { "style": "pop", "t": 0 },
  "exit": { "style": "pixel", "at": "see you", "lead": -0.8 },
  "beats": [
    { "at": "hello", "pose": "wave", "note": "greeting" },
    { "at": "so", "after": 4.0, "pose": "explain", "place": "left", "move": "glide" },
    { "at": "this one thing", "pose": "whoa", "size": "large", "note": "the key point, push in" },
    { "t": 12.4, "pose": "think" }
  ]
}
```

- **When:** `at` is a spoken phrase from `words.json` (`after: <seconds>` or `n: 2` to pick a later repeat), or `t` in
  seconds. Changes land `lead` seconds before the word (default 0.1; entrances 0.25).
- **Vocabulary:** `pose` = only the names in the presenter (the `direction` command lists them).
  `place` = `left | center | right` or 0..1 of the width. `move` = `glide` (default, 0.6s) or `cut` (instant).
  `size` = `small | medium | large` or 0.15..1.3 of the frame height (animates 0.5s; `large` is the push-in).
  `flip` = true/false. `enter` / `exit` style = `pop | pixel | slide | none`.
  `background` = `clear` (transparent), `green`, `dark`, `light` or any CSS colour. For an MP4 (for example a
  green-screen one), set `"alpha": null` in `film.json`; otherwise the render is a transparent WebM.
  `note` is for the user and you: say why a beat exists.
- **Directing rules:** a pose change carries meaning (a new idea, a question, a reaction, a list item), never just
  "for variety". Hold each pose 1.5s or more (`direction` warns under 0.9s). Move only on a pause or a new section,
  at most every ~5s, and glide unless the user cuts the footage there. Save `large` for the one or two key lines.
  Open with `wave` only if the script greets; end on `cheer`, `thumbs` or `wave`. **Never flip** a mascot with text or
  a logo on its clothes. Leave room for what the user will layer beside the mascot (ask where, if it is not obvious).
- **Show the user the `direction` timeline** (it prints your notes) before rendering. It is plain JSON, so they can
  hand-edit it and you re-run `direction` + `render`.

## Presenter (the user's own character)

A presenter is a folder with `presenter.json` and one PNG per pose, all on one canvas with the feet on one baseline.

**Fastest path: the web app.** The user sets up poses and face boxes in `app/` (steps 1 to 3, with a live preview) and
clicks **Export for Claude Code**. That zip unzips to a ready presenter folder (`source: "mascot-booth-app"`): face boxes
may carry a tilt (`[x, y, w, h, angle]`), and each pose carries the skin colours the app measured. Use it as is, run
step 4 below to check it, and skip steps 1 to 3.

1. Get full-body pose sheets of the character on a flat background (transparent, white, or chroma green #00B140),
   same scale, gaps between figures, no text. Useful poses: idle, explain, think, wave, thumbs, cheer, whoa, shrug,
   laugh. Open-mouth poses are the best talkers: their own mouth art is reused for lip sync.
2. `presenter cut --sheet a.png --names idle,think,explain --sheet b.png --names wave,thumbs --out <dir>`
3. Calibrate per pose in `presenter.json`: `mouth: [x, y, w, h]` around the drawn mouth (include the outline),
   `eyes: [[x, y, w, h], [x, y, w, h]]` around each eye, `mouthArt: "own"` for open-mouth poses (closed-mouth poses
   borrow the `donor` pose's mouth), `blinks: false` where the eyes are already closed. Use
   `presenter review <dir> --out review.png --crop x,y,w,h` to see a grid, adjust, repeat.
4. Check the lip sync and blinks before a film uses it: `MASCOT_BOOTH_PRESENTER=<dir> node <cs>/bin/mascot-booth.mjs stills <cs>/tests/presenter-review --at 0.5 --query mouth=open` (also `mouth=closed`, `mouth=round`, `blink=1`). Every pose shows each mouth shape and a blink.

Lip sync is driven by the voice's **letter timings**, not loudness: M/B/P close, F/V bite, O/U round, E/I wide, A
open, short gaps close, long pauses hand the face back to the pose's own expression. Blinks find the lens interior
by flood fill so glasses frames stay intact; a pose whose lenses cannot be isolated simply does not blink.

## Honesty

Never invent results, timings, metrics or capabilities in a script or on screen. If something was not tested, say
so. Do not post, publish or upload anything; deliver the file.
