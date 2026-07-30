# LRS Land Services — Cloudflare Pages deployment

This folder is the production build. It was converted from a Netlify deploy;
nothing Netlify-specific remains.

```
index.html  about.html  services.html      pages
404.html    thank-you.html                 error + form success pages
shared.css                                 shared styles
uploads/                                   images (renamed + compressed)
functions/api/contact.js                   contact form handler (replaces Netlify Forms)
_headers  _redirects  _routes.json          Cloudflare Pages config
robots.txt
```

---

## 1. Create the Pages project

**Direct upload (fastest — no git required)**

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Name the project `lrs-land-services`.
3. Drag this entire folder in. Upload.

**Or via Wrangler**

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=lrs-land-services
```

**Or connect a Git repo** — push this folder to GitHub, then Pages → Connect to Git.
Build command: *(leave empty)* · Build output directory: `/`

Pages picks up `functions/` automatically on any of the three paths. There is no
build step; this is plain HTML/CSS.

---

## 2. Configure the contact form

The form posts to `/api/contact`, handled by `functions/api/contact.js`, which
sends mail through [Resend](https://resend.com) (free tier: 3,000 emails/month).

1. Create a Resend account and **verify the sending domain** (`lrslandservices.com`)
   — add the DKIM/SPF records Resend gives you. Verification is required; Resend
   will not send from an unverified domain.
2. Create an API key (starts with `re_`).
3. Pages project → **Settings** → **Variables and Secrets** → add for
   **Production** *and* **Preview**:

   | Name | Type | Value |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | `re_...` |
   | `CONTACT_TO` | Text | `Logan@lrslandservices.com` (comma-separate for more) |
   | `CONTACT_FROM` | Text | `LRS Website <website@lrslandservices.com>` |

4. **Redeploy** — environment variables only apply to deployments made after
   they are set.
5. Submit the form on the live site and confirm the email lands. Replies go
   straight to the person who filled out the form (`reply_to` is set).

If `RESEND_API_KEY` is missing the form returns a clear error and tells the
visitor to call — it never fails silently the way a broken Netlify form would.

**Prefer a different provider?** Swap the single `fetch('https://api.resend.com/emails', …)`
call in `functions/api/contact.js`. Postmark, SendGrid, and Mailgun all take the
same shape.

---

## 3. Point the domain

1. Pages project → **Custom domains** → **Set up a custom domain** →
   `lrslandservices.com`, then repeat for `www.lrslandservices.com`.
2. If the domain is already on Cloudflare DNS, records are created automatically.
   If it is elsewhere, either move the nameservers to Cloudflare or add the
   `CNAME` Cloudflare shows you.
3. Remove the old Netlify DNS records (`A 75.2.60.5` / the `*.netlify.app` CNAME)
   so nothing resolves back to the old host.
4. SSL provisions automatically, usually within a few minutes.
5. Once traffic is confirmed on Cloudflare, delete the Netlify site — leaving it
   live invites duplicate-content indexing.

---

## 4. What changed coming off Netlify

| Netlify | Now |
|---|---|
| `data-netlify="true"` form → Netlify Forms | `POST /api/contact` → Pages Function → Resend |
| `netlify-honeypot="bot-field"` | Same hidden field, checked server-side in the Function |
| Pretty URLs (automatic) | Explicit `_redirects` + root-absolute internal links |
| `_headers` / `_redirects` | Same file formats — Cloudflare Pages reads both |

Also cleaned up in the same pass:

- **Image filenames** normalized to lowercase kebab-case. Netlify tolerated
  `Site Prep.JPG` and spaces in paths; those are a URL-encoding and
  case-sensitivity hazard everywhere else. All references were rewritten to match.
- **Images recompressed** — capped at 2000px on the long edge, quality 82,
  EXIF stripped. 137 MB → 21 MB with no visible quality loss.
- **Claude Design edit-mode panel removed** — the React 18 *development*
  builds, Babel standalone, and the tweaks panel were being shipped to visitors
  (~1.5 MB of dev JS from unpkg, plus a 404 on `tweaks-panel.jsx`). The panel's
  settings (green colorway, steel-blue accent) were already baked into the CSS,
  so the design is unchanged.

---

## 5. Local preview

```bash
npx wrangler pages dev .
```

Serves the site with Functions running, at `http://localhost:8788`. Set
`RESEND_API_KEY` in a local `.dev.vars` file to test the form end to end.
