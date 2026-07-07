# MOSC AI Scribe GitHub Static Site

This folder contains a GitHub Pages-ready static version of the MOSC AI Scribe sample.

## Files

- `index.html` - page shell
- `styles.css` - visual design
- `app.js` - recorder, settings, Gemini call, prompts, JSON schemas, fallback models

## How To Use

1. Create a GitHub repository.
2. Upload these three files to the repository root.
3. Enable GitHub Pages from repository settings.
4. Open the site.
5. Click the settings button in the bottom-left corner.
6. Paste your own Gemini API key.

The key is stored only in your browser local storage. No API key is included in these files.

## Matched Settings

- Default model: `gemini-2.5-flash`
- High accuracy model: `gemini-3-pro-preview`
- Fallbacks: `gemini-3-flash-preview`, then `gemini-3.1-flash-lite-preview`
- `responseMimeType`: `application/json`
- `temperature`: `0.1`
- OPD new patient schema
- OPD follow-up schema
- Strict Dictation Mode prompts
- Dark Mode
- Browser microphone recording with `audio/webm`

## Important Security Note

Any API key used directly in a browser website can be seen by the user of that browser. For public production use, route requests through your own backend or serverless function and keep the Gemini API key on the server.
