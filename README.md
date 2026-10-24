# ⧗ Future Voices — a digital time capsule platform

Record video messages, photographs, audio and letters addressed to the
future — your future child, your grandchildren, or the people of the year
3026. Seal each capsule with a release date. Until that date arrives it
stays sealed: private capsules are visible to you alone, and sealed public
capsules reveal nothing but a countdown.

**Everything is real and self-contained.** One Node process, one SQLite
file, one uploads folder. Copy it to your server, run two commands, and it
is live on your own URL. No external database, no cloud services required.

---

## Features

| Area | What you get |
|---|---|
| **Capsules** | Text letters, images, video and audio uploads — **no file-size limit** (streamed straight to disk), no file-count limit |
| **Time lock** | Any release date from today up to **year 9999** (+1, +10, +25, +50, +100, **+1000 years** quick presets, or an exact date). A scheduler unseals capsules the moment their date arrives |
| **Privacy** | Private (only you) or Public. Public capsules can appear in the searchable **Future Archive** or stay unlisted (link-only) |
| **Recipients** | Tag: future self, future child, grandchildren, people of 2078, future generations — or a custom name |
| **Archive** | Public archive with full-text search, filters by release year / recipient / media type, sorting and pagination |
| **Accounts** | Register / sign in / sign out, **Google sign-in** (one click with your Google account, activates when credentials are configured), email verification, password reset (real emails via SMTP; graceful in-UI fallback without), profile with display name & bio, password change |
| **Vault dashboard** | Manage every capsule: edit, re-seal, change privacy, delete, watch countdowns |
| **Interactions** | Minimal, privacy-first "future reactions" (4 signal types, one per visitor per capsule) |
| **Safety** | Report flow + admin moderation desk (hide/restore, strike, ban) · public capsules are **screened against community standards** before publishing (adult content, hate, threats, scam patterns) · 3 strikes = **automatic ban** (sessions closed, public capsules hidden) · 3 community reports **auto-quarantine** a capsule for review · full member management (search, ban/unban) · **the first registered account becomes the admin** |
| **Data ownership** | One-click JSON export of your entire account (GDPR-style portability) |
| **Security** | scrypt password hashing, DB-backed httpOnly session cookies, access-checked media gateway (private/sealed media is *never* publicly reachable), range-streamed video |
| **UI** | Responsive from phones to desktops, light/dark theme, keyboard & screen-reader friendly, sticky footer layout |

---

## Quick start (any machine with Node.js 20+)

```bash
# 1 — install
npm install

# 2 — configure (optional; sensible defaults are baked in)
cp .env.example .env

# 3 — create the database schema
npm run db:push

# 4 — run
npm run dev          # development, http://localhost:3000

#    …or in production:
npm run build
npm start            # respects PORT and HOSTNAME env vars
```

Open `http://localhost:3000`. **The first account you register becomes the
admin/moderator.** From then on, new accounts are regular users.

### Keeping it alive (recommended)

```bash
npm i -g pm2
pm2 start "npm start" --name future-voices
pm2 save && pm2 startup      # restarts on reboot
```

---

## Deploy on your own URL

### Option A — Docker (easiest)

```bash
docker compose up -d --build
```

That's it. Database and uploads persist in the `fv-data` volume. Set
`APP_URL` and SMTP variables in a `.env` file next to `docker-compose.yml`
to enable real emails. To serve on port 80/443 with a domain, put a reverse
proxy in front (below).

### Option B — bare Node on a VPS

1. Copy this whole folder to the server (e.g. `git clone` or scp).
2. `npm install && npm run db:push && npm run build`
3. `PORT=3000 pm2 start "npm start" --name future-voices`
4. Reverse-proxy your domain to port 3000.

**nginx** (note: `client_max_body_size 0` keeps uploads unlimited):

```nginx
server {
    listen 80;
    server_name capsules.yourdomain.com;

    client_max_body_size 0;            # no upload cap at the proxy either
    proxy_read_timeout 3600s;          # allow very long uploads
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_http_version 1.1;
    }
}
```

Then add free HTTPS:

```bash
sudo certbot --nginx -d capsules.yourdomain.com
```

**Caddy** equivalent (automatic HTTPS):

```
capsules.yourdomain.com {
    request_body {
        max_size none
    }
    reverse_proxy 127.0.0.1:3000
}
```

---

### Google sign-in

Add Google credentials to `.env` and the **“Continue with Google”** button
appears automatically in the sign-in dialog — users click their Google
account and they are in, no password needed. Full step-by-step setup is
documented in `.env.example` (OAuth consent screen → OAuth client ID →
add the redirect URI `/api/auth/google/callback`). Without credentials
the app simply shows email sign-in only.

### Community standards & moderation

- Public capsules (title, letter, custom recipient) are screened before
  publishing against an editable blocklist of adult, hateful, threatening
  and scam content (`src/lib/moderation.ts`). Flagged text can still be
  saved as a **private** capsule — the public archive stays clean.
- A blocked public attempt records a **strike**; 3 strikes auto-ban the
  account (sessions closed, public capsules hidden). Admins can also ban
  or unban any member from the **Members** tab of the moderation desk.
- 3 distinct community reports **auto-quarantine** a capsule (hidden from
  the archive until an admin reviews it).
- The word lists are intentionally plain and editable — extend or soften
  them to fit your community.

## Email verification & password reset

Out of the box (no SMTP configured) the app remains fully usable: the
verify/reset links are shown in the interface and logged to the server
console. The moment you add SMTP settings to `.env` and restart, every
email is delivered for real:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Future Voices <you@gmail.com>"
APP_URL=https://capsules.yourdomain.com
```

> Gmail requires an **App Password** (Google Account → Security → 2-Step
> Verification → App passwords). Any transactional provider works too.

---

## Storage — how "no limit" works

- Uploads are **streamed** from the browser through the API directly to
  disk (busboy → file stream). A 4 GB video uses ~0 KB of RAM.
- There is **no application-level size cap** and no file-count cap.
- Files live in `UPLOAD_DIR` (default `./uploads`), *outside* the web
  root. Every byte is served through an access-checked gateway, so
  private and sealed media cannot be reached by URL guessing.
- Serving is range-streamed, so giant videos start playing instantly and
  seek smoothly.
- The only limits that exist are physical: the disk you provide, and (if
  you add one) your reverse proxy. The nginx/Caddy snippets above keep
  those unlimited as well.

**Backups:** copy two things — `db/custom.db` (or your `/data` volume) and
the `uploads/` folder. That is the entire platform state.

**PostgreSQL:** want a networked DB instead of SQLite? Change
`provider = "sqlite"` to `provider = "postgresql"` in
`prisma/schema.prisma`, point `DATABASE_URL` at your Postgres instance and
run `npm run db:push` again.

---

## The time lock, precisely

1. When a capsule is created with a future `releaseAt`, its status is set
   to `SEALED`.
2. A background scheduler (every 60 s) flips due capsules to `PUBLISHED`.
   An external cron can also call `POST /api/cron?key=<CRON_SECRET>`.
3. **Independently of the scheduler**, every read-path query filters
   `releaseAt <= now`, so a sealed post can never leak — even if the
   process was paused when the date passed.
4. Authors always retain access to their own sealed capsules (that's the
   point of a vault), but nobody else does — including teaser-free media.

## Moderation

Visitors can report public capsules (spam / inappropriate / copyright /
other). Admins see the queue in the **Moderation desk** (account menu) and
can hide or restore capsules. Hidden capsules vanish from the archive and
become link-dead for non-authors.

## Project structure

```
prisma/schema.prisma      # User, Session, AuthToken, Post, Media, Reaction, Report
src/app/api/…             # auth, posts, upload, media gateway, export, cron, admin
src/components/fv/…       # landing, archive, compose, post detail, dashboard, admin
src/lib/                  # auth (scrypt+sessions), storage (streaming), mailer, scheduler
db/custom.db              # SQLite database (created by db:push)
uploads/                  # media storage (created on first upload)
Dockerfile                # production image (data volume at /data)
docker-compose.yml        # one-command deployment
.env.example              # every configuration knob, documented
```

## API surface (for integrations)

| Method & path | Purpose |
|---|---|
| `POST /api/auth/register` · `login` · `logout` | session auth (httpOnly cookie) |
| `POST /api/auth/verify-email` · `resend-verification` | email confirmation |
| `POST /api/auth/forgot-password` · `reset-password` | password recovery |
| `PATCH/POST /api/auth/profile` | profile & password change |
| `GET/POST /api/posts` | archive search (q, year, recipient, mediaType, sort, page) · create |
| `GET/PATCH/DELETE /api/posts/:id` | detail (sealed teaser) · edit · delete |
| `POST /api/posts/:id/react` · `/report` | future reactions · moderation reports |
| `POST /api/upload` | streaming upload (no size cap) |
| `GET/HEAD /api/media/:id` | access-checked, range-streamed file serving |
| `GET /api/me/posts` · `GET /api/me/export` | vault listing · JSON data export |
| `GET/POST /api/admin/reports` | moderation queue |
| `POST /api/cron?key=…` | external trigger for the release scheduler |

---

*Made for the people of 2078 — and 3026.*

---

## About the developer

**Future Voices** was created by **Isaac Bridget Njuguna** — a child of
God with a dream to see a better world — so that wisdom, love and hope
can travel safely across generations.
