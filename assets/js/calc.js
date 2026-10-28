// Fórmulas (puras, exportadas para test) y catálogo de calculadoras (datos que genera la interfaz).
// Unidades convencionales: mg/dL, mmol/L o mEq/L, mmHg, kg, cm.

export const fx = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ln = Math.log, ex = Math.exp;

// ---------- Filtrado glomerular y antropometría
export const ckdepi2021 = (cr, age, female) => {
  const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302;
  return 142 * Math.min(cr / k, 1) ** a * Math.max(cr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
};
export const ckdepiCys = (cys, age, female) =>
  133 * Math.min(cys / 0.8, 1) ** -0.499 * Math.max(cys / 0.8, 1) ** -1.328 * 0.996 ** age * (female ? 0.932 : 1);
export const ckdepiCrCys = (cr, cys, age, female) => {
  const k = female ? 0.7 : 0.9, a = female ? -0.219 : -0.144;
  return 135 * Math.min(cr / k, 1) ** a * Math.max(cr / k, 1) ** -0.544 * Math.min(cys / 0.8, 1) ** -0.323
    * Math.max(cys / 0.8, 1) ** -0.778 * 0.9961 ** age * (female ? 0.963 : 1);
};
export const ekfc = (cr, age, female) => {
  const x = cr / (female ? 0.7 : 0.9);
  return (107.3 / (x < 1 ? x ** 0.322 : x ** 1.132)) * (age > 40 ? 0.99 ** (age - 40) : 1);
};
export const cockcroftGault = (cr, age, kg, female) => ((140 - age) * kg) / (72 * cr) * (female ? 0.85 : 1);
export const watson = (age, cm, kg, female) => (female ? -2.097 + 0.1069 * cm + 0.2466 * kg : 2.447 - 0.09156 * age + 0.1074 * cm + 0.3362 * kg);
export const humeWeyers = (cm, kg, female) => (female ? 0.34454 * cm + 0.183809 * kg - 35.270121 : 0.194786 * cm + 0.296785 * kg - 14.012934);
export const bsaMosteller = (cm, kg) => Math.sqrt((cm * kg) / 3600);
export const bsaDuBois = (cm, kg) => 0.007184 * cm ** 0.725 * kg ** 0.425;

// ---------- Hemodiálisis
export const spKtV = (pre, post, tH, ufL, kg) => -ln(post / pre - 0.008 * tH) + (4 - 3.5 * (post / pre)) * ufL / kg; // Daugirdas 2ª generación
export const eKtV = (sp, tH, access = 'fav') => (access === 'fav' ? sp - 0.6 * (sp / tH) + 0.03 : sp - 0.47 * (sp / tH) + 0.02);
export const stdKtV = (sp, ekv, tMin, nWeek) => { // Leypoldt
  const f = 1 - ex(-ekv);
  return (10080 * f / tMin) / (f / sp + 10080 / (nWeek * tMin) - 1);
};
export const nPCR = (preUreaMgDl, sp) => (preUreaMgDl / 2.14) / (36.3 + 5.48 * sp + 53.5 / sp) + 0.168; // Depner/Daugirdas (KDOQI 2006), 3 sesiones/semana

// ---------- Riesgo: KFRE (Tangri 2016; supervivencia basal por región) y conversión uPCR->uACR (Sumida 2020)
const KFRE_S0 = {
  4: { na: { 2: 0.975, 5: 0.924 }, other: { 2: 0.9832, 5: 0.9365 } },
  8: { na: { 2: 0.978, 5: 0.9301 }, other: { 2: 0.9827, 5: 0.9245 } },
};
export function kfre({ age, male, egfr, acr, alb, phos, bicarb, ca, years = 5, vars = 4, na = false }) {
  let s = -0.2201 * (age / 10 - 7.036) + 0.2467 * (male - 0.5642) - 0.5567 * (egfr / 5 - 7.222) + 0.451 * (ln(acr) - 5.137);
  if (vars === 8) {
    s = -0.1992 * (age / 10 - 7.036) + 0.1602 * (male - 0.5642) - 0.4919 * (egfr / 5 - 7.222) + 0.3364 * (ln(acr) - 5.137)
      - 0.3441 * (alb - 3.997) + 0.2604 * (phos - 3.916) - 0.07354 * (bicarb - 25.57) - 0.2228 * (ca - 9.355);
  }
  return 1 - KFRE_S0[vars][na ? 'na' : 'other'][years] ** ex(s);
}
export const pcrToAcr = (pcr, female, dm, htn) => ex(5.2659 + 0.2934 * ln(Math.min(pcr / 50, 1)) + 1.5643 * ln(Math.max(Math.min(pcr / 500, 1), 0.1))
  + 1.1109 * ln(Math.max(pcr / 500, 1)) - 0.0773 * female + 0.0797 * dm + 0.1265 * htn);

// ---------- Riesgo: ADPKD, clasificación de imagen de Mayo (clase 1, típica)
export const ellipsoidMl = (l, w, d) => (Math.PI / 6) * l * w * d;
export function mayoClass(httkv, age) {
  const g = (ex(ln(httkv / 150) / age) - 1) * 100; // crecimiento anual asumiendo 150 mL/m al nacer
  const cls = g < 1.5 ? '1A' : g < 3 ? '1B' : g < 4.5 ? '1C' : g < 6 ? '1D' : '1E';
  return { growth: g, cls };
}

// ---------- Riesgo: SCORE2 / SCORE2-OP (ESC 2021). Colesterol en mmol/L. Calibración por región.
const SC_SCALE = {
  low: { m: [-0.5699, 0.7476], f: [-0.738, 0.7019], mo: [-0.34, 1.19], fo: [-0.52, 1.01] },
  moderate: { m: [-0.1565, 0.8009], f: [-0.3143, 0.7701], mo: [0.01, 1.25], fo: [-0.1, 1.1] },
  high: { m: [0.3207, 0.936], f: [0.571, 0.9369], mo: [0.08, 1.15], fo: [0.38, 1.09] },
  veryhigh: { m: [0.5836, 0.8294], f: [0.9412, 0.8329], mo: [0.05, 0.7], fo: [0.38, 0.69] },
};
export function score2({ region = 'low', age, male, smoker, sbp, tc, hdl, dm }) {
  if (age < 40 || age > 89) return NaN;
  const old = age >= 70, sx = male ? (old ? 'mo' : 'm') : old ? 'fo' : 'f';
  const [s1, s2] = SC_SCALE[region][sx];
  let p;
  if (!old) {
    const a = (age - 60) / 5, s = (sbp - 120) / 20, c = tc - 6, h = (hdl - 1.3) / 0.5;
    const x = male
      ? 0.3742 * a + 0.6012 * smoker + 0.2777 * s + 0.6457 * dm + 0.1458 * c - 0.2698 * h - 0.0755 * a * smoker - 0.0255 * a * s - 0.0281 * a * c + 0.0426 * a * h - 0.0983 * a * dm
      : 0.4648 * a + 0.7744 * smoker + 0.3131 * s + 0.8096 * dm + 0.1002 * c - 0.2606 * h - 0.1088 * a * smoker - 0.0277 * a * s - 0.0226 * a * c + 0.0613 * a * h - 0.1272 * a * dm;
    p = 1 - (male ? 0.9605 : 0.9776) ** ex(x);
  } else {
    const a = age - 73, s = sbp - 150, c = tc - 6, h = hdl - 1.4;
    const x = male
      ? 0.0634 * a + 0.4245 * dm + 0.3524 * smoker + 0.0094 * s + 0.085 * c - 0.3564 * h - 0.0174 * a * dm - 0.0247 * a * smoker - 0.0005 * a * s + 0.0073 * a * c + 0.0091 * a * h - 0.0929
      : 0.0789 * a + 0.601 * dm + 0.4921 * smoker + 0.0102 * s + 0.0605 * c - 0.304 * h - 0.0107 * a * dm - 0.0255 * a * smoker - 0.0004 * a * s - 0.0009 * a * c + 0.0154 * a * h - 0.229;
    p = 1 - (male ? 0.7576 : 0.8082) ** ex(x);
  }
  return (1 - ex(-ex(s1 + s2 * ln(-ln(1 - p))))) * 100;
}
export const score2Category = (risk, age) => {
  const [lo, hi] = age < 50 ? [2.5, 7.5] : age < 70 ? [5, 10] : [7.5, 15];
  return risk < lo ? 'bajo-moderado' : risk < hi ? 'alto' : 'muy alto';
};

// ---------- Utilidades de la interfaz de calculadoras
export const n = (id, label, unit, def, from) => ({ id, label, unit, def, from });
export const sel = (id, label, options, def) => ({ id, label, options, def: def ?? options[0][0], type: 'select' });
const SEX = sel('sex', 'Sexo', [['m', 'Varón'], ['f', 'Mujer']]);
const row = (k, v, note = '') => [k, v, note];
const flagRange = (v, lo, hi, loTxt, hiTxt, ok) => (v < lo ? loTxt : v > hi ? hiTxt : ok);

export const CALCS = [
  {
    id: 'hema', title: 'Hematología', items: [
      {
        id: 'micro', title: 'Diagnóstico diferencial de microcitosis', inputs: [n('hb', 'Hb', 'g/dL', '', 'hb'), n('rbc', 'Hematíes', '×10⁶/µL', '', 'rbc'), n('mcv', 'VCM', 'fL', '', 'vcm'), n('mch', 'HCM', 'pg', '', 'hcm'), n('rdw', 'RDW', '%', '', 'rdw')],
        run: v => {
          const T = 'sugiere talasemia', F = 'sugiere ferropenia';
          const idx = [
            ['Mentzer (VCM/hematíes)', v.mcv / v.rbc, 13, x => x < 13],
            ['Shine & Lal (VCM²·HCM/100)', (v.mcv ** 2 * v.mch) / 100, 1530, x => x < 1530],
            ['England & Fraser (VCM − hematíes − 5·Hb − 3,4)', v.mcv - v.rbc - 5 * v.hb - 3.4, 0, x => x < 0],
            ['Srivastava (HCM/hematíes)', v.mch / v.rbc, 3.8, x => x < 3.8],
            ['Green & King (VCM²·RDW/(100·Hb))', (v.mcv ** 2 * v.rdw) / (100 * v.hb), 65, x => x < 65],
            ['Ehsani (VCM − 10·hematíes)', v.mcv - 10 * v.rbc, 15, x => x < 15],
            ['RDW index (VCM·RDW/hematíes)', (v.mcv * v.rdw) / v.rbc, 220, x => x < 220],
          ].map(([k, x, cut, isT]) => row(k, fx(x, 1), isT(x) ? T : F));
          const t = idx.filter(r => r[2] === T).length;
          return [...idx, row('Resumen', `${t}/${idx.length} índices a favor de talasemia`, t >= 5 ? 'valorar electroforesis de Hb' : t <= 2 ? 'valorar ferropenia (perfil férrico)' : 'discordantes: perfil férrico y electroforesis')];
        },
      },
      {
        id: 'iron', title: 'Deficiencia de hierro y anemia', inputs: [SEX, sel('ctx', 'Situación', [['nd', 'ERC no en diálisis'], ['hd', 'Hemodiálisis / DP'], ['no', 'Sin ERC']]), n('hb', 'Hb', 'g/dL', '', 'hb'), n('fe', 'Hierro', 'µg/dL', '', 'fe'), n('tibc', 'CTFH (opcional)', 'µg/dL', '', 'tibc'), n('trf', 'Transferrina (si no hay CTFH)', 'mg/dL', '', 'trf'), n('ferr', 'Ferritina', 'ng/mL', '', 'ferr'), n('tsat', 'IST directo (opcional)', '%', '', 'tsat'), n('kg', 'Peso (Ganzoni)', 'kg', ''), n('target', 'Hb objetivo (Ganzoni)', 'g/dL', 13)],
        run: v => {
          const tibc = Number.isFinite(v.tibc) ? v.tibc : v.trf * 1.25;
          const ist = Number.isFinite(v.tsat) ? v.tsat : (v.fe / tibc) * 100;
          const thr = v.sex === 'f' ? 12 : 13, rows = [];
          rows.push(row('Anemia (OMS)', v.hb < thr ? 'sí' : 'no', `Hb < ${thr} g/dL`));
          rows.push(row('IST', fx(ist, 0) + ' %', Number.isFinite(v.tibc) || Number.isFinite(v.trf) ? 'Fe/CTFH (CTFH = transferrina × 1,25)' : ''));
          let d;
          if (v.ctx === 'hd') d = v.ferr > 800 ? 'ferritina >800: sobrecarga probable, no hierro IV' : ist < 20 && v.ferr < 200 ? 'ferropenia absoluta/funcional: hierro IV' : ist < 20 || v.ferr < 200 ? 'déficit funcional probable (KDOQI: ferritina <200 o IST <20 %): valorar hierro IV' : 'reservas adecuadas';
          else if (v.ctx === 'nd') d = ist <= 20 && v.ferr <= 100 ? 'ferropenia (ERC: IST ≤20 % y ferritina ≤100): hierro oral o IV' : ist <= 30 && v.ferr <= 500 ? 'prueba terapéutica de hierro si Hb baja o se quiere evitar AEE (KDIGO)' : 'reservas adecuadas';
          else d = v.ferr < 30 || ist < 16 ? 'ferropenia absoluta' : v.ferr < 100 && ist < 20 ? 'posible ferropenia con inflamación' : 'sin ferropenia evidente';
          rows.push(row('Interpretación', d));
          if (v.kg) rows.push(row('Déficit de hierro (Ganzoni)', fx(v.kg * (v.target - v.hb) * 2.4 + 500, 0) + ' mg', 'peso × (Hb objetivo − Hb) × 2,4 + 500 mg de depósito'));
          return rows;
        },
      },
      {
        id: 'retic', title: 'Índice de reticulocitos', inputs: [n('ret', 'Reticulocitos', '%', '', 'retic'), n('hto', 'Hematocrito', '%', '', 'hto'), n('rbc', 'Hematíes', '×10⁶/µL', '', 'rbc')],
        run: v => {
          const corr = (v.ret * v.hto) / 45, m = v.hto >= 40 ? 1 : v.hto >= 30 ? 1.5 : v.hto >= 20 ? 2 : 2.5;
          const rpi = corr / m;
          return [row('Reticulocitos corregidos', fx(corr, 2) + ' %', 'ret% × Hto/45'), row('Factor de maduración', fx(m, 1)), row('Índice de producción (IPR)', fx(rpi, 2), rpi < 2 ? 'respuesta medular inadecuada (hipoproliferativa)' : 'respuesta medular adecuada'),
            ...(v.rbc ? [row('Reticulocitos absolutos', fx(v.ret * v.rbc * 10, 0) + ' ×10⁹/L', '')] : [])];
        },
      },
      {
        id: 'eri', title: 'Índice de resistencia a eritropoyetina (ERI)', inputs: [sel('esa', 'Fármaco', [['epo', 'Epoetina (UI/semana)'], ['darbe', 'Darbepoetina (µg/semana, ×200)']]), n('dose', 'Dosis semanal', '', ''), n('kg', 'Peso', 'kg', ''), n('hb', 'Hb', 'g/dL', '', 'hb')],
        run: v => {
          const ui = v.esa === 'darbe' ? v.dose * 200 : v.dose, e = ui / v.kg / v.hb;
          return [row('Dosis equivalente', fx(ui, 0) + ' UI/semana'), row('ERI', fx(e, 1) + ' UI/kg/semana/(g/dL)', e > 15 ? 'hiporrespuesta marcada' : e > 10 ? 'hiporrespuesta probable' : 'dentro de lo esperable'), row('Nota', 'Descartar ferropenia, inflamación, hiperparatiroidismo, infección, diálisis insuficiente, déficit de B12/fólico y fármacos (IECA/ARA-II).')];
        },
      },
    ],
  },
  {
    id: 'hd', title: 'Hemodiálisis y diálisis peritoneal', items: [
      {
        id: 'ktv', title: 'Kt/V (single-pool, equilibrado y estándar)', inputs: [n('pre', 'Urea pre', 'mg/dL', '', 'urea'), n('post', 'Urea post', 'mg/dL', '', 'urea_post'), n('t', 'Duración sesión', 'min', 240), n('uf', 'UF', 'L', 2), n('w', 'Peso post', 'kg', ''), n('ns', 'Sesiones/semana', '', 3), sel('acc', 'Acceso', [['fav', 'FAV/injerto'], ['cvc', 'Catéter']])],
        run: v => {
          const sp = spKtV(v.pre, v.post, v.t / 60, v.uf, v.w), e = eKtV(sp, v.t / 60, v.acc), s = stdKtV(sp, e, v.t, v.ns);
          return [row('URR', fx((1 - v.post / v.pre) * 100, 0) + ' %', 'objetivo ≥65 %'), row('spKt/V (Daugirdas 2ª gen.)', fx(sp, 2), 'objetivo ≥1,2 (diana 1,4) en 3 sesiones/semana'), row('eKt/V (equilibrado)', fx(e, 2), 'ajuste por rebote'), row('stdKt/V (Leypoldt)', fx(s, 2), 'objetivo ≥2,1/semana; útil en pautas ≠ 3/semana')];
        },
      },
      {
        id: 'kru', title: 'Aclaramiento residual de urea (Kru)', inputs: [n('uu', 'Urea en orina', 'mg/dL', ''), n('vu', 'Volumen de orina', 'mL', ''), n('h', 'Tiempo de recogida', 'h', 24), n('su', 'Urea sérica media interdiálisis', 'mg/dL', ''), n('V', 'Agua corporal total (opc.)', 'L', '')],
        run: v => {
          const k = (v.uu * v.vu) / (v.su * v.h * 60);
          return [row('Kru', fx(k, 2) + ' mL/min', k >= 2 ? 'FRR relevante (≥2): puede computarse en la dosis' : 'FRR escasa'), ...(v.V ? [row('Kt/V renal semanal', fx((k * 10080) / (v.V * 1000), 2), 'Kru × 10080 / V')] : [])];
        },
      },
      {
        id: 'npcr', title: 'nPCR (tasa de catabolismo proteico normalizado)', inputs: [n('pre', 'Urea pre', 'mg/dL', '', 'urea'), n('sp', 'spKt/V de la sesión', '', '')],
        run: v => [row('nPCR', fx(nPCR(v.pre, v.sp), 2) + ' g/kg/día', 'objetivo ≥0,8–1,2'), row('Nota', 'Ecuación de Depner/Daugirdas (KDOQI 2006) para 3 sesiones/semana; en pautas más frecuentes subestima/sobrestima: usar cinética completa.')],
      },
      {
        id: 'recirc', title: 'Recirculación del acceso vascular', inputs: [n('S', 'Urea sistémica (periférica)', 'mg/dL', ''), n('A', 'Urea línea arterial', 'mg/dL', ''), n('V', 'Urea línea venosa', 'mg/dL', '')],
        run: v => { const r = ((v.S - v.A) / (v.S - v.V)) * 100; return [row('Recirculación', fx(r, 1) + ' %', r > 10 ? 'elevada (>10 %): revisar acceso (estenosis), agujas, Qb' : r > 5 ? 'límite' : 'normal (<5 %)'), row('Técnica', 'Tres tomas de urea con Qb habitual y UF a 0 los primeros minutos; A tras 2 min en línea arterial.')]; },
      },
      {
        id: 'dur', title: 'Duración del tratamiento de hemodiálisis', inputs: [n('target', 'spKt/V objetivo', '', 1.4), n('V', 'Agua corporal total', 'L', ''), n('K', 'Aclaramiento efectivo del dializador', 'mL/min', ''), n('told', 'Última sesión: duración', 'min', ''), n('kold', 'Última sesión: spKt/V', '', '')],
        run: v => {
          const rows = [];
          if (v.V && v.K) rows.push(row('Tiempo necesario (K, V)', fx((v.target * v.V * 1000) / v.K, 0) + ' min', 't = Kt/V · V / K (sin UF ni rebote)'));
          if (v.told && v.kold) rows.push(row('Tiempo según última sesión', fx((v.told * v.target) / v.kold, 0) + ' min', 'proporcional; aproximación'));
          return rows;
        },
      },
      {
        id: 'dp', title: 'Aclaramiento en diálisis peritoneal (Kt/V y CrCl semanales)', inputs: [n('vd', 'Volumen drenado 24 h', 'L', ''), n('du', 'Urea en dializado', 'mg/dL', ''), n('dc', 'Creatinina en dializado', 'mg/dL', ''), n('su', 'Urea sérica', 'mg/dL', '', 'urea'), n('sc', 'Creatinina sérica', 'mg/dL', '', 'cr'), n('vu', 'Diuresis 24 h', 'mL', 0), n('uu', 'Urea en orina', 'mg/dL', 0), n('uc', 'Creatinina en orina', 'mg/dL', 0), n('V', 'Agua corporal total', 'L', ''), n('bsa', 'Superficie corporal', 'm²', '')],
        run: v => {
          const kp = (v.du / v.su) * v.vd * 7 / v.V, cp = ((v.dc / v.sc) * v.vd * 7 * 1.73) / v.bsa;
          const cu = (v.uu * v.vu) / (v.su * 1440), cc = (v.uc * v.vu) / (v.sc * 1440), frr = (cu + cc) / 2;
          const kr = (cu * 10080) / (v.V * 1000), cr = (frr * 10.08 * 1.73) / v.bsa;
          return [row('Kt/V peritoneal semanal', fx(kp, 2)), row('Kt/V renal semanal', fx(kr, 2), 'con aclaramiento de urea'), row('Kt/V total semanal', fx(kp + kr, 2), 'objetivo ≥1,7'), row('Aclaramiento renal de urea / creatinina', `${fx(cu, 1)} / ${fx(cc, 1)} mL/min`), row('FRR (media)', fx(frr, 1) + ' mL/min'), row('CrCl peritoneal', fx(cp, 1) + ' L/sem/1,73 m²'), row('CrCl renal', fx(cr, 1) + ' L/sem/1,73 m²', 'FRR media × 10,08 × 1,73/SC'), row('CrCl total', fx(cp + cr, 1) + ' L/sem/1,73 m²')];
        },
      },
      {
        id: 'tbw', title: 'Agua corporal total y superficie corporal', inputs: [SEX, n('age', 'Edad', 'años', ''), n('cm', 'Talla', 'cm', ''), n('kg', 'Peso', 'kg', '')],
        run: v => { const f = v.sex === 'f'; return [row('Watson', fx(watson(v.age, v.cm, v.kg, f), 1) + ' L'), row('Hume–Weyers', fx(humeWeyers(v.cm, v.kg, f), 1) + ' L'), row('SC (Mosteller)', fx(bsaMosteller(v.cm, v.kg), 2) + ' m²'), row('SC (DuBois)', fx(bsaDuBois(v.cm, v.kg), 2) + ' m²'), row('IMC', fx(v.kg / (v.cm / 100) ** 2, 1))]; },
      },
    ],
  },
  {
    id: 'nefro', title: 'Nefroclínica', items: [
      {
        id: 'urcr', title: 'Relación urea/creatinina', inputs: [n('u', 'Urea', 'mg/dL', '', 'urea'), n('c', 'Creatinina', 'mg/dL', '', 'cr')],
        run: v => [row('Urea/Cr', fx(v.u / v.c, 0), v.u / v.c > 100 ? '>100: sugiere origen prerrenal / catabolismo / hemorragia digestiva' : 'sin sugerir prerrenal'), row('BUN/Cr', fx(v.u / 2.14 / v.c, 1), v.u / 2.14 / v.c > 20 ? '>20: patrón prerrenal' : '≤20')],
      },
      {
        id: 'fena', title: 'Excreción fraccional de sodio y de urea', inputs: [n('una', 'Na orina', 'mEq/L', '', 'u_na'), n('pna', 'Na plasma', 'mEq/L', '', 'na'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('pcr', 'Cr plasma', 'mg/dL', '', 'cr'), n('uu', 'Urea orina (FEUrea)', 'mg/dL', ''), n('pu', 'Urea plasma', 'mg/dL', '', 'urea')],
        run: v => { const fe = (v.una * v.pcr) / (v.pna * v.ucr) * 100, rows = [row('FENa', fx(fe, 2) + ' %', fe < 1 ? '<1 %: prerrenal (no fiable con diuréticos, ERC avanzada o sal)' : fe > 2 ? '>2 %: lesión tubular / pérdida renal de sodio' : 'indeterminado')]; if (v.uu && v.pu) { const fu = (v.uu * v.pcr) / (v.pu * v.ucr) * 100; rows.push(row('FEUrea', fx(fu, 1) + ' %', fu < 35 ? '<35 %: prerrenal (válida con diuréticos)' : fu > 50 ? '>50 %: lesión tubular' : 'indeterminado')); } return rows; },
      },
      {
        id: 'fek', title: 'Excreción de potasio: FEK, TTKG y K/Cr (hipo/hiperpotasemia)', inputs: [n('uk', 'K orina', 'mEq/L', '', 'u_k'), n('pk', 'K plasma', 'mEq/L', '', 'k'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('pcr', 'Cr plasma', 'mg/dL', '', 'cr'), n('uosm', 'Osm orina (opc.)', 'mOsm/kg', ''), n('posm', 'Osm plasma (opc.)', 'mOsm/kg', '')],
        run: v => {
          const fek = (v.uk * v.pcr) / (v.pk * v.ucr) * 100, kcr = v.uk / (v.ucr / 100); // mEq por g de creatinina
          const rows = [row('FEK', fx(fek, 1) + ' %', v.pk < 3.5 ? (fek > 6.5 ? 'hipoK con FEK >6,5 %: pérdida renal' : 'hipoK con FEK ≤6,5 %: pérdida extrarrenal') : v.pk > 5 ? (fek < 6 ? 'hiperK con FEK baja: excreción renal insuficiente' : 'hiperK con excreción renal conservada') : ''), row('K/Cr urinario', fx(kcr, 1) + ' mEq/g', v.pk < 3.5 ? (kcr > 13 ? '>13: pérdida renal' : '≤13: pérdida extrarrenal') : '')];
          if (v.uosm && v.posm) rows.push(row('TTKG', fx((v.uk / v.pk) / (v.uosm / v.posm), 1), v.pk < 3.5 ? (((v.uk / v.pk) / (v.uosm / v.posm)) > 4 ? '>4: pérdida renal (exceso mineralocorticoide)' : '<2–3: extrarrenal') : v.pk > 5 ? (((v.uk / v.pk) / (v.uosm / v.posm)) < 7 ? '<7: hipoaldosteronismo/resistencia' : '>7: respuesta aldosterona conservada') : 'válido si Osm orina > plasma y Na orina >25'));
          return rows;
        },
      },
      {
        id: 'rtf', title: 'Reabsorción tubular de fosfato (RTF) / EFF / TmP/GFR', inputs: [n('up', 'P orina', 'mg/dL', ''), n('pp', 'P plasma', 'mg/dL', '', 'p'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('pcr', 'Cr plasma', 'mg/dL', '', 'cr')],
        run: v => { const eff = (v.up * v.pcr) / (v.pp * v.ucr) * 100, rtf = 100 - eff, t = rtf / 100, tmp = t <= 0.86 ? t * v.pp : (0.3 * t) / (1 - 0.8 * t) * v.pp; return [row('EFF', fx(eff, 1) + ' %'), row('RTF', fx(rtf, 1) + ' %', rtf < 85 ? '<85 %: pérdida renal de fosfato' : '≥85 %'), row('TmP/GFR (Walton–Bijvoet)', fx(tmp, 2) + ' mg/dL', 'normal 2,5–4,2 mg/dL')]; },
      },
      {
        id: 'rtu', title: 'Reabsorción tubular de urato (RTU) / EFU', inputs: [n('uu', 'Urato orina', 'mg/dL', ''), n('pu', 'Urato plasma', 'mg/dL', '', 'urato'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('pcr', 'Cr plasma', 'mg/dL', '', 'cr')],
        run: v => { const e = (v.uu * v.pcr) / (v.pu * v.ucr) * 100; return [row('EFU', fx(e, 1) + ' %', e < 5.5 ? '<5,5 %: infraexcreción (hiperuricemia)' : e > 10 ? '>10 %: pérdida renal / sobreproducción-hiperexcreción' : 'rango habitual (5,5–10 %)'), row('RTU', fx(100 - e, 1) + ' %')]; },
      },
      {
        id: 'caur', title: 'Excreción urinaria de calcio', inputs: [n('uca', 'Ca orina', 'mg/dL', ''), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('ca24', 'Ca orina 24 h (opc.)', 'mg/24h', ''), n('kg', 'Peso (opc.)', 'kg', ''), SEX],
        run: v => { const rows = [], r = v.uca / v.ucr; if (r) rows.push(row('Ca/Cr (muestra aislada)', fx(r, 2) + ' mg/mg', r > 0.2 ? '>0,2: hipercalciuria' : 'normal')); if (v.ca24) { rows.push(row('Calciuria 24 h', fx(v.ca24, 0) + ' mg', v.ca24 > (v.sex === 'f' ? 250 : 300) ? 'hipercalciuria (>250 mujer / >300 varón)' : 'normal')); if (v.kg) rows.push(row('Por peso', fx(v.ca24 / v.kg, 1) + ' mg/kg/día', v.ca24 / v.kg > 4 ? '>4 mg/kg/día: hipercalciuria' : 'normal')); } return rows; },
      },
      {
        id: 'prot', title: 'Proteinuria en muestra simple (uPCR)', inputs: [n('up', 'Proteína orina', 'mg/dL', ''), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr')],
        run: v => { const p = (v.up / v.ucr) * 1000; return [row('uPCR', fx(p, 0) + ' mg/g', p < 150 ? 'A1 (normal-ligera)' : p <= 500 ? 'A2 (moderada)' : 'A3 (grave)'), row('Proteinuria 24 h estimada', fx(p / 1000, 2) + ' g/día', 'aprox. (PCR en mg/mg ≈ g/día)')]; },
      },
      {
        id: 'alb', title: 'Albuminuria en muestra simple (uACR)', inputs: [n('ua', 'Albúmina orina', 'mg/dL', '', 'u_alb'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr')],
        run: v => { const a = (v.ua / v.ucr) * 1000; return [row('uACR', fx(a, 0) + ' mg/g', a < 30 ? 'A1' : a <= 300 ? 'A2' : 'A3')]; },
      },
      {
        id: 'furst', title: 'FURST (ratio de Furst: restricción hídrica en SIADH)', inputs: [n('una', 'Na orina', 'mEq/L', '', 'u_na'), n('uk', 'K orina', 'mEq/L', '', 'u_k'), n('pna', 'Na plasma', 'mEq/L', '', 'na')],
        run: v => { const r = (v.una + v.uk) / v.pna; return [row('(UNa + UK) / PNa', fx(r, 2)), row('Restricción hídrica', r > 1 ? '< 500 mL/día (alta probabilidad de fallo: valorar urea, tolvaptán o suero salino)' : r >= 0.5 ? '500–700 mL/día' : '≈ 1 L/día', 'Furst 2000; aplica a SIADH/hiponatremia hipotónica euvolémica')]; },
      },
      {
        id: 'egfr', title: 'FGe: CKD-EPI 2021, cistatina, EKFC y Cockcroft–Gault', inputs: [SEX, n('age', 'Edad', 'años', ''), n('cr', 'Creatinina', 'mg/dL', '', 'cr'), n('cys', 'Cistatina C (opc.)', 'mg/L', '', 'cysc'), n('kg', 'Peso (C–G)', 'kg', '')],
        run: v => { const f = v.sex === 'f', r = [row('CKD-EPI 2021 (Cr)', fx(ckdepi2021(v.cr, v.age, f), 0) + ' mL/min/1,73 m²'), row('EKFC (Cr)', fx(ekfc(v.cr, v.age, f), 0) + ' mL/min/1,73 m²')]; if (v.cys) { r.push(row('CKD-EPI 2012 (cistatina)', fx(ckdepiCys(v.cys, v.age, f), 0))); r.push(row('CKD-EPI 2021 (Cr-cistatina)', fx(ckdepiCrCys(v.cr, v.cys, v.age, f), 0))); } if (v.kg) r.push(row('Cockcroft–Gault', fx(cockcroftGault(v.cr, v.age, v.kg, f), 0) + ' mL/min', 'para ajuste de dosis de fármacos')); return r; },
      },
      {
        id: 'pcr2acr', title: 'Conversión uPCR → uACR (Sumida 2020)', inputs: [n('pcr', 'uPCR', 'mg/g', '', 'u_pcr'), SEX, sel('dm', 'Diabetes', [['0', 'No'], ['1', 'Sí']]), sel('htn', 'HTA', [['0', 'No'], ['1', 'Sí']])],
        run: v => [row('uACR estimada', fx(pcrToAcr(v.pcr, v.sex === 'f' ? 1 : 0, +v.dm, +v.htn), 0) + ' mg/g', 'estimación; no sustituye a la medición')],
      },
    ],
  },
  {
    id: 'ab', title: 'Bioquímica, electrolitos y ácido-base', items: [
      { id: 'cacor', title: 'Calcio corregido', inputs: [n('ca', 'Ca total', 'mg/dL', '', 'ca'), n('alb', 'Albúmina', 'g/dL', '', 'alb')], run: v => { const c = v.ca + 0.8 * (4 - v.alb); return [row('Ca corregido', fx(c, 2) + ' mg/dL', c < 8.4 ? 'hipocalcemia' : c > 10.2 ? 'hipercalcemia' : 'normal')]; } },
      {
        id: 'ag', title: 'Anión gap en sangre', inputs: [n('na', 'Na', 'mEq/L', '', 'na'), n('cl', 'Cl', 'mEq/L', '', 'cl'), n('hco3', 'HCO3', 'mEq/L', '', 'hco3'), n('alb', 'Albúmina (opc.)', 'g/dL', '', 'alb')],
        run: v => { const a = v.na - v.cl - v.hco3, rows = [row('Anión gap', fx(a, 1), a > 12 ? '>12: acidosis con AG elevado' : 'normal (8–12)')]; if (v.alb) { const c = a + 2.5 * (4.4 - v.alb); rows.push(row('AG corregido por albúmina', fx(c, 1), 'AG + 2,5 × (4,4 − Alb)')); } rows.push(row('Delta-delta (ΔAG/ΔHCO3)', fx((a - 12) / (24 - v.hco3), 2), '1–2: AG puro; <1: mixta con AG normal; >2: alcalosis metabólica asociada')); return rows; },
      },
      { id: 'osm', title: 'Osmolaridad calculada y GAP osmolar', inputs: [n('na', 'Na', 'mEq/L', '', 'na'), n('glu', 'Glucosa', 'mg/dL', '', 'glu'), n('urea', 'Urea', 'mg/dL', '', 'urea'), n('osm', 'Osm medida (opc.)', 'mOsm/kg', ''), n('etoh', 'Etanol (opc.)', 'mg/dL', 0)], run: v => { const o = 2 * v.na + v.glu / 18 + v.urea / 6, rows = [row('Osm calculada', fx(o, 0) + ' mOsm/kg', '2·Na + glucosa/18 + urea/6')]; if (v.osm) { const g = v.osm - (o + (v.etoh || 0) / 4.6); rows.push(row('GAP osmolar', fx(g, 0), g > 10 ? '>10: sospechar tóxico osmótico (metanol, etilenglicol, isopropílico) o cetoacidosis/lactato' : 'normal')); } return rows; } },
      {
        id: 'uag', title: 'GAP osmolar urinario, carga neta y anión gap urinario', inputs: [n('una', 'Na orina', 'mEq/L', '', 'u_na'), n('uk', 'K orina', 'mEq/L', '', 'u_k'), n('ucl', 'Cl orina', 'mEq/L', '', 'u_cl'), n('uosm', 'Osm orina (opc.)', 'mOsm/kg', ''), n('uurea', 'Urea orina (opc.)', 'mg/dL', ''), n('uglu', 'Glucosa orina (opc.)', 'mg/dL', 0)],
        run: v => { const ag = v.una + v.uk - v.ucl, rows = [row('AG urinario (Na+K−Cl)', fx(ag, 0) + ' mEq/L', ag < 0 ? 'negativo: excreción de NH4⁺ conservada (pérdida digestiva)' : 'positivo: defecto de acidificación distal / ↓ NH4⁺ (ATR)')]; if (v.uosm && v.uurea) { const g = v.uosm - 2 * (v.una + v.uk) - v.uurea / 6 - (v.uglu || 0) / 18; rows.push(row('GAP osmolar urinario', fx(g, 0) + ' mOsm/kg', g > 100 ? '>100: excreción de NH4⁺ adecuada' : '<100: ↓ excreción de NH4⁺')); rows.push(row('NH4⁺ estimado', fx(g / 2, 0) + ' mEq/L', 'GAP/2')); } return rows; },
      },
      {
        id: 'hh', title: 'Henderson–Hasselbalch y compensación', inputs: [n('ph', 'pH', '', '', 'ph'), n('pco2', 'pCO2', 'mmHg', '', 'pco2'), n('hco3', 'HCO3', 'mEq/L', '', 'hco3')],
        run: v => {
          let { ph, pco2, hco3 } = v; const rows = [];
          if (!Number.isFinite(hco3)) hco3 = 0.03 * pco2 * 10 ** (ph - 6.1); else if (!Number.isFinite(ph)) ph = 6.1 + Math.log10(hco3 / (0.03 * pco2)); else if (!Number.isFinite(pco2)) pco2 = hco3 / (0.03 * 10 ** (ph - 6.1));
          rows.push(row('pH', fx(ph, 2)), row('pCO2', fx(pco2, 0) + ' mmHg'), row('HCO3', fx(hco3, 1) + ' mEq/L'), row('[H⁺]', fx((24 * pco2) / hco3, 0) + ' nEq/L'));
          if (hco3 < 22 && ph < 7.4) rows.push(row('Compensación (Winter)', `pCO2 esperada ${fx(1.5 * hco3 + 8, 0)} ± 2`, pco2 > 1.5 * hco3 + 10 ? 'pCO2 mayor: acidosis respiratoria asociada' : pco2 < 1.5 * hco3 + 6 ? 'pCO2 menor: alcalosis respiratoria asociada' : 'compensación adecuada'));
          if (hco3 > 26 && ph > 7.4) rows.push(row('Compensación (alcalosis metabólica)', `pCO2 esperada ${fx(40 + 0.7 * (hco3 - 24), 0)} ± 5`));
          return rows;
        },
      },
      { id: 'aa', title: 'Gradiente alveolo-arterial de oxígeno', inputs: [n('fio2', 'FiO2', '(0,21–1)', 0.21), n('pao2', 'PaO2', 'mmHg', ''), n('paco2', 'PaCO2', 'mmHg', '', 'pco2'), n('patm', 'Presión barométrica', 'mmHg', 760), n('age', 'Edad', 'años', '')], run: v => { const pa = v.fio2 * (v.patm - 47) - v.paco2 / 0.8, g = pa - v.pao2, esp = v.age / 4 + 4; return [row('PAO2', fx(pa, 0) + ' mmHg'), row('Gradiente A–a', fx(g, 0) + ' mmHg', g > esp ? `elevado (esperado ≤ ${fx(esp, 0)} para la edad): shunt, V/Q o difusión` : 'normal: hipoventilación o FiO2/altitud baja'), row('Nota', 'Madrid (~650 m): presión barométrica ≈ 705 mmHg.')]; } },
      { id: 'hco3d', title: 'Déficit de bicarbonato', inputs: [n('kg', 'Peso', 'kg', ''), n('hco3', 'HCO3 actual', 'mEq/L', '', 'hco3'), n('obj', 'HCO3 objetivo', 'mEq/L', 24), n('f', 'Espacio de distribución', '(0,4–0,6)', 0.5)], run: v => [row('Déficit', fx(v.f * v.kg * (v.obj - v.hco3), 0) + ' mEq', 'corregir la mitad en 12–24 h y reevaluar')] },
      { id: 'nahyper', title: 'Sodio corregido para hiperglucemia', inputs: [n('na', 'Na', 'mEq/L', '', 'na'), n('glu', 'Glucosa', 'mg/dL', '', 'glu')], run: v => [row('Na corregido (Katz, 1,6)', fx(v.na + 1.6 * (v.glu - 100) / 100, 1)), row('Na corregido (Hillier, 2,4)', fx(v.na + 2.4 * (v.glu - 100) / 100, 1), 'preferible con glucosa >400 mg/dL')] },
      { id: 'excw', title: 'Exceso de agua en hiponatremia', inputs: [n('kg', 'Peso', 'kg', ''), sel('tbwf', 'Agua corporal total', [['0.6', '60 % (varón)'], ['0.5', '50 % (mujer / varón mayor)'], ['0.45', '45 % (mujer mayor)']]), n('na', 'Na', 'mEq/L', '', 'na'), n('obj', 'Na objetivo', 'mEq/L', 140)], run: v => { const tbw = v.kg * +v.tbwf; return [row('ACT', fx(tbw, 1) + ' L'), row('Exceso de agua', fx(tbw * (1 - v.na / v.obj), 1) + ' L', 'ACT × (1 − Na/Na objetivo)')]; } },
      { id: 'nadef', title: 'Déficit de sodio en hiponatremia', inputs: [n('kg', 'Peso', 'kg', ''), sel('tbwf', 'Agua corporal total', [['0.6', '60 % (varón)'], ['0.5', '50 % (mujer / varón mayor)'], ['0.45', '45 % (mujer mayor)']]), n('na', 'Na', 'mEq/L', '', 'na'), n('obj', 'Na objetivo', 'mEq/L', 125)], run: v => [row('Déficit de Na', fx(v.kg * +v.tbwf * (v.obj - v.na), 0) + ' mEq', 'ACT × (Na objetivo − Na). Subir ≤8 mEq/L en 24 h (≤6 si riesgo de desmielinización)')] },
      { id: 'h2odef', title: 'Déficit de agua en hipernatremia', inputs: [n('kg', 'Peso', 'kg', ''), sel('tbwf', 'Agua corporal total', [['0.6', '60 % (varón)'], ['0.5', '50 % (mujer / varón mayor)'], ['0.45', '45 % (mujer mayor)']]), n('na', 'Na', 'mEq/L', '', 'na'), n('obj', 'Na objetivo', 'mEq/L', 140)], run: v => [row('Déficit de agua', fx(v.kg * +v.tbwf * (v.na / v.obj - 1), 1) + ' L', 'ACT × (Na/Na objetivo − 1). Descender ≤10 mEq/L en 24 h')] },
      { id: 'cosm', title: 'Aclaramiento osmolar y de agua libre', inputs: [n('uosm', 'Osm orina', 'mOsm/kg', ''), n('posm', 'Osm plasma', 'mOsm/kg', ''), n('v', 'Diuresis', 'mL/24 h', '')], run: v => { const c = (v.uosm * v.v) / v.posm; return [row('Aclaramiento osmolar', fx(c, 0) + ' mL/24 h'), row('Aclaramiento de agua libre (CH2O)', fx(v.v - c, 0) + ' mL/24 h', v.v - c > 0 ? 'positivo: orina diluida (pérdida de agua libre)' : 'negativo: orina concentrada (retención de agua libre)')]; } },
      { id: 'efwc', title: 'Aclaramiento de agua libre de electrolitos', inputs: [n('v', 'Diuresis', 'mL/24 h', ''), n('una', 'Na orina', 'mEq/L', '', 'u_na'), n('uk', 'K orina', 'mEq/L', '', 'u_k'), n('pna', 'Na plasma', 'mEq/L', '', 'na')], run: v => [row('CH2O electrolitos', fx(v.v * (1 - (v.una + v.uk) / v.pna), 0) + ' mL/24 h', 'V × (1 − (UNa + UK)/PNa); si es negativo, la orina retiene agua libre'), row('Ratio de Furst', fx((v.una + v.uk) / v.pna, 2), '>1 restricción <500 mL/día; 0,5–1: 500–700; <0,5: ≈1 L')] },
      { id: 'dna', title: 'Cambio de Na plasmático con infusión IV (Adrogué–Madias)', inputs: [n('kg', 'Peso', 'kg', ''), sel('tbwf', 'Agua corporal total', [['0.6', '60 % (varón)'], ['0.5', '50 % (mujer / varón mayor)'], ['0.45', '45 % (mujer mayor)']]), n('na', 'Na plasma', 'mEq/L', '', 'na'), sel('fl', 'Suero', [['513', 'NaCl 3 % (513)'], ['154', 'NaCl 0,9 % (154)'], ['77', 'NaCl 0,45 % (77)'], ['130', 'Ringer lactato (130)'], ['0', 'Glucosado 5 % (0)']]), n('add', 'Na+K añadido por L', 'mEq/L', 0), n('vol', 'Volumen', 'L', 1)], run: v => { const tbw = v.kg * +v.tbwf, inf = +v.fl + v.add, d = ((inf - v.na) * v.vol) / (tbw + v.vol); return [row('Δ Na plasmático', fx(d, 1) + ' mEq/L', `Na esperado ≈ ${fx(v.na + d, 1)}; fórmula orientativa (no incluye pérdidas urinarias ni redistribución)`)]; } },
      { id: 'ttkg', title: 'Gradiente transtubular de potasio (TTKG)', inputs: [n('uk', 'K orina', 'mEq/L', '', 'u_k'), n('pk', 'K plasma', 'mEq/L', '', 'k'), n('uosm', 'Osm orina', 'mOsm/kg', ''), n('posm', 'Osm plasma', 'mOsm/kg', ''), n('una', 'Na orina (validez)', 'mEq/L', '', 'u_na')], run: v => { const t = (v.uk / v.pk) / (v.uosm / v.posm); return [row('TTKG', fx(t, 1), v.pk < 3.5 ? (t > 4 ? '>4: pérdida renal de K' : '<2–3: extrarrenal') : v.pk > 5 ? (t < 7 ? '<7: hipoaldosteronismo o resistencia' : '>7: aldosterona conservada') : ''), ...(v.uosm <= v.posm || v.una < 25 ? [row('Aviso', 'No válido: requiere Osm orina > plasma y Na orina >25 mEq/L.')] : [])]; } },
      { id: 'fehco3', title: 'Excreción fraccional de bicarbonato', inputs: [n('uh', 'HCO3 orina', 'mEq/L', ''), n('ph', 'HCO3 plasma', 'mEq/L', '', 'hco3'), n('ucr', 'Cr orina', 'mg/dL', '', 'u_cr'), n('pcr', 'Cr plasma', 'mg/dL', '', 'cr')], run: v => { const f = (v.uh * v.pcr) / (v.ph * v.ucr) * 100; return [row('FE HCO3', fx(f, 1) + ' %', f > 15 ? '>15 % con HCO3 plasmático normalizado: ATR proximal (tipo 2)' : f < 5 ? '<5 %: normal / ATR distal' : 'intermedio')]; } },
    ],
  },
];
