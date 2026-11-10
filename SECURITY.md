# Security

## Reporting a problem

If you find a security problem, please don't open a public issue. Report it privately through GitHub instead:
go to this repository's **Security** tab and click **Report a vulnerability**.

Please include what you found, how to reproduce it, and what someone could do with it. This is a small, free project
maintained by one person, so replies may take a few days.

## How your keys and files are handled

These are the promises the code keeps. If you find a place where it doesn't, that is a security bug: please report it.

- **No server.** The web app is a static page. There is no Mascot Booth backend, account system or analytics.
- **Your images and voice are not uploaded.** Cutting out poses, lip sync and video export run in your browser.
- **Your ElevenLabs key goes only to ElevenLabs** (`api.elevenlabs.io`), and only when you click an ElevenLabs button.
  The web app never saves it: it lives in the password box until you close or refresh the tab.
- **In the engine**, the key is read only from the `ELEVENLABS_API_KEY` environment variable, sent only to ElevenLabs,
  and never printed, logged or written to a file.
- **The only other downloads** are the speech models (from Hugging Face) and the Transformers.js library (from
  jsDelivr) for Sharper lip sync and `listen`. Nothing is sent with them.

Every network call the web app makes is in `app/js/voice.js` and `app/js/listen-worker.js`.

## Supported versions

Only the latest version on the `main` branch gets fixes.
