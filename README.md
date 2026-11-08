# Little Scholars — Reading Academy V4.3 (review branch)

This branch enhances the original 20-day / four-week learning app without removing any of the existing Phonics Lab, Math Lab, storybooks or Parent Studio features.

## Changes
- New **reading-academy-upgrade.js** loads on the current index page after the main app.
- Adds four distinct original inline SVG picture cues (mouse, snake, apple, mat) and touch-friendly word building on the 16 guided reader pages.
- Adds a **parent sound recording studio** for /m/, /s/, short /a/, /t/. Voice recordings are recorded and saved locally in the browser via MediaRecorder; permission and HTTPS are required. Microphone audio is not uploaded.
- Adds per-page oral decoding observations: independent / supported / needs more practice.
- Tracks attempts and hints separately from page completion. Existing saved browser progress uses the same key as V4.2 and is left intact.

## Review checklist
1. On mobile Safari and desktop browser, open Weeks 1–4, Reading Academy.
2. Check page turns, tap letter tiles, use remove/reset/hint/check.
3. Check accurate phoneme playback from Parent Studio (grant microphone permission); confirm recordings replay.
4. Check a parent oral reading observation appears in Parent Studio counts.
5. Reopen the site and check prior completion, worldview and child name remain intact.
6. Check all existing Phonics Lab, Math Lab, Discover, Missions and illustrated storybooks.
7. Test the Netlify deploy preview before merging to main.

## Limitations
- This is an **early functional prototype**, not a professionally illustrated or human-narrated product. The picture cards use original inline vector drawings. Accurate sounds depend on a parent's recordings.
- Microphone recordings remain in *localStorage* as data URLs and are not synchronized or included with the existing JSON progress export. Browser storage is limited. Separate cloud-based audio storage would require an explicit privacy/security design.
- The app cannot automatically verify spoken pronunciation. Oral reading evidence is parent-observed rather than automated speech recognition.
- The material should be reviewed with an early-literacy specialist before being presented as a validated reading program.

## Deployment
Static site. Netlify publish directory: repository root. No build command. Main branch currently remains unchanged; this is for preview and review.