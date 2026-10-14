# DKE Scrim Points System

A small leaderboard for the scrim group. Visitors can see each IGN and point total. The admin can add players, edit points, or scan Mobile Legends result screenshots to calculate game points. The page refreshes the standings every four seconds.

The site and its serverless API run on Vercel. Player totals are saved in a **private Vercel Blob store** connected to the Vercel project. There is no Supabase setup.

## Deploy on Vercel

1. Import this repository into Vercel.
2. In the project, open **Storage → Create Storage → Blob**. Choose **Private**, create the store, and connect it to this project for Production. Connect Preview too if you want previews to use their own storage.
3. In **Settings → Environment Variables**, add:
   - `ADMIN_USERNAME` — your chosen admin username
   - `ADMIN_PASSWORD` — your chosen admin password
   - `ADMIN_SESSION_SECRET` — a private random value with at least 32 characters
   - `VYCEAI_API_KEY` — create an API key in VyceAI and store it only as a server environment variable
4. Deploy the project.

When the private Blob store is connected, Vercel provides the storage credentials to the server functions. Do not expose Blob or VyceAI credentials in the browser or commit them to the repository. If an API key has been shared publicly, revoke it and configure a newly rotated key in Vercel. The first admin save creates the players file; until then, the leaderboard is empty.

Use the admin credentials you chose when signing in. Select **Admin sign in** to add an IGN and its starting points. Use **Edit** in that player's row to change their total later. To award a game, select **Submit game result**, upload a screenshot, then review and correct every detected team, IGN, rating, and award before selecting **Approve & add points**. The image is sent to VyceAI for analysis and is not saved by this site. No points are changed until the signed-in admin approves the review. The public leaderboard sorts by points, highest first.

The result scan accepts JPEG, PNG, or WebP screenshots (up to 12 MB before browser enhancement and 2 MB after processing). Before upload, the browser scales the screenshot for readable detail (up to 1.75×, capped at 3600 pixels on the longest edge) and applies contrast/brightness enhancement. This can improve visibility but cannot recreate detail absent from a blurry or cropped image; use a clear, full results screenshot. Image analysis uses the OpenAI-compatible VyceAI Chat Completions API with the `deepseek-v4.1` model; `VYCEAI_API_KEY` remains server-side and is never sent to the browser. The extraction prompt requests exact IGN symbols and ratings in the supplied result-list format. The AI identifies the result banner and the actual winning physical side independently; the winner may be left/blue or right/red. The server validates the 10-player roster and calculates official medal points. Incomplete or unclear scans are rejected before review or point approval. The review shows team counts and each server-calculated award so an admin can correct OCR before approving. The server validates extracted data, calculates awards, enforces the point limit, and prevents the same exact screenshot from being applied twice. Existing IGN matches receive additional points; new IGN names are added to the leaderboard. Applied screenshot hashes are stored with the private player data in Vercel Blob.

### Mobile Legends result points

Ratings are read to one decimal place. The highest rating on each team receives the applicable MVP award; if there is a tie for highest rating, each tied player receives that MVP award. An admin can correct the winner, team, IGN, or rating in the review before points are applied.

| Winning team | Points | Losing team | Points |
| --- | ---: | --- | ---: |
| Bronze (3.0–4.0) | 3 | Bronze (3.0–4.0) | 2 |
| Silver (4.1–7.0) | 5 | Silver (4.1–7.0) | 3 |
| Gold (7.1–10.0) | 7 | Gold (7.1–10.0) | 5 |
| Supreme (10.1+, non-MVP) | 7 | MVP Loss (highest rating, 6.6+) | 10 |
| MVP Gold (highest rating, up to 10.0) | 12 |  |  |
| Supreme MVP (highest rating, 10.1+) | 12 |  |  |

Ratings below 3.0 without an MVP award receive zero points. Losing-team ratings above 10.0 that do not qualify for MVP Loss receive zero points.

## Tournament brackets

Select **Tournament Bracket** in the dashboard header to open the public read-only tournament view. Admins sign in with the same credentials as the points dashboard and can create one tournament at a time. Tournament data is stored separately from leaderboard points in the same private Vercel Blob store.

Setup accepts 2–256 team names entered directly by the admin, Single/Double Elimination, Round Robin, and Swiss formats; single-game, Bo3, or Bo5 scoring; optional third-place play; optional round-robin pools feeding a single-elimination playoff; and optional station/court names. Team entry order determines initial seeds. Tournament setup does not import names or ranks from the points leaderboard.

Admins can start matches, enter or override set scores, force a winner, flag a completed result as disputed, schedule a match, assign a station, edit team names, remove a team, delete the full bracket, and finish the tournament. Removing a team rebuilds the bracket and clears prior scores and schedules; the admin is prompted before that change. Visitors receive the same bracket and standings without write controls. The public view refreshes every five seconds. Double elimination includes a reset final if the losers-bracket finalist wins the first grand final. Swiss rounds pair similar records without eliminating players and use wins, score differential, head-to-head, Buchholz, and median-Buchholz standings tie-breaks.

The tournament endpoints are `GET /api/tournament` and admin-only `POST`/`PATCH /api/admin/tournament`. Shared request-origin checks, signed admin sessions, and Blob configuration are the same as the existing admin API. The shape declarations live in `lib/tournament.d.ts`; bracket generation and result progression are in `lib/tournament.js`.

The admin result endpoint is `POST /api/admin/results`; it scans screenshots, previews server-calculated awards, and applies approved results. It uses the same signed admin session and same-origin protections as the other write endpoints.

This implementation is admin-operated: it does not expose participant self-reporting, community predictions/voting, or unattended automatic forfeits. Match countdowns are informational; an admin must enter or force a result. Vercel Blob stores a single JSON tournament document, so this is intended for a single active admin-managed event rather than concurrent tournament editing by multiple moderators.

## Run locally

Install Node.js 20 or later and the Vercel CLI, then copy `.env.example` to `.env.local`. Connect a Vercel Blob store to the project and use `vercel env pull` to load its local development credentials. Run the app with `npx vercel dev`.

## Prizes

- Top 1: ₱700
- Top 2: ₱500
- Top 3: ₱300
- Top 4: ₱200
- Top 5: ₱100

The page wording was reviewed with guidance from [blader/humanizer](https://github.com/blader/humanizer). That writing guide is not part of the deployed site and is not needed to run it.
