// UI text in English and Taglish. Keep both short, friendly and non-technical.
export const STRINGS = {
  en: {
    tagline: 'Make your mascot talk. No editing skills needed.',
    kicker: 'Free tool · Mascot Booth', h1a: 'Make your mascot', h1b: 'talk',
    lede: 'Upload your mascot, give it a voice, and export a talking video. No editing skills needed.',
    pill1: 'Free, no account', pill2: 'Runs in your browser', pill3: 'English or Taglish',
    foot_h_a: 'Your mascot,', foot_h_b: 'now talking.',
    foot_body: 'Mascot Booth is a free tool by Zeke & Learn. If it helped, follow the page for more practical AI builds.',
    follow: 'Follow Zeke & Learn', follow_short: 'Follow',
    madeBy: 'A free tool by',
    step1: 'Make your poses', step2: 'Upload poses', step3: 'Face setup', step4: 'Voice', step5: 'Animate & export',
    next: 'Next', back: 'Back',

    s1_title: 'First, give your mascot 6 poses',
    s1_body: 'We\'ll use ChatGPT to draw your mascot in 6 poses. It takes about a minute.',
    s1_a: 'Open ChatGPT and start a new chat.',
    s1_b: 'Attach a picture of your mascot (the clearer, the better).',
    s1_c: 'Copy the prompt below, paste it, and send.',
    s1_d: 'Download the image ChatGPT makes. That\'s your pose sheet.',
    s1_copy: 'Copy prompt', s1_copied: 'Copied!', s1_open: 'Open ChatGPT',
    s1_tip: 'Tip: if a pose looks off (different face, missing feet, poses touching), ask ChatGPT to "try again, keep the same character".',
    s1_have: 'I have my pose sheet',
    s1m_title: 'Optional: drawn mouths for better talking',
    s1m_body: 'In the same ChatGPT chat, send this prompt too. You get 9 mouths for different sounds, so the talking looks drawn instead of stretched.',
    s1m_copy: 'Copy mouth prompt',

    s2m_title: 'Mouth sheet (optional)',
    s2m_hint: 'The 9 mouths from the mouth prompt. Skip this and your mascot still talks, using its own mouth.',
    s2m_drop: 'Drop the mouth sheet here',
    s2m_found: 'Got all 9 mouths. Your mascot will talk with them.',
    s2m_expect: 'We need 9 mouths in a 3 by 3 grid. Found {n}. Try generating the mouth sheet again.',
    s2m_working: 'Cutting out the mouths…',

    s2_title: 'Upload your pose sheet',
    s2_drop: 'Drop the image here, or click to choose',
    s2_hint: 'PNG, JPG or WEBP from ChatGPT. Green, white or transparent background.',
    s2_found: 'Found {n} poses',
    s2_expect: 'We need exactly 6 poses. Found {n}. Try generating the sheet again, with more space between poses.',
    s2_check: 'Check the names. If one is wrong, pick the right name from its menu.',
    s2_working: 'Cutting out your poses…',

    s3_title: 'Show us the mouth and eyes',
    s3_body: 'Drag the boxes so the green one covers the mouth and the blue ones cover each eye. Watch the preview: the mouth should open and close, and the eyes should blink cleanly.',
    s3_closed: 'Eyes are closed in this pose',
    s3_pose: 'Pose {i} of {n}',
    s3_auto: 'We guessed where they are. Just fix what\'s off.',
    s3_mouthbox: 'Mouth', s3_eyebox: 'Eye',
    s3_draw: 'Pick one, then drag a box around it on the face. Drag a box to move it, its corner to resize, or the round handle on top to tilt it (double-click the handle to straighten).',
    s3_prev: 'Previous pose', s3_next: 'Next pose', s3_done: 'All poses look good',
    s3_cc_title: 'Use this mascot in Claude Code (optional)',
    s3_cc_body: 'Downloads a zip with your poses and face boxes. Unzip it and tell Claude Code where the folder is: it can then write the script, make the voice and direct your mascot for you.',
    s3_cc_btn: 'Export for Claude Code', s3_cc_working: 'Packing your mascot…', s3_cc_done: 'Saved {f}. Unzip it, then point Claude Code at the folder.',

    s4_title: 'Give your mascot a voice',
    s4_upload: 'Upload audio', s4_record: 'Record', s4_eleven: 'ElevenLabs',
    s4_drop: 'Drop an audio file here, or click to choose (MP3, WAV, M4A)',
    s4_rec_start: 'Start recording', s4_rec_stop: 'Stop', s4_rec_hint: 'Allow the microphone when your browser asks.',
    s4_el_key: 'ElevenLabs API key', s4_el_keyhint: 'Stays in this browser tab. We never see it.',
    s4_el_voice: 'Voice', s4_el_load: 'Load my voices', s4_el_text: 'What should your mascot say?',
    s4_el_go: 'Make the voice', s4_el_tags: 'Tip: add feelings in brackets, like [excited] or [laughs].',
    s4_ready: 'Voice ready: {s} seconds', s4_working: 'Listening to the voice…',
    s4_el_working: 'ElevenLabs is speaking…',
    s4_sample_q: 'No voice yet? Try it with ours first.', s4_sample_btn: '▶ Use a sample voice',
    s4_sample_ready: 'Sample voice ready: {s} seconds (Zeke\'s AI voice clone, made with ElevenLabs).',
    s4s_title: 'Sharper lip sync (optional)',
    s4s_hint: 'Times every letter you said, so the mouth closes on M, B and P, rounds on O and bites on F. Runs on your computer and nothing is uploaded. The first time, it downloads a speech model (about 95 MB, or 230 MB without the text below). After that it starts quickly.',
    s4s_text: 'What did you say? (optional)',
    s4s_text_hint: 'Paste your script for the best match and a smaller download. Leave it empty and we write down what you said first.',
    s4s_en: 'I spoke English', s4s_tl: 'I spoke Tagalog or Taglish',
    s4s_go: 'Make lip sync sharper',
    s4s_download_whisper: 'Downloading the speech-to-text model… {p}', s4s_whisper: 'Writing down what you said…',
    s4s_download_aligner: 'Downloading the letter-timing model… {p}', s4s_align: 'Timing every letter… {p}',
    s4s_done: 'Sharper lip sync is on: {n} words timed.', s4s_heard: 'We heard: "{t}"',
    s4s_weak: 'Done, but the words and the recording do not match well. Check the text you pasted, or clear it and try again.',
    s4s_no_speech: 'No speech was heard in the recording.',

    s5_title: 'Animate and export',
    s5_play: 'Play', s5_pause: 'Pause',
    s5_size: 'Video size', s5_bg: 'Background', s5_scale: 'Mascot size', s5_pos: 'Position', s5_enter: 'Entrance',
    s5_left: 'Left', s5_center: 'Center', s5_right: 'Right',
    s5_pop: 'Pop', s5_pixel: 'Pixel', s5_slide: 'Slide up', s5_none: 'None',
    s5_bg_clear: 'Transparent', s5_bg_green: 'Green screen', s5_bg_dark: 'Dark', s5_bg_light: 'Light', s5_bg_glow: 'Glow', s5_bg_custom: 'Color',
    s5_timeline: 'Poses. Click one to change it.',
    s5_export: 'Export',
    s5_exp_alpha: 'Transparent video (WebM)', s5_exp_alpha_hint: 'For Canva, CapCut, Premiere. Put your mascot on top of anything.',
    s5_exp_mp4: 'MP4 video', s5_exp_mp4_hint: 'Ready to post, with the background you picked. Pick Green screen to key it out in any editor.',
    s5_exporting: 'Making your video… {p}%', s5_done: 'Done! Your download should start.',
    s5_unsupported: 'Your browser can\'t make videos here. Please use Chrome or Edge on a computer.',
    s5_alpha_note: 'Transparent export works best in Chrome or Edge.',
    pick_pose: 'Pick a pose',
    pose_idle: 'Idle', pose_explain: 'Explaining', pose_wave: 'Wave', pose_think: 'Thinking', pose_thumbs: 'Thumbs up', pose_cheer: 'Cheer',
    privacy: 'Everything happens on your computer. Your images and voice are never uploaded.',
  },
  tl: {
    tagline: 'Pagsalitain ang mascot mo. Kahit walang alam sa editing.',
    kicker: 'Libreng tool · Mascot Booth', h1a: 'Pagsalitain ang', h1b: 'mascot mo',
    lede: 'I-upload ang mascot mo, bigyan ng boses, at mag-export ng video na nagsasalita. Kahit walang alam sa editing.',
    pill1: 'Libre, walang account', pill2: 'Sa browser mo lang', pill3: 'English o Taglish',
    foot_h_a: 'Ang mascot mo,', foot_h_b: 'nagsasalita na.',
    foot_body: 'Libreng tool ang Mascot Booth mula sa Zeke & Learn. Kung nakatulong, i-follow ang page para sa iba pang practical AI builds.',
    follow: 'I-follow ang Zeke & Learn', follow_short: 'I-follow',
    madeBy: 'Libreng tool mula sa',
    step1: 'Gawin ang poses', step2: 'I-upload', step3: 'Mukha', step4: 'Boses', step5: 'Animate at export',
    next: 'Next', back: 'Back',

    s1_title: 'Una, bigyan natin ng 6 poses ang mascot mo',
    s1_body: 'Gagamitin natin ang ChatGPT para i-drawing ang mascot mo sa 6 na poses. Mga isang minuto lang.',
    s1_a: 'Buksan ang ChatGPT at mag-new chat.',
    s1_b: 'I-attach ang picture ng mascot mo (mas malinaw, mas maganda).',
    s1_c: 'I-copy ang prompt sa baba, i-paste, at i-send.',
    s1_d: 'I-download ang image na ginawa ng ChatGPT. Yan ang pose sheet mo.',
    s1_copy: 'Copy prompt', s1_copied: 'Copied!', s1_open: 'Buksan ang ChatGPT',
    s1_tip: 'Tip: kung may pose na mali (iba ang mukha, putol ang paa, magkadikit), sabihin sa ChatGPT: "try again, same character".',
    s1_have: 'May pose sheet na ako',
    s1m_title: 'Optional: drawn na bibig para mas maganda ang salita',
    s1m_body: 'Sa parehong ChatGPT chat, i-send din itong prompt. Makakakuha ka ng 9 na bibig para sa iba\'t ibang tunog, kaya mukhang drawing ang pagsasalita, hindi stretched.',
    s1m_copy: 'Copy mouth prompt',

    s2m_title: 'Mouth sheet (optional)',
    s2m_hint: 'Yung 9 na bibig galing sa mouth prompt. Kahit i-skip mo ito, magsasalita pa rin ang mascot mo gamit ang sarili niyang bibig.',
    s2m_drop: 'I-drop dito ang mouth sheet',
    s2m_found: 'Kumpleto ang 9 na bibig. Ito na ang gagamitin ng mascot mo sa pagsasalita.',
    s2m_expect: 'Kailangan ng 9 na bibig, 3 by 3. {n} lang ang nakita. Subukang i-generate ulit ang mouth sheet.',
    s2m_working: 'Ginugupit ang mga bibig…',

    s2_title: 'I-upload ang pose sheet mo',
    s2_drop: 'I-drop dito ang image, o i-click para pumili',
    s2_hint: 'PNG, JPG o WEBP galing ChatGPT. Green, white o transparent na background.',
    s2_found: '{n} poses ang nakita',
    s2_expect: 'Kailangan eksaktong 6 poses. {n} lang ang nakita. Subukang i-generate ulit, mas maluwag ang pagitan ng poses.',
    s2_check: 'I-check ang mga pangalan. Kung may mali, piliin ang tamang pangalan sa menu nito.',
    s2_working: 'Ginugupit ang poses mo…',

    s3_title: 'Ituro natin ang bibig at mata',
    s3_body: 'I-drag ang mga box: green sa bibig, blue sa bawat mata. Tingnan ang preview: dapat bumubuka-sara ang bibig at malinis ang kurap ng mata.',
    s3_closed: 'Nakapikit ang mata sa pose na ito',
    s3_pose: 'Pose {i} of {n}',
    s3_auto: 'Hinulaan na namin kung nasaan sila. Ayusin lang ang mali.',
    s3_mouthbox: 'Bibig', s3_eyebox: 'Mata',
    s3_draw: 'Pumili ng isa, tapos mag-drag ng box sa paligid nito sa mukha. I-drag ang box para ilipat, ang kanto para palakihin, o ang bilog sa taas para i-tilt (i-double-click ang bilog para ituwid).',
    s3_prev: 'Nakaraang pose', s3_next: 'Susunod na pose', s3_done: 'Okay na lahat ng poses',
    s3_cc_title: 'Gamitin ang mascot sa Claude Code (optional)',
    s3_cc_body: 'Magda-download ng zip na may poses at face boxes mo. I-unzip, tapos sabihin kay Claude Code kung nasaan ang folder: siya na ang gagawa ng script, voice at direction ng mascot mo.',
    s3_cc_btn: 'Export for Claude Code', s3_cc_working: 'Inihahanda ang mascot mo…', s3_cc_done: 'Na-save ang {f}. I-unzip, tapos ituro kay Claude Code ang folder.',

    s4_title: 'Bigyan ng boses ang mascot mo',
    s4_upload: 'Upload audio', s4_record: 'Mag-record', s4_eleven: 'ElevenLabs',
    s4_drop: 'I-drop dito ang audio file, o i-click para pumili (MP3, WAV, M4A)',
    s4_rec_start: 'Simulan ang recording', s4_rec_stop: 'Stop', s4_rec_hint: 'I-allow ang microphone pag nagtanong ang browser.',
    s4_el_key: 'ElevenLabs API key', s4_el_keyhint: 'Nasa browser tab mo lang ito. Hindi namin nakikita.',
    s4_el_voice: 'Boses', s4_el_load: 'I-load ang voices ko', s4_el_text: 'Ano ang sasabihin ng mascot mo?',
    s4_el_go: 'Gawin ang boses', s4_el_tags: 'Tip: lagyan ng feelings sa brackets, tulad ng [excited] o [laughs].',
    s4_ready: 'Ready na ang boses: {s} seconds', s4_working: 'Pinapakinggan ang boses…',
    s4_el_working: 'Nagsasalita ang ElevenLabs…',
    s4_sample_q: 'Wala pang boses? Subukan muna gamit ang amin.', s4_sample_btn: '▶ Gamitin ang sample voice',
    s4_sample_ready: 'Ready na ang sample voice: {s} seconds (AI voice clone ni Zeke, gawa sa ElevenLabs).',
    s4s_title: 'Mas sharp na lip sync (optional)',
    s4s_hint: 'Tina-time ang bawat letra na sinabi mo, kaya sumasara ang bibig sa M, B at P, bumibilog sa O at kumakagat sa F. Sa computer mo lang tumatakbo at walang ina-upload. Sa unang beses, magda-download ito ng speech model (mga 95 MB, o 230 MB kung walang text sa baba). Pagkatapos noon, mabilis na.',
    s4s_text: 'Ano ang sinabi mo? (optional)',
    s4s_text_hint: 'I-paste ang script mo para mas tama at mas maliit ang download. Kung blangko, isusulat muna namin ang narinig namin.',
    s4s_en: 'English ang salita ko', s4s_tl: 'Tagalog o Taglish ang salita ko',
    s4s_go: 'Gawing mas sharp ang lip sync',
    s4s_download_whisper: 'Dina-download ang speech-to-text model… {p}', s4s_whisper: 'Isinusulat ang sinabi mo…',
    s4s_download_aligner: 'Dina-download ang letter-timing model… {p}', s4s_align: 'Tina-time ang bawat letra… {p}',
    s4s_done: 'Naka-on na ang sharp lip sync: {n} words na-time.', s4s_heard: 'Narinig namin: "{t}"',
    s4s_weak: 'Tapos na, pero hindi masyadong tugma ang text at ang recording. I-check ang text na in-paste mo, o burahin ito at subukan ulit.',
    s4s_no_speech: 'Walang narinig na boses sa recording.',

    s5_title: 'Animate at i-export',
    s5_play: 'Play', s5_pause: 'Pause',
    s5_size: 'Size ng video', s5_bg: 'Background', s5_scale: 'Laki ng mascot', s5_pos: 'Pwesto', s5_enter: 'Pasok',
    s5_left: 'Kaliwa', s5_center: 'Gitna', s5_right: 'Kanan',
    s5_pop: 'Pop', s5_pixel: 'Pixel', s5_slide: 'Slide up', s5_none: 'Wala',
    s5_bg_clear: 'Transparent', s5_bg_green: 'Green screen', s5_bg_dark: 'Dark', s5_bg_light: 'Light', s5_bg_glow: 'Glow', s5_bg_custom: 'Kulay',
    s5_timeline: 'Poses. I-click para palitan.',
    s5_export: 'Export',
    s5_exp_alpha: 'Transparent video (WebM)', s5_exp_alpha_hint: 'Para sa Canva, CapCut, Premiere. Ipatong ang mascot mo kahit saan.',
    s5_exp_mp4: 'MP4 video', s5_exp_mp4_hint: 'Ready i-post, kasama ang background na pinili mo. Piliin ang Green screen para ma-key out sa kahit anong editor.',
    s5_exporting: 'Ginagawa ang video mo… {p}%', s5_done: 'Tapos na! Magda-download na yan.',
    s5_unsupported: 'Hindi kaya ng browser mo gumawa ng video dito. Gamitin ang Chrome o Edge sa computer.',
    s5_alpha_note: 'Mas gumagana ang transparent export sa Chrome o Edge.',
    pick_pose: 'Pumili ng pose',
    pose_idle: 'Idle', pose_explain: 'Nag-e-explain', pose_wave: 'Kumakaway', pose_think: 'Nag-iisip', pose_thumbs: 'Thumbs up', pose_cheer: 'Cheer',
    privacy: 'Sa computer mo lang lahat nangyayari. Hindi namin ina-upload ang images at boses mo.',
  },
};

export const POSES = ['idle', 'explain', 'wave', 'think', 'thumbs', 'cheer'];

export const CHATGPT_PROMPT = `Use the character in the attached image as the exact reference. Draw the SAME character in the SAME art style: same face, hair, colors, clothes and body proportions.

Make ONE image with exactly 6 full-body poses, in a grid of 3 columns and 2 rows, in this order:
1) IDLE: standing relaxed, friendly smile with the mouth slightly open
2) EXPLAINING: one hand held out to the side like presenting something, talking with the mouth open
3) WAVE: one hand raised beside the head, waving hello, big open smile
4) THINKING: hand on chin, eyes looking up, mouth closed
5) THUMBS UP: one thumb up in front of the chest, open smile
6) CHEER: both fists raised, happy open-mouth smile

Rules for every pose:
- Full body from the top of the head to the feet, facing the viewer.
- Same height and same scale in every pose, feet on the same level.
- Eyes open in every pose.
- The mouth is clearly drawn. Open mouths show the teeth and tongue.
- Lots of empty space between poses. Nothing touches or overlaps.
- Background: solid flat chroma-key green (#00B140) everywhere. No gradient, no floor, no shadows.
- No text, labels, numbers, sparkles or effect marks anywhere.
- Nothing on the character is green.`;

// Optional second prompt: a drawn mouth set for lip sync. Order matters (see DRAWN in mascot.js).
export const MOUTH_PROMPT = `Using the same character as before (or the character in the attached image), make ONE image: a MOUTH SHEET with exactly 9 separate mouths of this character, drawn in the IDENTICAL art style, outline weight, colours and shading as the character. Every mouth is drawn front-on at the same size as each other, about as wide as the character's smile, centered in its own cell, in a neat 3 by 3 grid with wide gaps so nothing touches. Draw ONLY the mouth and lips (no nose, no chin, no face, no skin patch around it).

The 9 mouths, left to right, top to bottom:
1) lips closed and pressed together, a straight relaxed line (for M, B, P)
2) slightly open with top and bottom teeth together, small smile (for S, T, K, EE)
3) medium open, relaxed, some top teeth showing (for EH, AE)
4) wide open, jaw dropped, tongue visible at the bottom (for AH)
5) open and slightly rounded, medium size (for OH)
6) small tight round pucker (for OO, W)
7) top teeth resting on the lower lip (for F, V)
8) open with the tongue tip raised behind the top teeth (for L)
9) closed gentle friendly smile at rest

Background: solid flat chroma-key green (#00B140), evenly lit, no gradient, no shadows. No text, no labels, no numbers. Nothing is green.`;

let lang = 'en';
try { lang = localStorage.getItem('mascot-booth-lang') || (/^(fil|tl)/.test(navigator.language || '') ? 'tl' : 'en'); } catch {}
export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem('mascot-booth-lang', l); } catch {} apply(); }
export function t(key, vars = {}) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', v);
  return s;
}
/** Fill every [data-t] element; [data-t-attr="placeholder"] puts it in an attribute instead. */
export function apply(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => {
    const v = t(el.dataset.t);
    if (el.dataset.tAttr) el.setAttribute(el.dataset.tAttr, v); else el.textContent = v;
  });
  document.documentElement.lang = lang === 'tl' ? 'fil' : 'en';
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  document.dispatchEvent(new CustomEvent('langchange'));
}
