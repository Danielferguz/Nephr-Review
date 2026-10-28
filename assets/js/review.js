// Actualización de la revisión: sustituye la sección de analítica, propone acciones (en rojo) y arma medicación y plan.
// Todas las sugerencias son reglas fijas; el clínico las valida. Nada sale del navegador.
import { parseLab, current, series, slope, trendText, fmtDate, formatOrdered, sniffPatient } from './lab.js';
import { ckdepi2021, cockcroftGault, spKtV, eKtV, stdKtV, fx } from './calc.js';

export const TYPES = {
  erca: 'Consulta ERCA', general: 'Consulta general', glom: 'Consulta glomerulares', tx: 'Consulta trasplante',
  dp: 'Consulta DP', hd: 'Consulta hemodiálisis', hdd: 'Consulta hemodomi', guardia: 'Guardia de nefrología',
};
const DIAL = new Set(['dp', 'hd', 'hdd']);

const T = t => ({ t });
const S = t => ({ t, s: true });

// ---- Medicación: diccionario por clase (sobre texto sin acentos y en minúsculas)
const MEDS = [
  ['raas', /enalapril|lisinopril|ramipril|perindopril|captopril|losartan|valsartan|candesartan|irbesartan|telmisartan|olmesartan|azilsartan|micardis|karvezide|cozaar|diovan|atacand|aprovel|karvea|renitec|acuprel|twynsta|sevikar|entresto|sacubitrilo/],
  ['arm', /finerenona|kerendia|espironolactona|aldactone|eplerenona|inspra/],
  ['sglt2', /dapagliflozina|forxiga|xigduo|empagliflozina|jardiance|synjardy|glyxambi|canagliflozina|invokana|ertugliflozina/],
  ['metf', /metformina|dianben|synjardy|xigduo|janumet|efficib|eucreas/],
  ['statin', /atorvastatina|rosuvastatina|simvastatina|pravastatina|pitavastatina|lovastatina|fluvastatina|lipitor|crestor|zocor|sortis|atozet|inegy/],
  ['ppi', /omeprazol|pantoprazol|esomeprazol|lansoprazol|rabeprazol|nexium/],
  ['nsaid', /ibuprofeno|naproxeno|diclofenaco|ketorolaco|dexketoprofeno|enantyum|celecoxib|etoricoxib|aceclofenaco|indometacina|meloxicam|piroxicam|nimesulida/],
  ['doac', /edoxaban|lixiana|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa/],
  ['esa', /aranesp|darbepoetina|mircera|epoetina|eporatin|retacrit|binocrit|neorecormon|eprex|roxadustat/],
  ['iron', /ferbisol|ferinject|venofer|monofer|sulfato ferroso|fero-?gradumet|ferrograd|hierro|carboximaltosa|maltofer|tardyferon|ferroprotina/],
  ['pbind', /sevelamer|renvela|renagel|lantano|fosrenol|carbonato calcico|mastical|calcio acetato|royen|velphoro|sucroferric/],
  ['vitd', /hidroferol|calcifediol|colecalciferol|deltius|vitamina d3|vigantol|fortasec/],
  ['vitda', /calcitriol|rocaltrol|paricalcitol|zemplar|alfacalcidol|etalpha/],
  ['calcim', /cinacalcet|mimpara|etelcalcetida|parsabiv|evocalcet/],
  ['bicarb', /bicarbonato/],
  ['gaba', /gabapentina|pregabalina|lyrica|neurontin/],
  ['sulf', /glibenclamida|glimepirida|gliclazida|daonil|amaryl|diamicron/],
  ['dpp4', /sitagliptina|januvia|vildagliptina|galvus|alogliptina|vipidia|linagliptina|trajenta/],
];
const nrm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function parseMeds(text) {
  return text.split(/\r?\n|;/).map(l => l.trim()).filter(Boolean).map(raw => {
    const tail = raw.match(/CRONICA\s+(.*)$/i);
    const label = raw.replace(/^(?:f[aá]rmacos|tratamiento|medicaci[oó]n)[^:]{0,20}:\s*/i, '').split(/,\s/)[0].replace(/\s+\d+\s+(comprimidos?|capsulas?|sobres?|ampollas?|comp)\b.*$/i, '').trim() + (tail ? ` — ${tail[1].trim()}` : '');
    const n = nrm(raw);
    return { raw, label, classes: MEDS.filter(([, re]) => re.test(n)).map(([c]) => c), notes: [] };
  });
}

// ---- Motor de reglas
export function analyze(ctx) {
  const { cur, all, type, meds } = ctx, dial = DIAL.has(type);
  const v = k => { const r = cur.vals.get(k); return r ? r.num : NaN; };
  const ok = x => Number.isFinite(x);
  const has = c => meds.some(m => m.classes.includes(c));
  const prev = k => { const s = series(all, k); return s.length > 1 && s[s.length - 1].date === cur.vals.get(k)?.date ? s[s.length - 2] : null; };
  const prior = (k, n = 3) => { const s = series(all, k), l = cur.vals.get(k); const p = s.filter(x => !l || x.date < l.date).slice(-n); return p.length ? ` (previos ${p.map(x => x.str).join(', ')})` : ''; };
  const plan = [], adds = [];
  const bullets = [];
  const sug = (text, opt = {}) => {
    if (!plan.includes(text)) plan.push(text);
    if (opt.cls) meds.filter(m => m.classes.includes(opt.cls)).forEach(m => !m.notes.includes(text) && m.notes.push(text));
    if (opt.add && !has(opt.add)) adds.push(text);
    return S(' --> ' + text);
  };
  const bullet = (...segs) => segs.flat().filter(Boolean).length && bullets.push(segs.flat().filter(Boolean));

  const age = ctx.age, female = ctx.female;
  let fg = v('fg');
  if (!ok(fg) && ok(v('cr')) && age) fg = ckdepi2021(v('cr'), age, female);
  const acr = v('u_acr'), pcr = v('u_pcr') || v('u24_pcr');
  const prot = ok(acr) ? acr >= 30 : ok(pcr) ? pcr >= 150 : false;
  const K = v('k'), hco3 = ok(v('hco3s')) && !ok(v('hco3')) ? v('hco3s') : v('hco3');
  const alb = v('alb'), ca = v('ca'), caCorr = ok(ca) && ok(alb) ? ca + 0.8 * (4 - alb) : ca;
  const crClG = ok(v('cr')) && age && ctx.kg ? cockcroftGault(v('cr'), age, ctx.kg, female) : NaN;

  // 1. Función renal / dosis de diálisis
  if (!dial) {
    const s = [T(`Función renal: ${ok(v('fg')) ? 'CKD-EPI ' : 'FGe '}${ok(fg) ? fx(fg, 0) : '—'} mL/min${prior('fg')}, Cr ${cur.vals.get('cr')?.valueStr ?? '—'}${prior('cr')}.`)];
    const p = prev('fg');
    let drop = NaN;
    if (p && ok(fg)) {
      drop = (p.value - fg) / p.value;
      s.push(T(Math.abs(fg - p.value) <= 2 || Math.abs(drop) <= 0.1 ? ' Función renal estable.' : drop > 0 ? ' Descenso respecto a la determinación previa.' : ' Mejoría respecto a la determinación previa.'));
      if (drop >= 0.25 || fg - p.value <= -5) s.push(sug(`Descenso del FGe (${p.str} → ${fx(fg, 0)}): descartar causa reversible (volumen, nefrotóxicos, obstrucción) y repetir en 1-2 semanas`));
    }
    if (ok(acr) || ok(pcr)) {
      const pr = prev(ok(acr) ? 'u_acr' : v('u_pcr') ? 'u_pcr' : 'u24_pcr');
      s.push(T(` ${ok(pcr) ? `uPCR ${fx(pcr, 0)}${prior('u_pcr')}` : ''}${ok(pcr) && ok(acr) ? ' y ' : ''}${ok(acr) ? `uACR ${fx(acr, 0)} mg/g${prior('u_acr')}` : ''}.`));
      const now = ok(acr) ? acr : pcr;
      if (pr && now >= 2 * pr.value && now >= 30) s.push(sug(`Proteinuria x${fx(now / pr.value, 1)} respecto a la previa: confirmar en muestra de primera hora con sedimento`));
    }
    bullet(...s);
    if (prot && !has('raas') && !(K > 5) && !dial) bullets[bullets.length - 1].push(sug('Proteinuria sin bloqueo del SRAA: valorar IECA/ARA-II a dosis máxima tolerada con control de K y creatinina', { add: 'raas' }));
    if (prot && ok(fg) && fg >= 20 && !has('sglt2') && (ctx.dm || (ok(acr) && acr >= 200) || (ok(pcr) && pcr >= 500))) bullets[bullets.length - 1].push(sug('Valorar iSGLT2 (FGe ≥20 y albuminuria)', { add: 'sglt2' }));
    if (ctx.dm && ok(acr) && acr >= 30 && ok(fg) && fg >= 25 && K <= 5 && !has('arm')) bullets[bullets.length - 1].push(sug('DM2 con albuminuria persistente: valorar finerenona (K ≤5,0)', { add: 'arm' }));
  } else {
    const pre = v('urea'), post = v('urea_post'), s = [T(`Dosis de diálisis: urea ${cur.vals.get('urea')?.valueStr ?? '—'}${ok(post) ? ` / post ${post}` : ''}, Cr ${cur.vals.get('cr')?.valueStr ?? '—'}.`)];
    if (type !== 'dp' && ok(pre) && ok(post)) {
      const urr = (1 - post / pre) * 100;
      s.push(T(` URR ${fx(urr, 0)} %`));
      if (ctx.session?.t && ctx.session.w) {
        const sp = spKtV(pre, post, ctx.session.t / 60, ctx.session.uf || 0, ctx.session.w), e = eKtV(sp, ctx.session.t / 60, ctx.session.acc || 'fav');
        s.push(T(`, spKt/V ${fx(sp, 2)}${ctx.session.n ? `, stdKt/V ${fx(stdKtV(sp, e, ctx.session.t, ctx.session.n), 2)}` : ''}`));
        if (type === 'hd' && sp < 1.2) s.push(sug('spKt/V <1,2: revisar acceso (recirculación), Qb, duración y adherencia; valorar aumentar tiempo de sesión'));
      } else if (type === 'hd' && urr < 65) s.push(sug('URR <65 %: revisar acceso, Qb, duración y recirculación; completar Kt/V'));
      s.push(T('.'));
    } else if (type === 'dp') s.push(T(' Dosis según cinética peritoneal con orina de 24 h (calculadora DP).'));
    s.push(T(' No calculo FGe por estar en TRS.'));
    bullet(...s);
  }

  // 2. Iones
  {
    const parts = [['K', 'k'], ['Na', 'na'], ['Cl', 'cl'], ['Mg', 'mg']].filter(([, k]) => ok(v(k))).map(([l, k]) => `${l} ${cur.vals.get(k).valueStr}`);
    if (parts.length) {
      const sg = [];
      if (K >= 6) sg.push(sug('K ≥6,0: repetir de inmediato (descartar hemólisis), ECG y valorar tratamiento urgente', { cls: 'raas' }));
      else if (K > 5.5) sg.push(sug(has('raas') || has('arm') ? 'Hiperpotasemia: dieta baja en K, valorar captor de K y reducir dosis de IECA/ARA-II/ARM si persiste' : 'Hiperpotasemia: dieta baja en K y valorar captor de K', { cls: has('raas') ? 'raas' : 'arm' }));
      else if (K > 5 && has('arm')) sg.push(sug('K >5,0 con ARM: valorar reducir dosis', { cls: 'arm' }));
      else if (K < 3.5) sg.push(sug('Hipopotasemia: valorar aportes de K y revisar diuréticos/pérdidas digestivas'));
      if (v('na') < 135) sg.push(sug('Hiponatremia: valorar osmolaridad, volemia y fármacos (diuréticos tiazídicos)'));
      if (v('na') > 145) sg.push(sug('Hipernatremia: revisar aporte de agua libre'));
      if (v('mg') < 1.6) sg.push(sug('Hipomagnesemia: valorar suplemento oral y revisar IBP/diuréticos', { cls: 'ppi' }));
      bullet(T(sg.length ? `Control iónico: ${parts.join(', ')}${prior('k').replace('previos', 'K previos')}.` : `Control iónico ok (${parts.join(' / ')}).`), ...sg);
    }
  }

  // 3. Ácido-base
  if (ok(hco3)) {
    const venous = ok(v('pco2')) && v('pco2') > 50 && (!ok(v('po2')) || v('po2') < 60);
    const sg = [];
    if (hco3 < 18 && !dial) sg.push(sug('Acidosis metabólica (HCO3 <18): iniciar/aumentar bicarbonato oral con control de TA y volemia', { cls: 'bicarb', add: 'bicarb' }));
    else if (hco3 < 22) sg.push(sug(dial ? 'HCO3 pre-diálisis <22: aumentar bicarbonato del baño y/o aportes orales' : 'HCO3 <22: valorar bicarbonato oral y dieta rica en frutas y verduras', { cls: 'bicarb' }));
    else if (hco3 > 26) sg.push(sug(dial ? 'HCO3 >26: valorar reducir bicarbonato del baño/aportes' : 'HCO3 >26: valorar reducir bicarbonato', { cls: 'bicarb' }));
    bullet(T(`Ácido-base: HCO3 ${fx(hco3, 1)}${ok(v('hco3s')) && ok(v('hco3')) ? ` (estándar ${fx(v('hco3s'), 1)})` : ''}${ok(v('ph')) ? `, pH ${fx(v('ph'), 3)}` : ''}${ok(v('pco2')) ? `, pCO2 ${fx(v('pco2'), 1)}` : ''}${ok(v('be')) ? `, EB ${fx(v('be'), 1)}` : ''}${venous ? '; muestra de aspecto venoso, no valorable como arterial' : ''}.`), ...sg);
  }

  // 4. Metabolismo Ca/P
  if ([ca, v('p'), v('pth'), v('vitd'), v('caion')].some(ok)) {
    const sg = [], P = v('p'), pth = v('pth'), d = v('vitd');
    if (dial) {
      if (P > 5.5) sg.push(sug('Hiperfosfatemia: reforzar dieta y adherencia al quelante; valorar ajustar quelante', { cls: 'pbind', add: 'pbind' }));
      if (P < 3.5) sg.push(sug('Hipofosfatemia: valorar reducir quelante y liberalizar la dieta', { cls: 'pbind' }));
      if (pth > 600) sg.push(sug('PTH >600 (≈9× LSN): tras ajustar Ca y P valorar vitamina D activa y/o calcimimético', { cls: 'vitda' }));
      if (pth < 130) sg.push(sug('PTH <130 (<2× LSN): riesgo de enfermedad ósea adinámica; valorar reducir/suspender vitamina D activa y calcimimético', { cls: 'vitda' }));
    } else {
      if (P > 4.5) sg.push(sug(P > 5.5 ? 'Hiperfosfatemia: dieta pobre en fósforo y valorar quelante' : 'Fósforo sobre rango: reforzar dieta pobre en fósforo; quelante si persiste', { cls: 'pbind' }));
      if (pth > 150 && (!ok(fg) || fg < 45)) sg.push(sug('PTH elevada: corregir déficit de calcidiol, hiperfosfatemia e hipocalcemia antes de vitamina D activa; seguimiento de la tendencia', { cls: 'vitda' }));
    }
    if (caCorr < 8.4) sg.push(sug('Hipocalcemia: revisar vitamina D y aportes de calcio; precaución con calcimiméticos', { cls: 'calcim' }));
    if (caCorr > 10.2) sg.push(sug('Hipercalcemia: revisar calcio oral, quelantes cálcicos y vitamina D; descartar hiperparatiroidismo', { cls: 'pbind' }));
    if (d < 20) sg.push(sug('Déficit de 25-OH-vitamina D: reposición con colecalciferol/calcifediol y control de Ca', { cls: 'vitd', add: 'vitd' }));
    else if (d < 30 && !dial) sg.push(sug('Insuficiencia de vitamina D: valorar suplemento', { cls: 'vitd', add: 'vitd' }));
    const parts = [ok(ca) ? `Ca ${cur.vals.get('ca').valueStr}${ok(alb) ? ` (corregido ${fx(caCorr, 1)})` : ''}` : '', ok(v('caion')) ? `Ca2+ ${cur.vals.get('caion').valueStr}` : '', ok(P) ? `P ${cur.vals.get('p').valueStr}` : '', ok(pth) ? `PTH ${cur.vals.get('pth').valueStr}${prior('pth', 2)}` : '', ok(d) ? `calcidiol ${cur.vals.get('vitd').valueStr}` : ''].filter(Boolean);
    bullet(T(`Metabolismo Ca/P: ${parts.join(', ')}.`), ...sg);
  }

  // 5. Anemia y hierro
  if ([v('hb'), v('ferr'), v('tsat'), v('vcm')].some(ok)) {
    const hb = v('hb'), ferr = v('ferr'), tsat = v('tsat'), vcm = v('vcm'), sg = [];
    const esa = has('esa');
    const ironLow = dial ? (ok(tsat) && tsat < 20) || (ok(ferr) && ferr < 200) : (ok(tsat) && tsat <= 20 && ok(ferr) && ferr <= 100);
    const ironHigh = ok(ferr) && ferr > (dial ? 800 : 500) || (ok(tsat) && tsat > 45);
    if (esa && hb > (dial ? 12 : 11.5)) sg.push(sug(`Hb ${fx(hb, 1)} con AEE por encima de objetivo: reducir dosis de AEE ~25 %`, { cls: 'esa' }));
    else if (esa && hb < 10) sg.push(sug('Hb <10 con AEE: revisar hierro, inflamación, hiperparatiroidismo y adherencia; valorar aumentar AEE ~25 %', { cls: 'esa' }));
    else if (!esa && hb < 10 && !ironLow) sg.push(sug('Hb <10 sin AEE y reservas de hierro adecuadas: valorar iniciar AEE', { add: 'esa' }));
    if (ironLow && !has('iron')) sg.push(sug(dial ? 'Déficit de hierro (ferritina <200 o IST <20 %): valorar hierro IV' : 'Ferropenia (IST ≤20 % y ferritina ≤100): iniciar hierro oral, IV si intolerancia o ineficacia', { add: 'iron' }));
    else if (ironLow) sg.push(sug('Persiste déficit de hierro con tratamiento: valorar adherencia/intolerancia y paso a vía IV', { cls: 'iron' }));
    if (ironHigh && has('iron')) sg.push(sug(`Reservas altas (ferritina ${ok(ferr) ? ferr : '—'}, IST ${ok(tsat) ? tsat : '—'} %): valorar suspender hierro`, { cls: 'iron' }));
    if (hb < 12 && !ok(tsat) && !ok(ferr)) sg.push(sug('Solicitar perfil férrico (IST, ferritina), B12 y ácido fólico'));
    if (vcm > 100) sg.push(sug('Macrocitosis: solicitar B12 y ácido fólico; revisar IBP/metformina', { cls: 'ppi' }));
    if (vcm < 80) sg.push(sug('Microcitosis: perfil férrico; valorar electroforesis de Hb si la ferritina es normal'));
    const parts = [ok(hb) ? `Hb ${cur.vals.get('hb').valueStr}${prior('hb', 2)}` : '', ok(vcm) ? `VCM ${cur.vals.get('vcm').valueStr}` : '', ok(v('fe')) ? `Fe ${cur.vals.get('fe').valueStr}` : '', ok(ferr) ? `ferritina ${cur.vals.get('ferr').valueStr}` : '', ok(tsat) ? `IST ${cur.vals.get('tsat').valueStr} %` : '', ok(v('b12')) ? `B12 ${cur.vals.get('b12').valueStr}` : '', ok(v('fol')) ? `fólico ${cur.vals.get('fol').valueStr}` : ''].filter(Boolean);
    bullet(T(`Anemia: ${parts.join(', ')}.`), ...sg);
  }

  // 6. Lípidos
  if ([v('chol'), v('ldl'), v('tg')].some(ok)) {
    const ldl = v('ldl'), sg = [];
    const on = has('statin');
    if (!on && !dial && age) {
      if (age >= 50 && ok(fg) && fg < 60) sg.push(sug('Valorar iniciar estatina (o estatina + ezetimiba): edad ≥50 y FGe <60 (KDIGO 1A)', { add: 'statin' }));
      else if (age >= 50) sg.push(sug('Valorar estatina por ERC y edad ≥50 (KDIGO 1B)', { add: 'statin' }));
      else if (ctx.dm) sg.push(sug('Valorar estatina por ERC con diabetes (KDIGO 2A)', { add: 'statin' }));
    } else if (!on && dial) { /* KDIGO: no iniciar en diálisis */ } else if (on && ldl > 70) sg.push(sug(`LDL ${ldl} con estatina: reforzar adherencia y dieta; valorar intensificar o añadir ezetimiba`, { cls: 'statin' }));
    if (v('tg') > 500) sg.push(sug('TG >500: riesgo de pancreatitis; dieta, descartar causas secundarias y valorar fibrato/omega-3'));
    bullet(T(`Perfil lipídico: colesterol total ${cur.vals.get('chol')?.valueStr ?? '—'}${ok(ldl) ? `, LDL ${cur.vals.get('ldl').valueStr}` : ''}${ok(v('hdl')) ? `, HDL ${cur.vals.get('hdl').valueStr}` : ''}${ok(v('tg')) ? `, TG ${cur.vals.get('tg').valueStr}` : ''}.`), ...sg);
  }

  // 7. Hepático, glucemia, urato, nutrición
  const hep = ['ast', 'alt', 'ggt', 'fa', 'bil'].filter(k => cur.vals.has(k));
  if (hep.length) bullet(T(hep.some(k => cur.vals.get(k).flag) ? `Perfil hepático: ${hep.map(k => `${k.toUpperCase()} ${cur.vals.get(k).valueStr}${cur.vals.get(k).flag ? '*' : ''}`).join(', ')}.` : 'Perfil hepático normal.'));
  const gl = [ok(v('glu')) ? `glucosa ${cur.vals.get('glu').valueStr}` : '', ok(v('hba1c')) ? `HbA1c ${cur.vals.get('hba1c').valueStr} %` : '', ok(v('urato')) ? `urato ${cur.vals.get('urato').valueStr}` : ''].filter(Boolean);
  if (gl.length) bullet(T(`${gl.join(', ').replace(/^./, c => c.toUpperCase())}.`));
  if (ok(alb) || ok(v('pt')) || ok(v('pcr'))) {
    const sg = [];
    if (alb < 3.5) sg.push(sug('Albúmina baja: valorar estado nutricional, inflamación y pérdidas (proteinuria/peritoneal)'));
    if (v('pcr') > 10) sg.push(sug('PCR elevada: buscar foco infeccioso/inflamatorio y recontrol'));
    bullet(T(`Parámetros nutricionales: ${[ok(alb) ? `albúmina ${cur.vals.get('alb').valueStr}` : '', ok(v('pt')) ? `PT ${cur.vals.get('pt').valueStr}` : '', ok(v('pcr')) ? `PCR ${cur.vals.get('pcr').valueStr}` : ''].filter(Boolean).join(', ')}.`), ...sg);
  }
  if (ok(v('psa'))) bullet(T(`PSA ${cur.vals.get('psa').valueStr}${ok(v('psar')) ? ` (libre/total ${cur.vals.get('psar').valueStr})` : ''}.`));
  const hemo = ['plt', 'wbc'].filter(k => cur.vals.get(k)?.flag);
  if (hemo.length) bullet(T(`Hemograma: ${hemo.map(k => `${k === 'plt' ? 'plaquetas' : 'leucocitos'} ${cur.vals.get(k).valueStr}*`).join(', ')}.`));
  bullet(T('resto aceptable.'));

  // 8. Reglas por fármaco (sólo si el fármaco está en el listado)
  const dose = (cls, text) => has(cls) && sug(text, { cls });
  if (dial || (ok(fg) && fg < 30)) {
    if (dial) dose('sglt2', 'Sin indicación de iSGLT2 en diálisis: valorar suspender');
    dose('metf', 'Metformina contraindicada con FGe <30 o diálisis: suspender');
  } else if (ok(fg) && fg < 45) dose('metf', 'FGe 30-44: reducir metformina a máx. 1000 mg/día');
  dose('nsaid', 'Evitar AINE en ERC: valorar suspender');
  if (ok(fg) && fg < 60) { dose('sulf', 'Evitar sulfonilureas de vida media larga con FGe <60 (hipoglucemias): valorar alternativa'); dose('gaba', 'Ajustar dosis de gabapentinoide al FGe'); dose('dpp4', 'Ajustar iDPP4 al FGe (alogliptina 12,5 mg si FGe 30-59 y 6,25 mg si <30; sitagliptina 50/25 mg; linagliptina sin ajuste)'); }
  if (has('doac')) {
    const txt = ok(crClG) ? `CrCl (Cockcroft-Gault) ${fx(crClG, 0)} mL/min: revisar dosis del anticoagulante oral directo (edoxaban 30 mg si 15-50; rivaroxaban 15 mg si 15-49; dabigatrán contraindicado <30; apixaban 2,5 mg/12 h si ≥2 de edad ≥80, peso ≤60, Cr ≥1,5)` : 'Revisar dosis del anticoagulante oral directo según aclaramiento (Cockcroft-Gault)';
    if (!ok(crClG) || crClG < 50) sug(txt, { cls: 'doac' });
  }
  return { bullets, plan, adds, fg, K };
}

// ---- Evolución
export function evolution(all, { age, female, months = 24 }) {
  const rows = [], keys = [['fg', 'FGe'], ['cr', 'Cr'], ['u_pcr', 'uPCR'], ['u_acr', 'uACR'], ['k', 'K'], ['hb', 'Hb'], ['hco3', 'HCO3'], ['p', 'P'], ['pth', 'PTH']];
  for (const [k, label] of keys) { const s = series(all, k); if (s.length > 1) rows.push([label, trendText(s, 6)]); }
  let s = series(all, 'fg'), derived = false;
  if (s.length < 3) {
    const cr = series(all, 'cr');
    if (cr.length >= 3 && age) {
      const last = Date.parse(cr[cr.length - 1].date);
      s = cr.map(p => ({ date: p.date, value: ckdepi2021(p.value, age - (last - Date.parse(p.date)) / 3.156e10, !!female), str: fx(ckdepi2021(p.value, age - (last - Date.parse(p.date)) / 3.156e10, !!female), 0) }));
      derived = true;
    }
  }
  let sl = null;
  if (s.length >= 3) {
    const since = new Date(Date.parse(s[s.length - 1].date) - months * 30.44 * 864e5).toISOString().slice(0, 10);
    sl = slope(s.filter(p => p.date >= since)) || slope(s);
    if (sl) rows.push(['Pendiente FGe', `${fx(sl.perYear, 1)} mL/min/año (${sl.n} puntos, ${fx(sl.spanYears, 1)} años${derived ? ', FGe calculado con CKD-EPI 2021' : ''}); FGe a 5 años ≈ ${fx(sl.at5, 0)} mL/min (extrapolación lineal, orientativa${sl.spanYears < 1 ? '; seguimiento <1 año: poco fiable' : ''})`]);
  }
  return { rows, slope: sl, series: s };
}

// ---- Documento: líneas de segmentos {t, s}
const HEAD = /^\s*(an[aá]l[ií]sis|an[aá]l[ií]tica)\b/i;
const BUL = /^\s*(\\?-|•|\*|--?>|\d+[.)])\s*/;

export function buildReview(inp) {
  const { type, prev = '', labText = '', medsText = '' } = inp;
  const warnings = [];
  const sn = { ...sniffPatient(prev), ...sniffPatient(labText) };
  const age = inp.age ?? sn.age, female = inp.female ?? sn.female, kg = inp.kg ?? sn.weight, cm = inp.cm ?? sn.height;
  const cur = current(parseLab(labText), inp.defaultDate);
  if (!cur.date) return { warnings: ['No se reconoció ninguna analítica en el texto pegado.'], cur };
  const meds = parseMeds(medsText);
  const res = analyze({ cur, all: cur.all, type, meds, age, female, kg, dm: inp.dm, session: inp.session });
  if (!age && !DIAL.has(type)) warnings.push('Sin edad: no se calculan FGe a partir de Cr ni reglas por edad (estatinas). Indica edad y sexo.');

  const section = [[T(`Analítica (${fmtDate(cur.date)}):`)], [], ...res.bullets.map(b => [T('- '), ...b])];
  const lines = prev ? prev.split(/\r?\n/) : [];
  const h = lines.findIndex(l => HEAD.test(l));
  let doc;
  if (h < 0) { if (prev) warnings.push('No encontré una sección «Analítica/Análisis» en la revisión previa: la añado al final.'); doc = [...lines.map(l => [T(l)]), ...(prev ? [[]] : []), ...section]; }
  else {
    let e = h + 1;
    while (e < lines.length && (BUL.test(lines[e]) || (!lines[e].trim() && lines.slice(e + 1).find(l => l.trim()) && BUL.test(lines.slice(e + 1).find(l => l.trim()))))) e++;
    doc = [...lines.slice(0, h).map(l => [T(l)]), ...section, ...lines.slice(e).map(l => [T(l)])];
  }
  const medDoc = meds.map(m => [T(m.label), ...(m.notes.length ? [S(' → ' + m.notes.join('; '))] : [])]);
  res.adds.forEach(a => medDoc.push([S('+ ' + a)]));
  const planDoc = res.plan.map(p => [S('- ' + p)]);
  const evo = evolution(cur.all, { age, female });
  return { cur, date: cur.date, doc, section, medDoc, planDoc, evo, ordered: formatOrdered(cur), warnings, patient: { age, female, kg, cm }, res };
}

// ---- Render
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const toPlain = (doc, mark = true) => doc.map(l => l.map(g => (g.s && mark ? ` [[${g.t.trim()}]]` : g.t)).join('').replace(/^ \[\[/, '[[')).join('\n');
export const toHtml = (doc, rich = false) => doc.map(l => l.map(g => (g.s ? (rich ? `<b style="color:#C00000">${esc(g.t)}</b>` : `<span class="sug">${esc(g.t)}</span>`) : esc(g.t))).join('')).join('<br>');
