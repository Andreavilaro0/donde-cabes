/* Dónde cabes: mapa que se va cerrando. Plain JS + MapLibre GL JS 5.24.1 (BSD-3-Clause).
   Idea of side panel, bottom sheet and short camera flights taken from Oasis-Madrid
   (github.com/ariaslombardero/Oasis-Madrid, Apache-2.0); no code copied.
   Nothing typed here leaves the page: no requests, no storage. */
(() => {
  const D = JSON.parse(document.getElementById('match-data').textContent);
  const M = D.municipalities, BY = Object.fromEntries(M.map(m => [m.ine, m]));
  const FID = {};
  D.outlines.features.forEach(f => { if (f.properties.ine) FID[f.properties.ine] = f.id; });
  const $ = id => document.getElementById(id), root = () => $('match');
  const eur = n => n.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' €'; // data values as they come (rent can have one decimal)
  const eurDown = n => Math.floor(n + 1e-9).toLocaleString('es-ES') + ' €'; // cap and what is left: rounded down, as in the rest of the app
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 760px)');
  const hasLayer = k => D.layers.includes(k);

  // What each countable thing is called: [one, many]
  const THING = {
    health_centres: ['centro de salud o consultorio', 'centros de salud o consultorios', 'salud'],
    pharmacies: ['farmacia', 'farmacias', 'farmacia'],
    schools: ['colegio o instituto', 'colegios e institutos', 'colegios'],
    sports: ['instalación deportiva', 'instalaciones deportivas', 'deporte'],
    cultural: ['equipamiento cultural', 'equipamientos culturales', 'cultura'],
    parks: ['parque', 'parques', 'parques'],
    bus_stops: ['parada de bus interurbano', 'paradas de bus interurbano', 'bus interurbano'],
    metro_stations: ['estación de metro', 'estaciones de metro', 'metro'],
    rail_stations: ['estación de Cercanías', 'estaciones de Cercanías', 'Cercanías'],
    light_rail_stops: ['parada de metro ligero', 'paradas de metro ligero', 'metro ligero'],
    vets: ['centro veterinario', 'centros veterinarios', 'veterinario'],
    worship: ['lugar de culto', 'lugares de culto', 'lugares de culto'],
    dog_areas: ['zona canina (para perros)', 'zonas caninas (para perros)', 'zona canina'],
  };
  const TRANSPORT = ['metro_stations', 'rail_stations', 'light_rail_stops', 'bus_stops'];
  const SERVICES = ['health_centres', 'pharmacies', 'sports', 'cultural', 'parks', ...(hasLayer('worship') ? ['worship'] : [])];
  const DOG = ['parks', ...['dog_areas', 'vets'].filter(hasLayer)]; // pet: shown in «why»; the rule uses parks or dog areas

  // ---------- state ----------
  let S, history = [], opener = null, onClose = null;
  const fresh = o => ({
    annual: o.annual, share: o.share, earners: o.earners === 2 ? 2 : 1, capOverride: null,
    people: null, size: 3, kids: null, school: null, room: null, dog: null,
    transport: null, services: null, work: null, workHint: o.ine || '', step: 0, showFinal: false,
  });
  const cap = s => s.capOverride ?? s.annual * s.share * s.earners / 1200;

  // requirement list: [label, key, test(m) -> true | false | null]
  const count = (m, k) => m.around[k] === undefined ? undefined : m.around[k];
  function reqs(s) {
    const r = [['tu tope de alquiler', 'rent', m => m.rent ? m.rent.value * 1200 <= (s.capOverride != null
      ? s.capOverride * 1200 : s.annual * s.share * s.earners) : null]];
    const has = k => m => { const v = count(m, k); return v == null ? (v === undefined ? true : null) : v > 0; };
    if (s.kids) r.push(['peques de 0 a 4', 'kids', m => (m.nurseries > 0 || m.private_early > 0) ? true
      : (m.nurseries == null || m.private_early == null) ? null : false]);
    if (s.school) r.push(['edad escolar', 'schools', has('schools')]);
    // dog: a park or a dog area. dog_areas/vets are never 0 (OpenStreetMap: missing is not none), so this can only be yes or unknown
    if (s.dog) r.push(['mascota: parque o zona canina', 'dog', m => (m.around.parks > 0 || m.around.dog_areas > 0) ? true : null]);
    (s.transport || []).forEach(k => r.push([THING[k][2], k, has(k)]));
    (s.services || []).forEach(k => r.push([THING[k][2], k, has(k)]));
    return r;
  }
  function evaluate(s) {
    const R = reqs(s), out = { in: [], unknown: [], out: [] };
    for (const m of M) {
      let fail = null; const miss = [];
      for (const [label, , t] of R) { const v = t(m); if (v === false) { fail = label; break; } if (v === null) miss.push(label); }
      if (fail) out.out.push(m); else if (miss.length) out.unknown.push([m, miss]); else out.in.push(m);
    }
    const w = s.work && BY[s.work];
    out.in.sort(w ? (a, b) => km(a, w) - km(b, w) : (a, b) => a.rent.value - b.rent.value);
    return out;
  }
  function km(a, b) {
    if (!a.centre || !b.centre) return Infinity;
    const r = Math.PI / 180, [x1, y1] = a.centre, [x2, y2] = b.centre;
    const h = Math.sin((y2 - y1) * r / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin((x2 - x1) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // ---------- steps ----------
  const opt = (k, v, label, on) => `<button type="button" class="mt-opt" data-k="${k}" data-v="${v}" aria-pressed="${on}">${label}</button>`;
  const seg = html => `<div class="mt-seg" role="group"><span class="mt-pill" aria-hidden="true"></span>${html}</div>`;
  const yesNo = k => s => seg(opt(k, 'true', 'Sí', s[k] === true) + opt(k, 'false', 'No', s[k] === false));
  const checks = (k, keys) => s => keys.map(x => `<label class="mt-check"><input type="checkbox" role="switch" data-multi="${k}" value="${x}" ${(s[k] || []).includes(x) ? 'checked' : ''}><span>${THING[x][2][0].toUpperCase() + THING[x][2].slice(1)}</span></label>`).join('')
    + `<button type="button" class="mt-go" data-done="${k}">Listo</button>`;
  const list = a => { const t = a.length ? a.map(k => THING[k][2]).join(', ') : 'nada de esto'; return t[0].toUpperCase() + t.slice(1); };
  const STEPS = [
    { q: '¿Quién va a vivir?', done: s => s.people, sum: s => ({ solo: 'Una persona', pareja: 'Pareja', familia: `Familia de ${s.size}` })[s.people],
      ui: s => seg(opt('people', 'solo', 'Una persona', s.people === 'solo') + opt('people', 'pareja', 'Pareja', s.people === 'pareja')
        + opt('people', 'familia', 'Familia', s.people === 'familia'))
        + (s.people === 'familia' ? `<label class="mt-num">Personas <input type="number" min="3" max="12" value="${s.size}" data-num="size"></label><button type="button" class="mt-go" data-done="people">Listo</button>` : '')
        + '<p class="mt-note">El número de personas no cambia el precio: no hay dato de alquiler por tamaño de vivienda.</p>' },
    { q: '¿Cuántos sueldos entran?', skip: s => s.people === 'solo', done: s => s.earnersSet, sum: s => s.earners === 2 ? 'Dos' : 'Uno',
      ui: s => seg(opt('earners', '1', 'Uno', s.earnersSet && s.earners === 1) + opt('earners', '2', 'Dos', s.earnersSet && s.earners === 2))
        + '<p class="mt-note">Con dos, el tope cuenta los dos sueldos iguales al que pusiste.</p>' },
    { q: 'Tu tope de alquiler al mes', done: s => s.capSet, sum: s => eurDown(cap(s)),
      ui: s => `<label class="mt-num">Euros al mes <input type="number" min="1" step="1" value="${Math.floor(cap(s) + 1e-9)}" data-num="cap"></label><button type="button" class="mt-go" data-done="cap">Seguir</button>
        <p class="mt-note">Sale del sueldo y el porcentaje que pusiste antes. Puedes cambiarlo; no se guarda ni se envía.</p>` },
    { q: '¿Hay peques de 0 a 4 años?', done: s => s.kids != null, sum: s => s.kids ? 'Sí: hace falta escuela infantil' : 'No', ui: yesNo('kids') },
    { q: '¿Hay alguien en edad escolar?', done: s => s.school != null, sum: s => s.school ? 'Sí: hace falta colegio' : 'No', ui: yesNo('school') },
    { q: '¿Te vale una habitación?', done: s => s.room != null, sum: s => s.room ? 'Sí (sin dato de precio)' : 'No', ui: yesNo('room') },
    { q: '¿Viene alguna mascota?', done: s => s.dog != null, sum: s => s.dog ? 'Sí: parque o zona canina' : 'No', ui: yesNo('dog') },
    { q: '¿Qué transporte necesitas cerca?', done: s => s.transport, sum: s => list(s.transport), ui: checks('transport', TRANSPORT) },
    { q: '¿Qué más necesitas en el municipio?', done: s => s.services, sum: s => list(s.services), ui: s => checks('services', SERVICES)(s)
      + (hasLayer('worship') && D.definitions.worship ? `<p class="mt-note">Lugares de culto: ${D.definitions.worship} Esta respuesta no sale de la página ni se guarda.</p>` : '') },
    { q: '¿Dónde trabajas o estudias?', done: s => s.workSet, sum: s => s.work ? BY[s.work].name : 'Sin decir',
      ui: s => `<label class="mt-num mt-sel">Municipio <select data-num="work"><option value="">Prefiero no decirlo</option>${[...M].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(m => `<option value="${m.ine}" ${(s.work || s.workHint) === m.ine ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label><button type="button" class="mt-go" data-done="work">Listo</button>
        <p class="mt-note">Ordena por distancia en línea recta entre centros de municipio. No es tiempo de viaje.</p>` },
  ];
  const nextStep = s => { const i = STEPS.findIndex(st => !(st.skip && st.skip(s)) && !st.done(s)); return i < 0 ? STEPS.length : i; };

  function change(fn) {
    history.push(JSON.stringify(S));
    fn(S);
    S.step = nextStep(S);
    if (S.step >= STEPS.length) S.showFinal = true;
    render(true);
  }

  // ---------- panel ----------
  const warnRoom = '<p class="mt-warn">Estos datos no tienen precio de habitaciones: el mapa usa el alquiler de una vivienda entera. Para habitaciones mira <a href="https://www.idealista.com/alquiler-habitacion/madrid-provincia/" target="_blank" rel="noopener">anuncios de habitaciones en Idealista</a>.</p>';
  const cover = k => M.filter(m => m.around[k] != null).length;
  const warnDog = () => `<p class="mt-warn">Se queda si tiene al menos un parque o una zona canina. Las zonas caninas son para perros. Los parques no garantizan que admitan animales: ${D.definitions.parks_for_dogs || 'no consta.'} Los centros veterinarios valen para cualquier mascota. Hay dato de parques en ${cover('parks')} de ${M.length} municipios${hasLayer('dog_areas') ? `, de zonas caninas en ${cover('dog_areas')} y de centros veterinarios en ${cover('vets')}. Zonas caninas y centros veterinarios salen de listas incompletas: sin dato no significa que no haya, y el número es un mínimo` : '. Zonas caninas y centros veterinarios: aún sin dato'}.</p>`;

  function renderSteps() {
    $('mt-steps').innerHTML = STEPS.map((st, i) => {
      if (st.skip && st.skip(S)) return '';
      const active = i === S.step && !S.showFinal, done = st.done(S);
      return `<li class="mt-step ${active ? 'is-active' : done ? 'is-done' : 'is-todo'}">
        <button type="button" class="mt-q" data-open="${i}" aria-expanded="${active}"><span>${st.q}</span>${done && !active ? `<span class="mt-a">${st.sum(S)}</span>` : ''}</button>
        ${active ? `<div class="mt-body">${st.ui(S)}</div>` : ''}
        ${i === 5 && S.room ? warnRoom : ''}${i === 6 && S.dog ? warnDog() : ''}</li>`;
    }).join('');
  }

  // Segmented control: the pill sits under the chosen option and slides with a critically damped spring.
  function movePill(sg, btn, animate) {
    const pill = sg.querySelector('.mt-pill'); if (!pill) return;
    sg.querySelectorAll('.mt-opt').forEach(o => o.classList.toggle('is-on', o === btn));
    if (!btn) { pill.style.opacity = 0; return; }
    const to = { transform: `translateX(${btn.offsetLeft - 3}px)`, width: btn.offsetWidth + 'px', opacity: 1 };
    if (animate && window.Motion && !reduced.matches && pill.style.opacity === '1') Motion.animate(pill, to, { type: 'spring', bounce: 0, duration: 0.32 });
    else Object.assign(pill.style, to);
  }
  const placePills = () => document.querySelectorAll('#mt-steps .mt-seg').forEach(sg => movePill(sg, sg.querySelector('[aria-pressed=true]'), false));
  root().addEventListener('pointerdown', e => { const b = e.target.closest('.mt-seg .mt-opt'); if (b) movePill(b.parentNode, b, true); }); // feedback on press, commit on release

  // the big number counts to the new value with the same spring; reduced motion: it just changes
  let shown = 0, roll = null;
  function rollCount(n) {
    const b = $('mt-count').querySelector('b'); if (roll) roll.stop();
    if (!window.Motion || reduced.matches || shown === n) { shown = n; b.textContent = n; return; }
    roll = Motion.animate(shown, n, { type: 'spring', bounce: 0, duration: 0.4, onUpdate: v => { shown = Math.round(v); b.textContent = shown; } });
  }

  function render(moved) {
    const r = evaluate(S), wasInside = !!(document.activeElement && document.activeElement.closest('#match')), focusKey = wasInside && keyOf(document.activeElement);
    renderSteps(); placePills();
    $('mt-undo').disabled = !history.length;
    const was = shown;
    $('mt-count').innerHTML = `<b>${was}</b><span>${r.in.length === 1 ? 'municipio encendido' : 'municipios encendidos'} de ${M.length}</span>`
      + (r.unknown.length ? `<small><i class="mt-sw mt-sw-unk"></i>${r.unknown.length} sin saber</small>` : '')
      + (!S.showFinal ? `<button type="button" class="mt-go mt-now" id="mt-now">Ver los mejores ya</button>` : '');
    renderResult(r); rollCount(r.in.length);
    const body = document.querySelector('#mt-steps .is-active .mt-body');
    if (body && moved && window.Motion && !reduced.matches) Motion.animate(body, { opacity: [0, 1], transform: ['translateY(8px)', 'none'] }, { type: 'spring', bounce: 0, duration: 0.35 });
    if (moved && S.showFinal && window.Motion && !reduced.matches) {
      Motion.animate('#mt-result .mt-top > li', { opacity: [0, 1], transform: ['translateY(14px)', 'none'] }, { duration: 0.32, ease: [0.23, 1, 0.32, 1], delay: Motion.stagger(0.09) });
      Motion.animate('#mt-result .mt-top ul li', { opacity: [0, 1] }, { duration: 0.25, delay: Motion.stagger(0.025, { startDelay: 0.15 }) });
    }
    $('mt-unknown').hidden = !r.unknown.length;
    $('mt-unknown').querySelector('summary').textContent = `No lo sabemos: ${r.unknown.length} ${r.unknown.length === 1 ? 'municipio' : 'municipios'}`;
    $('mt-unknown').querySelector('ul').innerHTML = r.unknown.map(([m, miss]) => `<li><b>${m.name}</b>: sin dato de ${miss.join(', ').replace('tu tope de alquiler', 'alquiler')}</li>`).join('');
    paint(r);
    if (moved) frame(r);
    // keep keyboard focus where it was, or move it to the step that is open now
    const again = focusKey && document.querySelector(`#match ${focusKey}`);
    if (again) again.focus();
    else if (S.showFinal && moved) { $('mt-result').focus({ preventScroll: true }); $('mt-result').scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    else if (wasInside) { const b = document.querySelector('#mt-steps .is-active .mt-body button, #mt-steps .is-active .mt-body input, #mt-steps .is-active .mt-body select') || $('mt-now'); if (b) b.focus(); }
    const act = document.querySelector('#mt-steps .is-active');
    if (act && moved) act.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  }
  const keyOf = el => el.dataset.multi ? `[data-multi="${el.dataset.multi}"][value="${el.value}"]` : el.dataset.num ? `[data-num="${el.dataset.num}"]` : el.id ? '#' + el.id : null;

  function why(m, s) {
    const c = cap(s), r = m.rent, w = s.work && BY[s.work], L = [];
    L.push(`Alquiler mediano de ${eur(r.value)} al mes (${r.year}). Con tu tope de ${eurDown(c)} sobran ${eurDown(c - r.value)}.`);
    if (r.p25 != null && r.p75 != null) L.push(`La mitad central de los alquileres (P25 a P75) va de ${eur(r.p25)} a ${eur(r.p75)}.`);
    if (r.type === 'detached') L.push('Solo hay dato de casas unifamiliares, no de pisos.');
    if (w) L.push(w === m ? 'Es donde trabajas o estudias.' : `${km(m, w).toFixed(0)} km en línea recta hasta ${w.name}. No es tiempo de viaje.`);
    if (s.kids) L.push(`${m.nurseries} ${m.nurseries === 1 ? 'escuela infantil' : 'escuelas infantiles'} y ${m.private_early} ${m.private_early === 1 ? 'centro privado' : 'centros privados'} de infantil.`);
    const keys = [...new Set([...(s.school ? ['schools'] : []), ...(s.dog ? DOG : []), ...(s.transport || []), ...(s.services || [])])];
    keys.forEach(k => {
      const n = m.around[k], names = (m.names[k] || []).map(nice);
      if (n == null) return;
      L.push(`${k === 'dog_areas' || k === 'vets' ? 'Al menos ' : ''}${n} ${n === 1 ? THING[k][0] : THING[k][1]}${names.length ? ': ' + names.join(', ') + (n > names.length ? ' y más' : '') : ''}.`);
    });
    if (s.dog && m.around.parks > 0) L.push('No consta si esos parques admiten animales.');
    const unk = Object.keys(m.around).filter(k => m.around[k] == null && THING[k]).map(k => THING[k][2]);
    if (unk.length) L.push(`Sin dato aquí: ${unk.join(', ')}.`);
    return L;
  }
  const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a']);
  const ROMAN = /^(i{1,3}|iv|vi{0,3}|ix|xi{0,3})$/;
  const nice = t => t === t.toUpperCase() ? t.toLowerCase().replace(/\S+/g, (w, i) => ROMAN.test(w) ? w.toUpperCase() : i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)) : t;

  function renderResult(r) {
    const box = $('mt-result');
    if (!S.showFinal) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    if (!r.in.length) {
      const R = reqs(S); let best = null;
      R.filter(x => x[1] !== 'rent').forEach(([label, key]) => {
        const t = JSON.parse(JSON.stringify(S)); dropReq(t, key);
        const n = evaluate(t).in.length; if (!best || n > best.n) best = { label, key, n };
      });
      const low = M.filter(m => m.rent).reduce((a, m) => m.rent.value < a.rent.value ? m : a);
      box.innerHTML = `<h3>Con todo lo marcado no queda ningún municipio.</h3>${best && best.n ? `<p>Lo que más descarta es <b>${best.label}</b>. Sin eso quedarían ${best.n}.</p><button type="button" class="mt-go" data-drop="${best.key}">Quitar ${best.label}</button>`
        : `<p>Lo que descarta es el tope: el alquiler mediano más bajo con dato es ${low.rent.value.toLocaleString('es-ES')} €, en ${low.name}. Tu tope es ${eurDown(cap(S))}.</p>`}`;
      return;
    }
    const top = r.in.slice(0, 3);
    box.innerHTML = `<h3>${top.length === 1 ? 'Tu municipio' : `Tus ${top.length} mejores municipios`}</h3>
      <p class="mt-note">${S.work ? 'Ordenados por distancia en línea recta a ' + BY[S.work].name : 'Ordenados por alquiler, de menos a más'}. Los recuentos se enseñan pero no ordenan: dependen del tamaño del municipio. Madrid capital cuenta entera, sin barrios.</p>
      <ol class="mt-top">${top.map((m, i) => `<li><button type="button" class="mt-pick" data-fly="${m.ine}"><i>${i + 1}</i>${m.name}</button><ul>${why(m, S).map(t => `<li>${t}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  }
  function dropReq(s, key) {
    if (key === 'kids') s.kids = false;
    else if (key === 'schools') s.school = false;
    else if (key === 'dog') s.dog = false;
    if (s.transport) s.transport = s.transport.filter(k => k !== key);
    if (s.services) s.services = s.services.filter(k => k !== key);
  }

  // ---------- map ----------
  let ready = false, map, tween = {}, fade = null, labels = [], stats = null;
  const IGN = 'https://www.ign.es/wmts/ign-base?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=IGNBaseTodo&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const REGION = [[-4.58, 39.88], [-3.05, 41.17]];
  function hatch() {
    const n = 12, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); x.fillStyle = '#0f1c28'; x.fillRect(0, 0, n, n);
    x.strokeStyle = '#8796a3'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, n); x.lineTo(n, 0); x.moveTo(-n / 2, n / 2); x.lineTo(n / 2, -n / 2); x.moveTo(n / 2, n * 1.5); x.lineTo(n * 1.5, n / 2); x.stroke();
    return x.getImageData(0, 0, n, n);
  }
  function makeMap() {
    const st = k => ['coalesce', ['feature-state', k], 0];
    const sources = { mun: { type: 'geojson', data: D.outlines } };
    const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#08121c' } }];
    const online = navigator.onLine;
    if (online) {
      sources.ign = { type: 'raster', tiles: [IGN], tileSize: 256, minzoom: 6, maxzoom: 18, attribution: 'Mapa base: IGN, CC BY 4.0 scne.es' };
      layers.push({ id: 'ign', type: 'raster', source: 'ign', minzoom: 9.5,
        paint: { 'raster-saturation': -1, 'raster-brightness-max': 0.38, 'raster-contrast': 0.1, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 10.5, 1] } });
    }
    const lit = ['+', st('lit'), st('top')];
    layers.push(
      { id: 'fill', type: 'fill', source: 'mun', paint: {
        'fill-color': ['interpolate', ['linear'], lit, 0, '#0f1c28', 1, '#c9921a', 2, '#ffcf4a'],
        'fill-opacity': online ? ['interpolate', ['linear'], ['zoom'], 9.5, 1, 10.5, ['interpolate', ['linear'], lit, 0, 0.72, 1, 0.42, 2, 0.55]] : 1 } },
      { id: 'unk', type: 'fill', source: 'mun', paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, st('unk'), 10.5, ['*', 0.6, st('unk')]] } },
      { id: 'line', type: 'line', source: 'mun', paint: { 'line-color': ['interpolate', ['linear'], lit, 0, '#1f3346', 1, '#08121c', 2, '#08121c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 1.6] } },
      { id: 'top', type: 'line', source: 'mun', paint: { 'line-color': '#fff6d6', 'line-width': 2.5, 'line-opacity': st('top') } });
    map = new maplibregl.Map({ container: 'mt-map', style: { version: 8, sources, layers }, bounds: REGION,
      fitBoundsOptions: { padding: pad() }, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxZoom: 15, minZoom: 7,
      attributionControl: { compact: false, customAttribution: online ? undefined : 'Mapa base: IGN, CC BY 4.0 scne.es (sin conexión: sin calles)' } });
    map.touchZoomRotate.disableRotation();
    map.addImage('hatch', hatch());
    map.on('error', e => { // offline or IGN down: drop the street layer once, keep the map quiet
      if (e.sourceId === 'ign') { if (map.getLayer('ign')) { map.removeLayer('ign'); map.removeSource('ign'); map.setPaintProperty('fill', 'fill-opacity', 1); } }
      else console.warn('mapa:', e.error && e.error.message);
    });
    map.on('movestart', e => { if (e.originalEvent && camAnim) { camAnim.stop(); camBusy = false; } }); // a drag or wheel takes over the camera
    map.on('click', 'fill', e => { const ine = e.features[0].properties.ine; if (ine) flyTo(ine); });
    map.on('load', () => { ready = true; render(true); });
  }
  const pad = () => {
    const p = $('mt-panel').getBoundingClientRect();
    return narrow.matches ? { top: 110, left: 40, right: 40, bottom: innerHeight - p.top + 40 } : { top: 120, left: p.right + 160, right: innerWidth * .12, bottom: 80 };
  };
  function paint(r) {
    if (!ready) return;
    const target = {}, topSet = S.showFinal ? new Set(r.in.slice(0, 3).map(m => m.ine)) : new Set();
    // at the end the three best stay bright and the rest of the lit ones step back
    r.in.forEach(m => target[m.ine] = { lit: topSet.has(m.ine) || !S.showFinal ? 1 : 0.4, top: topSet.has(m.ine) ? 1 : 0, unk: 0 });
    r.unknown.forEach(([m]) => target[m.ine] = { lit: 0, top: 0, unk: 1 });
    M.forEach(m => { target[m.ine] ||= { lit: 0, top: 0, unk: 0 }; });
    const from = {};
    for (const ine in target) from[ine] = tween[ine] || { lit: 0, top: 0, unk: 0 };
    if (fade) fade.stop();
    const apply = e => {
      for (const ine in target) {
        if (FID[ine] === undefined) continue;
        const a = from[ine], b = target[ine], v = { lit: a.lit + (b.lit - a.lit) * e, top: a.top + (b.top - a.top) * e, unk: a.unk + (b.unk - a.unk) * e };
        if (a.lit !== b.lit || a.top !== b.top || a.unk !== b.unk || e === 1) map.setFeatureState({ source: 'mun', id: FID[ine] }, v);
        tween[ine] = v;
      }
    };
    // lights go out and on with one Motion tween over all municipalities; reduced motion: at once
    if (reduced.matches || !window.Motion) apply(1);
    else fade = Motion.animate(0, 1, { type: 'spring', bounce: 0, duration: 0.35, onUpdate: apply });
    // names on the map only when few are left: labels are HTML, no remote glyphs
    labels.forEach(l => l.remove()); labels = [];
    const named = S.showFinal ? r.in.slice(0, 3) : r.in.length <= 8 ? r.in : [];
    const w = S.work && BY[S.work];
    if (w && w.centre && S.workSet) {
      const el = document.createElement('div'); el.className = 'mt-label mt-work'; el.textContent = (topSet.has(w.ine) ? '' : 'Trabajas o estudias en ') + w.name;
      if (!topSet.has(w.ine)) labels.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(w.centre).addTo(map));
    }
    named.forEach((m, i) => {
      if (!m.centre) return;
      const el = document.createElement('div'); el.className = 'mt-label' + (topSet.has(m.ine) ? ' is-top' : '');
      el.innerHTML = topSet.has(m.ine) ? `<i>${i + 1}</i>${m.name}` : m.name;
      labels.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(m.centre).addTo(map));
    });
  }
  function bboxOf(list) {
    const b = [180, 90, -180, -90];
    list.forEach(m => { if (!m.bbox) return; b[0] = Math.min(b[0], m.bbox[0]); b[1] = Math.min(b[1], m.bbox[1]); b[2] = Math.max(b[2], m.bbox[2]); b[3] = Math.max(b[3], m.bbox[3]); });
    return b[0] > b[2] ? REGION : [[b[0], b[1]], [b[2], b[3]]];
  }
  function frame(r) {
    if (!ready) return;
    const fin = S.showFinal && r.in.length;
    const list = fin ? [...r.in.slice(0, 3), ...(S.work ? [BY[S.work]] : [])] : r.in;
    camTo(list.length ? bboxOf(list) : REGION, fin ? 10.6 : 11, fin ? 28 : 0);
  }
  function flyTo(ine) { const m = BY[ine]; if (m && m.bbox) camTo(bboxOf([m]), 13, 28); }
  // Camera: one spring on a plain object {lng, lat, zoom, pitch}, applied with jumpTo each frame.
  // A new answer retargets the same object, so Motion keeps the velocity: no jump, no restart.
  let cam = null, camAnim = null, camBusy = false;
  function camTo(bounds, maxZoom, pitch) {
    const c = map.cameraForBounds(bounds, { padding: pad(), maxZoom });
    if (!c) return;
    const to = { lng: c.center.lng, lat: c.center.lat, zoom: c.zoom, pitch };
    if (reduced.matches || !window.Motion) { map.jumpTo({ center: [to.lng, to.lat], zoom: to.zoom, pitch: reduced.matches ? 0 : pitch }); return; }
    if (!camBusy || !cam) { const n = map.getCenter(); cam = { lng: n.lng, lat: n.lat, zoom: map.getZoom(), pitch: map.getPitch() }; }
    camBusy = true;
    const t = [], run = { last: performance.now(), on: true };
    const tick = now => { if (!run.on) return; t.push(now - run.last); run.last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const mine = camAnim = Motion.animate(cam, to, { type: 'spring', visualDuration: 0.85, bounce: 0,
      onUpdate: () => map.jumpTo({ center: [cam.lng, cam.lat], zoom: cam.zoom, pitch: cam.pitch }) });
    mine.finished.then(() => {
      run.on = false; const f = t.slice(1);
      window.__mtFrames = { frames: f.length, avgMs: +(f.reduce((a, b) => a + b, 0) / (f.length || 1)).toFixed(1), worstMs: +Math.max(0, ...f).toFixed(1), over33: f.filter(x => x > 33.4).length };
      if (camAnim === mine) camBusy = false;
    }, () => { run.on = false; });
  }

  // ---------- events ----------
  root().addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (b.classList.contains('mt-grip')) return;
    if (b.id === 'mt-back') return close();
    if (b.id === 'mt-undo') { if (history.length) { S = JSON.parse(history.pop()); render(true); } return; }
    if (b.id === 'mt-now') return change(s => { s.showFinal = true; s.step = STEPS.length; });
    if (d.fly) return flyTo(d.fly);
    if (d.drop) return change(s => dropReq(s, d.drop));
    if (d.open != null) { const i = +d.open; if (i !== S.step || S.showFinal) { history.push(JSON.stringify(S)); S.step = i; S.showFinal = false; render(false); } return; }
    if (d.k && b.closest('.mt-seg') && !reduced.matches && !d.go) {
      if (d.wait) return;
      movePill(b.parentNode, b, true); d.wait = '1';
      return setTimeout(() => { d.go = '1'; b.click(); }, 150); // let the pill land, then the step folds
    }
    if (d.k) return change(s => {
      const v = d.v === 'true' ? true : d.v === 'false' ? false : d.v;
      if (d.k === 'people') { s.people = v; if (v === 'solo') { s.earners = 1; s.earnersSet = true; } }
      else if (d.k === 'earners') { s.earners = +v; s.earnersSet = true; s.capOverride = null; }
      else s[d.k] = v;
      if (d.k === 'people' && v === 'familia') s.people = null, s.pendingFamily = true; // wait for the size and «Listo»
    });
    if (d.done) return change(s => {
      const body = b.closest('.mt-body');
      if (d.done === 'people') { s.people = 'familia'; s.pendingFamily = false; s.size = Math.max(3, +body.querySelector('[data-num="size"]').value || 3); }
      else if (d.done === 'cap') { const v = +body.querySelector('[data-num="cap"]').value; if (v > 0) { if (Math.floor(v) !== Math.floor(cap(s) + 1e-9)) s.capOverride = v; s.capSet = true; } }
      else if (d.done === 'work') { s.work = body.querySelector('[data-num="work"]').value || null; s.workSet = true; }
      else s[d.done] = [...body.querySelectorAll(`[data-multi="${d.done}"]:checked`)].map(i => i.value);
    });
  });
  root().addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input[type=number]')) { e.preventDefault(); const go = e.target.closest('.mt-body').querySelector('.mt-go'); if (go) go.click(); }
  });
  narrow.addEventListener('change', () => { panel.style.transform = ''; sheetY = liveY = 0; if (map) frame(evaluate(S)); });

  // ---------- bottom sheet on phones: drag the grip, flick or tap; Enter/Space toggles ----------
  const panel = $('mt-panel'), grip = root().querySelector('.mt-grip');
  // Apple «Designing Fluid Interfaces»: start from the live value, track 1:1, rubber-band past the top,
  // project the flick (d = 0.998) to pick the snap point, hand the finger's velocity to the spring.
  let sheetY = 0, liveY = 0, drag = null, dragged = false, sheetAnim = null;
  const lowY = () => Math.max(0, panel.offsetHeight - 132);
  const putY = y => { liveY = y; panel.style.transform = `translateY(${y}px)`; };
  const rubber = (o, dim) => (o * dim * 0.55) / (dim + 0.55 * Math.abs(o));
  function setSheet(y, velocity = 0) {
    sheetY = y; grip.setAttribute('aria-expanded', String(y === 0));
    if (sheetAnim) sheetAnim.stop();
    if (window.Motion && !reduced.matches) sheetAnim = Motion.animate(liveY, y, { type: 'spring', velocity, bounce: 0, duration: 0.4, onUpdate: putY });
    else putY(y);
    if (map) setTimeout(() => frame(evaluate(S)), reduced.matches ? 0 : 220);
  }
  grip.addEventListener('pointerdown', e => {
    if (!narrow.matches || drag) return; // one pointer at a time
    if (sheetAnim) sheetAnim.stop(); // grab it mid-flight
    grip.setPointerCapture(e.pointerId); drag = { id: e.pointerId, y0: e.clientY, base: liveY, hist: [[performance.now(), e.clientY]] }; dragged = false;
  });
  grip.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0; if (Math.abs(dy) > 6) dragged = true;
    let y = drag.base + dy, low = lowY();
    if (y < 0) y = -rubber(-y, innerHeight); else if (y > low) y = low + rubber(y - low, innerHeight);
    putY(y); drag.hist.push([performance.now(), e.clientY]); if (drag.hist.length > 5) drag.hist.shift();
  });
  grip.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const h = drag.hist, a = h[0], z = h[h.length - 1], v = z[0] > a[0] ? (z[1] - a[1]) / (z[0] - a[0]) * 1000 : 0; // px/s
    drag = null;
    if (!dragged) return;
    const projected = liveY + (v / 1000) * 0.998 / (1 - 0.998);
    setSheet(projected > lowY() / 2 ? lowY() : 0, v);
  });
  grip.addEventListener('click', () => { if (dragged) { dragged = false; return; } setSheet(sheetY === 0 ? lowY() : 0); });

  let viaKeys = false;
  addEventListener('keydown', () => { viaKeys = true; }, true);
  addEventListener('pointerdown', () => { viaKeys = false; }, true);
  function open(o) {
    opener = document.activeElement; onClose = o.onClose || null; history = [];
    S = fresh(o); S.step = nextStep(S);
    root().hidden = false; document.documentElement.classList.add('mt-open');
    if (!map) makeMap(); else { map.resize(); render(true); }
    renderSteps(); render(false);
    enter();
    // keyboard users land on the first answer; pointer users get no ring (focus goes to the title)
    const f = viaKeys ? root().querySelector('.mt-body button') : $('mt-title'); if (f) f.focus({ preventScroll: true });
  }
  // Entrance (encargo ios-cambio1): list from its side (the sheet from below), blocks staggered, counter from the right.
  // Critically damped springs, transform and opacity only, settled under 900 ms; clicks work from the first frame.
  function enter() {
    if (!window.Motion) return;
    const A = Motion.animate, sp = { type: 'spring', bounce: 0, duration: 0.4 };
    const items = [...panel.querySelectorAll(':scope > header, :scope > h2, :scope > .mt-rule, #mt-steps > li')];
    if (reduced.matches) { A([panel, $('mt-count')], { opacity: [0, 1] }, { duration: 0.2 }); return; }
    if (narrow.matches) { if (sheetAnim) sheetAnim.stop(); sheetAnim = A(panel.offsetHeight, 0, { ...sp, onUpdate: putY }); }
    else A(panel, { transform: ['translateX(-48px)', 'none'], opacity: [0, 1] }, sp);
    A(items, { transform: ['translateX(-28px)', 'none'], opacity: [0, 1] }, { ...sp, delay: Motion.stagger(0.03) });
    A($('mt-count'), { transform: ['translateX(40px)', 'none'], opacity: [0, 1] }, { ...sp, delay: 0.08 });
  }
  // Exit by the same side it came in: list to the left (sheet down), counter to the right; then hide.
  function close() {
    if (!window.Motion || reduced.matches) return hide();
    const A = Motion.animate, sp = { type: 'spring', bounce: 0, duration: 0.3 };
    A($('mt-count'), { transform: 'translateX(40px)', opacity: 0 }, sp);
    const out = narrow.matches ? A(liveY, panel.offsetHeight, { ...sp, onUpdate: putY }) : A(panel, { transform: 'translateX(-48px)', opacity: 0 }, sp);
    out.finished.then(hide, hide);
  }
  function hide() {
    if (root().hidden) return;
    panel.style.transform = panel.style.opacity = $('mt-count').style.transform = $('mt-count').style.opacity = ''; sheetY = liveY = 0;
    root().hidden = true; document.documentElement.classList.remove('mt-open');
    document.dispatchEvent(new CustomEvent('dondecabes:matchclose'));
    if (onClose) onClose();
    if (opener && opener.focus) opener.focus();
  }
  // Family: show size field without leaving the step
  const oldUi = STEPS[0].ui; STEPS[0].ui = s => oldUi(s.pendingFamily ? { ...s, people: 'familia' } : s);

  $('mt-credits').innerHTML = `<p>Mapa: MapLibre GL JS 5.24.1, licencia BSD-3-Clause. Calles al acercarte: IGN, CC BY 4.0 scne.es (necesitan conexión). Movimiento: Motion 14.14.0, licencia MIT. Idea de panel lateral y vuelos de cámara: Oasis-Madrid, Apache-2.0 (no se usa su código). Letra: Avenir Next del sistema.</p>`
    + `<p>Alquiler: ${D.definitions.rent} ${D.sources['alquiler-mivau'].note || ''}</p>` + [...new Map(Object.values(D.sources).filter(x => x.credit).map(x => [x.credit, x.link])).entries()].map(([c, l]) => `<p>${c}${l ? ` <a href="${l}" target="_blank" rel="noopener">${l}</a>` : ''}</p>`).join('');

  window.dondeCabes = Object.assign(window.dondeCabes || {}, { openMatch: open, closeMatch: close });
})();
