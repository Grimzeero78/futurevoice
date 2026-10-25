# Future Voices on Cloudflare — free hosting guide

Your whole platform — accounts, capsules, magic keys, diary, photos/videos —
running on Cloudflare's free plan, straight from this repo. **Cost: $0.**
No credit card needed. Your URL will look like:

```
https://futurevoice.<your-subdomain>.workers.dev
```

---

## How it works (30 seconds)

| What | Self-hosted (your PC / Docker) | Cloudflare (this guide) |
| --- | --- | --- |
| Code runtime | Node.js | Cloudflare Workers |
| Database | SQLite file (`db/custom.db`) | Cloudflare D1 (serverless SQLite, free 5 GB) |
| Uploaded photos/videos | `uploads/` folder on disk | Cloudflare R2 bucket (free 10 GB) |
| Email | SMTP (nodemailer) | Resend or Brevo HTTP API (free tiers) |

Same code, same features, same security. The app detects where it runs.

**Two Cloudflare limits to know:** single files up to ~90 MB on Cloudflare
(self-host has no limit), and Workers block raw SMTP — that's why email uses
an HTTP provider there.

---

## Setup (one time, ~15 minutes, from Windows PowerShell)

You need Node.js installed (you already have it — you run the site locally).

### 1. Log in to Cloudflare

Create a free account at <https://dash.cloudflare.com/sign-up> if you don't
have one. Then:

```powershell
cd path\to\futurevoice
npx wrangler login
```

A browser window opens — click **Allow**.

### 2. Create the database and the file bucket

```powershell
npx wrangler d1 create futurevoice
npx wrangler r2 bucket create futurevoice-uploads
```

The first command prints a block containing `"database_id": "xxxx..."`.
**Copy that id.**

### 3. Put the database id in `wrangler.jsonc`

Open `wrangler.jsonc` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the
id you copied. Also set `APP_URL` to your future address (you'll see your
subdomain after the first deploy — you can come back and fix it later).

### 4. Create the tables in the database

```powershell
npm run cf:migrate:remote
```

Answer **yes** when it asks to confirm.

### 5. Set your secrets

```powershell
npx wrangler secret put APP_SECRET
```

Paste a long random string (any 40+ characters, used for the magic-key
fingerprints and media links) and press Enter.

**Email (optional now, needed before unlock-day emails can send):**

```powershell
npx wrangler secret put RESEND_API_KEY     # or BREVO_API_KEY — see below
npx wrangler secret put MAIL_FROM
```

- **Resend** (<https://resend.com>, free 3,000 emails/month): sign up →
  verify a domain you own → create an API key. Needs a domain (~$10/yr).
- **Brevo** (<https://brevo.com>, free 300 emails/day): sign up → verify your
  own email address as a sender → create an API key. **Works without owning
  a domain.**
- `MAIL_FROM` example: `Future Voices <capsule@yourdomain.com>` (must match
  the sender you verified).

Skipping this is fine to start — the site works fully, email just logs
instead of sending until you add a key.

### 6. Deploy 🚀

```powershell
npm run cf:deploy
```

At the end it prints your real URL. Open it — **the first account you
register becomes the admin.** That's it. Your time capsule is live for the
whole world.

*(Later, fix `APP_URL` in `wrangler.jsonc` to the printed URL and run
`npm run cf:deploy` again — links in emails and the secure cookie flag use it.)*

---

## Updating the site later

Changed something in the code? Two commands:

```powershell
git pull
npm install
npm run cf:deploy
```

If you ever change `prisma/schema.prisma`: also generate new migration SQL

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output migrations/0002_whatever.sql
npm run cf:migrate:remote
```

---

## Your own domain (optional, later)

- Buy a domain (any registrar) and add it to Cloudflare (free plan), **or**
  transfer DNS of an existing domain to Cloudflare.
- In the dashboard: **Workers & Pages → futurevoice → Settings → Domains &
  Routes → Add → Custom domain.** Cloudflare handles the HTTPS certificate.
- Update `APP_URL` in `wrangler.jsonc` and redeploy.

---

## Test it on your machine before deploying (optional)

```powershell
npm install
npm run cf:migrate:local    # creates tables in a local D1 copy
npm run cf:preview          # runs the REAL Workers runtime locally on :8787
```

Everything works the same — local D1, local R2 simulation — so what you see
here is what will happen in production.

---

## Keeping unlock-day emails flowing

Cloudflare Workers don't wake themselves on a schedule. The unlock-day email
sweep is an HTTP endpoint: `/api/cron?key=YOUR_CRON_SECRET`. Set
`CRON_SECRET` in `wrangler.jsonc` (vars) + redeploy, then create one free
daily job at <https://cron-job.org> pointing to:

```
https://futurevoice.<your-subdomain>.workers.dev/api/cron?key=YOUR_CRON_SECRET
```

Keepers get their email the same day a capsule opens even without it — the
claim flow re-checks on every sign-in — but the daily sweep is the punctual
postman.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run cf:deploy` says "database_id" wrong | You skipped step 3 — paste the real id into `wrangler.jsonc` |
| `10021` / validation errors on deploy | `npx wrangler login` again (session expired) |
| Site is up but uploads fail | R2 bucket missing — run `npx wrangler r2 bucket create futurevoice-uploads` |
| "Error 1101" after deploy | Run `npm run cf:migrate:remote` (tables missing) |
| Emails not arriving | No mail key set, or sender not verified in Resend/Brevo |
| Want a file bigger than 90 MB | Upload it self-hosted, or split it — Cloudflare free tier caps request bodies |

---

## Still want the self-hosted version?

Nothing changed for it. On your own PC or any VPS it's the same as before:

```powershell
git pull
npm install
npm run build
npm start          # SQLite file + uploads folder + SMTP, exactly like always
```

or with Docker: `docker compose up -d`. The app picks SQLite automatically
whenever there's no Cloudflare binding.
