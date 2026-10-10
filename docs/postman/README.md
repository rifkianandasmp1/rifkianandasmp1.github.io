# Postman

| File | What |
|---|---|
| `portfolio-admin-api.postman_collection.json` | All endpoints with tests (16 requests, 33 assertions) |
| `portfolio-production.postman_environment.json` | https://rifkiananda.vercel.app |
| `portfolio-preview.postman_environment.json` | The PR branch Preview deployment |
| `portfolio-local.postman_environment.json` | `go run ./cmd/dev` on http://localhost:3000 |

## Use
1. Postman → **Import** → select the collection and the environments.
2. Choose an environment (top right) and set **admin_password** (a secret; keep it in *Current value*
   so it is not synced to Postman's cloud).
3. Run the folders in order, or the whole collection with the **Collection Runner**.

The collection stores the session cookie after **Sign in** and sends it on every request.

## Folders
1. **Public**: published JSON, robots.txt, sitemap.xml
2. **Auth**: session status, wrong password (401), missing Origin (403), sign in
3. **Content (read + safe checks)**: get content, stale baseSha (409), invalid data (400), non-image upload (415). Nothing is committed
4. **Writes (commit to GitHub!)**: publish and image upload. ⚠️ Each request creates a commit and a Vercel deployment. Untick this folder in the runner when using Production
5. **Sign out**: sign out, then content without a session (401)

## Command line
```bash
npx newman run docs/postman/portfolio-admin-api.postman_collection.json \
  -e docs/postman/portfolio-local.postman_environment.json \
  --env-var admin_password='your password'
```

Preview deployments may be behind Vercel Deployment Protection. If Preview requests return a
Vercel login page, create a *Protection Bypass for Automation* secret (Vercel → Project → Settings →
Deployment Protection) and put it in the Preview environment's `vercel_bypass` variable.
