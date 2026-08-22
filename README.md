# Group Calendar

Live shared calendar for events + availability, built with React + Vite + Tailwind + FullCalendar + Supabase.

## Setup

1. Copy `.env.example` to `.env` and fill in your Supabase project URL + anon key.
2. `npm install`
3. `npm run dev`

## Deploy

Deploy to Cloudflare Pages: build command `npm run build`, output directory `dist`.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Pages project settings.
