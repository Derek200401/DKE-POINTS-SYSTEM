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

## Run locally

Install Node.js 20 or later and the Vercel CLI, then copy `.env.example` to `.env.local`. Connect a Vercel Blob store to the project and use `vercel env pull` to load its local development credentials. Run the app with `npx vercel dev`.

## Point values

- MVP win: 15
- Team win: 10
- MVP loss: 7
- Team loss: 5

The page wording was reviewed with guidance from [blader/humanizer](https://github.com/blader/humanizer). That writing guide is not part of the deployed site and is not needed to run it.
