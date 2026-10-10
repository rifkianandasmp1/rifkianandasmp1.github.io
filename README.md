# M. Rifki Ananda — Portfolio

Personal portfolio hosted on **Vercel**, with a password-protected admin panel backed by
a private **Go** API. The repository can stay private.

## File structure

```
├── public/                  ← Everything served to visitors
│   ├── index.html           ← Portfolio
│   ├── admin.html           ← Admin panel (served at /admin)
│   ├── data/portfolio.json  ← All content (the "database")
│   ├── images/              ← Photos
│   └── assets/              ← CSS and JS for the site and the admin
├── backend/                 ← Go API: auth, content, upload, GitHub client (+ tests)
├── api/*/index.go           ← Vercel Function entrypoints, one per route
├── cmd/dev/                 ← Local dev server (go run ./cmd/dev)
├── docs/
│   ├── api-contract.md      ← API contract (read this first)
│   └── openapi.yaml         ← Same contract as OpenAPI 3.1
├── go.mod
└── vercel.json              ← Output dir, rewrites, security headers
```

Only `public/` is served as static files, so the Go source is never downloadable.

## How it works

1. Visitors get static files: `index.html` renders `data/portfolio.json`.
2. `/admin` asks for a password. The Go API checks it against `ADMIN_PASSWORD` and
   sets an HttpOnly, signed session cookie (valid 7 days).
3. **Publish** sends the content to `PUT /api/content`, which commits
   `public/data/portfolio.json` to GitHub using a token stored only in Vercel.
4. The commit triggers a new Vercel deployment; the site updates in about a minute.

Every change is a Git commit (easy to revert), and no database is needed.
Endpoints, payloads and error codes are specified in [`docs/api-contract.md`](docs/api-contract.md).

## Setting up Vercel (one time)

### 1. Create a GitHub token for the server
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
- **Repository access:** Only select repositories → this repository
- **Permissions → Repository → Contents:** Read and write
- Pick a long expiry and note the date. Publishing stops working when it expires.

### 2. Import the project
1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project** → import this repository.
3. Framework preset: **Other**. Leave the build command empty; the output directory
   (`public`) comes from `vercel.json`.

### 3. Environment variables (Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | Your admin password (at least 8 characters; use a long one) |
| `SESSION_SECRET` | A random string of 32+ characters, e.g. from `openssl rand -base64 48` |
| `GITHUB_TOKEN` | The token from step 1 |

That is all that is required. The repository and branch come from the deployment's
own Git metadata, so production publishes to `main` and each preview publishes to its
own branch. Only set `GITHUB_OWNER`, `GITHUB_REPO` or `GITHUB_BRANCH` to override that.

Redeploy after adding or changing variables. Changing `SESSION_SECRET` signs everyone out.

### 4. Domain
The site is live at https://rifkiananda.vercel.app. To use your own domain:
Project → Settings → **Domains** → add it and follow the DNS instructions.
Then update the `og:image`, `og:url` and canonical URLs in `public/index.html` so link previews work.

### 5. Make the repository private (optional)
GitHub → repository **Settings → General → Danger Zone → Change visibility**.
Vercel keeps deploying private repositories. On a free GitHub plan this also switches
off the old GitHub Pages site.

## Editing content

Open `/admin`, sign in, edit, then **Publish** (or Ctrl/Cmd + S). Drafts are saved in the
browser, **Preview** shows the unpublished draft, and photo uploads are resized to 1200px.

Text fields support a tiny markup: `*text*` for the accent italic and `**text**` for bold.

## Local development

Requires Go 1.24+.

```bash
# .env.local (git-ignored) holds the same variables as Vercel
go run ./cmd/dev          # http://localhost:3000 and http://localhost:3000/admin
go test ./...             # API tests, no network needed
```

Publishing from the local admin commits to the real repository. `vercel dev` also works
if you prefer the Vercel CLI.
