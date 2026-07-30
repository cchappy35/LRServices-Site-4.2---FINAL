/**
 * Cloudflare Pages Function — contact form handler.
 * Replaces Netlify Forms. Route: POST /api/contact
 *
 * Required environment variables (Cloudflare dashboard → Pages project →
 * Settings → Variables and Secrets):
 *
 *   RESEND_API_KEY   secret   Your Resend API key (re_...)
 *   CONTACT_TO       plain    Where leads are delivered. Comma-separate for
 *                             multiple recipients.
 *                             default: Logan@lrslandservices.com
 *   CONTACT_FROM     plain    Sender address on a domain you have verified in
 *                             Resend. default: website@lrslandservices.com
 */

const FIELDS = [
  ['first-name', 'First Name', true],
  ['last-name', 'Last Name', true],
  ['company', 'Company', true],
  ['phone', 'Phone', false],
  ['email', 'Email', true],
  ['service', 'Service Needed', false],
  ['state', 'Project State', false],
  ['message', 'Project Description', false],
];

const MAX_LEN = 5000;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function readBody(request) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (type.includes('application/json')) return await request.json();
  const form = await request.formData();
  return Object.fromEntries(form);
}

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await readBody(request);
  } catch {
    return json(400, { error: 'Could not read the submitted form.' });
  }

  // Honeypot — bots fill hidden fields, humans don't. Return 200 so the bot
  // thinks it succeeded and doesn't retry.
  if (data['bot-field']) return json(200, { ok: true });

  const missing = FIELDS.filter(([k, , req]) => req && !String(data[k] || '').trim())
    .map(([, label]) => label);
  if (missing.length) {
    return json(400, { error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const email = String(data.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json(400, { error: 'That email address does not look valid.' });
  }

  if (Object.values(data).some((v) => String(v).length > MAX_LEN)) {
    return json(400, { error: 'Submission is too long.' });
  }

  const apiKey = env.RESEND_API_KEY;
  const to = (env.CONTACT_TO || 'Logan@lrslandservices.com').split(',').map((s) => s.trim());
  const from = env.CONTACT_FROM || 'LRS Website <website@lrslandservices.com>';

  if (!apiKey) {
    console.error('RESEND_API_KEY is not set — cannot deliver contact form submission.');
    return json(500, { error: 'The form is not configured yet. Please call 404-889-1105.' });
  }

  const name = `${data['first-name']} ${data['last-name']}`.trim();
  const rows = FIELDS.map(
    ([k, label]) =>
      `<tr><td style="padding:6px 14px 6px 0;vertical-align:top;color:#666;white-space:nowrap">${esc(
        label
      )}</td><td style="padding:6px 0;vertical-align:top"><strong>${esc(
        data[k] || '—'
      )}</strong></td></tr>`
  ).join('');

  const meta = {
    Submitted: new Date().toISOString(),
    'From page': request.headers.get('Referer') || '—',
    Country: request.headers.get('CF-IPCountry') || '—',
  };
  const metaRows = Object.entries(meta)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#999;white-space:nowrap">${esc(
          k
        )}</td><td style="padding:3px 0;color:#999">${esc(v)}</td></tr>`
    )
    .join('');

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#222;max-width:640px">
    <h2 style="margin:0 0 4px;font-size:19px">New quote request — ${esc(name)}</h2>
    <p style="margin:0 0 20px;color:#666;font-size:14px">Submitted through lrslandservices.com</p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:22px 0 12px">
    <table style="border-collapse:collapse;font-size:12px">${metaRows}</table>
  </div>`;

  const text = FIELDS.map(([k, label]) => `${label}: ${data[k] || '—'}`).join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: email,
      subject: `Quote request — ${name}${data.company ? ` (${data.company})` : ''}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    console.error('Resend rejected the message:', res.status, await res.text());
    return json(502, { error: 'We could not send your message. Please call 404-889-1105.' });
  }

  // No-JS fallback: a plain form POST gets a redirect to the thank-you page.
  const accept = (request.headers.get('Accept') || '').toLowerCase();
  if (!accept.includes('application/json')) {
    return Response.redirect(new URL('/thank-you', request.url).toString(), 303);
  }

  return json(200, { ok: true });
}

// Anything other than POST on this route.
const notAllowed = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });

export const onRequestGet = notAllowed;
export const onRequestPut = notAllowed;
export const onRequestDelete = notAllowed;
export const onRequestPatch = notAllowed;
