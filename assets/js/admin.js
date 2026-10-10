/* ============================================================
   Portfolio admin — edits data/portfolio.json and publishes it
   through the private API (api/*.js on Vercel). The GitHub token
   lives only on the server; the browser holds a session cookie.
   ============================================================ */
(function () {
  'use strict';

  const DRAFT_KEY = 'portfolio-admin-draft';
  const SECTION_KEY = 'portfolio-admin-section';
  const RICH = 'Use *text* for accent italic and **text** for bold.';

  // ---------- Content schema (drives the whole editor) ----------
  const SECTIONS = [
    {
      id: 'profile', title: 'Profile', desc: 'Name, headline, photo and the stats under the hero.',
      blocks: [
        { kind: 'fields', fields: [
          { path: 'profile.first_name', label: 'First name' },
          { path: 'profile.last_name', label: 'Last name', hint: 'Shown in accent italic.' },
          { path: 'profile.role', label: 'Role / headline' },
          { path: 'profile.location', label: 'Location' },
          { path: 'profile.status', label: 'Status pill', full: true, hint: 'Shown with a green dot above your name. Leave empty to hide it.' },
          { path: 'profile.tagline', label: 'Tagline', type: 'textarea', full: true, hint: RICH },
          { path: 'profile.photo', label: 'Profile photo', type: 'image', full: true },
        ] },
        { kind: 'list', title: 'Hero stats', path: 'profile.stats', noun: 'stat',
          summary: (s) => [s.label, [s.value, s.suffix].filter(Boolean).join(' ')],
          blank: () => ({ label: '', value: '', suffix: '' }),
          fields: [
            { key: 'label', label: 'Label' },
            { key: 'value', label: 'Value' },
            { key: 'suffix', label: 'Suffix', hint: 'Optional, e.g. "+ yrs" or "/ 4".' },
          ] },
      ],
    },
    {
      id: 'about', title: 'About', desc: 'Intro text and SDLC methodology bars.',
      blocks: [
        { kind: 'fields', fields: [
          { path: 'about.lead', label: 'Lead sentence', type: 'textarea', full: true, hint: RICH },
        ] },
        { kind: 'strings', title: 'Paragraphs', path: 'about.paragraphs', noun: 'paragraph' },
        { kind: 'fields', title: 'Methodology', fields: [
          { path: 'methodology.label', label: 'Label', full: true },
        ] },
        { kind: 'list', path: 'methodology.items', noun: 'methodology',
          summary: (m) => [m.name, m.duration],
          blank: () => ({ name: '', duration: '', percent: 50, desc: '' }),
          fields: [
            { key: 'name', label: 'Name' },
            { key: 'duration', label: 'Duration', hint: 'e.g. "3+ yrs" or "9 mos".' },
            { key: 'percent', label: 'Bar fill (%)', type: 'number', min: 0, max: 100 },
            { key: 'desc', label: 'Description', type: 'textarea', full: true },
          ] },
      ],
    },
    {
      id: 'experience', title: 'Experience', desc: 'Work history, newest first. Use "Present" as the end date for your current role.',
      count: 'experience',
      blocks: [
        { kind: 'list', path: 'experience', noun: 'position',
          summary: (e) => [e.role, [e.company, [e.start, e.end].filter(Boolean).join(' — ')].filter(Boolean).join(' · ')],
          blank: () => ({ start: '', end: 'Present', role: '', company: '', location: '', desc: '', tags: [] }),
          fields: [
            { key: 'role', label: 'Role' },
            { key: 'company', label: 'Company' },
            { key: 'start', label: 'Start', hint: 'e.g. "Apr 2026".' },
            { key: 'end', label: 'End', hint: '"Present" marks it as your current role.' },
            { key: 'location', label: 'Location' },
            { key: 'desc', label: 'Description', type: 'textarea', full: true, rows: 4, hint: RICH },
            { key: 'tags', label: 'Highlights / tags', type: 'tags', full: true },
          ] },
      ],
    },
    {
      id: 'projects', title: 'Projects', desc: 'Project archive. The organization is used for the filter buttons.',
      count: 'projects',
      blocks: [
        { kind: 'list', path: 'projects', noun: 'project',
          summary: (p) => [p.title, [p.org, p.year].filter(Boolean).join(' · ')],
          blank: () => ({ year: String(new Date().getFullYear()), title: '', org: '', desc: '' }),
          fields: [
            { key: 'title', label: 'Title' },
            { key: 'org', label: 'Organization' },
            { key: 'year', label: 'Year', hint: 'e.g. "2025" or "2025–26".' },
            { key: 'desc', label: 'Description', type: 'textarea', full: true, hint: RICH },
          ] },
      ],
    },
    {
      id: 'education', title: 'Education', desc: 'Degrees, GPA and honors.',
      count: 'education',
      blocks: [
        { kind: 'list', path: 'education', noun: 'degree',
          summary: (e) => [String(e.degree || '').replace(/\*/g, ''), e.school],
          blank: () => ({ start: '', end: '', degree: '', school: '', gpa: '', honors: '' }),
          fields: [
            { key: 'degree', label: 'Degree', full: true, hint: 'Wrap the field of study in *asterisks* to highlight it.' },
            { key: 'school', label: 'School' },
            { key: 'gpa', label: 'GPA', hint: 'e.g. "4.00 / 4.00".' },
            { key: 'start', label: 'Start' },
            { key: 'end', label: 'End' },
            { key: 'honors', label: 'Honors / notes', type: 'textarea', full: true, hint: RICH },
          ] },
      ],
    },
    {
      id: 'skills', title: 'Skills', desc: 'Skill groups shown as chips.',
      count: 'skills',
      blocks: [
        { kind: 'list', path: 'skills', noun: 'skill group',
          summary: (s) => [s.category, `${(s.items || []).length} items`],
          blank: () => ({ category: '', items: [] }),
          fields: [
            { key: 'category', label: 'Category', full: true },
            { key: 'items', label: 'Skills', type: 'tags', full: true },
          ] },
      ],
    },
    {
      id: 'training', title: 'Training', desc: 'Training, webinars and certifications.',
      count: 'training',
      blocks: [
        { kind: 'list', path: 'training', noun: 'entry',
          summary: (t) => [t.title, t.year],
          blank: () => ({ year: String(new Date().getFullYear()), title: '' }),
          fields: [
            { key: 'title', label: 'Title' },
            { key: 'year', label: 'Year' },
            { key: 'certificate', label: 'This is a certification', type: 'checkbox', full: true },
          ] },
      ],
    },
    {
      id: 'contact', title: 'Contact', desc: 'Closing call-to-action and contact links.',
      blocks: [
        { kind: 'fields', fields: [
          { path: 'contact.heading', label: 'Heading', hint: RICH },
          { path: 'contact.subheading', label: 'Subheading' },
        ] },
        { kind: 'list', title: 'Links', path: 'contact.links', noun: 'link',
          summary: (l) => [l.label, l.value],
          blank: () => ({ label: '', value: '', href: '' }),
          fields: [
            { key: 'label', label: 'Label' },
            { key: 'value', label: 'Displayed text' },
            { key: 'href', label: 'Link', full: true, hint: 'https://…, mailto:…, tel:… — leave empty for plain text.' },
          ] },
      ],
    },
    {
      id: 'seo', title: 'SEO', desc: 'How the site appears in browser tabs and search results.',
      blocks: [
        { kind: 'fields', fields: [
          { path: 'meta.title', label: 'Page title', full: true },
          { path: 'meta.description', label: 'Meta description', type: 'textarea', full: true, hint: 'Aim for 120–160 characters.' },
        ] },
        { kind: 'note', html: 'The <b>“Last updated”</b> date in the footer is set automatically each time you publish.' },
      ],
    },
  ];

  // ---------- State ----------
  let data = null;          // object being edited
  let published = '';       // canonical JSON of the last published/loaded version
  let baseSha = null;       // sha of data/portfolio.json the edits are based on
  let section = 'profile';
  const openItems = new Set();
  const localImages = {};   // path -> object URL for freshly uploaded photos

  // ---------- Utils ----------
  const $ = (id) => document.getElementById(id);
  const canonical = (obj) => JSON.stringify(obj, null, 2) + '\n';

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = value;
  }
  function getList(path) {
    let arr = getPath(data, path);
    if (!Array.isArray(arr)) { arr = []; setPath(data, path, arr); }
    return arr;
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  let toastTimer;
  function toast(message, { error = false, link = null, ms = 4500 } = {}) {
    const t = $('toast');
    t.textContent = message;
    if (link) { t.append(' '); t.append(h('a', { href: link.href, target: '_blank', rel: 'noopener' }, link.text)); }
    t.classList.toggle('error', error);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- API ----------
  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection.', 0, {});
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && path !== '/api/auth') showLogin('Your session expired. Please sign in again.');
      const fallback = res.status === 404 ? 'The admin API is not available on this host (deploy the site on Vercel).' : `Server error ${res.status}`;
      throw new ApiError(payload.error || fallback, res.status, payload);
    }
    return payload;
  }

  // ---------- Storage (all wrapped: storage can be unavailable) ----------
  function readJSON(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function removeKey(storage, key) {
    try { storage.removeItem(key); } catch (e) {}
  }

  let draftTimer;
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 300);
  }
  function saveDraft() {
    clearTimeout(draftTimer);
    if (data) writeJSON(localStorage, DRAFT_KEY, { data, baseSha, savedAt: new Date().toISOString() });
  }
  function clearDraft() {
    clearTimeout(draftTimer);
    removeKey(localStorage, DRAFT_KEY);
  }

  // ---------- Dirty tracking ----------
  const isDirty = () => data != null && canonical(data) !== published;

  function changedSections() {
    let before = {};
    try { before = JSON.parse(published || '{}'); } catch (e) {}
    const keys = new Set([...Object.keys(before), ...Object.keys(data || {})]);
    const titles = { meta: 'SEO', methodology: 'About (methodology)' };
    return [...keys]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]))
      .map((k) => titles[k] || (SECTIONS.find((s) => s.id === k) || {}).title || k);
  }

  function refreshStatus() {
    const dirty = isDirty();
    $('dirty-badge').hidden = !dirty;
    $('btn-publish').disabled = !dirty;
    document.title = (dirty ? '• ' : '') + 'Portfolio Admin';
    SECTIONS.forEach((s) => {
      if (!s.count) return;
      const el = document.querySelector(`[data-count="${s.id}"]`);
      if (el) el.textContent = getList(s.count).length;
    });
  }

  function changed() {
    saveDraftSoon();
    refreshStatus();
  }

  function setStatus(state, text) {
    const c = $('conn-status');
    c.dataset.state = state;
    c.querySelector('.conn-text').textContent = text;
  }

  // ---------- Field rendering ----------
  function fieldEl(def, get, set, onAfter) {
    const type = def.type || 'text';
    const after = () => { if (onAfter) onAfter(); changed(); };
    const hint = def.hint ? h('span', { class: 'hint' }, def.hint) : null;
    const cls = 'field' + (def.full ? ' full' : '');

    if (type === 'checkbox') {
      return h('label', { class: 'check' + (def.full ? ' full' : '') },
        h('input', { type: 'checkbox', checked: !!get(), onchange: (e) => { set(e.target.checked || undefined); after(); } }),
        def.label);
    }

    if (type === 'image') return imageField(def, get, set, after);

    let input;
    if (type === 'textarea') {
      input = h('textarea', { rows: def.rows || 3, value: get() || '', oninput: (e) => { set(e.target.value); after(); } });
    } else if (type === 'tags') {
      input = h('textarea', {
        rows: Math.max(3, (get() || []).length + 1),
        value: (get() || []).join('\n'),
        oninput: (e) => { set(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)); after(); },
      });
      return h('label', { class: cls }, h('span', null, def.label, ' ', h('em', null, '(one per line)')), input, hint);
    } else if (type === 'number') {
      input = h('input', {
        type: 'number', min: def.min, max: def.max, value: get() ?? '',
        oninput: (e) => { set(e.target.value === '' ? 0 : Number(e.target.value)); after(); },
      });
    } else {
      input = h('input', { type: 'text', value: get() || '', oninput: (e) => { set(e.target.value); after(); } });
    }
    return h('label', { class: cls }, h('span', null, def.label), input, hint);
  }

  function imageField(def, get, set, after) {
    const src = () => localImages[get()] || get() || '';
    const img = h('img', { src: src(), alt: '' });
    const input = h('input', { type: 'text', value: get() || '', oninput: (e) => { set(e.target.value); img.src = src(); after(); } });
    const upload = h('button', {
      type: 'button', class: 'btn btn-sm',
      onclick: () => {
        const picker = $('photo-file');
        picker.onchange = async () => {
          const file = picker.files[0];
          picker.value = '';
          if (!file) return;
          upload.disabled = true;
          upload.textContent = 'Uploading…';
          try {
            const path = await uploadImage(file);
            set(path);
            input.value = path;
            img.src = src();
            after();
            toast('Photo uploaded. Publish to make it live.');
          } catch (err) {
            toast('Upload failed: ' + err.message, { error: true });
          } finally {
            upload.disabled = false;
            upload.textContent = 'Upload new…';
          }
        };
        picker.click();
      },
    }, 'Upload new…');
    return h('div', { class: 'field' + (def.full ? ' full' : '') },
      h('span', null, def.label),
      h('div', { class: 'image-field' },
        img,
        h('div', { class: 'field' }, input, h('span', { class: 'hint' }, 'Path inside the repository, e.g. images/profile.png. Uploads are resized to 1200px.')),
        upload));
  }

  async function uploadImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    const { path } = await api('/api/upload', { method: 'POST', body: { filename: file.name, content: await blobToBase64(blob) } });
    localImages[path] = URL.createObjectURL(blob);
    return path;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // ---------- Blocks ----------
  function fieldsBlock(block) {
    const wrap = h('div', { class: 'card fields' },
      block.fields.map((f) => fieldEl(f, () => getPath(data, f.path), (v) => setPath(data, f.path, v))));
    return block.title ? h('div', { class: 'group' }, h('h2', { class: 'group-title' }, block.title), wrap) : wrap;
  }

  function stringsBlock(block) {
    const arr = getList(block.path);
    const rows = h('div', { class: 'strings' });
    const draw = () => {
      rows.replaceChildren(...arr.map((text, i) => h('div', { class: 'string-row' },
        h('textarea', { rows: 4, value: text, 'aria-label': `${block.noun} ${i + 1}`, oninput: (e) => { arr[i] = e.target.value; changed(); } }),
        h('div', { class: 'item-tools' },
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); changed(); } }, '↑'),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', title: 'Remove', 'aria-label': 'Remove', onclick: () => { arr.splice(i, 1); draw(); changed(); } }, '✕')))));
    };
    draw();
    return h('div', { class: 'group' },
      h('h2', { class: 'group-title' }, block.title),
      h('div', { class: 'card' }, rows,
        h('button', { type: 'button', class: 'btn add-btn', onclick: () => { arr.push(''); draw(); changed(); rows.lastElementChild.querySelector('textarea').focus(); } }, `+ Add ${block.noun}`)));
  }

  function listBlock(block) {
    const arr = getList(block.path);
    const list = h('div', { class: 'list' });

    const draw = () => {
      list.replaceChildren(...arr.map((item, i) => {
        const key = `${block.path}:${i}`;
        const titleEl = h('span', { class: 'item-title' });
        const updateTitle = () => {
          const [title, sub] = block.summary(item);
          titleEl.replaceChildren(title || h('i', { class: 'muted' }, `Untitled ${block.noun}`), sub ? h('span', { class: 'sub' }, sub) : '');
        };
        updateTitle();

        const move = (dir) => (e) => {
          e.stopPropagation();
          const j = i + dir;
          if (j < 0 || j >= arr.length) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          const wasOpen = openItems.has(key);
          const otherOpen = openItems.has(`${block.path}:${j}`);
          openItems.delete(key); openItems.delete(`${block.path}:${j}`);
          if (wasOpen) openItems.add(`${block.path}:${j}`);
          if (otherOpen) openItems.add(key);
          draw(); changed();
        };
        const remove = (e) => {
          e.stopPropagation();
          if (!confirm(`Remove this ${block.noun}?`)) return;
          arr.splice(i, 1);
          [...openItems].filter((k) => k.startsWith(block.path + ':')).forEach((k) => openItems.delete(k));
          draw(); changed();
        };

        const el = h('div', { class: 'item' + (openItems.has(key) ? ' open' : '') });
        const head = h('div', {
          class: 'item-head', role: 'button', tabindex: 0, 'aria-expanded': String(openItems.has(key)),
          onclick: () => {
            const open = !el.classList.contains('open');
            el.classList.toggle('open', open);
            head.setAttribute('aria-expanded', String(open));
            open ? openItems.add(key) : openItems.delete(key);
          },
          onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); head.click(); } },
        },
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'),
          h('span', { class: 'item-index' }, String(i + 1).padStart(2, '0')),
          titleEl,
          h('span', { class: 'item-tools' },
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: move(-1) }, '↑'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: move(1) }, '↓'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', title: 'Remove', 'aria-label': 'Remove', onclick: remove }, '✕')));

        const body = h('div', { class: 'item-body fields' },
          block.fields.map((f) => fieldEl(f, () => item[f.key], (v) => {
            if (v === undefined) delete item[f.key]; else item[f.key] = v;
          }, updateTitle)));

        el.append(head, body);
        return el;
      }));
    };
    draw();

    const add = h('button', {
      type: 'button', class: 'btn add-btn',
      onclick: () => {
        arr.push(block.blank());
        openItems.add(`${block.path}:${arr.length - 1}`);
        draw(); changed();
        const input = list.lastElementChild.querySelector('input, textarea');
        if (input) input.focus();
      },
    }, `+ Add ${block.noun}`);

    const content = [list, add];
    return block.title
      ? h('div', { class: 'group' }, h('h2', { class: 'group-title' }, block.title), ...content)
      : h('div', { class: 'group' }, ...content);
  }

  // ---------- Page rendering ----------
  function renderSidebar() {
    $('sidebar').replaceChildren(...SECTIONS.map((s) => h('button', {
      type: 'button', 'aria-current': String(s.id === section),
      onclick: () => { section = s.id; writeJSON(sessionStorage, SECTION_KEY, section); renderSidebar(); renderEditor(); window.scrollTo(0, 0); },
    }, s.title, s.count ? h('span', { class: 'count', 'data-count': s.id }, getList(s.count).length) : null)));
  }

  function renderEditor() {
    const s = SECTIONS.find((x) => x.id === section) || SECTIONS[0];
    $('editor').replaceChildren(
      h('header', { class: 'section-header' }, h('h1', null, s.title), h('p', null, s.desc)),
      ...s.blocks.map((b) => {
        if (b.kind === 'fields') return fieldsBlock(b);
        if (b.kind === 'strings') return stringsBlock(b);
        if (b.kind === 'list') return listBlock(b);
        if (b.kind === 'note') { const n = h('div', { class: 'notice' }); n.innerHTML = b.html; return n; }
        return null;
      }));
    refreshStatus();
  }

  function renderAll() {
    renderSidebar();
    renderEditor();
  }

  // ---------- Loading ----------
  function emptyData() {
    return {
      meta: { title: '', description: '' },
      profile: { first_name: '', last_name: '', role: '', location: '', status: '', tagline: '', photo: '', stats: [] },
      about: { lead: '', paragraphs: [] },
      methodology: { label: '', items: [] },
      experience: [], projects: [], education: [], skills: [], training: [],
      contact: { heading: '', subheading: '', links: [] },
    };
  }

  function restoreDraft() {
    const draft = readJSON(localStorage, DRAFT_KEY);
    if (!draft || !draft.data || canonical(draft.data) === published) return;
    const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : 'earlier';
    if (confirm(`You have unsaved changes from ${when}. Restore them?`)) {
      data = draft.data;
      if (draft.baseSha && draft.baseSha !== baseSha) {
        toast('Note: the published data changed since this draft was made. Review before publishing.', { ms: 8000 });
      }
    } else {
      clearDraft();
    }
  }

  async function loadContent() {
    setStatus('busy', 'Loading…');
    const res = await api('/api/content');
    data = res.data || emptyData();
    published = res.data ? canonical(res.data) : '';
    baseSha = res.sha;
    restoreDraft();
    setStatus('on', 'Signed in · publishing to GitHub');
    $('app').hidden = false;
    renderAll();
  }

  // ---------- Login ----------
  function showLogin(message) {
    const dlg = $('login-dialog');
    $('login-error').textContent = message || '';
    $('login-error').hidden = !message;
    setStatus('off', 'Signed out');
    if (!dlg.open) dlg.showModal();
    $('login-form').password.focus();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = $('login-submit');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    $('login-error').hidden = true;
    try {
      await api('/api/auth', { method: 'POST', body: { password: form.password.value } });
      form.password.value = '';
      $('login-dialog').close();
      if (data && isDirty()) {
        // Session expired mid-edit: keep the edits, just refresh the published baseline.
        const res = await api('/api/content');
        published = res.data ? canonical(res.data) : '';
        baseSha = res.sha;
        setStatus('on', 'Signed in · publishing to GitHub');
        refreshStatus();
      } else {
        await loadContent();
      }
    } catch (err) {
      $('login-error').textContent = err.message;
      $('login-error').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
  // Escape must not dismiss the login screen.
  $('login-dialog').addEventListener('cancel', (e) => e.preventDefault());

  async function init() {
    section = readJSON(sessionStorage, SECTION_KEY) || section;
    const { authenticated } = await api('/api/auth');
    if (authenticated) await loadContent();
    else showLogin();
  }

  // ---------- Publish ----------
  function openPublish() {
    if (!isDirty()) { toast('Nothing to publish.'); return; }
    const sections = changedSections();
    $('publish-changes').replaceChildren(...sections.map((s) => h('li', null, s)));
    $('publish-form').message.value = `Update portfolio: ${sections.join(', ').toLowerCase()}`;
    $('publish-error').hidden = true;
    $('publish-dialog').showModal();
  }

  async function publish(message, force) {
    return api('/api/content', { method: 'PUT', body: { data, baseSha, message, force } });
  }

  $('publish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = e.target.message.value.trim() || 'Update portfolio content';
    const btn = $('publish-submit');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    $('publish-error').hidden = true;
    try {
      let res;
      try {
        res = await publish(message, false);
      } catch (err) {
        if (!(err.status === 409 && err.body && err.body.conflict)) throw err;
        if (!confirm('The portfolio data was changed after you started editing. Overwrite it with your version?')) {
          throw new Error('Publishing cancelled. Reload the page to get the latest version.');
        }
        res = await publish(message, true);
      }
      data = res.data;
      published = canonical(res.data);
      baseSha = res.sha;
      clearDraft();
      $('publish-dialog').close();
      renderEditor();
      toast('Published! The site redeploys in about a minute.', {
        link: res.commitUrl ? { href: res.commitUrl, text: 'View commit' } : null,
        ms: 8000,
      });
    } catch (err) {
      $('publish-error').textContent = err.message;
      $('publish-error').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publish';
    }
  });
  $('publish-cancel').addEventListener('click', () => $('publish-dialog').close());
  $('btn-publish').addEventListener('click', openPublish);

  // ---------- Toolbar ----------
  $('btn-preview').addEventListener('click', () => {
    saveDraft();
    window.open('index.html?preview=1', '_blank');
  });

  const menu = $('menu-list');
  const moreBtn = $('btn-more');
  const closeMenu = () => { menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    moreBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', closeMenu);
  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    closeMenu();
    if (action === 'download') {
      const url = URL.createObjectURL(new Blob([canonical(data)], { type: 'application/json' }));
      h('a', { href: url, download: 'portfolio.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === 'import') {
      $('import-file').click();
    } else if (action === 'discard') {
      if (!isDirty()) { toast('No local changes.'); return; }
      if (!confirm('Discard all unpublished changes?')) return;
      data = published ? JSON.parse(published) : emptyData();
      clearDraft();
      renderAll();
      toast('Changes discarded.');
    } else if (action === 'logout') {
      if (isDirty()) saveDraft();
      try { await api('/api/auth', { method: 'DELETE' }); } catch (err) { /* cookie may already be gone */ }
      $('app').hidden = true;
      showLogin();
    }
  });

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.profile) throw new Error('This file does not look like portfolio data.');
      data = parsed;
      saveDraft();
      renderAll();
      toast('Imported. Review, then publish.');
    } catch (err) {
      toast('Import failed: ' + err.message, { error: true });
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!$('app').hidden) openPublish();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { saveDraft(); e.preventDefault(); e.returnValue = ''; }
  });

  init().catch((err) => {
    console.error(err);
    setStatus('error', 'Server unavailable');
    $('app').hidden = false;
    $('editor').replaceChildren(h('div', { class: 'empty' }, 'Could not start the admin panel: ' + err.message));
  });
})();
