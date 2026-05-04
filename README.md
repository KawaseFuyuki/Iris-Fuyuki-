# Iris Fuyuki — Discord Bot

A fully-featured multi-module Discord bot built with discord.js v14.

## Deploy on Render

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set these settings:
   - **Root Directory:** *(leave blank if repo is just this folder)*
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add environment variable:
   - `DISCORD_BOT_TOKEN` = your bot token
6. Deploy!

## Local Setup

```bash
npm install
DISCORD_BOT_TOKEN=your_token node src/index.js
```

## Features

- Module A: Reaction Roles (`/reactionrole`, `/temprole`, `/timer`)
- Module B: Moderation (`&mute`, `&ban`, `&warn`, `&purge`, `&antilink`, `&snipe`, etc.)
- Module C: Info & Giveaways (`&avatar`, `&invites`, `&ilb`, `&trigger`, `&gs/ge/gr`)
- Module D: Server Setup (`/welcome`, `/ticket`, `/embed`)
- Keep-alive Express server on port 3000
- Persistent SQLite database (survives restarts)
