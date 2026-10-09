'use strict';
(function () {
  const T = {
    es: {
      title: '¿Le ofrecen ayuda con su caso de inmigración? Verifique antes de pagar.',
      lede: 'Pegue el mensaje, anuncio o WhatsApp que recibió. Lo revisamos contra la lista oficial del Departamento de Justicia y las señales de fraude que publican USCIS y EOIR.',
      textLabel: 'Mensaje o anuncio', textPh: 'Ej.: «Soy notario, le garantizo su residencia. Pague hoy por Zelle…»',
      tryLabel: 'Pruebe un ejemplo:', exNotario: 'Notario por WhatsApp', exUscis: 'Llamada «de USCIS»', exImpostor: 'Organización suplantada',
      moreLabel: 'Agregar nombre, organización o teléfono (opcional)', nameLabel: 'Nombre de la persona', orgLabel: 'Organización', phoneLabel: 'Teléfono que le dieron',
      go: 'Verificar', checking: 'Verificando…', privacy: 'No guardamos lo que pega aquí. No necesita cuenta.',
      foot: 'Verifica es una ayuda para verificar, no asesoría legal. Datos oficiales: Departamento de Justicia de EE. UU. (EOIR), lista de organizaciones reconocidas y representantes acreditados.',
      risk: { high: 'Riesgo alto', medium: 'Precaución', low: 'Sin señales de alerta' },
      why: 'Lo que encontramos', checksTitle: 'Comprobación en la lista oficial del DOJ', next: 'Qué hacer ahora', aiTitle: 'Lo que leyó la IA en su mensaje',
      listed: 'En la lista oficial', notListed: 'No está en la lista', possible: 'Posible coincidencia: confirme',
      expires: 'Acreditación vence', dhsOnly: 'Solo ante DHS (no en corte de inmigración)', pending: 'renovación pendiente',
      officialPhone: 'Teléfono oficial', phoneMismatch: 'El teléfono que le dieron NO es el registrado.', phoneOk: 'El teléfono coincide con el registrado.',
      source: 'Fuente', score: 'Puntaje de riesgo', aiMethod: { ai: 'Extraído por IA', regex: 'Extracción por patrones (IA no disponible)', none: '' },
      k: { names: 'Personas', orgs: 'Organizaciones', titles: 'Títulos que usa', gov: 'Dice ser del gobierno', phones: 'Teléfonos', web: 'Sitios / correos', pay: 'Pago', promises: 'Promesas', urgency: 'Presión o amenazas' },
      yes: 'Sí', no: 'No', empty: 'Pegue el mensaje o escriba un nombre, organización o teléfono.', fail: 'No pudimos verificar ahora. Intente de nuevo en un momento.',
      rosterMeta: (m) => `Lista oficial del DOJ actualizada el ${m.report_last_updated}: ${m.representatives.toLocaleString('es')} representantes acreditados y ${m.organizations.toLocaleString('es')} oficinas de organizaciones reconocidas.`,
    },
    en: {
      title: 'Someone offering help with your immigration case? Verify before you pay.',
      lede: 'Paste the message, ad or WhatsApp you received. We check it against the U.S. Department of Justice\'s official roster and the fraud warning signs published by USCIS and EOIR.',
      textLabel: 'Message or ad', textPh: 'e.g. "I am a notario, I guarantee your green card. Pay today by Zelle…"',
      tryLabel: 'Try an example:', exNotario: 'WhatsApp notario', exUscis: '"USCIS" call', exImpostor: 'Impersonated organization',
      moreLabel: 'Add a name, organization or phone (optional)', nameLabel: 'Person\'s name', orgLabel: 'Organization', phoneLabel: 'Phone they gave you',
      go: 'Verify', checking: 'Checking…', privacy: 'We don\'t store what you paste. No account needed.',
      foot: 'Verifica is a verification aid, not legal advice. Official data: U.S. Department of Justice (EOIR) roster of recognized organizations and accredited representatives.',
      risk: { high: 'High risk', medium: 'Caution', low: 'No red flags' },
      why: 'What we found', checksTitle: 'Official DOJ roster check', next: 'What to do now', aiTitle: 'What the AI read in your message',
      listed: 'On the official roster', notListed: 'Not on the roster', possible: 'Possible match: confirm',
      expires: 'Accreditation expires', dhsOnly: 'DHS only (not immigration court)', pending: 'renewal pending',
      officialPhone: 'Official phone', phoneMismatch: 'The phone you were given is NOT the one on file.', phoneOk: 'The phone matches the one on file.',
      source: 'Source', score: 'Risk score', aiMethod: { ai: 'Extracted by AI', regex: 'Pattern extraction (AI unavailable)', none: '' },
      k: { names: 'People', orgs: 'Organizations', titles: 'Titles used', gov: 'Claims to be government', phones: 'Phones', web: 'Websites / emails', pay: 'Payment', promises: 'Promises', urgency: 'Pressure or threats' },
      yes: 'Yes', no: 'No', empty: 'Paste the message, or enter a name, organization or phone.', fail: 'We could not check right now. Please try again in a moment.',
      rosterMeta: (m) => `Official DOJ roster updated ${m.report_last_updated}: ${m.representatives.toLocaleString('en')} accredited representatives and ${m.organizations.toLocaleString('en')} recognized-organization offices.`,
    },
  };
  const EXAMPLES = {
    notario: { text: 'Buenas tardes, le escribe la Lic. María Gómez, notaria y consultora de inmigración de Servicios Hispanos Unidos. Le garantizamos el permiso de trabajo en 30 días. Solo necesita depositar $800 por Zelle hoy mismo, mañana sube el precio. WhatsApp 602-555-0199' },
    uscis: { text: 'This is officer Daniel Ruiz from USCIS. There is a problem with your application and you will be deported unless you pay a $450 processing fee today with Google Play gift cards. Do not hang up.' },
    impostor: { text: 'Hola, somos Hispanic Catholic Social Services. Para abrir su caso de asilo llame a este número y deposite $300 de anticipo.', organization: 'Hispanic Catholic Social Services', phone: '(205) 555-0100' },
  };

  let lang = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  try { const saved = localStorage.getItem('verifica-lang'); if (saved === 'es' || saved === 'en') lang = saved; } catch (_) { /* private mode */ }
  let last = null;
  let rosterInfo = null;
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else n.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };

  function applyLang() {
    const t = T[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((n) => { const v = t[n.dataset.i18n]; if (typeof v === 'string') n.textContent = v; });
    document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t[n.dataset.i18nPh]; });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.title = lang === 'es' ? 'Verifica — verifique antes de pagar' : 'Verifica — verify before you pay';
    if (rosterInfo) $('#roster-meta').textContent = t.rosterMeta(rosterInfo);
    if (last) render(last);
  }

  function pill(status) {
    const t = T[lang];
    return status === 'listed' ? el('span', { class: 'pill ok' }, t.listed)
      : status === 'possible' ? el('span', { class: 'pill maybe' }, t.possible) : el('span', { class: 'pill no' }, t.notListed);
  }

  function render(r) {
    const t = T[lang];
    const box = $('#result');
    box.replaceChildren();
    box.append(el('div', { class: `verdict ${r.risk}` },
      el('span', { class: 'badge' }, t.risk[r.risk]),
      el('p', { class: 'headline' }, r.headline[lang]),
      el('span', { class: 'score' }, `${t.score}: ${r.score}/100`)));

    if (r.findings.length) {
      box.append(el('section', { class: 'card' }, el('h2', { class: 'section-title' }, t.why),
        el('ul', { class: 'findings' }, r.findings.map((f) => el('li', { class: `finding ${f.severity}` },
          el('p', null, f[lang]),
          el('span', { class: 'src' }, `${t.source}: `, el('a', { href: f.source.url, target: '_blank', rel: 'noopener' }, f.source.title)))))));
    }

    const people = r.checks.people || []; const orgs = r.checks.organizations || [];
    if (people.length || orgs.length) {
      const items = [];
      for (const p of people) {
        const m = (p.matches || [])[0];
        items.push(el('div', { class: 'check' }, el('strong', null, p.name), pill(p.status),
          m ? el('div', { class: 'detail' }, `${m.name}${m.expires ? ` · ${t.expires} ${m.expires}` : ''}${m.pending_renewal ? ` (${t.pending})` : ''}${m.dhs_only ? ` · ${t.dhsOnly}` : ''}`) : null));
      }
      for (const o of orgs) {
        const m = (o.matches || [])[0];
        items.push(el('div', { class: 'check' }, el('strong', null, o.name), pill(o.status),
          m ? el('div', { class: 'detail' }, `${m.office} · ${m.address}, ${m.city}, ${m.state} ${m.zip}${m.phone ? ` · ${t.officialPhone}: ${m.phone}` : ''}`) : null,
          o.phone && o.status === 'listed' ? el('div', { class: 'detail' }, o.phone.on_file_for_name ? t.phoneOk : t.phoneMismatch) : null));
      }
      box.append(el('section', { class: 'card' }, el('h2', { class: 'section-title' }, t.checksTitle), el('div', { class: 'checks' }, items)));
    }

    const c = r.claims; const yn = (b) => (b ? t.yes : t.no);
    const rows = [
      [t.k.names, c.person_names.join(', ')], [t.k.orgs, c.organization_names.join(', ')], [t.k.titles, c.claimed_titles.join(', ')],
      [t.k.gov, yn(c.claims_government_affiliation)], [t.k.phones, c.phones.join(', ')], [t.k.web, [...c.websites, ...c.emails].join(', ')],
      [t.k.pay, [c.payment.amount, ...c.payment.methods].filter(Boolean).join(' · ')], [t.k.promises, c.promises.join(' · ')], [t.k.urgency, yn(c.urgency)],
    ].filter(([, v]) => v);
    box.append(el('details', { class: 'card ai' }, el('summary', null, `${t.aiTitle} — ${t.aiMethod[r.extraction.method] || ''}`),
      el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]))));

    box.append(el('section', { class: 'card' }, el('h2', { class: 'section-title' }, t.next),
      el('ol', { class: 'steps' }, r.next_steps[lang].map((s) => el('li', null, s))),
      el('p', { class: 'privacy' }, r.disclaimer[lang])));
    box.hidden = false;
  }

  async function submit(e) {
    if (e) e.preventDefault();
    const t = T[lang];
    const body = { text: $('#text').value, name: $('#name').value, organization: $('#organization').value, phone: $('#phone').value, lang };
    if (!Object.values(body).some((v) => v && v !== lang && v.trim())) {
      const box = $('#result'); box.replaceChildren(el('p', { class: 'error' }, t.empty)); box.hidden = false; return;
    }
    const go = $('#go'); go.disabled = true; go.firstElementChild.textContent = t.checking;
    // Never leave the previous verdict on screen next to new inputs.
    last = null; $('#result').hidden = true; $('#result').replaceChildren();
    try {
      const res = await fetch('/api/public/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      last = await res.json();
      render(last);
      $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (_) {
      const box = $('#result'); box.replaceChildren(el('p', { class: 'error' }, t.fail)); box.hidden = false;
    } finally {
      go.disabled = false; go.firstElementChild.textContent = T[lang].go;
    }
  }

  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    try { localStorage.setItem('verifica-lang', lang); } catch (_) { /* private mode */ }
    applyLang();
  }));
  document.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => {
    const ex = EXAMPLES[b.dataset.example];
    $('#text').value = ex.text || ''; $('#name').value = ex.name || ''; $('#organization').value = ex.organization || ''; $('#phone').value = ex.phone || '';
    if (ex.organization || ex.phone || ex.name) $('.more').open = true;
    submit();
  }));
  $('#check').addEventListener('submit', submit);
  fetch('/api/public/check/roster').then((r) => r.json()).then((m) => { rosterInfo = m; applyLang(); }).catch(() => {});
  applyLang();
})();
