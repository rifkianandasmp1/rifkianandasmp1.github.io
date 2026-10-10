# Portfolio Admin API — Contract

Version 1.0.0 · Machine-readable spec: [`openapi.yaml`](openapi.yaml) (OpenAPI 3.1)

This is the private API behind `/admin`. It is written in Go (`backend/`) and runs as
Vercel Functions (`api/*/index.go`). The public site never calls it; it only reads the
static file `/data/portfolio.json`.

## 1. Overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/auth` | — | Is the caller signed in? |
| `POST` | `/api/auth` | — | Sign in with the admin password |
| `DELETE` | `/api/auth` | — | Sign out |
| `GET` | `/api/content` | session | Read the latest content document |
| `PUT` | `/api/content` | session | Publish the content document (Git commit) |
| `POST` | `/api/upload` | session | Upload an image (Git commit) |
| `GET` | `/data/portfolio.json` | — | Published content (static file) |
| `GET` | `/robots.txt`, `/sitemap.xml` | — | Generated for the current domain |

### Storage and deployment
- Content lives in the GitHub repository as `public/data/portfolio.json`; images in `public/images/`.
- `PUT /api/content` and `POST /api/upload` each create one commit on the configured
  branch (by default the branch of the running deployment, see [Configuration](#5-configuration)).
  The commit triggers a Vercel deployment, so changes are public **about one minute**
  after a successful response.
- The GitHub token exists only in the server environment.

## 2. Conventions

### Requests
- Request bodies are JSON: `Content-Type: application/json` (otherwise `415`).
- **CSRF protection:** `POST`, `PUT` and `DELETE` must carry an `Origin` header whose host
  equals the API host (browsers send it automatically). Missing or foreign origin → `403`.
- Body size limits: sign-in 4 KiB, content 512 KiB, upload ~4 MiB (3 MiB after base64 decoding) → `413`.

### Authentication
`POST /api/auth` sets this cookie on success:

```
admin_session=<payload>.<signature>; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Strict
```

- `payload` is base64url JSON `{"exp": <unix seconds>}`, `signature` is HMAC-SHA256 with
  `SESSION_SECRET`. Sessions last **7 days**; there is no server-side session store.
- Changing `SESSION_SECRET` signs everyone out. Changing `ADMIN_PASSWORD` does not end
  existing sessions — rotate `SESSION_SECRET` as well.
- Wrong passwords are answered after ~800 ms to slow down guessing.

### Responses and errors
- All API responses are JSON with `Cache-Control: no-store`.
- Errors always have this shape, and `error` is safe to show to the user:

```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|---|---|
| `400` | Invalid JSON or body does not match the schema |
| `401` | Wrong password (sign-in) or missing/invalid/expired session |
| `403` | Missing or cross-origin `Origin` header |
| `405` | Method not supported; the `Allow` header lists valid methods |
| `409` | Content changed on GitHub (see [Conflicts](#conflicts)) |
| `413` | Body or image too large |
| `415` | Not JSON, or the upload is not a JPEG/PNG/WebP image |
| `500` | Server not configured (missing environment variables, or repository/branch not found) or unexpected error |
| `502` | GitHub unreachable or rejected the server token |

## 3. Endpoints

### `GET /api/auth`
Returns whether the request carries a valid session. Never returns `401`.

```http
GET /api/auth
```
```json
200 OK
{ "authenticated": false }
```

### `POST /api/auth`
```http
POST /api/auth
Origin: https://your-domain
Content-Type: application/json

{ "password": "my long admin password" }
```

| Status | Body |
|---|---|
| `200` + `Set-Cookie` | `{ "authenticated": true }` |
| `401` | `{ "error": "Wrong password" }` |
| `400` `403` `413` `415` `500` | error |

### `DELETE /api/auth`
Clears the cookie (`Max-Age=0`). Works with or without a valid session.

```json
200 OK
{ "authenticated": false }
```

### `GET /api/content`
Reads the file from GitHub, so it is always the latest committed version (the deployed
copy can lag by a minute).

```json
200 OK
{
  "data": { "meta": { … }, "profile": { … }, … },
  "sha": "3f1c0a9e2b7d4c6f8a1e5b9d0c2f4a6e8b0d1c3e"
}
```

`data` and `sha` are both `null` when the branch exists but the file does not exist yet.
If the repository or branch cannot be found, the server returns `500` naming the setting to
fix instead, e.g. `Branch "x" does not exist in owner/repo (check GITHUB_BRANCH for this environment)`.
Errors: `401`, `500`, `502`.

### `PUT /api/content`
Publishes the whole document.

```http
PUT /api/content
Origin: https://your-domain
Content-Type: application/json

{
  "data": { "profile": { … }, "experience": [ … ], … },
  "baseSha": "3f1c0a9e…",
  "message": "Update portfolio: experience",
  "force": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `data` | [Portfolio](#4-content-document) | yes | `profile` must be an object; `experience`, `projects`, `education`, `skills`, `training` must be arrays if present |
| `baseSha` | string | no | `sha` from `GET /api/content`. Enables the conflict check |
| `message` | string | no | Commit message, max 200 characters. Default `Update portfolio content` |
| `force` | boolean | no | `true` overwrites even when `baseSha` is stale |

The server sets `meta.updated` to today's date in Asia/Jakarta (`YYYY-MM-DD`), keeps the
client's key order, writes the file with two-space indentation and a trailing newline,
and commits it.

```json
200 OK
{
  "data": { …document as committed… },
  "sha": "9b2e…",
  "commitUrl": "https://github.com/<owner>/<repo>/commit/…"
}
```

Use the returned `sha` as the next `baseSha`.

#### Conflicts
| Situation | Response | What the client does |
|---|---|---|
| `baseSha` differs from the file on GitHub | `409 { "error": "...", "conflict": true, "latestSha": "…" }` | Ask the user, then retry with `"force": true`, or reload |
| File changed during the commit itself | `409 { "error": "The file changed on GitHub while saving. Reload and try again." }` | Reload and retry |

Other errors: `400`, `401`, `403`, `413`, `415`, `500`, `502`.

### `POST /api/upload`
```http
POST /api/upload
Origin: https://your-domain
Content-Type: application/json

{ "filename": "My Photo.jpg", "content": "<base64 of the image bytes>" }
```

- The type is detected from the bytes: JPEG, PNG or WebP only (`415` otherwise). Max 3 MiB (`413`).
- Stored as `public/images/<slug>-<id>.<ext>`, where `slug` comes from `filename`.
- The admin panel resizes photos to at most 1200 px (JPEG) before uploading.

```json
200 OK
{ "path": "images/my-photo-mv1xp3fs.jpg" }
```

`path` is relative to the site root. Put it in the document (e.g. `profile.photo`) and
publish. The image is reachable after the next deployment.

### Public resources
- `GET /data/portfolio.json`: the deployed content document (`Cache-Control: public, max-age=0, must-revalidate`).
- `GET /robots.txt`: allows everything except `/admin` and `/api/`, and points to the sitemap.
- `GET /sitemap.xml`: lists the home page for the requesting domain.

## 4. Content document

`public/data/portfolio.json`. Only the shape rules in `PUT /api/content` are enforced;
unknown fields are preserved.

Fields marked **rich** accept `*accent italic*` and `**bold**`. All other HTML is escaped
when the site renders it.

```jsonc
{
  "meta":    { "title": "", "description": "", "updated": "2026-10-10" },   // updated: set by server
  "profile": {
    "first_name": "M. Rifki", "last_name": "Ananda",                       // last name in accent italic
    "role": "", "location": "", "status": "",                              // empty status hides the pill
    "tagline": "rich",
    "photo": "images/profile.png"
  },
  "about":       { "lead": "rich", "paragraphs": ["rich"] },
  "methodology": { "label": "", "items": [ { "name": "", "duration": "", "percent": 0, "desc": "rich" } ] },
  "experience":  [ { "active": true, "start": "Apr 2026", "end": "Present", "role": "", "company": "", "company_short": "", "location": "", "desc": "rich", "tags": [""] } ],
  "projects":    [ { "active": true, "year": "", "title": "", "org": "", "desc": "rich" } ],   // org drives the filter buttons
  "education":   [ { "active": true, "start": "", "end": "", "degree": "rich", "school": "", "gpa": "", "honors": "rich" } ],
  "skills":      [ { "active": true, "category": "", "items": [""] } ],
  "training":    [ { "active": true, "year": "", "title": "", "certificate": true } ],
  "contact": {
    "heading": "rich", "subheading": "",
    "links": [ { "active": true, "label": "", "value": "", "href": "https://… | mailto:… | tel:… | \"\"" } ]
  }
}
```

- `active: false` hides an item in `experience`, `projects`, `education`, `skills`, `training`
  or `contact.links`. Absent means shown. Hidden items are also left out of the hero stats, and
  a hidden email or LinkedIn link also removes its button from the hero.
- `experience[].end` containing "Present" marks the current role.
- `profile.stats` is no longer used. The site computes the hero stats from the visible items:

| Stat | Rule |
|---|---|
| Experience | Earliest `experience[].start` to the latest `end` ("Present" = today). Shown as whole years (`4+ yrs`), or months under a year |
| Projects shipped | Number of visible `projects` |
| GPA | `gpa` of the visible education with the latest `end`; the label follows the degree ("Master's GPA", "Bachelor's GPA", …) |
| Currently at | `company_short` of the current role, or `company` shortened (text before " · ", without "PT", "(Persero)", "Tbk"). Hidden when there is no current role |

- The project archive shows 6 cards per page, with previous/next buttons when there are more.
- `contact.links[].href` with any other scheme is rendered as plain text.

## 5. Configuration

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Admin password, at least 8 characters |
| `SESSION_SECRET` | yes | At least 32 random characters, used to sign cookies |
| `GITHUB_TOKEN` | yes | Fine-grained token with **Contents: Read and write** on the repository |
| `GITHUB_OWNER` | no | Repository owner. Default: `VERCEL_GIT_REPO_OWNER` |
| `GITHUB_REPO` | no | Repository name. Default: `VERCEL_GIT_REPO_SLUG` |
| `GITHUB_BRANCH` | no | Branch to commit to. Default: `VERCEL_GIT_COMMIT_REF` (the deployment's branch), else `main` |
| `GITHUB_API_URL` | no | API base URL, for GitHub Enterprise or a local fake |

If any required variable is missing, every admin endpoint returns
`500 { "error": "Server is not configured: …" }` naming the variables.
