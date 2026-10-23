# Putting Future Voices on GitHub — step by step

This folder is a **ready-to-push git repository** (one initial commit, clean
history). Pick ONE of the three ways below — A is the easiest, no command
line needed.

---

## Way A — Upload through the GitHub website (no tools to install)

1. Go to <https://github.com> and sign in (create a free account if needed).
2. Click the **+** in the top-right corner → **New repository**.
3. Name it, e.g. `future-voices`. Keep it **Private** unless you want the
   code public. Do **not** tick "Add a README" (you already have one).
4. Click **Create repository**.
5. On the new page click the link **"uploading an existing file"**.
6. On your computer, open the `future-voices` folder, select **ALL files and
   folders inside it** (including `.gitignore`, `.env.example`, `.dockerignore`
   — enable "show hidden files" if you don't see them) and **drag them** into
   the browser drop zone.
   > Tip: zip first and drag the zip? No — GitHub needs real files. Drag the
   > folder *contents*.
7. Wait for the upload to finish → type `Initial commit` → click
   **Commit changes**.

Done — your code is on GitHub at `https://github.com/<your-username>/future-voices`.

---

## Way B — With git from the command line (recommended for updates)

The folder already contains a git repo with an initial commit, so pushing is
only three commands.

1. Create the empty repo on github.com exactly like steps 1–4 above
   (**do not** add a README / .gitignore / license there).
2. Copy the repo URL GitHub shows you, then run:

```bash
cd future-voices
git remote add origin https://github.com/<your-username>/future-voices.git
git push -u origin main
```

Git will ask for your GitHub username and a **Personal Access Token**
(passwords no longer work): GitHub → Settings → Developer settings →
Personal access tokens → **Generate new token (classic)** → tick the `repo`
scope → copy it and paste it as the password.

### After the first push — saving future changes

```bash
git add -A
git commit -m "describe what you changed"
git push
```

---

## Way C — GitHub Desktop (point & click, keeps git working)

1. Install <https://desktop.github.com>.
2. **File → Add local repository** → select this `future-voices` folder.
3. **Repository → Push** — it will offer to publish and create the GitHub
   repo for you. Done.

---

## Keeping secrets out (already handled)

`.gitignore` excludes: `node_modules`, the `.next` build, your real `.env`,
the SQLite database `db/*.db` and everything in `uploads/`. Your users'
capsules and passwords will never be published by accident. Only commit
`.env.example`, never `.env`.

---

## After GitHub — put it live on your own URL

### Deploy to a VPS (DigitalOcean / Hetzner / Contabo / your server)

```bash
# on the server, once Docker is installed:
git clone https://github.com/<your-username>/future-voices.git
cd future-voices
docker compose up -d --build        # app listens on port 3000
```

Point your domain's DNS `A` record at the server IP, put Caddy or nginx in
front (ready-made snippets in `README.md`) and you are live on
`https://capsules.yourdomain.com`.

### One-click platforms that read straight from GitHub

- **Railway** — New Project → Deploy from GitHub repo → add a Volume mounted
  at `/data`. Done.
- **Render** — New → Web Service → connect the repo → Build:
  `npm install && npm run db:push && npm run build`, Start: `npm start`,
  add a persistent Disk mounted at `/data`.
- **Fly.io** — `fly launch` (detects the Dockerfile), `fly volumes create
  fv_data --size 20`, `fly deploy`.

All three give you `https://<app>.onrender.com`-style URLs, and custom
domains are a settings toggle.

---

## Checklist

- [ ] Repo created on GitHub
- [ ] Pushed (Way A, B or C)
- [ ] `README.md` shows on the repo page
- [ ] No `.env` file in the repo (only `.env.example`)
- [ ] Deployed somewhere (Docker VPS / Railway / Render / Fly)
- [ ] First registered account = your admin account
