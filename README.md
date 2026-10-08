# M. Rifki Ananda — Portfolio

Personal portfolio hosted on GitHub Pages, with an admin panel that publishes
content changes straight to this repository.

Live site: https://rifkianandasmp1.github.io

## File structure

```
├── index.html            ← Public portfolio
├── admin.html            ← Content editor (needs a GitHub token to publish)
├── data/
│   └── portfolio.json    ← All content lives here (the "database")
├── assets/
│   ├── css/site.css      ← Portfolio styles (light + dark theme)
│   ├── css/admin.css     ← Admin styles
│   ├── js/site.js        ← Renders portfolio.json into the page
│   ├── js/admin.js       ← Schema-driven editor
│   └── js/github.js      ← GitHub Contents API client (the backend)
├── images/               ← Photos
├── favicon.svg, robots.txt, sitemap.xml, .nojekyll
```

## How the backend works

GitHub Pages only serves static files, so the repository itself is the backend:

1. `index.html` loads `data/portfolio.json` and renders every section from it.
2. `admin.html` edits that JSON in the browser and, when you click **Publish**,
   commits it to this repository through the GitHub REST API.
3. GitHub Pages redeploys automatically — the live site updates in about a minute.

No server, database or hosting bill is needed. Every edit is a commit, so the
full history is in Git and any change can be reverted.

## Editing content

1. Open `https://rifkianandasmp1.github.io/admin.html`.
2. Click **Not connected** (top left) and paste a GitHub token — see below.
3. Edit any section. Drafts are saved in your browser automatically.
4. **Preview** opens the site with your unpublished draft.
5. **Publish** (or Ctrl/Cmd + S) commits the changes.

Uploading a new profile photo from the admin resizes it to 1200px and commits it
to `images/`.

Text fields that mention it support a tiny markup: `*text*` for the accent italic
and `**text**` for bold.

### Creating the GitHub token (one time)

1. Go to **GitHub → Settings → Developer settings → Fine-grained tokens →
   Generate new token** (https://github.com/settings/personal-access-tokens/new).
2. **Repository access:** *Only select repositories* → `rifkianandasmp1.github.io`.
3. **Permissions → Repository permissions → Contents:** *Read and write*.
4. Pick an expiry, generate, and paste the token into the admin panel.

The token is stored only in your browser (for the current tab, or on the device if
you tick *Remember*). Use **More → Disconnect GitHub** to remove it. Anyone can open
`admin.html`, but nobody can publish without a token that has write access to this
repository.

## Local preview

The page loads its data with `fetch`, so open it through a local web server
instead of double-clicking the file:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000 and http://localhost:8000/admin.html
```

## Deploying

GitHub Pages serves the default branch (`main`). Merge changes into `main` and
the site redeploys automatically.
