// Tests con datos SINTÉTICOS. Ejecutar: node tests/run.mjs
import assert from 'node:assert/strict';
import * as L from '../assets/js/lab.js';
import * as C from '../assets/js/calc.js';
import * as R from '../assets/js/risk.js';
import { buildReview, toPlain, toHtml, parseInline } from '../assets/js/review.js';
import { parseMeds } from '../assets/js/drugs.js';
import { chartSvg } from '../assets/js/chart.js';
import { anonymize } from '../assets/js/anon.js';
import { buildRequest, askClaude } from '../assets/js/ia.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b} ± ${tol}, obtenido ${a}`);
let n = 0; const pending = [];
const t = (name, fn) => pending.push(Promise.resolve().then(fn).then(() => { n++; console.log('ok', name); }, e => { console.error('FALLO', name); throw e; }));

// ---- Parser
t('parseEntry: valor, flag, unidad y rango', () => {
  const r = L.parseEntry('Srm/Pla-Potasio *5.5 mmol/L (3.5 - 5.1)');
  assert.deepEqual([r.name, r.num, r.flag, r.unit, r.ref], ['Srm/Pla-Potasio', 5.5, true, 'mmol/L', '3.5 - 5.1']);
});
t('parseEntry: nombre con dígitos y rango abierto', () => {
  const r = L.parseEntry('Srm-Vitamina B12 357 pg/mL (211 - 911)');
  assert.equal(r.name, 'Srm-Vitamina B12'); assert.equal(r.num, 357);
  assert.equal(L.parseEntry('Srm/Pla-Colesterol total 129 mg/dL ( - 200)').num, 129);
});
t('parseEntry: texto y descartes', () => {
  assert.equal(L.parseEntry('Uri(mic)-Proteínas Negativo g/L').value, 'Negativo');
  assert.equal(L.parseEntry('Uri(mic)-Glucosa *1+').valueStr, '1+');
  assert.equal(L.parseEntry('San-HbA1c (NGSP) No procede %'), null);
  assert.equal(L.parseEntry('Srm/Pla-Creatinina Pendiente mg/dL (provisional)'), null);
});

const LAB1 = '10/09/2026 09:00:00: San-Hemoglobina *9.6 g/dL (13.7 - 16.4), San-Volumen corpuscular medio (VCM) 88 fL (83 - 97), Srm/Pla-Creatinina *2.80 mg/dL (0.7 - 1.3), Filtrado glomerular (CKD-EPI) *24 mL/min/1.73m2 (45 - ), Srm/Pla-Potasio *5.8 mmol/L (3.5 - 5.1), Srm/Pla-Sodio 139 mmol/L, Srm/Pla-Cloro 106 mmol/L, Srm/Pla-Fosfato *5.2 mg/dL, Srm/Pla-Calcio total 8.9 mg/dL, Srm/Pla-Albúmina 3.9 g/dL, Srm-Paratohormona (PTH) intacta *310 pg/mL, Srm-Vitamina D (calcidiol) 14 ng/mL, Srm-Hierro 40 µg/dL, Srm/Pla-Ferritina 80 ng/mL, Srm-Índice de saturación de la transferrina 14 %, Srm/Pla-Colesterol total 210 mg/dL, Colesterol LDL calculado (Friedewald) 130 mg/dL, San-Bicarbonato 17 mmol/L, Uri(mic)-Albúmina/creatinina (mg/g) *420 mg/g crea';
const GRID = 'Descripción\nValor\nFecha\nHora\nSrm/Pla-Creatinina\n*2.40 mg/dL\n05-03-2026 10:00\nSrm/Pla-Creatinina\n*2.55 mg/dL\n02-06-2026 10:00\nFiltrado glomerular (CKD-EPI)\n*30 mL/min/1.73m2\n05-03-2026 10:00\nFiltrado glomerular (CKD-EPI)\n*28 mL/min/1.73m2\n02-06-2026 10:00\nUri(mic)-Albúmina/creatinina (mg/g)\n*200 mg/g crea\n02-06-2026 10:00\nSrm/Pla-Creatinina\t*2.62 mg/dL\t20-08-2026\t09:00';
t('parseLab: línea con fecha y rejilla (líneas y tabulador)', () => {
  assert.ok(L.parseLab(LAB1).length >= 18);
  const g = L.parseLab(GRID);
  assert.equal(g.length, 6);
  assert.equal(g.at(-1).date, '2026-08-20');
});
t('current/series/slope', () => {
  const recs = [...L.parseLab(GRID), ...L.parseLab(LAB1)];
  const cur = L.current(recs);
  assert.equal(cur.date, '2026-09-10');
  assert.equal(cur.vals.get('k').num, 5.8);
  const s = L.series(cur.all, 'cr'); assert.equal(s.length, 4);
  assert.ok(L.slope(s).perYear > 0);
  assert.match(L.formatOrdered(cur), /Bioquímica: .*Creatinina 2\.8 mg\/dL, Filtrado 24 mL\/min/);
});
t('formatOrdered: formato HCIS (datos sintéticos)', () => {
  const lab = '03/11/2026 08:15:30: San-Hematíes *3.85 x10e6/µL (3.9 - 5.1), San-Hemoglobina *11.2 g/dL, San-Hematocrito 36.1, San-Volumen corpuscular medio (VCM) 90.2 fL, San-Índice de distribución eritrocitaria (RDW) *14.9 %, San-Plaquetas 244 x10e3/µL, San-Leucocitos 8.10 x10e3/µL, San-Neutrófilos 5.60 x10e3/µL, San-Linfocitos 1.80 x10e3/µL, San-Monocitos 0.50 x10e3/µL, San-Eosinófilos 0.15 x10e3/µL, San-Basófilos 0.05 x10e3/µL, Srm/Pla-Creatinina *1.95 mg/dL, Filtrado glomerular (CKD-EPI) *27 mL/min/1.73m2, Srm/Pla-Sodio 140 mmol/L, Srm/Pla-Potasio 4.2 mmol/L, Srm/Pla-Magnesio 1.84 mg/dL, Colesterol LDL calculado (Friedewald) 90 mg/dL, Uri(mic)-Creatinina 70.0 mg/dL, Uri(mic)-Densidad 1.018, Uri(mic)-Glucosa Negativo, Uri(mic)-Urobilinógeno Normal, Uri(mic)-Glucosa *1+, Uri(mic)-Proteína/creatinina (mg/g) *150.2 mg/g crea';
  const out = L.formatOrdered(L.current(L.parseLab(lab)));
  assert.equal(out, [
    'Analítica 03/11/2026',
    '- Hemograma: Hematíes 3.850.000/µL, Hb 11.2 g/dL, Hto 36.1%, VCM 90.2 fL, ADE 14.9%',
    '    Leucocitos 8100/µL [N 5600, L 1800, M 500, E 150, B 50, N/L 3.11]',
    '    Plaquetas 244.000/µL',
    '- Iones: Na+ 140 mmol/L, K+ 4.2 mmol/L, Mg2+ 1.8 mg/dL',
    '- Bioquímica: Creatinina 1.95 mg/dL, Filtrado 27 mL/min',
    '',
    'Orina 03/11/2026, 08:15: Densidad 1.018, Glucosa 1+, Urobilinógeno -, Creatinina 70 mg/dL, Prot/Cr 150.2 mg/gCr'].join('\n'));
  assert.match(L.formatOrdered(L.current(L.parseLab(lab)), { extras: true }), /\nOtros: .*LDL 90/);
});
t('sniffPatient', () => assert.deepEqual(L.sniffPatient('Varón de 57 años en HD. Peso: 63 kg Altura: 175 cm'), { female: false, age: 57, weight: 63, height: 175 }));

// ---- Fórmulas
t('CKD-EPI 2021 varón 60 a, Cr 1.0 ≈ 86', () => near(C.ckdepi2021(1.0, 60, false), 86.2, 0.5));
t('Kt/V Daugirdas: urea 85→40, 2.5 h, UF 0.5 L, 63 kg ≈ 0.82', () => near(C.spKtV(85, 40, 2.5, 0.5, 63), 0.82, 0.02));
t('stdKt/V ≈ 2.1 para spKt/V 1.3 3×/sem 4 h', () => { const sp = 1.3, e = C.eKtV(sp, 4); near(C.stdKtV(sp, e, 240, 3), 2.1, 0.1); });
t('Watson varón 50 a 175 cm 70 kg ≈ 40.2 L', () => near(C.watson(50, 175, 70, false), 40.2, 0.1));
t('Mayo: htTKV 600 a los 40 → 1C (3.5 %/año)', () => { const m = C.mayoClass(600, 40); assert.equal(m.cls, '1C'); near(m.growth, 3.53, 0.05); });
t('KFRE: monotonía y rango', () => {
  const b = { age: 60, male: 1, acr: 500 };
  const a = C.kfre({ ...b, egfr: 40, years: 5 }), c = C.kfre({ ...b, egfr: 15, years: 5 });
  assert.ok(c > a && a > 0 && c < 1);
  assert.ok(C.kfre({ ...b, egfr: 20, years: 5 }) > C.kfre({ ...b, egfr: 20, years: 2 }));
  const k8 = C.kfre({ ...b, egfr: 20, years: 5, vars: 8, alb: 4, phos: 3.9, bicarb: 25.5, ca: 9.4 });
  assert.ok(k8 > 0 && k8 < 1);
});
t('SCORE2: plausible y monótono', () => {
  const base = { region: 'low', age: 60, male: 1, smoker: 0, sbp: 140, tc: 5.5, hdl: 1.3, dm: 0 };
  const r = C.score2(base); assert.ok(r > 3 && r < 9, r);
  assert.ok(C.score2({ ...base, smoker: 1 }) > r);
  assert.ok(C.score2({ ...base, age: 75 }) > r);
});
t('Pendiente por calculadoras: calcio corregido y anión gap', () => {
  const ag = C.CALCS.find(g => g.id === 'ab').items.find(i => i.id === 'ag').run({ na: 140, cl: 100, hco3: 14, alb: 4 });
  assert.equal(ag[0][1], '26.0');
});
t('Todas las calculadoras ejecutan con valores de ejemplo sin NaN inesperados', () => {
  for (const g of C.CALCS) for (const it of g.items) {
    const v = {}; for (const i of it.inputs) v[i.id] = i.options ? i.def : (i.def === '' ? 10 : +i.def);
    const rows = it.run(v); assert.ok(Array.isArray(rows) && rows.length > 0, it.id);
  }
});

// ---- Riesgo
t('statinAdvice KDIGO', () => {
  assert.match(R.statinAdvice({ age: 70, egfr: 40, dialysis: false }).join(' '), /1A/);
  assert.match(R.statinAdvice({ age: 70, egfr: 8, dialysis: true }).join(' '), /no iniciar/i);
});
t('mayoRows y kfreRows', () => {
  assert.match(R.mayoRows({ age: 40, httkv: 600, egfr: 60, slope: -3 }).flat().join(' '), /1C/);
  assert.match(R.kfreRows({ age: 60, female: false, egfr: 25, upcr: 800 }).flat().join(' '), /KFRE-4 a 5 años/);
});

// ---- Fármacos
t('parseMeds: línea del HCE, marca → principio activo y posología', () => {
  const [m] = parseMeds('CARVEDILOL 6,25 MG 28 COMPRIMIDOS, 6,25 MG ORAL COMPRIMIDOS 29/07/2026 CRONICA 1 Desayuno,1 Cena');
  assert.equal(m.label, 'carvedilol 6,25 mg en desayuno y 6,25 mg en cena');
  const k = parseMeds('KARVEZIDE 300MG/12,5MG 28 COMP, 28 COMPRIMIDO ORAL 20/02/2009 CRONICA 1 Desayuno')[0];
  assert.equal(k.inn, 'irbesartán/hidroclorotiazida'); assert.ok(k.classes.includes('raas') && k.classes.includes('diur'));
  assert.equal(parseMeds('ALOPURINOL MUNDOGEN 100 MG 100 COMPRIMIDOS, 100 MG ORAL 07/06/2018 CRONICA 2 Desayuno')[0].label, 'alopurinol 200 mg en desayuno');
});
t('parseMeds: fecha de inicio sólo anotada en fármacos que alteran FGe/CrS', () => {
  const [a, b, c] = parseMeds('Forxiga 10 mg 1-0-0 desde 30/06/2026\nTivicay 50 mg 1-0-0\nAdiro 100 mg 1-0-0');
  assert.equal(a.label, 'dapagliflozina 10 mg en desayuno (inicio 30/06/2026)'); assert.ok(a.hemo);
  assert.equal(b.label, 'dolutegravir 50 mg en desayuno'); assert.ok(b.secr);
  assert.equal(c.label, 'ácido acetilsalicílico 100 mg en desayuno');
});
t('parseMeds: pauta expandida por toma', () => {
  assert.equal(parseMeds('Bicarbonato Sodico 1 G 0-2-2')[0].label, 'bicarbonato sódico 2 g en comida y 2 g en cena');
  assert.equal(parseMeds('Enalapril 20 mg 1-0-1')[0].label, 'enalapril 20 mg en desayuno y 20 mg en cena');
  assert.equal(parseMeds('ALOPURINOL NORMON 100 MG 100 COMPRIMIDOS, 100 MG ORAL 07/06/2018 CRONICA 2 Desayuno')[0].label, 'alopurinol 200 mg en desayuno');
  assert.equal(parseMeds('Karvezide 300mg/12,5mg 1-0-0')[0].label.includes('1-0-0'), true); // combinación: se deja como está
  assert.equal(parseMeds('Aranesp 40 mcg cada 15 días')[0].label, 'darbepoetina alfa 40 mcg cada 15 días');
});
t('parseMeds: dosis diaria y desconocidos', () => {
  assert.equal(parseMeds('Bicarbonato Sodico 1 G 0-2-2')[0].dose, '4 g/día');
  assert.equal(parseMeds('HIDROFEROL 0,266 MG 10 CAPSULAS, ORAL 03/02/2021 CRONICA 1 cada 1 mes')[0].dose, '');
  assert.equal(parseMeds('FOOBAR 10 mg')[0].unknown, true);
});

// ---- Negrita y pegado
t('negrita en la analítica = valor destacado; parseInline', () => {
  const r = L.parseEntry('Srm/Pla-Potasio **5.8** mmol/L (3.5 - 5.1)'); assert.equal(r.num, 5.8); assert.equal(r.flag, true); assert.equal(r.bold, true);
  assert.equal(L.parseLab('**14/09/2026 10:30:00:** San-Hemoglobina **13.1 g/dL**, Srm/Pla-Sodio 142 mmol/L')[0].date, '2026-09-14');
  const seg = parseInline('**REVISIÓN** ERCA [[inicio X]]');
  assert.deepEqual(seg.map(g => [g.t, !!g.b, !!g.s]), [['REVISIÓN', true, false], [' ERCA ', false, false], ['inicio X', true, true]]);
});

// ---- Revisión de extremo a extremo (estilo del clínico)
const LABX = '14/09/2026 10:30:00: San-Hemoglobina *13.1 g/dL, San-Linfocitos *1.03 x10e3/µL (1.3 - 3.4), San-Neutrófilos (%) *72.9 % (37.1 - 68.4), San-Bicarbonato *22.4 (23 - 27), Srm/Pla-Creatinina *3.84 mg/dL, Filtrado glomerular (CKD-EPI) *16 mL/min/1.73m2, Srm/Pla-Sodio 142 mmol/L, Srm/Pla-Potasio 4.4 mmol/L, Srm/Pla-Magnesio *1.55 mg/dL (1.6 - 2.6), Calcio ajustado por albúmina 8.7 mg/dL (8.7 - 10.4), Srm/Pla-Fosfato *5.2 mg/dL, Srm-Paratohormona (PTH) intacta *627.2, Srm-Vitamina D (calcidiol) 32 ng/mL, Srm/Pla-Albúmina 4.4 g/dL, Colesterol LDL calculado (Friedewald) 55 mg/dL, Srm/Pla-Urato 6.3 mg/dL, San-HbA1c (NGSP) *6.3 %, Uri(mic)-Proteína/creatinina (mg/g) *1439.7 mg/g crea, Uri(mic)-Albúmina/creatinina (mg/g) *552.8 mg/g crea, Uri(mic)-Eritrocitos Negativo';
const EVOX = 'Srm/Pla-Creatinina\n*3.70 mg/dL\n10-06-2026 10:00\nFiltrado glomerular (CKD-EPI)\n*15 mL/min/1.73m2\n10-06-2026 10:00\nUri(mic)-Proteína/creatinina (mg/g)\n*900 mg/g crea\n10-06-2026 10:00\nUri(mic)-Albúmina/creatinina (mg/g)\n*300 mg/g crea\n10-06-2026 10:00\nSrm-Paratohormona (PTH) intacta\n*410 pg/mL\n10-06-2026 10:00';
const MEDX = 'LOKELMA 5 G 28 SOBRES, 5 G ORAL 01/06/2026 CRONICA 1 Desayuno\nBICARBONATO SODICO 1 G 0-2-2\nMIMPARA 30 MG 28 COMPRIMIDOS, ORAL 15/06/2026 CRONICA 1 Cena\nRENVELA 800 MG 1-1-1\nADENURIC 80 mg 1-0-0';
const PREV = '**REVISIÓN ERCA**\n\nVarón de 72 años con ERC.\n\nAnalítica (04/07/2026):\n\n- Función renal estable.\n- resto aceptable.\n\nPruebas complementarias: ecocardiograma pendiente.\n\nPLAN\n\n--> Revisión en 3 meses.';
t('buildReview ERCA: no necesita analítica de hoy y escribe en el estilo del clínico', () => {
  const r = buildReview({ type: 'erca', prev: PREV, labTexts: [LABX, EVOX, ''], medsText: MEDX, style: 'det' });
  const plain = toPlain(r.doc);
  assert.equal(r.date, '2026-09-14');
  assert.ok(plain.includes('Analítica (14/09/2026):') && !plain.includes('04/07/2026'));
  assert.ok(plain.includes('Pruebas complementarias: ecocardiograma pendiente.') && plain.includes('--> Revisión en 3 meses.'));
  assert.match(plain, /- Función renal estable, CKD_EPI 16 mL\/min con CrS 3\.84 \(15 mL\/min en junio\)\. Proteinuria en ascenso, uPCR 1440 y uACR 553 mg\/g frente a 900\/300 mg\/g en junio, sin hematuria/);
  assert.match(plain, /Control iónico ok \(K 4\.4 \/ Na 142\) con ciclosilicato de sodio y zirconio\./);
  assert.match(plain, /Hipomagnesemia \(1\.55\): \[\[inicio aportes de magnesio\.\]\]/);
  assert.match(plain, /Acidosis metabólica con HCO3 22\.4 pese a bicarbonato 4 g\/día: \[\[aumento aportes\.\]\]/);
  assert.match(plain, /Ca ajustado 8\.7, P 5\.2, VD 32 y PTH 627\.2, en ascenso pese a cinacalcet \(desde 15\/06\/2026\): \[\[refuerzo sevelamer con las comidas y aumento cinacalcet\.\]\]/);
  assert.match(plain, /Anemia: Hb 13\.1, bien controlada sin AEE/);
  assert.match(plain, /Perfil lipídico bien controlado \(LDL 55\)/);
  assert.match(plain, /Ac\. úrico 6\.3 en rango con febuxostat\. Buenos parámetros nutricionales \(albúmina 4\.4\) e inflamatorios\. HbA1c 6\.3 %, buen control\./);
  assert.match(plain, /Linfopenia 1\.03 con neutrofilia relativa\./);
  assert.ok(!/  \[\[/.test(plain), 'sin doble espacio antes de [[');
  const html = toHtml(r.doc, true);
  assert.ok(html.includes('<b style="color:#C00000">') && html.includes('<b>REVISIÓN ERCA</b>'));
  assert.match(toPlain(r.medDoc), /^ciclosilicato de sodio y zirconio 5 g en desayuno$/m);
  assert.match(toPlain(r.medDoc), /cinacalcet 30 mg en cena \[\[→ Aumento cinacalcet/);
  assert.ok(r.evo.charts.length >= 3);
});
t('buildReview: fármaco que altera el FGe, con fecha de inicio entre determinaciones', () => {
  const evo = 'Srm/Pla-Creatinina\n*2.00 mg/dL\n10-06-2026 10:00\nFiltrado glomerular (CKD-EPI)\n*30 mL/min/1.73m2\n10-06-2026 10:00';
  const lab = '14/09/2026 10:30:00: Srm/Pla-Creatinina *2.60 mg/dL, Filtrado glomerular (CKD-EPI) *22 mL/min/1.73m2, Srm/Pla-Potasio 4.8 mmol/L, Srm/Pla-Sodio 140 mmol/L';
  const r = buildReview({ type: 'erca', prev: '', labTexts: [lab, evo, ''], medsText: 'Forxiga 10 mg 1-0-0 desde 30/06/2026\nTivicay 50 mg 1-0-0 desde 01/09/2026', style: 'det' });
  const plain = toPlain(r.doc);
  assert.match(plain, /\[\[Inicio de dapagliflozina el 30\/06\/2026: posible descenso hemodinámico del FGe\.\]\]/);
  assert.match(plain, /\[\[Inicio de dolutegravir el 01\/09\/2026: inhibe la secreción tubular de creatinina/);
  assert.match(plain, /Función renal en descenso/);
});
t('buildReview HD: Kt/V y sin FGe', () => {
  const lab = '10/09/2026 08:00:00: Srm/Pla-Urea *85 mg/dL, Srm-Urea Ktv2 *40 mg/dL, Srm/Pla-Creatinina *7.0 mg/dL, Srm/Pla-Potasio 4.6 mmol/L';
  const r = buildReview({ type: 'hdd', prev: '', labText: lab, medsText: '', session: { t: 150, uf: 0.5, w: 63, n: 6 } });
  const plain = toPlain(r.doc);
  assert.match(plain, /URR 53 %, spKt\/V 0\.82/); assert.match(plain, /No calculo FGe/);
});
t('buildReview: marcas sin diccionario se avisan', () => {
  const r = buildReview({ type: 'erca', prev: '', labText: LABX, medsText: 'FOOBAR 10 mg\nForxiga 10 mg' });
  assert.match(r.warnings.join(' '), /sin equivalente.*FOOBAR/);
});


// ---- Plantilla HCIS («Analíticamente:») con datos sintéticos
const TPL_LAB = '03/11/2026 08:00:00: San-Hemoglobina *10.6 g/dL (12 - 14.7), Srm/Pla-Creatinina *2.60 mg/dL, Filtrado glomerular (CKD-EPI) *24 mL/min/1.73m2, Srm/Pla-Urea *90 mg/dL, Srm/Pla-Urato 6.1 mg/dL (2.3 - 6.6), Srm/Pla-Sodio 139 mmol/L, Srm/Pla-Potasio 4.0 mmol/L, Srm/Pla-Magnesio 2.1 mg/dL (1.6 - 2.6), Colesterol LDL calculado (Friedewald) 85 mg/dL, Srm/Pla-Calcio total 9.4 mg/dL, Calcio ajustado por albúmina 9.3 mg/dL, Srm/Pla-Fosfato 3.8 mg/dL, Srm-Paratohormona (PTH) intacta 60.0 (18.5 - 88), Srm-Vitamina D (calcidiol) 38 ng/mL, Srm/Pla-Albúmina 4.4 g/dL, Srm/Pla-Aspartato aminotransferasa (AST) 20 UI/L ( - 40), Srm/Pla-Alanina aminotransferasa (ALT) 18 ( - 35), Srm/Pla-Proteína C reactiva 2.0 mg/L ( - 5), Srm-Hierro 70 µg/dL, Srm/Pla-Ferritina 200 ng/mL, Srm-Índice de saturación de la transferrina 22 %, Uri(mic)-Proteína/creatinina (mg/g) *310.0 mg/g crea, Uri(mic)-Leucocitos Negativo, Uri(mic)-Nitritos Negativo, Uri(mic)-Eritrocitos Negativo';
const TPL_PREV = 'PRIMERA CONSULTA ERCA\n\nMujer de 80 años con ERC y vasculitis ANCA.\n\nNo se ha realizado analítica desde mayo. Hacemos gasometría en consulta\n-Funcion renal Cr 2.4 mg/dl\n-Hb 11.6g/dl con aranesp\n\nPruebas complementarias: al día.\n\nTRS: explicado.';
t('plantilla ERCA: esqueleto, situación actual, «Analíticamente:» y fin en «Comentario plan»', () => {
  const r = buildReview({ type: 'erca', prev: TPL_PREV, labText: TPL_LAB, medsText: 'ARANESP 10 mg cada 21 días\nNUSTENDI (bempedoico/ezetrol) 1 comp en cena\nRITUXIMAB 500mg --> según UMPI' });
  const p = toPlain(r.doc);
  assert.ok(p.startsWith('Revisión ERCA:\nResumen clínico:\nMujer de 80 años con ERC y vasculitis ANCA.\n\nSituación actual: Clínicamente estable. Sin ingresos desde última revisión.'));
  assert.ok(p.includes('Animo estable manteniendo autonomía.\n-TA en domicilio con cifras aprox. 130/80mmHg con datos en consulta:\n\nAnalíticamente:\n- Función renal con CKD_EPI 24ml/min, con proteinuria 0.3gr/gr [[valoro IECA/ARA-II a dosis baja'));
  assert.match(p, /- Buen control iónico \(K 4 \/ Na 139 mmol\/L\)\. \[\[ácido-base sin datos en esta analítica\]\]\n/);
  assert.match(p, /- Metabolismo Ca\/P con buen control y aceptable manejo de vitD\/HiperPTH secundario\n/);
  assert.match(p, /- Límite control de anemia con aceptable control férrico \[\[ajustamos darbepoetina alfa \(aumento ~25 %\)\.\]\]\n/);
  assert.match(p, /- Perfil lipídico con aceptable control\. Transaminasas en rango\n/);
  assert.match(p, /- Ac\. úrico en rango\. Aceptables parámetros nutricionales e inflamatorios\n/);
  assert.match(p, /- DRAS sin datos de ITU\n/);
  assert.ok(!p.includes('No se ha realizado analítica'));
  // secciones conservadas de la previa y por defecto de la plantilla
  assert.ok(p.includes('Pruebas complementarias: al día.\nVacunación: Al día [se recomienda vacunación de VHB') && p.includes('Otros especialistas:\n- Cardiología…'));
  assert.ok(p.includes('TRS: explicado.\n-- Opciones dialíticas:\n-- Tx renal:') && p.includes('INCLUIDO en LERU / PATHI desde ….'));
  // la revisión termina en «Comentario plan»: la medicación va aparte
  assert.ok(p.trimEnd().endsWith('[[- Ajustamos darbepoetina alfa (aumento ~25 %) por Hb 10.6 en el límite]]'), p.slice(-200));
  assert.ok(!/Medicación (previa|actualizada)/.test(p));
  const m = toPlain(r.medDoc);
  assert.match(m, /^Medicación previa:\ndarbepoetina alfa 10 mg cada 21 días\nácido bempedoico\/ezetimiba 1 comp en cena\nrituximab 500mg --> según UMPI\n\nMedicación actualizada:\n- darbepoetina alfa 10 mg cada 21 días \[\[→ Ajustamos/);
  assert.ok(!/estatina/.test(p + m), 'Nustendi cuenta como hipolipemiante: no se propone estatina');
  assert.match(r.warnings.join(' '), /Sustituí desde la línea/);
});
t('plantilla ERCA: bloque opcional de TRS sólo si no hay información ni es conservador', () => {
  const conTrs = buildReview({ type: 'erca', prev: 'Revisión ERCA:\nTRS: Tx renal de donante vivo en estudio.', labText: TPL_LAB });
  assert.ok(!toPlain(conTrs.doc).includes('-- Opciones dialíticas:'));
  const cons = buildReview({ type: 'erca', prev: 'Revisión ERCA:\nTRS: manejo conservador.', labText: TPL_LAB });
  assert.ok(!toPlain(cons.doc).includes('INCLUIDO en LERU'));
});
t('plantilla ERCA: regenerar sobre la salida anterior no duplica bloques ni avisa', () => {
  const r1 = buildReview({ type: 'erca', prev: TPL_PREV, labText: TPL_LAB, medsText: 'ARANESP 10 mg cada 21 días' });
  const r2 = buildReview({ type: 'erca', prev: toPlain(r1.doc), labText: TPL_LAB, medsText: 'ARANESP 10 mg cada 21 días' });
  const p = toPlain(r2.doc);
  for (const h of ['Revisión ERCA:', 'Resumen clínico:', 'Situación actual:', 'Analíticamente:', 'Comentario plan', '-- Opciones dialíticas:']) assert.equal(p.split(h).length - 1, 1, h);
  assert.deepEqual(r2.warnings, []);
});
t('analítica ordenada: valores anormales en negrita (HTML) y sin marcas en texto plano', () => {
  const r = buildReview({ type: 'erca', prev: '', labText: TPL_LAB });
  const html = toHtml(r.orderedDoc, true);
  assert.ok(html.includes('<b>Hb 10.6 g/dL</b>') && html.includes('<b>Creatinina 2.6 mg/dL</b>') && html.includes('<b>Filtrado 24 mL/min</b>'));
  assert.ok(!html.includes('<b>Na+ 139') && !html.includes('<b>K+ 4 mmol'));
  assert.ok(!/\*|\[\[/.test(toPlain(r.orderedDoc)));
});

// ---- Gráfica, anonimizador e IA
t('chartSvg: línea, puntos y tendencia', () => {
  const ser = [{ date: '2026-01-10', value: 30, str: '30' }, { date: '2026-04-10', value: 26, str: '26' }, { date: '2026-09-10', value: 21, str: '21' }];
  const svg = chartSvg(ser, { label: 'FGe', unit: 'mL/min' });
  assert.ok(svg.startsWith('<svg') && svg.includes('<polyline') && svg.includes('stroke-dasharray') && svg.includes('tendencia −'));
  assert.equal((svg.match(/<circle/g) || []).length, 3);
});
t('anonymize', () => {
  const x = anonymize('Comentario NEF HULP 16/07/2026 12:06 PESO GILSANZ, M GLORIA DEL\nFdN: 17/08/1954 Solicitado por: PESO, M GLORIA DEL Edad: 72 NHC 12345678 12345678Z Cr 2.1 mg/dL');
  assert.ok(!/GILSANZ|1954|12345678/.test(x), x); assert.match(x, /Cr 2\.1 mg\/dL/); assert.match(x, /16\/07\/2026/);
});
t('IA: petición y respuesta (fetch simulado)', async () => {
  const req = buildRequest({ model: 'claude-opus-5-5', type: 'Consulta ERCA', prev: 'p', labs: 'l', meds: 'm', draft: 'd' });
  assert.equal(req.model, 'claude-opus-5-5'); assert.ok(!('temperature' in req) && !('thinking' in req));
  assert.match(req.messages[0].content, /<revision_previa>\np\n<\/revision_previa>/);
  let seen;
  const ok = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '- hola [[x]]' }] }) }; };
  assert.equal(await askClaude({ key: 'sk-test', request: req, fetchImpl: ok }), '- hola [[x]]');
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], 'sk-test'); assert.equal(seen.init.headers['anthropic-version'], '2023-06-01'); assert.equal(seen.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  await assert.rejects(askClaude({ key: 'k', request: req, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }) }), /invalid x-api-key/);
  await assert.rejects(askClaude({ key: 'k', request: req, fetchImpl: async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) }) }), /declinó/);
  await assert.rejects(askClaude({ key: 'k', request: req, fetchImpl: async () => ({ ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [] }) }) }), /vacía/);
});

await Promise.all(pending);
console.log(`\n${n} tests OK`);
