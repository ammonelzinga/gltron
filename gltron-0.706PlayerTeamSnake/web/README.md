# GL Lite Bike web client

The six-player GLTron fork runs in the browser through WebAssembly. The lobby is a static Vite application. Firebase Realtime Database is used only for room discovery and encrypted WebRTC introductions; gameplay video and controls travel directly between the host browser and each player.

## Features

- Public or private room-code lobbies, optional passwords, and direct invite URLs.
- Up to six riders in Classic, Snake, 3 Teams, or Team Snake matches.
- Browser-hosted WebRTC video plus low-latency control data; no dedicated game server.
- Tournaments for 2–128 entrants with 2–6 riders per heat, configurable qualifiers and championship size, first-to-N scoring, manual/join-order/random seeding, up to four simultaneous arenas, odd-field balancing, optional third-place matches, and late spectators.
- Automatic score capture from the C game, round restarts until the points target is reached, advancing brackets, eliminated-rider spectator mode, and manual host score correction.
- Anonymous Firebase identities and host-only room/tournament writes. Password-protected signaling is encrypted in the browser with PBKDF2 and AES-GCM.

## Local development

From `gltron-0.706PlayerTeamSnake`:

1. Install Emscripten into `.emsdk` (`emsdk install latest`, then `emsdk activate latest`).
2. Run `powershell -ExecutionPolicy Bypass -File web/build-game.ps1`.
3. In `web`, run `npm install` and `npm run dev`.

With no Firebase environment values, the app uses local storage. That mode is intentionally for same-browser multi-tab testing only.

## Free Firebase setup

1. Create a Firebase project on the Spark plan.
2. Enable Authentication → Sign-in method → Anonymous.
3. Create a Realtime Database.
4. Copy `.env.example` to `.env.local` and enter the web app configuration.
5. Deploy `firebase-database.rules.json` as the database rules (or use `firebase deploy --only database`).

Firebase is the signaling/lobby service; it does not run a game server for each room. A host browser runs each arena, and closing the host tab closes its room.

## Test and build

```text
npm test
npm run test:e2e
npm run build
```

The end-to-end suite opens independent host/player tabs in Chrome and Edge, runs a seven-person 4+3 tournament through its final, checks password rooms and spectators, and verifies a real WebAssembly canvas/WebRTC control connection.

## Deploy to glLiteBike.zingabeegames.com

1. Run the WebAssembly build and `npm run build`.
2. Deploy `web/dist` to Firebase Hosting with `firebase deploy --only hosting`, or upload that folder to any HTTPS static host.
3. In the hosting provider, add `glLiteBike.zingabeegames.com` as the custom domain and create the DNS record it supplies.
4. Confirm `.wasm` files are served as `application/wasm` and all routes fall back to `index.html`. The included `firebase.json` configures hosting and database rules.

HTTPS is required outside localhost. The default WebRTC setup uses Google's public STUN service and no TURN relay, so it has no relay bill but cannot connect users behind some restrictive corporate, school, or carrier networks. Guaranteed connectivity requires an optional TURN service; the application reports connection failure instead of silently falling back to a paid dependency.

Large tournaments are bracketed up to 128 entrants, but only configured live heats are rendered and spectators request one stream at a time. Practical simultaneous-arena capacity still depends on the host's CPU and upload speed.
