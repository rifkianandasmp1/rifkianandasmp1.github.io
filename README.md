# M. Rifki Ananda — Portfolio

Personal portfolio hosted on **Vercel**, with a password-protected admin panel
backed by private serverless functions. The repository can stay private.

## File structure

```
├── index.html            ← Public portfolio
├── admin.html            ← Admin panel (served at /admin, password login)
├── data/portfolio.json   ← All content lives here (the "database")
├── images/               ← Photos
├── api/                  ← Private backend (Vercel Functions)
│   ├── auth.js           ← POST login · GET session status · DELETE logout
│   ├── content.js        ← GET / PUT data/portfolio.json (admin only)
│   ├── upload.js         ← POST image upload (admin only)
│   ├── seo.js            ← /robots.txt and /sitemap.xml for any domain
│   └── _lib/             ← Shared helpers (not exposed as routes)
├── assets/css, assets/js ← Site and admin front-end
├── test/api.test.js      ← API tests (npm test)
└── vercel.json           ← Rewrites and security headers
```

## How it works

1. Visitors get static files: `index.html` renders `data/portfolio.json`.
2. `/admin` asks for a password. The server checks it against `ADMIN_PASSWORD`
   and sets an HttpOnly, signed session cookie (valid 7 days).
3. **Publish** sends the content to `/api/content`, which commits
   `data/portfolio.json` to GitHub using a token stored only in Vercel.
4. The commit triggers a new Vercel deployment; the site updates in about a minute.

The GitHub token never reaches the browser, every change is a Git commit (easy to
revert), and no database or paid service is needed.

## Setting up Vercel (one time)

### 1. Create a GitHub token for the server
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
- **Repository access:** Only select repositories → this repository
- **Permissions → Repository → Contents:** Read and write
- Pick a long expiry and note the date — publishing stops working when it expires.

### 2. Import the project
1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project** → import this repository.
3. Framework preset: **Other**. Leave the build command and output directory empty.

### 3. Environment variables (Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | Your admin password (at least 8 characters; use a long one) |
| `SESSION_SECRET` | A random string of 32+ characters, e.g. from `openssl rand -base64 48` |
| `GITHUB_TOKEN` | The token from step 1 |
| `GITHUB_OWNER` | `rifkianandasmp1` |
| `GITHUB_REPO` | The repository name |
| `GITHUB_BRANCH` | `main` (optional, this is the default) |

Redeploy after adding or changing variables. Changing `SESSION_SECRET` signs everyone out.

### 4. Domain
The site is live at `https://<project>.vercel.app`. To use your own domain:
Project → Settings → **Domains** → add it and follow the DNS instructions.
Then put the full URL in the `og:image` tag in `index.html` so link previews work.

### 5. Make the repository private (optional)
GitHub → repository **Settings → General → Danger Zone → Change visibility**.
Vercel keeps deploying private repositories. On a free GitHub plan this also
switches off the old GitHub Pages site.

## Editing content

Open `/admin`, sign in, edit, then **Publish** (or Ctrl/Cmd + S). Drafts are saved in
the browser, **Preview** shows the unpublished draft, and photo uploads are resized
to 1200px and committed to `images/`.

Text fields support a tiny markup: `*text*` for the accent italic and `**text**` for bold.

## Local development

```bash
npm i -g vercel
vercel link          # connect to the Vercel project
vercel env pull      # download the environment variables into .env.local
vercel dev           # http://localhost:3000 and http://localhost:3000/admin
```

Run the API tests (no network needed):

```bash
npm test
```
