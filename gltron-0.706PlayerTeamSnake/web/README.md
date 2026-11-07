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
- Quick match pools waiting riders and creates a public room automatically. Preferences are exact for ten seconds, then the closest available configuration wins. Each Absolutely required checkbox permanently locks its setting. Quick pools wait up to 30 seconds from the first search for four human riders; four or more humans start early without bots. Casual games with fewer than four humans fill remaining seats with native bots (Insane 50%, Smart 30%, Fair 15%, Dumb 5%). Ranked never fills with bots and keeps waiting if human opponents are missing. Each bot keeps its own native difficulty through rematches and host migration.
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

## Ranked play

Casual is the default and never changes MMR. Ranked is an explicit choice in quick match or host setup; room-code joins show a second, explicit Join ranked action. Each browser’s Player 1 needs a different Google account. Split screen remains supported: local Players 2–4 participate as unranked guests, earn no personal rating, and add no browser votes. Bots and tournaments stay casual. Team Snake uses the Team ladder.

Enable both Anonymous and Google providers in Firebase Authentication. Add your production domain to Authentication’s authorized domains, fill the existing web environment configuration, deploy the updated database rules, then rebuild. No Cloud Functions or separate rating server are required. Google popup login was tested through the local Authentication emulator, not a real Google account or production project.

The ranked history lives under `rankedMatches`. The roster/voting membership is frozen before play. Each browser writes its own immutable full placement report under its Google UID. A unique highest vote count wins. An unbeatable majority may finalize early; otherwise reports have 30 seconds to arrive. After timeout, more than half of eligible browsers must have supplied valid reports. No quorum means no MMR update. Equal top vote counts use the host’s reported result if it is among the tied candidates; otherwise the host chooses between tied candidates. Genuine placement ties stay draws. Host migration preserves the ballot; missing clients cannot block an already unbeatable majority.

Completed records are immutable. Clients reject inconsistent final selections and derive three independent rating histories (Normal, Snake, Team) from accepted results, ordered by server completion time and match ID. Hosts never receive write access to other users’ stored MMR. Replaying a match ID cannot award another update. The current design downloads and recomputes the accepted history, suitable for an initial community deployment; large histories will eventually need indexed snapshots.

Ratings use published Glicko-2 equations with a 1500 starting rating, rating deviation 350 and volatility 0.06. FFA comparisons are weighted so a match is not treated as several independent games. Team results use team mean skill and uncertainty with a per-member contribution factor; this is a glTrof adaptation, not Valve’s private Dota formula. A provisional label appears for the first ten rated matches. Team standings use native team wins, not individual crash points.

Peer reports cross-check the host-provided game state; they are not independent anti-cheat validation. Colluding accounts or a dishonest host can still undermine community rankings or withhold finalization. Rating mathematics and consensus are verified by clients; database rules protect identity, frozen records and write ownership rather than executing Glicko mathematics.

For emulator verification:

```text
firebase emulators:start --only "database,auth" --project demo-gltrof
node tests/firebase-rules.mjs
node tests/ranked-rules.mjs
node node_modules/@playwright/test/cli.js test --config=playwright.ranked.config.js
```

The separate ranked test config supplies dummy project settings and connects only to local emulators. Emulator environment variables are ignored in production builds.

## World rankings and groups

Open **Rankings** from the home screen for your selected ladder’s MMR, world position, match count, and top 10, 50, or 100 players. Equal rounded MMR shares a position; unplayed accounts are unranked. The list uses accepted match history, not editable profile scores. Normal, Snake, and Team remain independent. Team Snake shares Team.

**Copy invite link** in any lobby produces a textable URL with its room code. Passwords are not included in lobby invite links. Group invites use a separate ?party=CODE link; opening it joins the group. Groups persist across match exits in the same browser tab. Names and local rider counts still come from the single home-screen identity bar.

A group can contain up to six physical riders across browsers, including split-screen guests. Any member can host, join a public/private/password lobby, or search quick match for everyone. The queue counts the entire group’s riders and Google accounts. All members must be home, or already in the selected lobby; a group cannot pull someone out of another active match. Whole-group admission is a host-validated atomic room transaction: capacity failure never seats a partial group. Membership heartbeats expire after 15 seconds; lobby admission expires after 25 seconds if the host is unavailable. Leaving a group does not eject you from an existing match. Groups reserve match seats; team assignment still follows native slot pairs, so large groups may span teams. Tournament entrants can register together but the bracket may place them in different heats.

Ranked groups require every browser’s distinct Google account plus its **Ready for ranked** checkbox. Only local Player 1 is rated; local guests add physical seats, not votes. Google identities are recorded under immutable rankedIdentities entries, protected by the actual Google authentication claim. The host checks those records and live membership before admitting a ranked group. Joining a password lobby shares its password only inside the group action, encrypted using the invite code; treat group codes as private invitations.

Community browser checks: node node_modules/@playwright/test/cli.js test tests/e2e/community.spec.js --workers=1. Ranked emulator tests also cover consent-gated group hosting and leaderboard updates.

Firebase queue regression: `node node_modules/@playwright/test/cli.js test --config=playwright.queue.config.js`. Requires local Auth/Database emulators. It covers Chrome + Edge using a cold queue with an existing revision, real 30-second waits, individual native bot levels, six-human early starts, and human-only ranked. Default browser tests explicitly disable production Firebase settings even when `.env.local` exists.

New lobbies, quick matches and tournament heats default to 25 points to win. Rounds restart automatically until the match target is reached. Hosts may choose a different target.

New matches use tiered trap scoring: distant trail 0.25, nearby trail owner 0.75, nearby opponent 0.5, physical cycle-body contact 2 points. Exactly one highest award per crash; equal awards prefer the actual trail owner, then nearest head, then a stable rider slot. No self-credit. Nearby is squared Euclidean distance within 0.3 seconds of the candidate’s instantaneous movement speed, including boost and native speed modulation. Individual points = survival plus awarded trap points; team points = team round wins plus teammates’ awarded trap points. Equal points are ordered by trap count; genuinely equal results share a place. Ranked uses the same native totals and tie-breaks for placements. Original scoring identifiers remain readable for historical match records. The scoreboard shows points plus separate survival/trap counts; rematches reset both counters. Tournament heat totals retain fractional points and use traps at a tied advancement cutoff, with host resolution still required for exact ties.

Trap geometry runs in the authoritative native simulation. Current mesh bounds are cached once (10 units long, about 2.52 wide); body collision uses a swept rectangle to avoid tunneling. Tick-start motion and collision times are resolved for at most six riders, so earlier crashes remove bodies/erased trails consistently. Award selection is allocation-free and uses squared distances; it never scans trail history. Integer quarter-points are carried in protocol-2 checkpoints and cleared on rematches. Historical survival and flat-half-point scoring identifiers remain readable. Run `powershell -File tests/run-native-traps.ps1` for native C rule/geometry checks and an isolated award-selection benchmark. `tiered-traps.spec.js` exercises actual trail, nearby, wall, moving-body and simultaneous head-on crashes.

## Publishing inside Digital Hive

The source repository stays reusable: `.env.example` is blank, and your `.env.local` is excluded from Git. Configure your Firebase deployment locally, compile the engine, then run `npm run build:site` for the fixed `/digitalhive/gltrof/` address. Engine downloads, artwork, scripts, CSS, home links and invite URLs respect this prefix.

After committing the source, run `npm run package:site`. This produces `site-package/gltrof-digitalhive.zip` containing `vendor/gltrof/`, `assets/gltrof-source.zip`, and `assets/GLTROF-COPYING.txt`. Copy those directories into the Zingabee website, then run its normal build and deployment. No Firebase setup is needed in the website itself. The compiled game includes the public Firebase web identifiers supplied at build time; source and local settings remain separate. The package includes the exact source commit and replaces older offline-preview banner wording without changing the website builder.

Firebase Authentication must authorize the website hostname (for example `zingabeegames.com`). A URL path is not an authorized domain: use the hostname only. Firebase Hosting is optional; these static files work on the website’s existing host. Google client secrets and Firebase admin credentials are never part of the source or bundle.

## Google names and touch play

Rankings use the signed-in Google profile display name, separate from the editable game nickname. Ratings remain keyed to the Firebase account UID. Public `rankedProfiles` entries contain only the display name and update time; owners must sign in through Google and the name must match their authentication token. Existing accounts publish their label when the updated client next initializes or signs in. Old game nicknames are not used as fallback leaderboard identities.

Google sign-in initially fills the rider name from the account profile. Later custom nicknames persist on that browser. Guests get a remembered cycle/grid nickname generated from 256 combinations. Switching accounts or signing out resets that default without transferring ratings.

Browser gameplay fills the available viewport, including portrait phones; each native camera projection follows its own displayed pane. Touch the left/right half of a pane to turn its local rider; hold BOOST, use the two glance buttons, or tap left/right after crashing to change the watched rider. Eliminated tournament spectators also get game-switch buttons. Fullscreen is requested on a touch gesture where supported; unsupported browsers keep the edge-to-edge browser viewport. Real phone browser chrome and operating-system fullscreen restrictions still apply. Native minimaps remain square at bottom-left. Redundant fixed-size desktop HUD text is replaced by the browser scoreboard.

Mutual, simultaneous head-on body collisions award zero trap points and zero trap counts to either rider; there is no proximity fallback for those crashes. Ordinary motorcycle-body traps still award two points. The original snake bug artwork and pickup mechanics remain; WebGL uses valid non-power-of-two filtering, transparent depth handling, and double-sided sprites.

Phone regression checks: `npm run test:mobile` (WebKit) and `node node_modules/@playwright/test/cli.js test tests/e2e/mobile-game.spec.js tests/e2e/snake-art.spec.js --workers=1` (Chrome, Edge, Firefox). These emulate touch viewports; they do not certify physical devices. Snake texture slots reserve all six skybox faces, and every sprite vertex supplies complete WebGL color/UV data. Browser texture coordinates focus the original padded artwork without replacing the image or changing pickup mechanics.

On touch screens the playfield has no top HUD. Only your primary local rider’s points and the current leader’s points appear in two compact bottom-right chips, above touch controls. Fullscreen/exit buttons also sit at bottom-right; the native minimap stays bottom-left. Desktop retains the full player scoreboard.
