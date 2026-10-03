# DKE Scrim Points System

A small leaderboard for the scrim group. Visitors can see each IGN and point total. The admin can add players and edit points. The page refreshes the standings every four seconds.

The site and its serverless API run on Vercel. Player totals are saved in a **private Vercel Blob store** connected to the Vercel project. There is no Supabase setup.

## Deploy on Vercel

1. Import this repository into Vercel.
2. In the project, open **Storage → Create Storage → Blob**. Choose **Private**, create the store, and connect it to this project for Production. Connect Preview too if you want previews to use their own storage.
3. In **Settings → Environment Variables**, add:
   - `ADMIN_USERNAME` — your chosen admin username
   - `ADMIN_PASSWORD` — your chosen admin password
   - `ADMIN_SESSION_SECRET` — a private random value with at least 32 characters
4. Deploy the project.

When the private Blob store is connected, Vercel provides the storage credentials to the server functions. Do not expose those credentials in the browser or commit them to the repository. The first admin save creates the players file; until then, the leaderboard is empty.

Use the admin credentials you chose when signing in. Select **Admin sign in** to add an IGN and its starting points. Use **Edit** in that player's row to change their total later. The public leaderboard sorts by points, highest first.

## Tournament brackets

Select **Tournament Bracket** in the dashboard header to open the public read-only tournament view. Admins sign in with the same credentials as the points dashboard and can create one tournament at a time. Tournament data is stored separately from leaderboard points in the same private Vercel Blob store.

Setup accepts 2–256 team names entered directly by the admin, Single/Double Elimination, Round Robin, and Swiss formats; single-game, Bo3, or Bo5 scoring; optional third-place play; optional round-robin pools feeding a single-elimination playoff; and optional station/court names. Team entry order determines initial seeds. Tournament setup does not import names or ranks from the points leaderboard.

Admins can start matches, enter or override set scores, force a winner, flag a completed result as disputed, schedule a match, assign a station, and finish the tournament. Visitors receive the same bracket and standings without write controls. The public view refreshes every five seconds. Double elimination includes a reset final if the losers-bracket finalist wins the first grand final. Swiss rounds pair similar records without eliminating players and use wins, score differential, head-to-head, Buchholz, and median-Buchholz standings tie-breaks.

The tournament endpoints are `GET /api/tournament` and admin-only `POST`/`PATCH /api/admin/tournament`. Shared request-origin checks, signed admin sessions, and Blob configuration are the same as the existing admin API. The shape declarations live in `lib/tournament.d.ts`; bracket generation and result progression are in `lib/tournament.js`.

This implementation is admin-operated: it does not expose participant self-reporting, screenshot uploads, community predictions/voting, or unattended automatic forfeits. Match countdowns are informational; an admin must enter or force a result. Vercel Blob stores a single JSON tournament document, so this is intended for a single active admin-managed event rather than concurrent tournament editing by multiple moderators.

## Run locally

Install Node.js 20 or later and the Vercel CLI, then copy `.env.example` to `.env.local`. Connect a Vercel Blob store to the project and use `vercel env pull` to load its local development credentials. Run the app with `npx vercel dev`.

## Point values

- MVP win: 15
- Team win: 10
- MVP loss: 7
- Team loss: 5

The page wording was reviewed with guidance from [blader/humanizer](https://github.com/blader/humanizer). That writing guide is not part of the deployed site and is not needed to run it.
