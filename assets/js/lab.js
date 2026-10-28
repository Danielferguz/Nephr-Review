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
    return { name: r[1].trim(), value: isNum ? num : clean, num, valueStr: clean, flag: flag || bold, bold, unit: (r[3] || '').trim(), ref };
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
  T('u_dens', 'Densidad', '^uri.*-densidad', 'Orina'), T('u_ph', 'pH orina', '^uri.*-ph$', 'Orina'), T('u_prot', 'Proteínas', '^uri.*-proteinas?$', 'Orina'),
  T('u_glu', 'Glucosa', '^uri.*-glucosa', 'Orina'), T('u_leu', 'Leucocitos', '^uri.*-leucocitos$', 'Orina'), T('u_nit', 'Nitritos', '^uri.*-nitritos', 'Orina'),
  T('u_hem', 'Hematíes', '^uri.*-(?:eritrocitos|hematies)', 'Orina'),
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

// ---- Salida ordenada
const FLAG = r => (r.flag ? '*' : '');
export function formatOrdered(cur) {
  const lines = [`Analítica (${fmtDate(cur.date)}):`];
  for (const g of GROUPS) {
    const parts = ANALYTES.filter(a => a.group === g && cur.vals.has(a.key)).map(a => {
      const r = cur.vals.get(a.key);
      const late = r.date !== cur.date ? ` [${fmtDate(r.date).slice(0, 5)}]` : '';
      return `${a.label} ${r.valueStr}${FLAG(r)}${a.unit && !/^[A-Za-z]/.test(r.valueStr) ? ' ' + a.unit : ''}${late}`;
    });
    if (parts.length) lines.push(`${g}: ${parts.join(', ')}`);
  }
  if (cur.others.length) lines.push(`Otros: ${cur.others.map(r => `${r.name.replace(/^[A-Za-z/()0-9]+-/, '')} ${r.valueStr}${FLAG(r)}${r.unit ? ' ' + r.unit : ''}`).join(', ')}`);
  lines.push('(* = fuera de rango del laboratorio)');
  return lines.join('\n');
}

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
