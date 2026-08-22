// supabase/functions/verify-group-password/index.ts
//
// Deploy with:
//   supabase functions deploy verify-group-password --no-verify-jwt
//
// Set the secret (never put this in your frontend .env):
//   supabase secrets set GROUP_PASSWORD_HASH=<sha256 hex of your password>
//
// Generate the hash locally once, e.g. in a browser console or Node:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
//     .then(buf => console.log([...new Uint8Array(buf)]
//       .map(b => b.toString(16).padStart(2, '0')).join('')))

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { password } = await req.json()

    if (!password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Password required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const expectedHash = Deno.env.get('GROUP_PASSWORD_HASH')
    if (!expectedHash) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const suppliedHash = await sha256Hex(password)

    if (suppliedHash !== expectedHash) {
      return new Response(JSON.stringify({ error: 'Incorrect password' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
