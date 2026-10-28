// Interfaz: acceso, pestañas, generación de la revisión, gráficas, calculadoras, riesgo, ejemplo e IA.
import { isLogged, login, logout } from './auth.js';
import { CALCS, n, sel, ckdepi2021 } from './calc.js';
import { kfreRows, mayoRows, cvRows } from './risk.js';
import { buildReview, evolution, TYPES, toPlain, toHtml, parseInline } from './review.js';
import { collect, current as currentLabs, sniffPatient, fmtDate } from './lab.js';
import { chartSvg, copyChartPng } from './chart.js';
import { anonymize } from './anon.js';
import { buildRequest, askClaude, MODELS } from './ia.js';
import { enableBoldPaste } from './paste.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = el => (el.value === '' ? undefined : parseFloat(el.value.replace(',', '.')));
const today = () => new Date().toISOString().slice(0, 10);
const TEXTS = ['prev', 'lab', 'evo', 'other', 'meds'];
const labTexts = () => [$('lab').value, $('evo').value, $('other').value];
let last = null; // último resultado de buildReview
let det = null; // lo detectado en vivo en lo pegado (alimenta el autorrelleno)

// ---- Acceso
const show = () => { const ok = isLogged(); $('gate').hidden = ok; $('app').hidden = !ok; };
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (await login($('user').value, $('pass').value)) { $('pass').value = ''; $('loginErr').hidden = true; show(); } else $('loginErr').hidden = false;
});
function wipe() {
  document.querySelectorAll('#tab-rev textarea, #tab-rev input, #tab-risk input, #tab-calc input').forEach(el => { if (el.type === 'checkbox') el.checked = el.id === 'iaAnon' || el.id === 'exAnon'; else { el.value = ''; delete el.dataset.touched; } });
  $('sex').value = ''; $('out').hidden = true; $('msgs').textContent = ''; $('detect').textContent = ''; $('iaOut').hidden = $('iaActs').hidden = true; $('iaMsg').textContent = '';
  $('exDl').disabled = $('exCopy').disabled = true; iaDoc = null; last = null; det = null;
  document.querySelectorAll('.res-host').forEach(h => { h.innerHTML = ''; });
}
$('logout').onclick = () => { logout(); wipe(); $('user').value = ''; show(); };
$('wipe').onclick = wipe;

// ---- Pestañas
function tabs(nav, attr, cb) {
  nav.addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    nav.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
    cb(b.dataset[attr]);
  });
}
tabs($('nav'), 'tab', t => ['rev', 'risk', 'calc'].forEach(k => { $('tab-' + k).hidden = k !== t; }));

// ---- Portapapeles
const flash = m => { $('msgs').textContent = m; setTimeout(() => { if ($('msgs').textContent === m) $('msgs').textContent = ''; }, 2500); };
async function copy(html, plain) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    flash('Copiado');
  } catch {
    try { await navigator.clipboard.writeText(plain); flash('Copiado como texto plano'); } catch { flash('No se pudo copiar: selecciona el texto manualmente'); }
  }
}
const copyText = t => navigator.clipboard.writeText(t).then(() => flash('Copiado'), () => flash('No se pudo copiar'));

// ---- Detección en vivo de lo pegado
TEXTS.forEach(id => enableBoldPaste($(id)));
function detect() {
  const recs = collect(labTexts()), cur = currentLabs(recs, today());
  const sn = { ...sniffPatient($('prev').value), ...sniffPatient(labTexts().join('\n')) };
  const sexv = $('sex').value;
  const p = { age: num($('age')) ?? sn.age, female: sexv ? sexv === 'f' : sn.female, kg: num($('kg')) ?? sn.weight, cm: num($('cm')) ?? sn.height };
  det = { cur: cur.date ? cur : null, patient: p };
  if (cur.date) {
    const cr = cur.vals.get('cr');
    if (!cur.vals.has('fg') && cr && p.age) det.fg = ckdepi2021(cr.num, p.age, !!p.female);
    det.slope = evolution(cur.all, { age: p.age, female: p.female }).slope;
  }
  $('detect').textContent = cur.date ? `Detectado: analítica del ${fmtDate(cur.date)} (${cur.vals.size} analitos reconocidos${cur.others.length ? `, ${cur.others.length} sin clasificar` : ''}).` : '';
  prefillAll();
}
let timer;
[...TEXTS, 'age', 'sex', 'kg', 'cm'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(detect, 350); }));

// ---- Revisión
for (const [k, v] of Object.entries(TYPES)) $('type').append(new Option(v, k));
let view = 'doc';
const textHtml = t => esc(t).replace(/\n/g, '<br>');
function current() {
  if (!last?.cur?.date) return null;
  const r = last;
  if (view === 'ord') return { shown: textHtml(r.ordered), html: textHtml(r.ordered), plain: r.ordered };
  if (view === 'evo') {
    const txt = r.evo.rows.map(x => `${x[0]}: ${x[1]}`).join('\n');
    const charts = r.evo.charts.map((c, i) => `<figure class="chart" data-i="${i}">${chartSvg(c.ser, c)}<button class="btn" type="button" data-copy="${i}">Copiar imagen</button></figure>`).join('');
    return { shown: `${textHtml(txt)}<div class="charts">${charts}</div>`, html: textHtml(txt), plain: txt };
  }
  const doc = { doc: r.doc, med: r.medDoc, plan: r.planDoc }[view];
  return { shown: toHtml(doc, false), html: `<div>${toHtml(doc, true)}</div>`, plain: toPlain(doc, view !== 'plan') };
}
function renderOut() {
  const c = current(); if (!c) return;
  $('outBody').innerHTML = c.shown || '<span class="muted">Sin contenido.</span>';
}
$('outBody').addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const c = last.evo.charts[+b.dataset.copy];
  copyChartPng(chartSvg(c.ser, c)).then(() => flash('Gráfica copiada como imagen'), () => flash('No se pudo copiar la imagen'));
});
tabs($('outTabs'), 'out', v => { view = v; renderOut(); });
$('copyRich').onclick = () => { const c = current(); c && copy(c.html, c.plain); };
$('copyPlain').onclick = () => { const c = current(); c && copyText(c.plain); };

$('go').onclick = () => {
  const sexv = $('sex').value, t = num($('s_t')), w = num($('s_w'));
  const r = buildReview({
    type: $('type').value, prev: $('prev').value, labTexts: labTexts(), medsText: $('meds').value, bullet: $('bullet').value,
    age: num($('age')), female: sexv ? sexv === 'f' : undefined, kg: num($('kg')), cm: num($('cm')), dm: $('dm').checked,
    defaultDate: today(), session: t && w ? { t, w, uf: num($('s_uf')), n: num($('s_n')), acc: $('s_acc').value } : undefined,
  });
  last = r;
  $('msgs').textContent = r.warnings.join(' ');
  if (!r.cur?.date) { $('out').hidden = true; return; }
  const p = r.patient;
  if (p.age && !$('age').value) $('age').value = p.age;
  if (p.female != null && !$('sex').value) $('sex').value = p.female ? 'f' : 'm';
  if (p.kg && !$('kg').value) $('kg').value = p.kg;
  if (p.cm && !$('cm').value) $('cm').value = p.cm;
  $('out').hidden = false;
  renderOut();
  detect();
};

// ---- Guardar ejemplo (descarga local; nada se envía)
const exampleText = () => {
  const a = $('exAnon').checked ? anonymize : x => x;
  const sec = (t, x) => `===== ${t} =====\n${a(x || '')}\n`;
  return [`Ejemplo Nefro Revisión · ${TYPES[$('type').value]}\n`, sec('REVISIÓN PREVIA', $('prev').value), sec('ÚLTIMA ANALÍTICA', $('lab').value), sec('EVOLUCIÓN', $('evo').value), sec('OTRA ANALÍTICA', $('other').value),
    sec('TRATAMIENTO', $('meds').value), sec('SALIDA GENERADA POR LA PÁGINA (texto plano)', last?.doc ? toPlain(last.doc) : ''), '===== LO QUE ESPERABAS / CORRECCIONES (escribe aquí) =====\n'].join('\n');
};
$('exMake').onclick = () => { $('exText').value = exampleText(); $('exText').readOnly = false; $('exDl').disabled = $('exCopy').disabled = false; };
$('exDl').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('exText').value], { type: 'text/plain;charset=utf-8' })); a.download = `ejemplo-nefro-revision-${today()}.txt`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('exCopy').onclick = () => copyText($('exText').value);

// ---- IA opcional (clave sólo en memoria)
MODELS.forEach(([v, t]) => $('iaModel').append(new Option(t, v)));
let iaDoc = null;
$('iaGo').onclick = async () => {
  const say = m => { $('iaMsg').textContent = m; };
  if (!last?.cur?.date) return say('Genera primero la revisión.');
  if (!$('iaOk').checked) return say('Marca la casilla de consentimiento.');
  const key = $('iaKey').value.trim();
  if (!key) return say('Introduce tu clave de la API de Anthropic.');
  const a = $('iaAnon').checked ? anonymize : x => x;
  const request = buildRequest({ model: $('iaModel').value, type: TYPES[$('type').value], prev: a($('prev').value), labs: a(labTexts().filter(Boolean).join('\n\n')), meds: a($('meds').value), draft: a(toPlain(last.doc)) });
  $('iaGo').disabled = true; say('Consultando a la IA…');
  try {
    const text = await askClaude({ key, request });
    iaDoc = text.split(/\r?\n/).map(parseInline);
    $('iaOut').innerHTML = toHtml(iaDoc, false); $('iaOut').hidden = $('iaActs').hidden = false; say('Listo. Revisa y valida el resultado.');
  } catch (e) { say(`No se pudo completar: ${e.message}`); } finally { $('iaGo').disabled = false; }
};
$('iaCopyRich').onclick = () => iaDoc && copy(`<div>${toHtml(iaDoc, true)}</div>`, toPlain(iaDoc));
$('iaCopyPlain').onclick = () => iaDoc && copyText(toPlain(iaDoc));

// ---- Formularios genéricos (calculadoras y riesgo)
function value(el) { return el.tagName === 'SELECT' ? el.value : el.value === '' ? NaN : parseFloat(el.value.replace(',', '.')); }
function form(item, host) {
  const d = document.createElement('details'); d.className = 'calc';
  d.innerHTML = `<summary>${esc(item.title)}</summary><div class="body"><div class="row"></div><p><button class="btn primary" type="button">Calcular</button> <button class="btn" type="button" hidden>Copiar</button></p><div class="res-host" aria-live="polite"></div></div>`;
  const row = d.querySelector('.row'), [calcBtn, copyBtn] = d.querySelectorAll('button'), res = d.querySelector('.res-host');
  for (const i of item.inputs) {
    const l = document.createElement('label');
    l.innerHTML = `<span>${esc(i.label)}${i.unit ? ` <span class="unit">(${esc(i.unit)})</span>` : ''}</span>`;
    let el;
    if (i.options) { el = document.createElement('select'); i.options.forEach(([v, t]) => el.append(new Option(t, v))); el.value = i.def; } else { el = document.createElement('input'); el.type = 'text'; el.inputMode = 'decimal'; el.value = i.def === '' ? '' : String(i.def); }
    el.dataset.id = i.id;
    if (i.from) el.dataset.from = i.from;
    if (['age', 'sex', 'kg', 'cm'].includes(i.id)) el.dataset.pat = i.id;
    el.addEventListener('input', () => { el.dataset.touched = '1'; });
    l.append(el); row.append(l);
  }
  let rows = [];
  calcBtn.onclick = () => {
    const v = {}; d.querySelectorAll('[data-id]').forEach(el => { v[el.dataset.id] = value(el); });
    try { rows = item.run(v); } catch { rows = []; }
    res.innerHTML = rows.length ? `<table class="res">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2] || '')}</td></tr>`).join('')}</table>` : '<p class="muted">Faltan datos.</p>';
    copyBtn.hidden = !rows.length;
  };
  copyBtn.onclick = () => copyText(`${item.title}\n${rows.map(r => `${r[0]}: ${r[1]}${r[2] ? ` (${r[2]})` : ''}`).join('\n')}`);
  host.append(d);
}
// Rellena cada campo con lo detectado en la analítica pegada (clave 'a|b' = primera disponible).
function prefillAll() {
  if (!det) return;
  const p = det.patient || {};
  document.querySelectorAll('[data-from], [data-pat]').forEach(el => {
    if (el.dataset.touched === '1') return;
    let v;
    if (el.dataset.pat) v = { age: p.age, sex: p.female == null ? undefined : p.female ? 'f' : 'm', kg: p.kg, cm: p.cm }[el.dataset.pat];
    else for (const k of el.dataset.from.split('|')) {
      v = k === '_slope' ? det.slope?.perYear : k === 'fg' && det.fg != null ? det.fg : det.cur?.vals.get(k)?.num;
      if (Number.isFinite(v)) break;
    }
    if (Number.isFinite(v) || typeof v === 'string') el.value = typeof v === 'number' ? String(+v.toFixed(2)) : v;
  });
}

// ---- Calculadoras
CALCS.forEach((g, i) => $('calcTabs').insertAdjacentHTML('beforeend', `<button class="tab${i ? '' : ' on'}" data-g="${g.id}">${esc(g.title)}</button>`));
function renderCalc(id) {
  $('calcBox').innerHTML = '';
  CALCS.find(g => g.id === id).items.forEach(it => form(it, $('calcBox')));
  prefillAll();
}
tabs($('calcTabs'), 'g', renderCalc);
renderCalc(CALCS[0].id);

// ---- Riesgo
const YN = [['0', 'No'], ['1', 'Sí']];
const SEXO = sel('sex', 'Sexo', [['m', 'Varón'], ['f', 'Mujer']]);
const RISK = [
  {
    title: 'Riesgo de fallo renal a 2 y 5 años (KFRE)',
    inputs: [n('age', 'Edad', 'años', ''), SEXO, n('egfr', 'FGe', 'mL/min/1,73 m²', '', 'fg'), n('acr', 'uACR', 'mg/g', '', 'u_acr'), n('upcr', 'uPCR (si no hay uACR)', 'mg/g', '', 'u_pcr'),
      n('alb', 'Albúmina (KFRE-8)', 'g/dL', '', 'alb'), n('phos', 'Fósforo (KFRE-8)', 'mg/dL', '', 'p'), n('bicarb', 'Bicarbonato (KFRE-8)', 'mEq/L', '', 'tco2|hco3'), n('ca', 'Calcio corregido (KFRE-8)', 'mg/dL', '', 'caadj|ca'),
      sel('vars', 'Modelo', [['auto', 'Automático'], ['4', '4 variables'], ['8', '8 variables']]), sel('reg', 'Calibración', [['eu', 'No norteamericana (Europa)'], ['na', 'Norteamericana']]), sel('dm', 'Diabetes (para uPCR→uACR)', YN), sel('htn', 'HTA (para uPCR→uACR)', YN)],
    run: v => kfreRows({ age: v.age, female: v.sex === 'f', egfr: v.egfr, acr: v.acr, upcr: v.upcr, alb: v.alb, phos: v.phos, bicarb: v.bicarb, ca: v.ca, vars: v.vars === 'auto' ? undefined : +v.vars, na: v.reg === 'na', dm: +v.dm, htn: +v.htn }),
  },
  {
    title: 'Poliquistosis (ADPKD): clasificación de Mayo y progresión a 5 y 10 años',
    inputs: [n('age', 'Edad', 'años', ''), n('cm', 'Talla', 'cm', ''), n('httkv', 'htTKV (si se conoce)', 'mL/m', ''), n('tkv', 'TKV (si se conoce)', 'mL', ''),
      n('l1', 'Riñón 1: longitud', 'cm', ''), n('w1', 'Riñón 1: anchura', 'cm', ''), n('d1', 'Riñón 1: profundidad', 'cm', ''), n('l2', 'Riñón 2: longitud', 'cm', ''), n('w2', 'Riñón 2: anchura', 'cm', ''), n('d2', 'Riñón 2: profundidad', 'cm', ''),
      n('egfr', 'FGe actual', 'mL/min/1,73 m²', '', 'fg'), n('slope', 'Pendiente anual de FGe (negativa)', 'mL/min/año', '', '_slope')],
    run: v => mayoRows({ age: v.age, height: v.cm, httkv: v.httkv, tkv: v.tkv, l1: v.l1, w1: v.w1, d1: v.d1, l2: v.l2, w2: v.w2, d2: v.d2, egfr: v.egfr, slope: v.slope }),
  },
  {
    title: 'Riesgo cardiovascular (SCORE2) y estatinas',
    inputs: [n('age', 'Edad', 'años', ''), SEXO, n('sbp', 'TAS', 'mmHg', ''), n('tc', 'Colesterol total', 'mg/dL', '', 'chol'), n('hdl', 'HDL', 'mg/dL', '', 'hdl'), n('ldl', 'LDL', 'mg/dL', '', 'ldl'), n('egfr', 'FGe', 'mL/min/1,73 m²', '', 'fg'),
      sel('smoker', 'Fumador', YN), sel('dm', 'Diabetes', YN), sel('ascvd', 'Enfermedad cardiovascular establecida', YN), sel('onStatin', 'Ya toma estatina', YN), sel('dialysis', 'En diálisis', YN), sel('tx', 'Trasplantado', YN),
      sel('region', 'Región de riesgo ESC', [['low', 'Baja (España)'], ['moderate', 'Moderada'], ['high', 'Alta'], ['veryhigh', 'Muy alta']])],
    run: v => cvRows({ age: v.age, female: v.sex === 'f', sbp: v.sbp, tc: v.tc, hdl: v.hdl, ldl: v.ldl, egfr: v.egfr, smoker: +v.smoker, dm: +v.dm, ascvd: +v.ascvd, onStatin: +v.onStatin, dialysis: +v.dialysis, tx: +v.tx, region: v.region }),
  },
];
RISK.forEach(it => form(it, $('riskBox')));

show();
