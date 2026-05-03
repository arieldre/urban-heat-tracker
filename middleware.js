export const config = { matcher: ['/((?!_next|favicon.ico|assets).*)'] };

const COOKIE = 'uh-auth';
const LOGIN_HTML = (err) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0c0f;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:monospace}
.box{background:#111418;border:1px solid #1e2329;border-radius:8px;padding:32px 28px;width:320px}
h1{color:#c8ff00;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:24px}
input{width:100%;background:#0d1014;border:1px solid #1e2329;color:#e8eaed;font-family:monospace;font-size:12px;border-radius:4px;padding:10px 12px;outline:none;margin-bottom:12px}
input:focus{border-color:#47c8ff}
button{width:100%;padding:10px;background:#c8ff00;color:#0a0c0f;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;border-radius:4px;cursor:pointer}
button:hover{background:#d9ff33}
.err{color:#ff5555;font-size:10px;margin-bottom:10px}
</style>
</head>
<body>
<div class="box">
<h1>Urban Heat Tracker</h1>
${err ? `<div class="err">Incorrect password</div>` : ''}
<form method="POST" action="/__auth">
<input type="password" name="p" placeholder="Password" autofocus required />
<button type="submit">Enter</button>
</form>
</div>
</body>
</html>`;

const enc = new TextEncoder();

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(secret, data, sig) {
  const expected = await hmacSign(secret, data);
  const a = enc.encode(expected);
  const b = enc.encode(sig);
  if (a.length !== b.length) return false;
  // timing-safe comparison
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const password = process.env.APP_PASSWORD;
  const cookieSecret = process.env.COOKIE_SECRET || password || 'fallback';

  // Auth form submission
  if (req.method === 'POST' && url.pathname === '/__auth') {
    const body = await req.text();
    const submitted = new URLSearchParams(body).get('p');
    if (password && submitted === password) {
      const payload = Date.now().toString();
      const sig = await hmacSign(cookieSecret, payload);
      const token = `${payload}.${sig}`;
      // Validate next is a safe relative path only
      const next = url.searchParams.get('next') || '/';
      const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      const res = new Response(null, { status: 302, headers: { Location: safeNext } });
      res.headers.set('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`);
      return res;
    }
    return new Response(LOGIN_HTML(true), { status: 401, headers: { 'Content-Type': 'text/html' } });
  }

  // If no password configured, pass through
  if (!password) return;

  // Check cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (match) {
    try {
      const token = decodeURIComponent(match[1]);
      const dot = token.lastIndexOf('.');
      if (dot > 0) {
        const payload = token.slice(0, dot);
        const sig = token.slice(dot + 1);
        if (await hmacVerify(cookieSecret, payload, sig)) return; // valid
      }
    } catch {}
  }

  // Not authenticated
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(LOGIN_HTML(false), { headers: { 'Content-Type': 'text/html' } });
}
