// Parseo, ordenación y evolución de analíticas pegadas desde el HCE/LIS (HULP/HCIS).
// Admite dos formatos: línea por fecha ("dd/mm/aaaa hh:mm:ss: Srm/Pla-Creatinina *2.59 mg/dL (0.7 - 1.3), ...")
// y rejilla de evolución (nombre / valor / fecha en líneas o separados por tabulador).

export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const isoDate = (d, m, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const fmtDate = iso => (iso ? iso.split('-').reverse().join('/') : '');
const DAY = 864e5;

const WORDS = /^(.*?)\s+(Negativo|Positivo|Normal|No procede|No calculable|Trazas|Presente|Ausente|Escasa?|Abundante)\b\s*(.*)$/i;
const NUM = /^(.*?)\s+(\*?\s?[<>]?\d+(?:[.,]\d+)?\+?)(?:\s+(.*))?$/;

// "Srm/Pla-Potasio *5.5 mmol/L (3.5 - 5.1)" -> {name, value, valueStr, flag, unit, ref}
export function parseEntry(s) {
  const bold = /\*\*/.test(s); // negrita del HCE (marcada con ** al pegar) = valor destacado
  s = s.replace(/\*\*/g, '').trim().replace(/\s+/g, ' ');
  let ref = null;
  const m = s.match(/\s\(([\d.,<>\s-]*)\)$/);
  if (m && /\d/.test(m[1])) { ref = m[1].trim(); s = s.slice(0, m.index); }
  let r = s.match(NUM);
  if (r) {
    const tok = r[2].replace(/\s/g, '');
    const flag = tok.startsWith('*');
    const clean = tok.replace('*', '');
    const num = parseFloat(clean.replace(',', '.').replace(/[<>+]/g, ''));
    const isNum = !clean.endsWith('+') && !/^[<>]/.test(clean);
    return { name: r[1].trim(), value: isNum ? num : clean, num: clean.endsWith('+') ? NaN : num, valueStr: clean, flag: flag || bold, bold, unit: (r[3] || '').trim(), ref };
  }
  r = s.match(WORDS);
  if (r && !/^No (procede|calculable)$/i.test(r[2])) return { name: r[1].trim(), value: r[2], num: NaN, valueStr: r[2], flag: bold, bold, unit: (r[3] || '').trim(), ref };
  return null; // p. ej. "Pendiente mg/dL (provisional)"
}

const LINE_DATE = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}:\d{2}(?::\d{2})?))?\s*:\s+(.+)$/;
const ONLY_DATE = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/;
const ENTRY_SPLIT = /,\s+(?=[A-ZÁÉÍÓÚÑ])/;
const PREFIX = /(?:^|,\s)(?:San|Srm|Pla|Uri)[A-Za-z/()0-9]*-/g;

// Devuelve registros [{date:'aaaa-mm-dd'|null, name, value, num, valueStr, flag, unit, ref}]
export function parseLab(text) {
  const recs = [];
  const push = (e, d, y, mo, tm) => { const r = parseEntry(e); if (r) recs.push({ ...r, date: y ? isoDate(d, mo, y) : null, time: tm || '' }); };
  let pend = [];
  const AROUND_DATE = /^\*\*(\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?\s*:?)\*\*/;
  for (const raw of text.replace(/\\([*_\\-])/g, '$1').split(/\r?\n/)) {
    const line = raw.trim().replace(AROUND_DATE, '$1');
    if (!line) continue;
    const a = line.match(LINE_DATE);
    if (a) { a[5].split(ENTRY_SPLIT).forEach(e => push(e, a[1], a[3], a[2], a[4])); pend = []; continue; }
    if ((line.match(PREFIX) || []).length >= 3) { line.split(ENTRY_SPLIT).forEach(e => push(e)); pend = []; continue; }
    if (line.includes('\t')) {
      const f = line.split('\t').map(x => x.trim());
      const di = f.findIndex(x => /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(x));
      if (di >= 2) { const d = f[di].match(ONLY_DATE) || f[di].match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); push(`${f[0]} ${f[1]}`, d[1], d[3], d[2], d[4]); pend = []; continue; }
    }
    const d = line.replace(/\*\*/g, '').match(ONLY_DATE);
    if (d) { if (pend.length >= 2) push(`${pend[pend.length - 2]} ${pend[pend.length - 1]}`, d[1], d[3], d[2], d[4]); pend = []; continue; }
    if (/^(descripci[oó]n|valor|fecha|hora)$/i.test(line.replace(/\*\*/g, '')) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(line)) continue;
    pend.push(line);
    if (pend.length > 3) pend.shift();
  }
  return recs;
}

// Une varias celdas de pegado (analítica, evolución, otra) en un único conjunto de registros.
export const collect = texts => texts.flatMap(t => parseLab(t || ''));

// ---- Catálogo de analitos: [clave, etiqueta, regex sobre nombre normalizado, grupo, unidad a mostrar]
const B = '(?:srm\\/pla|srm|pla)';
const T = (key, label, re, group, unit = '') => ({ key, label, re: new RegExp(re), group, unit });
export const GROUPS = ['Hemograma', 'Función renal', 'Iones', 'Gasometría', 'Metabolismo Ca/P', 'Hierro y anemia', 'Nutrición/inflamación', 'Lípidos', 'Hepático', 'Glucemia y urato', 'Hormonas y otros', 'Orina'];
export const ANALYTES = [
  T('hb', 'Hb', '^san-hemoglobina$', 'Hemograma'), T('hto', 'Hto', '^san-hematocrito$', 'Hemograma'),
  T('rbc', 'Hematíes', '^san-hematies$', 'Hemograma'), T('vcm', 'VCM', '^san-volumen corpuscular medio', 'Hemograma'),
  T('hcm', 'HCM', '^san-hemoglobina corpuscular media', 'Hemograma'), T('chcm', 'CHCM', '^san-concentracion de hb corpuscular media', 'Hemograma'),
  T('rdw', 'RDW', '^san-indice de distribucion eritrocitaria', 'Hemograma'), T('plt', 'Plaquetas', '^san-plaquetas$', 'Hemograma'),
  T('wbc', 'Leucocitos', '^san-leucocitos$', 'Hemograma'), T('neu', 'Neutrófilos', '^san-neutrofilos$', 'Hemograma'),
  T('lin', 'Linfocitos', '^san-linfocitos$', 'Hemograma'), T('mon', 'Monocitos', '^san-monocitos$', 'Hemograma'),
  T('eos', 'Eosinófilos', '^san-eosinofilos$', 'Hemograma'), T('bas', 'Basófilos', '^san-basofilos$', 'Hemograma'), T('retic', 'Reticulocitos %', '^san-reticulocitos \\(%\\)', 'Hemograma'), T('retic_abs', 'Reticulocitos', '^san-reticulocitos$', 'Hemograma'),
  T('neu_p', 'Neutrófilos %', '^san-neutrofilos \\(%\\)', 'Hemograma'), T('lin_p', 'Linfocitos %', '^san-linfocitos \\(%\\)', 'Hemograma'),
  T('mon_p', 'Monocitos %', '^san-monocitos \\(%\\)', 'Hemograma'), T('eos_p', 'Eosinófilos %', '^san-eosinofilos \\(%\\)', 'Hemograma'), T('bas_p', 'Basófilos %', '^san-basofilos \\(%\\)', 'Hemograma'),
  T('vpm', 'VPM', '^san-volumen plaquetar medio', 'Hemograma'),
  T('cr', 'Cr', `^${B}-creatinina$`, 'Función renal'), T('fg', 'FGe', '^filtrado glomerular(?!.*cistatina)', 'Función renal', 'mL/min'),
  T('fgcys', 'FGe cistatina', '^filtrado glomerular.*cistatina', 'Función renal', 'mL/min'), T('cysc', 'Cistatina C', 'cistatina c', 'Función renal'),
  T('urea', 'Urea', `^${B}-urea$`, 'Función renal'), T('urea_post', 'Urea post', '^srm-urea ktv2', 'Función renal'),
  T('na', 'Na', `^${B}-sodio$`, 'Iones'), T('k', 'K', `^${B}-potasio$`, 'Iones'), T('cl', 'Cl', `^${B}-cloro$`, 'Iones'), T('mg', 'Mg', `^${B}-magnesio$`, 'Iones'),
  T('ph', 'pH', '^san-ph$', 'Gasometría'), T('pco2', 'pCO2', '^san-pco2$', 'Gasometría'), T('po2', 'pO2', '^san-po2$', 'Gasometría'),
  T('tco2', 'CO2 total', '^san-concentracion total de co2', 'Gasometría'), T('hco3', 'HCO3', '^san-bicarbonato$', 'Gasometría'), T('hco3s', 'HCO3 est', '^san-bicarbonato estandar', 'Gasometría'),
  T('be', 'EB', '^san-exceso de bases$', 'Gasometría'), T('lac', 'Lactato', '^san-lactato$', 'Gasometría'),
  T('ag', 'Anión gap', '^san-anion gap', 'Gasometría'), T('caion', 'Ca2+', '^san-calcio ionizado$', 'Metabolismo Ca/P'),
  T('ca', 'Ca', `^${B}-calcio total$`, 'Metabolismo Ca/P'), T('caadj', 'Ca ajustado', '^calcio ajustado por albumina', 'Metabolismo Ca/P'), T('p', 'P', `^${B}-fosfato$`, 'Metabolismo Ca/P'),
  T('pth', 'PTH', 'paratohormona|\\(pth\\)', 'Metabolismo Ca/P'), T('vitd', '25-OH-D', 'calcidiol', 'Metabolismo Ca/P'),
  T('fa', 'FA', 'fosfatasa alcalina', 'Metabolismo Ca/P'),
  T('fe', 'Fe', '^srm-hierro$', 'Hierro y anemia'), T('ferr', 'Ferritina', '-ferritina$', 'Hierro y anemia'),
  T('tsat', 'IST', 'indice de saturacion de la transferrina', 'Hierro y anemia', '%'), T('trf', 'Transferrina', '^srm-transferrina$', 'Hierro y anemia'),
  T('tibc', 'CTFH', 'capacidad total de transporte del hierro', 'Hierro y anemia'), T('b12', 'B12', 'vitamina b12', 'Hierro y anemia'),
  T('fol', 'Fólico', '^srm-folato', 'Hierro y anemia'),
  T('alb', 'Albúmina', `^${B}-albumina$`, 'Nutrición/inflamación'), T('pt', 'PT', 'proteinas totales', 'Nutrición/inflamación'),
  T('pcr', 'PCR', 'proteina c reactiva', 'Nutrición/inflamación'),
  T('chol', 'Col total', 'colesterol total', 'Lípidos'), T('ldl', 'LDL', '^colesterol ldl', 'Lípidos'), T('hdl', 'HDL', 'colesterol hdl', 'Lípidos'),
  T('nohdl', 'no-HDL', '^colesterol no hdl', 'Lípidos'), T('tg', 'TG', 'triglicerid', 'Lípidos'),
  T('ast', 'AST', '\\(ast\\)', 'Hepático'), T('alt', 'ALT', '\\(alt\\)', 'Hepático'), T('ggt', 'GGT', '\\(ggt\\)', 'Hepático'),
  T('bil', 'Bilirrubina', `^${B}-bilirrubina total`, 'Hepático'),
  T('glu', 'Glucosa', `^${B}-glucosa$`, 'Glucemia y urato'), T('hba1c', 'HbA1c', '^san-hba1c \\(ngsp\\)', 'Glucemia y urato', '%'),
  T('urato', 'Urato', `^${B}-urato$`, 'Glucemia y urato'),
  T('tsh', 'TSH', '\\(tsh\\)', 'Hormonas y otros'), T('psa', 'PSA', '\\(psa\\)$', 'Hormonas y otros'), T('psal', 'PSA libre', '\\(psa\\) libre', 'Hormonas y otros'),
  T('psar', 'PSA libre/total', '^ratio psa', 'Hormonas y otros'),
  T('u_acr', 'uACR', '^uri.*-albumina\\/creatinina', 'Orina', 'mg/g'), T('u_pcr', 'uPCR', '^uri\\(mic\\)-proteina\\/creatinina', 'Orina', 'mg/g'),
  T('u24_pcr', 'uPCR 24h', '^uri\\(24h\\)-proteina\\/creatinina', 'Orina', 'mg/g'), T('u24_prot', 'Proteinuria 24h', '^uri\\(24h\\)-proteinas?$', 'Orina'),
  T('u_alb', 'Alb orina', '^uri.*-albumina$', 'Orina'), T('u_cr', 'Cr orina', '^uri.*-creatinina$', 'Orina'),
  T('u_na', 'Na orina', '^uri.*-sodio$', 'Orina'), T('u_k', 'K orina', '^uri.*-potasio$', 'Orina'), T('u_cl', 'Cl orina', '^uri.*-cloro$', 'Orina'),
  T('u_dens', 'Densidad', '^uri.*-densidad', 'Orina'), T('u_ph', 'pH', '^uri.*-ph$', 'Orina'), T('u_prot', 'Proteínas', '^uri\\(mic\\)-proteina$', 'Orina'), T('u_prot_t', 'Proteínas (tira)', '^uri.*-proteinas$', 'Orina'),
  T('u_glu', 'Glucosa', '^uri.*-glucosa', 'Orina'), T('u_ket', 'Cuerpos cetónicos', '^uri.*-cuerpos cetonicos', 'Orina'), T('u_bil', 'Bilirrubina', '^uri.*-bilirrubina$', 'Orina'), T('u_uro', 'Urobilinógeno', '^uri.*-urobilinogeno', 'Orina'),
  T('u_nit', 'Nitritos', '^uri.*-nitritos', 'Orina'), T('u_hem', 'Eritrocitos', '^uri.*-(?:eritrocitos|hematies)$', 'Orina'), T('u_leu', 'Leucocitos', '^uri.*-leucocitos$', 'Orina'),
];
export const BY_KEY = Object.fromEntries(ANALYTES.map(a => [a.key, a]));
export function identify(name) { const n = norm(name); return ANALYTES.find(a => a.re.test(n)) || null; }

export function annotate(recs) { return recs.map(r => ({ ...r, key: identify(r.name)?.key || null })); }

// Valores vigentes: último registro de cada analito dentro de `windowDays` de la fecha más reciente.
export function current(recs, defaultDate, windowDays = 21) {
  const rs = annotate(recs).map(r => ({ ...r, date: r.date || defaultDate || null }));
  const dated = rs.filter(r => r.date);
  const last = dated.length ? dated.map(r => r.date).sort().pop() : null;
  const vals = new Map(), others = [];
  for (const r of rs) {
    if (!r.date || !last) continue;
    if (Date.parse(last) - Date.parse(r.date) > windowDays * DAY) continue;
    if (!r.key) { if (r.date === last) others.push(r); continue; }
    const prev = vals.get(r.key);
    if (!prev || r.date > prev.date || (r.date === prev.date && (r.time || '') >= (prev.time || ''))) vals.set(r.key, r);
  }
  return { date: last, vals, others, all: rs };
}

// Serie cronológica (un valor por día) de un analito.
export function series(all, key) {
  const byDay = new Map();
  for (const r of all) if (r.key === key && r.date && Number.isFinite(r.num)) byDay.set(r.date, r);
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, value: r.num, str: r.valueStr }));
}

// Regresión lineal sobre el tiempo en años. Exige >=3 puntos y >=90 días de seguimiento.
export function regress(ser) {
  if (ser.length < 3) return null;
  const t = ser.map(p => Date.parse(p.date) / (365.25 * DAY)), y = ser.map(p => p.value);
  const span = t[t.length - 1] - t[0];
  if (span < 90 / 365.25) return null;
  const n = ser.length, mt = t.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  const sxx = t.reduce((a, x) => a + (x - mt) ** 2, 0), sxy = t.reduce((a, x, i) => a + (x - mt) * (y[i] - my), 0);
  const perYear = sxy / sxx;
  return { perYear, intercept: my - perYear * mt, n, spanYears: span, last: y[n - 1], at: yrs => y[n - 1] + perYear * yrs };
}
export function slope(ser) {
  const r = regress(ser);
  return r && { perYear: r.perYear, n: r.n, spanYears: r.spanYears, last: r.last, at5: Math.max(0, r.last + r.perYear * 5) };
}

export function trendText(ser, n = 4) {
  return ser.slice(-n).map(p => `${p.str} (${fmtDate(p.date).slice(0, 5)}/${p.date.slice(2, 4)})`).join(' → ');
}

// ---- Salida ordenada (formato HCIS): cada línea es una lista [clave, etiqueta, unidad, opciones]
const thousands = n => (n >= 10000 ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(Math.round(n)));
const QUAL = /^(negativo|normal|ausente)$/i;
const MAIN = [
  ['Hemograma', [
    [['rbc', 'Hematíes', '/µL', { mul: 1e6, fmt: thousands, tight: 1 }], ['hb', 'Hb', 'g/dL'], ['hto', 'Hto', '%', { tight: 1 }], ['vcm', 'VCM', 'fL'], ['hcm', 'HCM', 'pg'], ['rdw', 'ADE', '%', { tight: 1 }]],
    'WBC',
    [['plt', 'Plaquetas', '/µL', { mul: 1e3, fmt: thousands, tight: 1 }]],
  ]],
  ['Iones', [[['na', 'Na+', 'mmol/L'], ['k', 'K+', 'mmol/L'], ['cl', 'Cl-', 'mmol/L'], ['ca', 'Calcio total', 'mg/dL'], ['caadj', 'Ca2+Alb', 'mg/dL'], ['caion', 'Ca2+ iónico', 'mmol/L'], ['p', 'Fosfato', 'mg/dL'], ['mg', 'Mg2+', 'mg/dL', { dec: 1 }]]]],
  ['Gasometría', [[['ph', 'pH', ''], ['pco2', 'pCO2', 'mmHg'], ['po2', 'pO2', 'mmHg'], ['hco3', 'HCO3-', 'mmol/L'], ['be', 'EB', 'mmol/L'], ['lac', 'Lactato', 'mmol/L']]]],
  ['Bioquímica', [
    [['glu', 'Glucemia', 'mg/dL'], ['cr', 'Creatinina', 'mg/dL'], ['fg', 'Filtrado', 'mL/min'], ['urea', 'Urea', 'mg/dL']],
    [['urato', 'Urato', 'mg/dL'], ['chol', 'Colesterol total', 'mg/dL'], ['hdl', 'HDL', 'mg/dL'], ['tg', 'TG', 'mg/dL']],
    [['ferr', 'Ferritina', 'ng/mL'], ['trf', 'Transferrina', 'mg/dL'], ['tibc', 'CTTH', 'µg/dL'], ['fe', 'Hierro', 'µg/dL'], ['tsat', 'IST', '%', { tight: 1 }]],
    [['alt', 'ALAT', 'UI/L'], ['ast', 'ASAT', 'UI/L'], ['ggt', 'GGT', 'UI/L'], ['fa', 'FAlc', 'UI/L'], ['bil', 'BRT', 'mg/dL']],
    [['pcr', 'PCR', 'mg/L']],
    [['pth', 'PTHi', 'pg/mL']],
    [['pt', 'Proteínas', 'g/dL'], ['alb', 'Albúmina', 'g/dL'], ['vitd', 'Vitamina D (25-OH)', 'ng/mL']],
    [['hba1c', 'HbA1c', '%', { tight: 1 }], ['tsh', 'TSH', 'µUI/mL'], ['b12', 'Vitamina B12', 'pg/mL'], ['fol', 'Ácido fólico', 'ng/mL'], ['psa', 'PSA', 'ng/mL']],
  ]],
];
const URINE = [['u_dens', 'Densidad', ''], ['u_ph', 'pH', ''], ['u_glu', 'Glucosa', ''], ['u_ket', 'Cuerpos cetónicos', ''], ['u_bil', 'Bilirrubina', ''], ['u_uro', 'Urobilinógeno', ''], ['u_prot', 'Proteínas', 'mg/dL'],
  ['u_nit', 'Nitritos', ''], ['u_hem', 'Eritrocitos', ''], ['u_leu', 'Leucocitos', ''], ['u_cr', 'Creatinina', 'mg/dL'], ['u_pcr', 'Prot/Cr', 'mg/gCr'], ['u_alb', 'Albúmina', 'mg/dL'], ['u_acr', 'Alb/Cr', 'mg/gCr']];

const cell = (r, o = {}) => {
  if (!r) return null;
  if (!Number.isFinite(r.num)) return QUAL.test(r.valueStr) ? '-' : /^[<>]/.test(r.valueStr) ? r.valueStr : r.valueStr;
  const v = o.mul ? r.num * o.mul : r.num;
  return o.fmt ? o.fmt(v) : o.dec != null ? String(+v.toFixed(o.dec)) : /^[<>]/.test(r.valueStr) ? r.valueStr : String(parseFloat(r.valueStr));
};
const item = (vals, [k, label, unit, o = {}]) => { const c = cell(vals.get(k), o); return c == null ? null : { t: `${label} ${c}${unit ? (o.tight ? '' : ' ') + unit : ''}`, f: !!vals.get(k).flag }; };
const wbcItems = vals => {
  const w = vals.get('wbc'); if (!w) return null;
  const ab = k => (vals.get(k) ? Math.round(vals.get(k).num * 1000) : null), fl = k => !!vals.get(k)?.flag;
  const [n, l, m, e, b] = ['neu', 'lin', 'mon', 'eos', 'bas'].map(ab);
  const diff = [n != null && { t: `N ${n}`, f: fl('neu') }, l != null && { t: `L ${l}`, f: fl('lin') }, m != null && { t: `M ${m}`, f: fl('mon') }, e != null && { t: `E ${e}`, f: fl('eos') }, b != null && { t: `B ${b}`, f: fl('bas') }, n != null && l ? { t: `N/L ${(n / l).toFixed(2)}`, f: false } : false].filter(Boolean);
  return [{ t: `Leucocitos ${thousands(w.num * 1000)}/µL`, f: !!w.flag }, ...(diff.length ? [{ t: ' [' }, ...diff.flatMap((d, i) => (i ? [{ t: ', ' }, d] : [d])), { t: ']' }] : [])];
};
const segs = items => items.flatMap((it, i) => (i ? [{ t: ', ' }, it] : [it])).map(it => (it.f ? { t: it.t, b: true } : { t: it.t }));

// Líneas de segmentos {t, b}: los valores fuera de rango del laboratorio (o en negrita en el HCE) salen en negrita.
export function orderedDoc(cur, { extras = false } = {}) {
  const lines = [[{ t: `Analítica ${fmtDate(cur.date)}` }]], used = new Set();
  for (const [title, rows] of MAIN) {
    const out = rows.map(row => {
      if (row === 'WBC') { ['wbc', 'neu', 'lin', 'mon', 'eos', 'bas'].forEach(k => used.add(k)); const w = wbcItems(cur.vals); return w && w.map(g => (g.f ? { t: g.t, b: true } : { t: g.t })); }
      row.forEach(([k]) => used.add(k));
      const its = row.map(it => item(cur.vals, it)).filter(Boolean);
      return its.length ? segs(its) : null;
    }).filter(Boolean);
    out.forEach((sg, i) => lines.push(i === 0 ? [{ t: `- ${title}: ` }, ...sg] : [{ t: '    ' }, ...sg]));
  }
  const u = URINE.map(([k, label, unit]) => { used.add(k); return item(cur.vals, [k, label, unit]); }).filter(Boolean);
  if (u.length) {
    const rec = cur.vals.get('u_cr') || cur.vals.get('u_pcr') || cur.vals.get('u_acr') || cur.vals.get('u_dens');
    lines.push([], [{ t: `Orina ${fmtDate(rec?.date || cur.date)}${rec?.time ? `, ${rec.time.slice(0, 5)}` : ''}: ` }, ...segs(u)]);
  }
  if (extras) {
    const rest = [...cur.vals].filter(([k]) => !used.has(k)).map(([k, r]) => ({ t: `${BY_KEY[k].label} ${cell(r)}${BY_KEY[k].unit ? ' ' + BY_KEY[k].unit : ''}`, f: !!r.flag }))
      .concat(cur.others.map(r => ({ t: `${r.name.replace(/^[A-Za-z/()0-9]+-/, '')} ${r.valueStr}${r.unit ? ' ' + r.unit : ''}`, f: !!r.flag })));
    if (rest.length) lines.push([], [{ t: 'Otros: ' }, ...segs(rest)]);
  }
  return lines;
}
export const formatOrdered = (cur, o) => orderedDoc(cur, o).map(l => l.map(g => g.t).join('')).join('\n');

// Extrae edad/sexo/peso/talla de texto libre (revisión previa o cabecera de pruebas).
export function sniffPatient(text) {
  const p = {};
  let m = text.match(/\b(var[oó]n|hombre|mujer)\b[^.\n]{0,25}?(\d{2})\s*a[nñ]os/i) || text.match(/\b(var[oó]n|hombre|mujer)\s+de\s+(\d{2})/i);
  if (m) { p.female = /mujer/i.test(m[1]); p.age = +m[2]; }
  if (p.age == null && (m = text.match(/Edad:\s*(\d{2})/i))) p.age = +m[1];
  if (p.female == null && (m = text.match(/Sexo[^:]*:\s*(Var[oó]n|Mujer|Hombre)/i))) p.female = /mujer/i.test(m[1]);
  if ((m = text.match(/Peso:\s*(\d{2,3}(?:[.,]\d)?)\s*kg/i))) p.weight = +m[1].replace(',', '.');
  if ((m = text.match(/(?:Altura|Talla):\s*(\d{3}(?:[.,]\d)?)\s*cm/i))) p.height = +m[1].replace(',', '.');
  return p;
}
