# M. Rifki Ananda — Portfolio

Personal portfolio with built-in admin panel for managing content.

## 🗂 File Structure

```
your-repo/
├── index.html       ← Your portfolio (public site)
├── admin.html       ← Master data editor (private/your eyes only)
├── data.js          ← All content lives here
├── images/
│   └── profile.png  ← Your photos go here
└── README.md
```

## 🚀 Local Preview

Open `index.html` in your browser — that's it. No build step.

To edit your data: open `admin.html` in your browser.

## 📤 Deploy to GitHub Pages

1. Create a repo named `your-username.github.io`
2. Upload all files (`index.html`, `admin.html`, `data.js`, the `images/` folder)
3. Visit `https://your-username.github.io` — your site is live

## ✏️ Updating Your Content

**The easy way (recommended):**
1. Open `admin.html` in your browser
2. Edit anything — fields auto-save to your browser's memory
3. Click **💾 Export data.js**
4. Upload the new `data.js` to your GitHub repo (overwriting the old one)
5. Site updates within ~1 minute

**Adding a new photo:**
1. Upload the image file to your repo's `images/` folder via GitHub
2. In the admin panel's "Profile Photo Path" field, enter `images/your-filename.png`
3. Export & upload `data.js`

**The advanced way:** edit `data.js` directly in any text editor.

## 🔮 Future: When You Have a Real Server

The data is already structured as JSON — when you eventually run a backend:

1. **Portfolio side:** swap `<script src="data.js">` for a `fetch('/api/portfolio')` call
2. **Admin side:** change the export button to `POST /api/portfolio` instead of downloading a file
3. The data shape stays exactly the same — no UI changes needed

Suggested backend stack: Node.js + Express + PostgreSQL/MongoDB, or Supabase / Firebase for a managed option.

## 🎨 Customization

- **Colors:** edit the CSS variables at the top of `index.html` (`--bg`, `--accent`, etc.)
- **Fonts:** swap the Google Fonts import in `<head>` and the `--font-*` CSS variables
- **Layout:** all styles are in the `<style>` block in `index.html`

---

Built with ❤️ in Jakarta.
