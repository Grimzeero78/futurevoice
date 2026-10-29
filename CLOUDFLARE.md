# Future Voices on Cloudflare — free hosting guide

Your whole platform — accounts, letters, magic keys, diary — running on
Cloudflare's free plan, straight from this GitHub repo. **Cost: $0.**
Your URL will look like:

```
https://futurevoice.<your-subdomain>.workers.dev
```

---

## How it works (30 seconds)

| What | Self-hosted (your PC / Docker) | Cloudflare (this guide) |
| --- | --- | --- |
| Code runtime | Node.js | Cloudflare Workers |
| Database | SQLite file (`db/custom.db`) | Cloudflare D1 (serverless SQLite, free 5 GB) |
| Uploaded photos/videos | `uploads/` folder on disk | Cloudflare R2 bucket — **optional**, see below |
| Email | SMTP (nodemailer) | Brevo or Resend HTTP API (free tiers) |

Same code, same features, same security. The app detects where it runs.

**Two limits to know on Cloudflare:** single files up to ~90 MB, and
Workers can't speak raw SMTP (that's why email uses an HTTP provider).

---

## The dashboard way (recommended — no commands to type)

You need only two things: your free Cloudflare account
(<https://dash.cloudflare.com/sign-up>) and your GitHub repo. ~10 minutes.

### Step 1 — Connect the repo to a Worker

1. Cloudflare dashboard → **Compute (Workers & Pages)** → **Create** →
   **Import a repository** (you may need to **Connect GitHub** first and
   allow access to `Grimzeero78/futurevoice`).
2. Name the worker `futurevoice`.
3. Set the two build commands **exactly** like this:
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
4. Click **Create and deploy**.

> The first deploy is allowed to fail — the database id isn't wired in yet
> (next step). If your worker already exists from an earlier attempt: open
> **futurevoice → Settings → Build →** and make the two commands above
> match exactly, then continue.

### Step 2 — Create the database

1. Cloudflare dashboard → **Storage & Databases → D1 SQL** →
   **Create database**.
2. Name it `futurevoice`, location **Auto**, Create.
3. On the database page, **copy the Database ID** (a string like
   `9f42a8c1-....-....`). You'll paste it in the next step.

### Step 3 — Give the worker the database id (one tiny GitHub edit)

1. On **github.com**, open your repo → click `wrangler.jsonc` → the
   **pencil (edit) icon**.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the id you copied.
3. Click **Commit changes**.

Cloudflare sees the push and rebuilds automatically — this time the deploy
succeeds.

### Step 4 — Create the tables (one click)

Open this address once (your real address is shown on the worker page —
Workers & Pages → futurevoice → **Visit**):

```
https://futurevoice.<your-subdomain>.workers.dev/api/setup
```

It prints `Your database is ready` and creates all tables. That's the whole
setup — no SQL, no command line.

### Step 5 — Open your site 🚀

Go to your workers.dev address and **Sign up**. **The first account
registered becomes the admin.** Your time capsule platform is live for the
whole world.

### Step 6 (recommended) — Protect the magic keys with a secret

Workers & Pages → futurevoice → **Settings → Variables and Secrets →
Add** → Type **Secret**:

- Name: `APP_SECRET`
- Value: any long random text (40+ characters, e.g. from
  <https://www.random.org/strings/>)

This makes magic keys uncrackable even if the database ever leaks. Setting
it takes a minute — do it before you seal anything serious.

### Step 7 (recommended) — Fix the site address

After the first deploy you know your real address. Edit `wrangler.jsonc`
on GitHub again and replace `<your-subdomain>` inside `APP_URL` with it:

```jsonc
"APP_URL": "https://futurevoice.your-actual-name.workers.dev"
```

Commit — done. (Until you do this, everything still works; it just makes
email links and cookies exactly right.)

### Updating the site later

Change anything in the code on GitHub (or `git push`) → Cloudflare rebuilds
and deploys automatically. Nothing to run.

---

## Photos & videos (works out of the box — R2 optional)

Media uploads work on the free plan with **zero extra setup**: files are
stored as chunks **inside your D1 database**. Each file can be up to
**48 MB**, and the free database pool holds about **500 MB** in total —
plenty for letters, photos and voice notes.

- **Want more?** Connect an R2 bucket and the limit rises to **90 MB per
  file** with **10 GB** of storage. Cloudflare asks for a **payment card**
  when enabling R2, even though the first 10 GB are free (you are not
  charged under the free limits).
- **To switch R2 on later** (e.g. a prepaid or virtual card): dashboard →
  **Storage & Databases → R2 → Create bucket** → name it
  `futurevoice-uploads` → then edit `wrangler.jsonc` on GitHub and add
  this line inside the `{ }` (right after the `d1_databases` block, keep
  the comma rules — the file shows exactly where):

```jsonc
"r2_buckets": [ { "binding": "UPLOADS", "bucket_name": "futurevoice-uploads" } ],
```

Commit → redeploy → new uploads flow into R2 automatically (the app
prefers R2 whenever the binding exists). Text-only capsules are not
affected either way.

- **Want truly unlimited files with no card?** Run the self-hosted version
  (bottom of this page) on any machine — that mode has no size cap.

---

## Email (optional — add any time)

Without an email key the site works fully; unlock-day notes just log
instead of sending. To send real email from Cloudflare:

- **Brevo** (<https://brevo.com>) — free 300 emails/day, **no domain
  needed**: sign up → verify your own email as a sender → create an API
  key.
- **Resend** (<https://resend.com>) — free 3,000/month, needs a domain you
  own (~$10/yr).

Then add two Secrets (same place as APP_SECRET, Step 6):

- `BREVO_API_KEY` **or** `RESEND_API_KEY` → your key
- `MAIL_FROM` → e.g. `Future Voices <you@example.com>`
  (must match the sender you verified)

### Keeping unlock-day emails punctual

Workers don't wake themselves on a schedule. Set `CRON_SECRET` in the
`vars` of `wrangler.jsonc` (edit on GitHub), then create one free daily
job at <https://cron-job.org> pointing to:

```
https://futurevoice.<your-subdomain>.workers.dev/api/cron?key=YOUR_CRON_SECRET
```

Keepers still get their email even without it — the claim flow re-checks
on every sign-in — but the daily sweep is the punctual postman.

---

## The command-line way (alternative)

Prefer typing commands from Windows PowerShell? You need Node.js
installed. From the repo folder:

```powershell
npx wrangler login                                # browser opens → Allow
npx wrangler d1 create futurevoice                # copy database_id from output
#   → paste it into wrangler.jsonc (replace REPLACE_WITH_YOUR_D1_DATABASE_ID)
npm run cf:migrate:remote                         # create tables (answer yes)
npx wrangler secret put APP_SECRET                # paste a long random string
npm run cf:deploy                                 # prints your real URL
```

Optional email secrets: `npx wrangler secret put BREVO_API_KEY` (or
`RESEND_API_KEY`) and `npx wrangler secret put MAIL_FROM`. Optional media:
`npx wrangler r2 bucket create futurevoice-uploads` + the `r2_buckets`
block from the section above.

If you change `prisma/schema.prisma` later: generate new migration SQL,
refresh the setup data, apply:

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output migrations/0002_whatever.sql
node scripts/gen-d1-schema.mjs
npm run cf:migrate:remote
```

### Test on your machine before deploying (optional)

```powershell
npm install
npm run cf:migrate:local    # creates tables in a local D1 copy
npm run cf:preview          # runs the REAL Workers runtime locally on :8787
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Deploy fails: `database_id` / "could not find database" | Step 3 not done, or the id is wrong — paste the real D1 Database ID into `wrangler.jsonc` and commit |
| Deploy fails: `.open-next/worker.js` not found | The **Deploy command** is wrong — it must be exactly `npx opennextjs-cloudflare deploy` |
| Build fails early | The **Build command** must be exactly `npx opennextjs-cloudflare build` (it runs the Next.js build itself) |
| Site is up but every page errors (Error 1101) | Tables missing — open `/api/setup` once |
| `/api/setup` says it can't reach the database | The D1 id in `wrangler.jsonc` doesn't match your database, or the last deploy hasn't finished — fix and redeploy, then refresh |
| Uploads fail with a "storage" error | The database media pool is full (~500 MB on free D1) — delete old media or connect R2 (see "Photos & videos" above) |
| Emails not arriving | No mail key set, or sender not verified in Brevo/Resend |
| Login says "too many attempts" | Wait 15 minutes — brute-force protection doing its job |
| Want a file bigger than 90 MB | Self-host: that mode has no size limit |

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
