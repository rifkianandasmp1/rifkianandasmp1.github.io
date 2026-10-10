/* ============================================================
   Portfolio renderer — reads data/portfolio.json
   ============================================================ */
(function () {
  'use strict';

  const DATA_URL = 'data/portfolio.json';
  const DRAFT_KEY = 'portfolio-admin-draft';

  const $ = (id) => document.getElementById(id);
  const list = (v) => (Array.isArray(v) ? v : []);

  // Escape text for safe insertion into HTML.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Minimal markup: **bold** and *accent italic*. Everything else is escaped.
  function rich(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  // Only allow safe link schemes.
  function safeHref(href) {
    const h = String(href || '').trim();
    return /^(https?:|mailto:|tel:|#)/i.test(h) ? h : '';
  }

  const icons = {
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  };

  async function loadData() {
    const params = new URLSearchParams(location.search);
    if (params.has('preview')) {
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (draft && draft.data) {
          const banner = document.createElement('div');
          banner.className = 'preview-banner';
          banner.textContent = 'Preview — unsaved draft from admin';
          document.body.appendChild(banner);
          return draft.data;
        }
      } catch (e) { /* fall through to published data */ }
    }
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function render(D) {
    const meta = D.meta || {};
    const p = D.profile || {};
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');

    // Meta
    if (meta.title) document.title = meta.title;
    if (meta.description) document.querySelector('meta[name="description"]').setAttribute('content', meta.description);

    // Brand
    const initials = fullName.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(-2).join('');
    $('brand-mark').textContent = initials || 'RA';
    $('brand-name').textContent = fullName;

    // Hero
    if (p.status) {
      $('hero-status').lastElementChild.textContent = p.status;
    } else {
      $('hero-status').hidden = true;
    }
    $('hero-name').innerHTML = `${esc(p.first_name)}<br/><em>${esc(p.last_name)}</em>`;
    $('hero-role').textContent = [p.role, p.location].filter(Boolean).join(' · ');
    $('hero-tagline').innerHTML = rich(p.tagline);

    const links = list(D.contact && D.contact.links);
    const email = links.find((l) => /^mailto:/i.test(l.href || ''));
    const linkedin = links.find((l) => /linkedin\.com/i.test(l.href || ''));
    $('hero-actions').innerHTML = [
      email ? `<a class="btn btn-primary" href="${esc(safeHref(email.href))}">${icons.mail} Get in touch</a>` : '',
      `<a class="btn" href="#experience">View experience</a>`,
      linkedin ? `<a class="btn" href="${esc(safeHref(linkedin.href))}" target="_blank" rel="noopener">LinkedIn ${icons.arrow}</a>` : '',
    ].join('');

    if (p.photo) {
      $('hero-photo').innerHTML =
        `<img src="${esc(p.photo)}" alt="Portrait of ${esc(fullName)}" width="800" height="800" loading="eager" />` +
        (p.location ? `<figcaption>${icons.pin}<span>${esc(p.location)}</span></figcaption>` : '');
    } else {
      $('hero-photo').hidden = true;
    }

    $('hero-stats').innerHTML = list(p.stats).map((s) => `
      <div class="stat">
        <dt>${esc(s.label)}</dt>
        <dd>${esc(s.value)}${s.suffix ? `<span>${esc(s.suffix)}</span>` : ''}</dd>
      </div>`).join('');

    // About
    const about = D.about || {};
    $('about-lead').innerHTML = rich(about.lead);
    $('about-body').innerHTML = list(about.paragraphs).map((t) => `<p>${rich(t)}</p>`).join('');

    const method = D.methodology || {};
    $('method-label').textContent = method.label || '';
    $('method-grid').innerHTML = list(method.items).map((m) => {
      const pct = Math.max(0, Math.min(100, Number(m.percent) || 0));
      return `
      <article class="method-card">
        <div class="method-top">
          <h3 class="method-name">${esc(m.name)}</h3>
          <span class="method-duration">${esc(m.duration)}</span>
        </div>
        <div class="method-bar" role="img" aria-label="${esc(m.name)}: ${pct}% of practice">
          <div class="method-fill" style="--w:${pct}%"></div>
        </div>
        <p class="method-desc">${rich(m.desc)}</p>
      </article>`;
    }).join('');
    if (!list(method.items).length) document.querySelector('.method').hidden = true;

    // Experience
    $('timeline').innerHTML = list(D.experience).map((e) => {
      const current = /present|now|sekarang/i.test(e.end || '');
      return `
      <li class="job${current ? ' current' : ''}">
        <div class="job-when">
          <div>${esc(e.start)} — ${esc(e.end)}</div>
          ${current ? '<span class="job-badge">Current role</span>' : ''}
        </div>
        <div>
          <h3 class="job-role">${esc(e.role)}</h3>
          <p class="job-company">${esc(e.company)}</p>
          ${e.location ? `<p class="job-location">${esc(e.location)}</p>` : ''}
          <p class="job-desc">${rich(e.desc)}</p>
          ${list(e.tags).length ? `<ul class="chips">${list(e.tags).map((t) => `<li class="chip">${esc(t)}</li>`).join('')}</ul>` : ''}
        </div>
      </li>`;
    }).join('');

    // Projects + filters
    const projects = list(D.projects);
    $('project-grid').innerHTML = projects.map((pr) => `
      <article class="project" data-org="${esc(pr.org || '')}">
        <div class="project-meta"><span class="org">${esc(pr.org)}</span><span>${esc(pr.year)}</span></div>
        <h3 class="project-title">${esc(pr.title)}</h3>
        <p class="project-desc">${rich(pr.desc)}</p>
      </article>`).join('');

    const orgs = [];
    projects.forEach((pr) => { if (pr.org && !orgs.includes(pr.org)) orgs.push(pr.org); });
    const filters = $('project-filters');
    if (orgs.length > 1) {
      const btn = (label, value, count, pressed) =>
        `<button type="button" class="filter-btn" data-filter="${esc(value)}" aria-pressed="${pressed}">${esc(label)}<span class="count">${count}</span></button>`;
      filters.innerHTML = btn('All', '', projects.length, true) +
        orgs.map((o) => btn(o, o, projects.filter((pr) => pr.org === o).length, false)).join('');
      filters.addEventListener('click', (ev) => {
        const b = ev.target.closest('.filter-btn');
        if (!b) return;
        const value = b.dataset.filter;
        filters.querySelectorAll('.filter-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        document.querySelectorAll('#project-grid .project').forEach((card) => {
          card.hidden = !!value && card.dataset.org !== value;
          card.classList.add('in');
        });
      });
    } else {
      filters.hidden = true;
    }

    // Education
    $('edu-grid').innerHTML = list(D.education).map((e) => `
      <article class="edu">
        <div class="edu-top">
          <span class="edu-when">${esc(e.start)} — ${esc(e.end)}</span>
          ${e.gpa ? `<span class="gpa">GPA ${esc(e.gpa)}</span>` : ''}
        </div>
        <h3 class="edu-degree">${rich(e.degree)}</h3>
        <p class="edu-school">${esc(e.school)}</p>
        ${e.honors ? `<p class="edu-honors">${rich(e.honors)}</p>` : ''}
      </article>`).join('');

    // Skills & training
    $('skills-grid').innerHTML = list(D.skills).map((s) => `
      <div class="skill-group">
        <h3>${esc(s.category)}</h3>
        <ul class="chips">${list(s.items).map((i) => `<li class="chip">${esc(i)}</li>`).join('')}</ul>
      </div>`).join('');
    $('training-list').innerHTML = list(D.training).map((t) => `
      <li>
        <span class="training-year">${esc(t.year)}</span>
        <span>${esc(t.title)}</span>
        ${t.certificate ? '<span class="cert-badge">Certified</span>' : ''}
      </li>`).join('');

    // Contact
    const contact = D.contact || {};
    $('contact-heading').innerHTML = rich(contact.heading);
    $('contact-sub').textContent = contact.subheading || '';
    $('contact-links').innerHTML = links.map((l) => {
      const href = safeHref(l.href);
      const inner = `<span class="label">${esc(l.label)}</span><span class="value">${esc(l.value)}</span>`;
      if (!href || href === '#') return `<div class="contact-link">${inner}</div>`;
      const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
      return `<a class="contact-link" href="${esc(href)}"${ext}>${inner}</a>`;
    }).join('');

    // Footer
    $('footer-copy').textContent = `© ${new Date().getFullYear()} ${fullName}`;
    if (meta.updated) {
      const d = new Date(meta.updated + 'T00:00:00');
      $('footer-updated').textContent = isNaN(d) ? '' :
        'Last updated ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Structured data for search engines
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    const current = list(D.experience).find((e) => /present/i.test(e.end || ''));
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: fullName,
      jobTitle: p.role,
      worksFor: current ? { '@type': 'Organization', name: current.company } : undefined,
      alumniOf: list(D.education).map((e) => ({ '@type': 'CollegeOrUniversity', name: e.school })),
      address: p.location ? { '@type': 'PostalAddress', addressLocality: p.location } : undefined,
      email: email ? email.value : undefined,
      sameAs: linkedin ? [linkedin.href] : undefined,
      image: p.photo ? new URL(p.photo, location.href).href : undefined,
    });
    document.head.appendChild(ld);
  }

  // ---------- UI behaviour ----------
  function setupTheme() {
    const btn = $('theme-toggle');
    const root = document.documentElement;
    const isDark = () => root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const sync = () => btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      sync();
    });
    sync();
  }

  function setupNav() {
    const nav = $('site-nav');
    const toggle = $('menu-toggle');
    const header = document.querySelector('.site-header');
    const close = () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function setupObservers() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal, .job, .project, .edu').forEach((el) => el.classList.add('in'));
      return;
    }
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal, .job, .project, .edu').forEach((el) => reveal.observe(el));

    // Highlight the nav link of the section in view
    const links = new Map();
    document.querySelectorAll('.site-nav a[href^="#"]').forEach((a) => links.set(a.getAttribute('href').slice(1), a));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const a = links.get(en.target.id);
        if (a && en.isIntersecting) {
          links.forEach((x) => x.classList.remove('active'));
          a.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));
  }

  setupTheme();
  setupNav();

  loadData()
    .then((data) => {
      render(data);
      $('load-state').remove();
      $('content').hidden = false;
      setupObservers();
    })
    .catch((err) => {
      console.error(err);
      const local = location.protocol === 'file:';
      $('load-state').innerHTML = local
        ? 'Open this site through a local web server to preview it, e.g. <code>python3 -m http.server</code> then visit <code>http://localhost:8000</code>.'
        : 'Sorry — the portfolio data could not be loaded. Please refresh the page.';
    });
})();
