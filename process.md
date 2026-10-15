
## Session 9 — 2026-10-15

### Goal
Prepare a simple-language script for a demo video: the app working live plus a code walkthrough.

### Steps done
1. Recalled the working test path from Session 8: Meta app dashboard -> Webhooks -> Page -> `leadgen` -> Test -> Send to server, which delivers sample lead `444444444444`.
2. Compared the `copy/` folder with the main files. After the user's fixes the only differences left are formatting and the empty-list text.
3. Wrote the video script in the chat: demo first, then `start.js`, `server/index.js`, `app/App.js`, then the limits (unpublished app, short-lived token).
   Why: one recording that shows the result first, then explains how each part of the architecture is built.

### Note for recording
Lead `444444444444` must be deleted from `leads` and `outbox` before each demo, otherwise the server treats it as a duplicate and nothing new appears on the phone.
