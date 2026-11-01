# glTrof web client

The six-player GLTron fork is precompiled to WebAssembly. Browsers download the compiled module; Emscripten does not run on players' devices. The lobby is a static Vite application. Firebase Realtime Database handles room discovery plus encrypted WebRTC introductions. The host browser runs the authoritative match. Versioned game checkpoints and controls travel directly between browsers. Every player renders the original C game locally through WebAssembly.

## Features

- One remembered rider name and per-tab local rider count feed every play action. Quick-match preferences are collapsible; a focused host dialog groups lobby, game and tournament settings. Public lobbies support name/code, mode and session filters, one-click public joining, and password prompts when needed.

- GLtron menu artwork and gold/blue home page, one-click quick match with size/mode/speed preferences, and configuration details on public room cards. New rooms default to Large (720).
- Player names persist in the browser. Ordinary match results offer Play again votes; only the host starts the rematch, reusing existing WebRTC connections and clearing scores. Tournaments use their own bracket flow.
- Opaque bike-colored trails and matching minimap markers/lines. Crashed trails disappear from rendering and collisions immediately by default; the host can keep them by unchecking the crash-clearing option.

- Public or private room-code lobbies, optional passwords, and direct invite URLs.
- Up to six riders in Classic, Snake, 3 Teams, or Team Snake matches.
- WebRTC data channels carry compressed simulation checkpoints and reliable controls. Each browser renders its own camera or local split screen. No video stream or dedicated game server.
- Automatic coordinator handover preserves active matches and concurrent tournament arenas. Graceful Exit transfers immediately; a vanished host is replaced after its four-second lease expires. Cameras and glance stay local.
- Quick match pools waiting riders and creates a public room automatically. Preferences are exact for ten seconds, then the closest available configuration wins. Each Absolutely required checkbox permanently locks its setting. Compatible pools start after a shared three-second countdown.
- Tournaments for 2–128 entrants with 2–6 riders per heat, configurable qualifiers and championship size, first-to-N scoring, manual/join-order/random seeding, up to four simultaneous arenas, odd-field balancing, optional third-place matches, and late spectators.
- Automatic score capture from the C game, round restarts until the points target is reached, advancing brackets, eliminated-rider spectator mode, and manual host score correction.
- Anonymous Firebase identities and host-only room/tournament writes. Password-protected signaling is encrypted in the browser with PBKDF2 and AES-GCM.

## Local development

From `gltron-0.706PlayerTeamSnake`:

1. Install Emscripten into `.emsdk` (`emsdk install latest`, then `emsdk activate latest`).
2. Run `powershell -ExecutionPolicy Bypass -File web/build-game.ps1`.
3. In `web`, run `npm install` and `npm run dev`.

With no Firebase environment values, Vite provides an in-memory local lobby/signaling service. Chrome and Edge can share rooms using the exact same local server URL. Restarting the local server clears these temporary rooms. Static production builds still require Firebase for shared internet lobbies; their browser-storage fallback only supports the same browser profile.

Every browser has its own local Player 1: left/right arrows turn, up arrow boosts, comma/period glance. Local Player 2 uses A/D, W, Q/E; Player 3 uses J/L, I, U/O; Player 4 uses numpad 1/3, 5, 4/6. Bindings are editable. Browser cameras are rendered independently from desktop split-screen proportions; only riders sharing a browser share its displayed split-screen.

The local server applies room joins and signaling writes atomically. The browser-storage fallback uses Web Locks and individual path records. The host engine uses a worker-driven clock, so switching tabs does not pause simulation/rendering; legacy SDL keyboard/mouse bindings are ignored in web builds so only configured web controls apply. The local service is part of the existing development server, with no cloud account or paid service needed for local testing.

## Free Firebase setup

1. Create a Firebase project on the Spark plan.
2. Enable Authentication → Sign-in method → Anonymous.
3. Create a Realtime Database.
4. Copy `.env.example` to `.env.local` and enter the web app configuration.
5. Deploy `firebase-database.rules.json` as the database rules (or use `firebase deploy --only database`).

Firebase is the shared signaling/lobby/queue service; it does not run a game server per room. One elected browser resolves each arena. Other browsers retain checkpoints for automatic takeover. Closing the final participant removes the room on graceful Exit. Abrupt disconnects remove that browser’s presence and rider records.

## Test and build

```text
npm test
npm run test:e2e
npm run build
```

The end-to-end suite opens independent host/player tabs in Chrome and Edge, runs a seven-person 4+3 tournament through its final, checks password rooms and spectators, and verifies a real WebAssembly canvas/WebRTC control connection.

`tests/e2e/perspectives.spec.js` captures early/later gameplay screenshots in `visual-review/perspective-*.png`, checks rendered pixels in every local pane, and covers six riders distributed as 3+1+1+1, 1+3+1+1, 2+2+1+1, and 4+1+1. These perspective scenarios run in Chrome; live native-engine/control checks run in Chrome, Edge, and Firefox. Screenshot review complements connection-state assertions; neither certifies connectivity across every internet network.

`tests/e2e/background.spec.js` uses installed Windows Chrome/Edge. It tests independent browser profiles sharing local rooms, P1/P2 binding isolation, moving local game frames, and a genuinely hidden Chrome host using a temporary normal Chrome profile without Playwright's forced-visibility defaults.

`tests/e2e/crash.spec.js` checks original impact-to-debris timing across six cameras, keeps the rider's camera through the three-second shatter animation, and saves three crash stages from Chrome and Edge. Impact rings and white spires use the original geometry; debris retains the original face trajectories with batched web rendering. Native crash screenshots are saved alongside the web captures in `visual-review` for manual comparison.

`tests/e2e/turn-render.spec.js` exercises left/right turns, boost, and both glance keys for each local rider on host and guest browsers. It checks actual direction/action state plus visible pixels in every pane after each input, covering one- and two-local-player browsers in Chrome, Edge, and Firefox. This catches the first-turn blank canvas regression caused by incomplete immediate-mode vertex attributes in completed trail segments.

`tests/e2e/modes.spec.js` checks Classic, Snake, 3 Teams, and Team Snake with four local riders plus two Insane bots. It turns all four human riders and checks every pane remains visible. Tournament flow checks also verify unsaved final scores survive a late spectator joining before the host saves the result.

`tests/e2e/lobby-features.spec.js` checks name persistence, preferred quick matching, desktop/mobile layouts and actual host/guest rematches in Chrome, Edge and Firefox. `tests/e2e/colors.spec.js` samples minimap pixels for distinct rider colors. Local-development rooms share presence and coordinator leases across browsers. Production Firebase uses separate authenticated slot claims, player/presence disconnect registrations, and atomic authority changes.

## Deploy to glLiteBike.zingabeegames.com

1. Run the WebAssembly build and `npm run build`.
2. Deploy `web/dist` to Firebase Hosting with `firebase deploy --only hosting`, or upload that folder to any HTTPS static host.
3. In the hosting provider, add `glLiteBike.zingabeegames.com` as the custom domain and create the DNS record it supplies.
4. Confirm `.wasm` files are served as `application/wasm` and all routes fall back to `index.html`. The included `firebase.json` configures hosting and database rules.

HTTPS is required outside localhost. The default WebRTC setup uses Google's public STUN service and no TURN relay, so it has no relay bill but cannot connect users behind some restrictive corporate, school, or carrier networks. Guaranteed connectivity requires an optional TURN service; the application reports connection failure instead of silently falling back to a paid dependency.

Large tournaments are bracketed up to 128 entrants. The coordinator renders configured live heats; each spectator renders one chosen arena. Practical simultaneous-arena capacity depends on CPU and checkpoint upload capacity. Large lobbies connect through the coordinator and two preconnected backups rather than a full peer mesh.

`native-network.spec.js` checks real WebRTC data channels, independent native engines, abrupt host departure, and parallel-arena recovery. `quick-queue.spec.js` checks pooled starts, the ten-second fallback, locked preferences and cancellation. `session-controls.spec.js` checks graceful Exit plus spectator rider/arena switching.

For local Firebase rule verification, start `firebase emulators:start --only database --project demo-gltrof`, then run `node tests/firebase-rules.mjs`. The test uses separate simulated identities and checks simultaneous SDK slot claims, signaling access, coordinator handover, and denied unauthorized writes. It never connects to a production project.
