// Estimadores de riesgo: KFRE, ADPKD (Mayo) y riesgo cardiovascular / estatinas.
import { kfre, pcrToAcr, mayoClass, ellipsoidMl, score2, score2Category, fx } from './calc.js';

const row = (k, v, note = '') => [k, v, note];

export function kfreRows(p) {
  const rows = [], male = p.female ? 0 : 1;
  let acr = p.acr;
  if (!(acr > 0) && p.upcr > 0) { acr = pcrToAcr(p.upcr, p.female ? 1 : 0, p.dm ? 1 : 0, p.htn ? 1 : 0); rows.push(row('uACR estimada desde uPCR', fx(acr, 0) + ' mg/g', 'Sumida 2020 (estimación)')); }
  if (!(acr > 0) || !(p.egfr > 0) || !(p.age > 0)) return [row('Faltan datos', 'edad, sexo, FGe y uACR (o uPCR)')];
  const has8 = [p.alb, p.phos, p.bicarb, p.ca].every(x => x > 0);
  const base = { age: p.age, male, egfr: p.egfr, acr, na: !!p.na };
  const sel = p.vars === 8 ? [8] : p.vars === 4 ? [4] : has8 ? [4, 8] : [4];
  if (p.vars === 8 && !has8) return [...rows, row('Faltan datos', 'KFRE-8 necesita albúmina (g/dL), fósforo (mg/dL), bicarbonato (mEq/L) y calcio corregido (mg/dL)')];
  for (const vars of sel) for (const years of [2, 5]) {
    const r = kfre({ ...base, vars, years, alb: p.alb, phos: p.phos, bicarb: p.bicarb, ca: p.ca }) * 100;
    rows.push(row(`KFRE-${vars} a ${years} años`, fx(r, 1) + ' %', years === 2 ? (r >= 40 ? '≥40 %: preparar TRS / acceso' : r >= 10 ? '10–40 %: atención multidisciplinar ERCA' : '') : r >= 5 ? '≥5 % a 5 años: seguimiento por Nefrología' : ''));
  }
  rows.push(row('Validez', 'ERC G3–G5 sin diálisis ni trasplante. Calibración ' + (p.na ? 'norteamericana' : 'no norteamericana (Europa)') + '.'));
  return rows;
}

export function mayoRows(p) {
  const rows = [];
  let tkv = p.tkv;
  if (!(tkv > 0) && p.l1 > 0) {
    tkv = ellipsoidMl(p.l1, p.w1, p.d1) + (p.l2 > 0 ? ellipsoidMl(p.l2, p.w2, p.d2) : 0);
    rows.push(row('TKV por elipsoide (ambos riñones)', fx(tkv, 0) + ' mL', 'π/6 · L · A · P; menos preciso que volumetría por RM/TC'));
  }
  const ht = p.httkv > 0 ? p.httkv : tkv / (p.height / 100);
  if (!(ht > 0) || !(p.age > 0)) return [row('Faltan datos', 'edad y htTKV (o TKV + talla, o medidas de ambos riñones + talla)')];
  const m = mayoClass(ht, p.age);
  rows.push(row('htTKV', fx(ht, 0) + ' mL/m'), row('Crecimiento anual estimado', fx(m.growth, 1) + ' %/año', 'parte de 150 mL/m al nacer'),
    row('Clase de Mayo', m.cls, m.cls <= '1B' ? 'progresión lenta (1A–1B)' : 'progresión rápida (1C–1E): candidato a valorar tolvaptán si cumple criterios'));
  const slope = p.slope;
  if (Number.isFinite(slope) && slope < 0 && p.egfr > 0) {
    const t15 = (p.egfr - 15) / -slope;
    rows.push(row('FGe proyectada a 5 / 10 años', `${fx(Math.max(0, p.egfr + slope * 5), 0)} / ${fx(Math.max(0, p.egfr + slope * 10), 0)} mL/min`, `pendiente ${fx(slope, 1)} mL/min/año (lineal)`),
      row('Años hasta FGe 15', fx(t15, 1), 'extrapolación lineal; la progresión real no es lineal'));
  } else rows.push(row('Proyección a 5 y 10 años', 'indica una pendiente anual de FGe (observada o de referencia)'));
  rows.push(row('Aplicabilidad', 'ADPKD típica (clase 1: afectación bilateral y difusa). En enfermedad atípica (clase 2) no aplica.'));
  return rows;
}

// Recomendación de estatina (KDIGO 2013 lípidos en ERC) y objetivos ESC 2019.
export function statinAdvice(p) {
  const out = [];
  if (p.dialysis) out.push(p.onStatin ? 'En diálisis y ya con estatina: continuar (KDIGO).' : 'En diálisis: no iniciar estatina de rutina (KDIGO 2A); individualizar si cardiopatía isquémica o LDL muy alto.');
  else if (p.tx) out.push('Trasplantado: estatina recomendada (KDIGO 2B).');
  else if (p.age >= 50) out.push(p.egfr < 60 ? 'Edad ≥50 y FGe <60 sin diálisis: estatina o estatina + ezetimiba (KDIGO 1A).' : 'Edad ≥50 con ERC y FGe ≥60: estatina (KDIGO 1B).');
  else if (p.ascvd || p.dm || p.score >= 10) out.push('Edad 18–49 con ERC y ' + (p.ascvd ? 'ASCVD' : p.dm ? 'diabetes' : 'riesgo elevado') + ': estatina (KDIGO 2A).');
  else out.push('Edad 18–49 con ERC sin ASCVD ni diabetes: estatina solo si riesgo CV a 10 años alto (KDIGO 2A).');
  if (!p.dialysis) {
    const vh = p.ascvd || p.egfr < 30 || (p.dm && p.egfr < 60);
    out.push(vh ? 'Categoría ESC: riesgo CV muy alto (ASCVD, ERC grave o DM con lesión de órgano diana): LDL <55 mg/dL y reducción ≥50 %.' : p.egfr < 60 ? 'Categoría ESC: riesgo CV alto (ERC moderada): LDL <70 mg/dL y reducción ≥50 %.' : '');
    if (p.ldl > 0 && p.onStatin) out.push(`LDL ${p.ldl} con estatina: ${p.ldl > (p.egfr < 30 || p.ascvd ? 55 : 70) ? 'por encima del objetivo ESC: reforzar adherencia, intensificar o añadir ezetimiba.' : 'en objetivo ESC.'}`);
  }
  return out.filter(Boolean);
}

export function cvRows(p) {
  const rows = [];
  let s = NaN;
  if (p.age >= 40 && p.age <= 89 && p.sbp > 0 && p.tc > 0 && p.hdl > 0) {
    s = score2({ region: p.region || 'low', age: p.age, male: p.female ? 0 : 1, smoker: p.smoker ? 1 : 0, sbp: p.sbp, tc: p.tc / 38.67, hdl: p.hdl / 38.67, dm: p.dm ? 1 : 0 });
    rows.push(row(p.age >= 70 ? 'SCORE2-OP (10 años, ECV mortal y no mortal)' : 'SCORE2 (10 años, ECV mortal y no mortal)', fx(s, 1) + ' %', 'categoría: ' + score2Category(s, p.age)),
      row('Aviso', 'SCORE2 no está validado en ERC ni diabetes: en ERC G3b–G5 el riesgo es al menos alto/muy alto por definición (ESC).'));
  } else rows.push(row('SCORE2', 'requiere edad 40–89, TAS, colesterol total y HDL'));
  for (const t of statinAdvice({ ...p, score: s })) rows.push(row('Estatinas', t));
  return rows;
}
