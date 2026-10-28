// Tests con datos SINTÉTICOS. Ejecutar: node tests/run.mjs
import assert from 'node:assert/strict';
import * as L from '../assets/js/lab.js';
import * as C from '../assets/js/calc.js';
import * as R from '../assets/js/risk.js';
import { buildReview, parseMeds, toPlain, toHtml } from '../assets/js/review.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b} ± ${tol}, obtenido ${a}`);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

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
  assert.match(L.formatOrdered(cur), /Función renal: Cr 2\.80\*, FGe 24\* mL\/min/);
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

// ---- Revisión de extremo a extremo
const PREV = 'REVISIÓN ERCA\n\nResumen: Varón de 72 años con ERC.\n\nClínicamente bien.\n\nAnalítica (04/07/2026):\n\n- Función renal estable.\n- resto aceptable.\n\nPruebas complementarias: ecocardiograma pendiente.\n\nPLAN\n\n--> Revisión en 3 meses.';
t('buildReview ERCA: sustituye sólo la analítica y propone en rojo', () => {
  const r = buildReview({ type: 'erca', prev: PREV, labText: LAB1 + '\n' + GRID, medsText: 'Enalapril 20 mg 1-0-1; Metformina 850 mg 1-0-1; Aranesp 40 mcg cada 15 días' });
  assert.deepEqual(r.warnings, []);
  const plain = toPlain(r.doc);
  assert.ok(plain.includes('Analítica (10/09/2026):'));
  assert.ok(!plain.includes('04/07/2026'));
  assert.ok(plain.includes('Pruebas complementarias: ecocardiograma pendiente.') && plain.includes('--> Revisión en 3 meses.') && plain.includes('Clínicamente bien.'));
  assert.match(plain, /\[\[--> Hiperpotasemia/);
  assert.match(plain, /\[\[--> Acidosis metabólica/);
  const meds = toPlain(r.medDoc);
  assert.match(meds, /Enalapril 20 mg 1-0-1 \[\[→ .*Hiperpotasemia/);
  assert.match(meds, /Metformina.*\[\[→ Metformina contraindicada|FGe 30-44|contraindicada/);
  assert.match(meds, /\+ .*estatina|\+ .*hierro/i);
  assert.ok(toHtml(r.doc, true).includes('color:#C00000'));
  assert.ok(r.evo.rows.length > 0);
});
t('buildReview HD: Kt/V y sin FGe', () => {
  const lab = '10/09/2026 08:00:00: Srm/Pla-Urea *85 mg/dL, Srm-Urea Ktv2 *40 mg/dL, Srm/Pla-Creatinina *7.0 mg/dL, Srm/Pla-Potasio 4.6 mmol/L';
  const r = buildReview({ type: 'hdd', prev: '', labText: lab, medsText: '', session: { t: 150, uf: 0.5, w: 63, n: 6 } });
  const plain = toPlain(r.doc);
  assert.match(plain, /URR 53 %, spKt\/V 0\.82/); assert.match(plain, /No calculo FGe/);
});
t('parseMeds: línea del HCE', () => {
  const [m] = parseMeds('CARVEDILOL 6,25 MG 28 COMPRIMIDOS, 6,25 MG ORAL COMPRIMIDOS 29/07/2026 CRONICA 1 Desayuno,1 Cena');
  assert.equal(m.label, 'CARVEDILOL 6,25 MG — 1 Desayuno,1 Cena');
});

console.log(`\n${n} tests OK`);
