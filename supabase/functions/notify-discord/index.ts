// Supabase Edge Function: notify-discord
// Triggered via a Database Webhook on INSERT to public.events
// Posts a formatted announcement to a Discord channel, @-mentioning a role.
//
// Deploy: supabase functions deploy notify-discord
// Secrets (set once):
//   supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
//   supabase secrets set DISCORD_ROLE_ID=1048920081838653513
//   supabase secrets set APP_URL=https://your-group-calendar-url.example.com
//
// Then create a Database Webhook (Supabase Dashboard > Database > Webhooks):
//   Table: events   Events: Insert   Type: HTTP Request
//   URL: https://<project-ref>.functions.supabase.co/notify-discord
//   Method: POST   (the payload Supabase sends includes the new row as `record`)

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')!
const DISCORD_ROLE_ID = Deno.env.get('DISCORD_ROLE_ID')!
const APP_URL = Deno.env.get('APP_URL') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const event = payload.record

    if (!event || !event.id) {
      return new Response(JSON.stringify({ error: 'No event record in payload' }), { status: 400 })
    }

    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', event.user_id)
      .maybeSingle()

    if (creatorError) {
      console.error('Failed to look up creator:', creatorError.message)
    }

    const creatorName = creator?.username ?? 'Someone'
    const formattedDate = formatEventDate(event.event_date)
    const linkLine = APP_URL ? `\n${APP_URL}` : ''

    const content =
      `\ud83d\udcc5 **New event added!**\n` +
      `**${event.title}**\n` +
      `\ud83d\uddd3\ufe0f ${formattedDate}\n` +
      `\ud83d\udc64 Added by ${creatorName}` +
      `${linkLine}\n` +
      `<@&${DISCORD_ROLE_ID}>`

    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { roles: [DISCORD_ROLE_ID] },
      }),
    })

    if (!discordRes.ok) {
      const errText = await discordRes.text()
      console.error('Discord webhook failed:', discordRes.status, errText)
      return new Response(JSON.stringify({ error: 'Discord webhook failed', detail: errText }), { status: 502 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error('notify-discord error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
