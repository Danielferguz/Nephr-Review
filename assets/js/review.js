// Actualización de la revisión: sustituye la sección de analítica con comentario en el estilo del clínico y propone
// las decisiones (en rojo y negrita) para que las valide. Reglas fijas; nada sale del navegador.
import { collect, current, series, regress, trendText, fmtDate, formatOrdered, sniffPatient } from './lab.js';
import { ckdepi2021, cockcroftGault, spKtV, eKtV, stdKtV, fx } from './calc.js';
import { parseMeds } from './drugs.js';

export const TYPES = {
  erca: 'Consulta ERCA', general: 'Consulta general', glom: 'Consulta glomerulares', tx: 'Consulta trasplante',
  dp: 'Consulta DP', hd: 'Consulta hemodiálisis', hdd: 'Consulta hemodomi', guardia: 'Guardia de nefrología',
};
const DIAL = new Set(['dp', 'hd', 'hdd']);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---- Segmentos {t, b: negrita original, s: propuesta (rojo y negrita)}
const T = t => ({ t });
const S = t => ({ t, s: true, b: true });
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const num = x => Number.isFinite(x);
const join = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}` : a[0] || '');
const f0 = x => fx(x, 0);

// "**negrita**" y "[[propuesta]]" -> segmentos
export function parseInline(line) {
  const out = []; let bold = false, sug = false;
  for (const tok of line.split(/(\*\*|\[\[|\]\])/)) {
    if (tok === '**') bold = !bold; else if (tok === '[[') sug = true; else if (tok === ']]') sug = false;
    else if (tok) out.push(sug ? S(tok) : bold ? { t: tok, b: true } : T(tok));
  }
  return out;
}

// ---- Motor de reglas
export function analyze(ctx) {
  const { cur, all, type, meds, age, female, kg } = ctx, dial = DIAL.has(type);
  const rec = k => cur.vals.get(k), v = k => rec(k)?.num ?? NaN;
  const s = k => { const r = rec(k); return !r ? '—' : Number.isFinite(r.num) && !/^[<>]/.test(r.valueStr) ? String(parseFloat(r.valueStr)) : r.valueStr; }; // 4.0 -> 4
  const has = c => meds.some(m => m.classes.includes(c)), med = c => meds.find(m => m.classes.includes(c));
  const nameOf = (c, d) => med(c)?.inn || d;
  const prevRec = k => { const l = rec(k); const p = series(all, k).filter(x => !l || x.date < l.date); return p.length ? p[p.length - 1] : null; };
  const when = iso => MONTHS[new Date(iso).getUTCMonth()] + (iso.slice(0, 4) === cur.date.slice(0, 4) ? '' : `/${iso.slice(2, 4)}`);
  const refOf = k => rec(k)?.ref?.match(/^\s*(-?[\d.]+)?\s*-\s*(-?[\d.]+)?\s*$/);
  const low = k => { const m = refOf(k); return num(v(k)) && m?.[1] != null && v(k) < +m[1]; };
  const high = k => { const m = refOf(k); return num(v(k)) && m?.[2] != null && v(k) > +m[2]; };

  const plan = [], adds = [], bullets = [];
  let D = []; // decisiones de la frase en curso
  let DD = []; const dom = {}; // decisiones por dominio (para el estilo plantilla)
  const endDom = k => { dom[k] = DD; DD = []; };
  const renalNote = []; let doseBullet = null, capFacts = '', ironState = null, hemoTxt = '';
  const dec = (t, o = {}) => {
    D.push(t); DD.push(t);
    const full = cap(t) + (o.why ? ` por ${o.why}` : '');
    if (!plan.includes(full)) plan.push(full);
    if (o.cls) meds.filter(m => m.classes.includes(o.cls)).forEach(m => !m.notes.includes(full) && m.notes.push(full));
    if (o.add && !has(o.add) && !adds.includes(full)) adds.push(full);
  };
  const medNote = (cls, t) => { if (!has(cls)) return; if (!plan.includes(t)) plan.push(t); meds.filter(m => m.classes.includes(cls)).forEach(m => !m.notes.includes(t) && m.notes.push(t)); };
  const sent = text => { const o = [T(text)]; if (D.length) o.push(T(': '), S(`${D.join(' y ')}.`)); else o.push(T('.')); D = []; return o; };
  const bullet = (...sents) => { const flat = sents.flat().filter(Boolean); if (flat.length) { const o = []; sents.forEach((x, i) => { if (!x?.length) return; if (o.length) o.push(T(' ')); o.push(...x); }); bullets.push(o); } };

  let fg = v('fg');
  if (!num(fg) && num(v('cr')) && age) fg = ckdepi2021(v('cr'), age, female);
  const acr = v('u_acr'), pcr = num(v('u_pcr')) ? v('u_pcr') : v('u24_pcr');
  const K = v('k'), alb = v('alb'), ca = v('ca');
  const caCorr = num(v('caadj')) ? v('caadj') : num(ca) && num(alb) ? ca + 0.8 * (4 - alb) : ca;
  const hco3 = num(v('hco3')) ? v('hco3') : num(v('tco2')) ? v('tco2') : v('hco3s');
  const crClG = num(v('cr')) && age && kg ? cockcroftGault(v('cr'), age, kg, female) : NaN;
  const prot = num(acr) ? acr >= 30 : num(pcr) ? pcr >= 150 : false;

  // 1. Función renal o dosis de diálisis
  if (!dial) {
    const pf = prevRec('fg');
    let estado = '', drop = NaN;
    if (pf && num(fg)) {
      drop = (pf.value - fg) / pf.value;
      estado = Math.abs(fg - pf.value) <= 2 || Math.abs(drop) <= 0.1 ? ' estable' : drop > 0 ? ' en descenso' : ' en mejoría';
    }
    if (num(drop) && (drop >= 0.25 || fg - pf.value <= -5)) dec('repito analítica en 1-2 semanas y descarto causa reversible (volumen, nefrotóxicos, obstrucción)');
    const out = [sent(`Función renal${estado}, ${num(v('fg')) ? 'CKD_EPI' : 'FGe'} ${num(fg) ? f0(fg) : '—'} mL/min con CrS ${s('cr')}${pf ? ` (${pf.str} mL/min en ${when(pf.date)})` : ''}`)];
    // fármacos que modifican la CrS o el FGe: fecha de inicio entre las dos últimas determinaciones
    const cp = prevRec('cr');
    if (cp && (v('cr') - cp.value >= 0.3 || v('cr') / cp.value >= 1.15)) {
      meds.filter(m => (m.hemo || m.secr) && m.start && m.start >= cp.date && m.start <= cur.date).forEach(m => {
        const note = [S(`Inicio de ${m.inn} el ${fmtDate(m.start)}: ${m.secr ? 'inhibe la secreción tubular de creatinina, posible aumento de CrS sin descenso real del FG' : 'posible descenso hemodinámico del FGe'}.`)];
        out.push(note); renalNote.push(...note);
      });
    }
    if (num(acr) || num(pcr)) {
      const pa = prevRec('u_acr'), pp = prevRec('u_pcr') || prevRec('u24_pcr'), now = num(acr) ? acr : pcr, pv = num(acr) ? pa : pp;
      const tr = pv ? (now >= 1.3 * pv.value ? ' en ascenso' : now <= 0.7 * pv.value ? ' en descenso' : ' estable') : '';
      const hem = rec('u_hem') ? (/^neg/i.test(rec('u_hem').valueStr) || rec('u_hem').num === 0 ? ', sin hematuria' : ', con hematuria') : '';
      if (pv && now >= 2 * pv.value && now >= 30) dec('repito uPCR/uACR en muestra de primera hora con sedimento para confirmar');
      if (prot && !has('raas') && !(K > 5) && !dial) dec(num(fg) && fg < 30 ? 'valoro IECA/ARA-II a dosis baja con control de K y creatinina' : 'inicio IECA/ARA-II a dosis máxima tolerada con control de K y creatinina', { add: 'raas', why: 'proteinuria sin bloqueo del SRAA' });
      if (prot && num(fg) && fg >= 20 && !has('sglt2') && (ctx.dm || (num(acr) && acr >= 200) || (num(pcr) && pcr >= 500))) dec('valoro iSGLT2', { add: 'sglt2', why: 'FGe ≥20 y albuminuria' });
      if (ctx.dm && num(acr) && acr >= 30 && num(fg) && fg >= 25 && K <= 5 && !has('arm')) dec('valoro finerenona', { add: 'arm', why: 'DM2 con albuminuria persistente (K ≤5,0)' });
      out.push(sent(`Proteinuria${tr}, ${[num(pcr) && `uPCR ${f0(pcr)}`, num(acr) && `uACR ${f0(acr)}`].filter(Boolean).join(' y ')} mg/g${(pa || pp) ? ` frente a ${[pp && f0(pp.value), pa && f0(pa.value)].filter(Boolean).join('/')} mg/g en ${when((pa || pp).date)}` : ''}${hem}`));
    }
    bullet(...out);
  } else {
    const pre = v('urea'), post = v('urea_post');
    let txt = `Dosis de diálisis: urea ${s('urea')}${num(post) ? ` / post ${post}` : ''}, CrS ${s('cr')}`;
    if (type !== 'dp' && num(pre) && num(post)) {
      const urr = (1 - post / pre) * 100;
      txt += `, URR ${f0(urr)} %`;
      if (ctx.session?.t && ctx.session.w) {
        const sp = spKtV(pre, post, ctx.session.t / 60, ctx.session.uf || 0, ctx.session.w), e = eKtV(sp, ctx.session.t / 60, ctx.session.acc || 'fav');
        txt += `, spKt/V ${fx(sp, 2)}${ctx.session.n ? `, stdKt/V ${fx(stdKtV(sp, e, ctx.session.t, ctx.session.n), 2)}` : ''}`;
        if (type === 'hd' && sp < 1.2) dec('reviso acceso (recirculación), Qb y aumento el tiempo de sesión', { why: 'spKt/V <1,2' });
      } else if (type === 'hd' && urr < 65) dec('reviso acceso, Qb, duración y recirculación y completo Kt/V', { why: 'URR <65 %' });
    } else if (type === 'dp') txt += '; dosis según cinética peritoneal con orina de 24 h';
    bullet(sent(`${txt}. No calculo FGe por estar en TRS`));
  }

  doseBullet = bullets[bullets.length - 1]; endDom('renal');

  // 2. Iones y ácido-base
  {
    const sents = [], pk = num(K), pna = num(v('na'));
    const raas = med('raas') || med('arm');
    const kOk = !pk || (K <= 5.5 && K >= 3.5), naOk = !pna || (v('na') >= 135 && v('na') <= 145), mgLow = num(v('mg')) && (low('mg') || v('mg') < 1.6);
    if (pk && K >= 6) { dec('repito de inmediato (descartar hemólisis), ECG y valoro tratamiento urgente'); sents.push(sent(`Hiperpotasemia grave (K ${s('k')})`)); }
    else if (pk && K > 5.5) {
      dec(raas ? `valoro reducir ${raas.inn} y refuerzo dieta baja en K${has('kbind') ? ` y ${nameOf('kbind')}` : ' o inicio captor de K'}` : `dieta baja en K y ${has('kbind') ? `aumento ${nameOf('kbind')}` : 'valoro captor de K'}`, { cls: raas ? (has('raas') ? 'raas' : 'arm') : undefined });
      sents.push(sent(`Hiperpotasemia (K ${s('k')})${has('kbind') ? ` pese a ${nameOf('kbind')}` : ''}`));
    } else if (pk && K < 3.5) { dec('valoro aportes de potasio y reviso diuréticos'); sents.push(sent(`Hipopotasemia (K ${s('k')})`)); }
    if (pna && !naOk) { dec('valoro osmolaridad, volemia y fármacos (tiazidas)'); sents.push(sent(`${v('na') < 135 ? 'Hiponatremia' : 'Hipernatremia'} (Na ${s('na')})`)); }
    if (pk && kOk && naOk) {
      if (pk && K > 5 && has('arm')) { dec(`reduzco ${nameOf('arm')}`, { cls: 'arm' }); sents.push(sent(`Control iónico con K ${s('k')} / Na ${s('na')}`)); }
      else sents.push(sent(`Control iónico ok (K ${s('k')} / Na ${s('na')}${num(v('mg')) && !mgLow ? ` / Mg ${s('mg')}` : ''})${has('kbind') ? ` con ${nameOf('kbind')}` : ''}`));
    }
    if (mgLow) { dec(has('mg') ? 'aumento aportes de magnesio' : 'inicio aportes de magnesio', { cls: 'mg', add: 'mg' }); sents.push(sent(`Hipomagnesemia (${s('mg')})`)); }
    if (num(hco3)) {
      const acid = hco3 < 22 || (low('hco3') && hco3 < 23);
      if (acid) {
        dec(dial ? 'aumento bicarbonato del baño y/o aportes orales' : has('bicarb') ? 'aumento aportes' : 'inicio bicarbonato oral con control de TA y volemia', { cls: 'bicarb', add: dial ? undefined : 'bicarb', why: `acidosis metabólica (HCO3 ${s('hco3')})` });
        sents.push(sent(`Acidosis metabólica con HCO3 ${num(v('hco3')) ? s('hco3') : f0(hco3)}${has('bicarb') ? ` pese a bicarbonato${med('bicarb').dose ? ' ' + med('bicarb').dose : ''}` : ''}`));
      } else if (hco3 > 28) { if (has('bicarb')) dec('reduzco aportes de bicarbonato', { cls: 'bicarb' }); sents.push(sent(`Alcalosis metabólica con HCO3 ${f0(hco3)}`)); }
      else sents.push(sent(`Ácido-base aceptable (HCO3 ${num(v('hco3')) ? s('hco3') : f0(hco3)})`));
    }
    bullet(...sents);
  }

  endDom('ion');

  // 3. Metabolismo Ca/P
  if ([ca, caCorr, v('p'), v('pth'), v('vitd'), v('caion')].some(num)) {
    const P = v('p'), pth = v('pth'), vd = v('vitd'), pp = prevRec('pth');
    const trend = pp && num(pth) ? (pth >= 1.15 * pp.value ? ' en ascenso' : pth <= 0.85 * pp.value ? ' en descenso' : ' estable') : '';
    const calcim = med('calcim');
    const pthHigh = dial ? pth > 600 : pth > 150 && (!num(fg) || fg < 45);
    if (dial) {
      if (P > 5.5) dec(has('pbind') ? `refuerzo ${nameOf('pbind')} con las comidas y dieta` : 'inicio quelante de fósforo y refuerzo dietético', { cls: 'pbind', add: 'pbind', why: `hiperfosfatemia (P ${s('p')})` });
      if (P < 3.5) dec('reduzco quelante y liberalizo la dieta', { cls: 'pbind', why: `hipofosfatemia (P ${s('p')})` });
      if (pth > 600) dec(calcim ? `aumento ${calcim.inn}` : 'valoro cinacalcet o vitamina D activa tras ajustar Ca y P', { cls: 'calcim', why: `PTH ${s('pth')}` });
      if (pth < 130) dec('reduzco/suspendo vitamina D activa y calcimimético', { cls: 'vitda', why: `PTH ${s('pth')} (riesgo de enfermedad ósea adinámica)` });
    } else {
      if (P > 4.5) dec(has('pbind') ? `refuerzo ${nameOf('pbind')} con las comidas` : P > 5.5 ? 'inicio quelante de fósforo y dieta pobre en fósforo' : 'refuerzo dieta pobre en fósforo (quelante si persiste)', { cls: 'pbind', why: `fósforo ${s('p')}` });
      if (pthHigh) dec(calcim && pth > 300 ? `aumento ${calcim.inn}` : 'corrijo calcidiol, fósforo y calcio antes de valorar vitamina D activa', { cls: calcim && pth > 300 ? 'calcim' : 'vitda', why: `PTH ${s('pth')}` });
    }
    if (caCorr < 8.4) dec(calcim ? `reduzco/suspendo ${calcim.inn}` : 'reviso vitamina D y aportes de calcio', { cls: 'calcim', why: 'hipocalcemia' });
    if (caCorr > 10.2) dec('reduzco calcio oral, quelantes cálcicos y vitamina D', { cls: 'pbind', why: 'hipercalcemia' });
    if (vd < 20) dec(has('vitd') ? `aumento ${nameOf('vitd')}` : 'inicio colecalciferol/calcifediol con control de Ca', { cls: 'vitd', add: 'vitd', why: `déficit de vitamina D (${s('vitd')})` });
    else if (vd < 30 && !dial) dec(has('vitd') ? `aumento ${nameOf('vitd')}` : 'valoro suplemento de vitamina D', { cls: 'vitd', add: 'vitd', why: `insuficiencia de vitamina D (${s('vitd')})` });
    const first = `${num(v('caadj')) || (num(ca) && num(alb)) ? `Ca ajustado ${num(v('caadj')) ? s('caadj') : fx(caCorr, 1)}` : `Ca ${s('ca')}`}${num(v('caion')) ? ` con Ca2+ ${s('caion')}` : ''}`;
    const rest = [num(P) && `P ${s('p')}`, num(vd) && `VD ${s('vitd')}`, num(pth) && `PTH ${s('pth')}${trend ? `,${trend}` : ''}${calcim && pthHigh ? ` pese a ${calcim.inn}${calcim.start ? ` (desde ${fmtDate(calcim.start)})` : ''}` : ''}`].filter(Boolean);
    capFacts = join([first, ...rest]);
    bullet(sent(`Metabolismo Ca/P: ${capFacts}`));
  }

  endDom('cap');

  // 4. Anemia
  if ([v('hb'), v('ferr'), v('tsat'), v('vcm')].some(num)) {
    const hb = v('hb'), ferr = v('ferr'), tsat = v('tsat'), esa = med('esa');
    const ironLow = dial ? (num(tsat) && tsat < 20) || (num(ferr) && ferr < 200) : num(tsat) && tsat <= 20 && num(ferr) && ferr <= 100;
    const ironHigh = (num(ferr) && ferr > (dial ? 800 : 500)) || (num(tsat) && tsat > 45);
    ironState = num(ferr) || num(tsat) ? (ironLow ? 'low' : ironHigh ? 'high' : 'ok') : null;
    let txt = `Anemia: Hb ${s('hb')}`;
    if (esa) {
      if (hb > (dial ? 12 : 11.5)) dec(`reduzco ${esa.inn} ~25 %`, { cls: 'esa', why: `Hb ${s('hb')} por encima de objetivo` });
      else if (hb < 10) dec(`aumento ${esa.inn} ~25 % tras revisar hierro e inflamación`, { cls: 'esa', why: `Hb ${s('hb')}` });
      else if (!dial && hb < 11) dec(`ajustamos ${esa.inn} (aumento ~25 %)`, { cls: 'esa', why: `Hb ${s('hb')} en el límite` });
      else txt += `, en objetivo con ${esa.inn}`;
    } else if (hb >= 10) txt += ', bien controlada sin AEE';
    else if (hb < 10 && !ironLow) dec('valoro iniciar AEE', { add: 'esa', why: `Hb ${s('hb')} con reservas de hierro adecuadas` });
    if (num(v('vcm'))) txt += `, VCM ${s('vcm')}`;
    const iron = [num(v('fe')) && `Fe ${s('fe')}`, num(tsat) && `IST ${s('tsat')} %`, num(ferr) && `ferritina ${s('ferr')}`].filter(Boolean);
    if (iron.length) txt += `, con perfil férrico (${iron.join(', ')})`;
    if (ironLow) dec(has('iron') ? 'valoro hierro IV por ineficacia/intolerancia del oral' : dial ? 'inicio hierro IV' : 'inicio hierro oral (IV si intolerancia o ineficacia)', { cls: 'iron', add: 'iron', why: 'déficit de hierro' });
    if (ironHigh && has('iron')) dec('suspendo hierro', { cls: 'iron', why: `reservas altas (ferritina ${s('ferr')}, IST ${s('tsat')} %)` });
    if (num(v('b12')) && v('b12') < 200) dec('inicio vitamina B12', { why: `B12 ${s('b12')}` });
    if (num(v('fol')) && v('fol') < 3) dec('inicio ácido fólico', { why: `fólico ${s('fol')}` });
    if (num(v('vcm')) && v('vcm') > 100 && !num(v('b12'))) dec('solicito B12 y ácido fólico', { why: 'macrocitosis' });
    if (num(hb) && hb < 12 && !num(tsat) && !num(ferr)) dec('solicito perfil férrico (IST, ferritina)');
    bullet(sent(txt));
  }

  endDom('anemia');

  // 5. Lípidos y hepático
  {
    const ldl = v('ldl'), sents = [];
    if (num(ldl) || num(v('chol'))) {
      const on = has('statin') || has('lipid');
      if (num(ldl) && ldl > 100 && on) dec('refuerzo adherencia y dieta, valoro intensificar o añadir ezetimiba', { cls: has('statin') ? 'statin' : 'lipid', why: `LDL ${s('ldl')} con hipolipemiante` });
      if (!on && !dial && age && !(num(ldl) && ldl <= 70)) {
        if (age >= 50) dec('valoro iniciar estatina (o estatina + ezetimiba)', { add: 'statin', why: num(fg) && fg < 60 ? 'edad ≥50 y FGe <60 (KDIGO 1A)' : 'ERC y edad ≥50 (KDIGO 1B)' });
        else if (ctx.dm) dec('valoro estatina', { add: 'statin', why: 'ERC con diabetes (KDIGO 2A)' });
      }
      if (v('tg') > 500) dec('dieta, descarto causas secundarias y valoro fibrato/omega-3', { why: `TG ${s('tg')} (riesgo de pancreatitis)` });
      sents.push(sent(num(ldl) ? (ldl <= 70 ? `Perfil lipídico bien controlado (LDL ${s('ldl')})` : ldl <= 100 ? `Perfil lipídico aceptablemente controlado (LDL ${s('ldl')})` : `Perfil lipídico con LDL ${s('ldl')}`) : `Colesterol total ${s('chol')}`));
    }
    const hep = ['ast', 'alt', 'ggt', 'fa', 'bil'].filter(k => rec(k));
    if (hep.length) sents.push(sent(hep.some(k => rec(k).flag) ? `Perfil hepático: ${hep.filter(k => rec(k).flag).map(k => `${k.toUpperCase()} ${s(k)}`).join(', ')} fuera de rango` : 'Perfil hepático normal'));
    bullet(...sents);
  }

  endDom('lip');

  // 6. Urato, nutrición, inflamación, glucemia
  {
    const sents = [], urato = v('urato'), pcrp = v('pcr');
    if (num(urato)) sents.push(sent(`Ac. úrico ${s('urato')} ${urato <= 7 ? 'en rango' : 'elevado'}${has('allo') ? ` con ${nameOf('allo')}` : ''}`));
    if (num(alb)) {
      if (alb < 3.5) { dec('valoro estado nutricional, inflamación y pérdidas (proteinuria/peritoneal)'); sents.push(sent(`Hipoalbuminemia (${s('alb')})`)); }
      else sents.push(sent(`Buenos parámetros nutricionales (albúmina ${s('alb')})${num(pcrp) && pcrp > 5 ? '' : ' e inflamatorios'}`));
    }
    if (num(pcrp) && pcrp > 5) { dec('busco foco infeccioso/inflamatorio y recontrolo'); sents.push(sent(`PCR ${s('pcr')}`)); }
    if (num(v('hba1c'))) { if (v('hba1c') > 8) dec('valoro ajustar el tratamiento antidiabético', { why: `HbA1c ${s('hba1c')} %` }); sents.push(sent(`HbA1c ${s('hba1c')} %${v('hba1c') <= 7 ? ', buen control' : v('hba1c') <= 8 ? ', control subóptimo' : ''}`)); }
    if (num(v('psa'))) sents.push(sent(`PSA ${s('psa')}${num(v('psar')) ? ` (libre/total ${s('psar')})` : ''}`));
    bullet(...sents);
  }

  endDom('misc');

  // 7. Hemograma fuera de rango (no anemia)
  {
    const f = [];
    if (low('lin') || (rec('lin')?.flag && v('lin') < 1.3)) f.push(`Linfopenia ${s('lin')}`);
    if (high('wbc')) f.push(`leucocitosis ${s('wbc')}`); else if (low('wbc')) f.push(`leucopenia ${s('wbc')}`);
    if (high('neu_p') && !high('wbc')) f.push('neutrofilia relativa');
    if (high('plt')) f.push(`trombocitosis ${s('plt')}`); else if (low('plt')) f.push(`trombopenia ${s('plt')}`);
    if (f.length) { hemoTxt = join(f).replace(/ y /, ' con ').replace(/^./, c => c.toUpperCase()); bullet(sent(hemoTxt)); }
  }
  endDom('hemo');
  bullet([T('resto aceptable.')]);

  // ---- Estilo plantilla HCIS («Analíticamente:»): frases cualitativas de la plantilla + decisiones en rojo
  const tpl = [];
  const joinSent = sents => sents.reduce((a, x, i) => (i ? [...a, T('. '), ...x] : x), []);
  const tail = key => (dom[key]?.length ? [T(' '), S(`${dom[key].join(' y ')}.`)] : []);
  const push = (segs, key) => { if (segs.length) tpl.push([...segs, ...tail(key)]); };
  const tPth = v('pth'), tVd = v('vitd'), tP = v('p'), tHb = v('hb');
  if (dial) tpl.push(doseBullet);
  else tpl.push([T(`Función renal con ${num(v('fg')) ? 'CKD_EPI' : 'FGe'} ${num(fg) ? f0(fg) : '—'}ml/min${num(pcr) ? `, con proteinuria ${fx(pcr / 1000, 1)}gr/gr` : num(acr) ? `, con albuminuria ${f0(acr)}mg/g` : ''}`), ...tail('renal'), ...(renalNote.length ? [T(' '), ...renalNote] : [])]);
  {
    const sents = [], issues = [], hv = num(v('hco3')) ? s('hco3') : f0(hco3);
    if (num(K) || num(v('na'))) {
      if (num(K) && K > 5.5) issues.push(`hiperpotasemia (K ${s('k')})`); else if (num(K) && K < 3.5) issues.push(`hipopotasemia (K ${s('k')})`);
      if (num(v('na')) && v('na') < 135) issues.push(`hiponatremia (Na ${s('na')})`); else if (num(v('na')) && v('na') > 145) issues.push(`hipernatremia (Na ${s('na')})`);
      if (num(v('mg')) && (low('mg') || v('mg') < 1.6)) issues.push(`hipomagnesemia (Mg ${s('mg')})`);
      sents.push([T(issues.length ? `Control iónico con ${join(issues)}` : `Buen control iónico (${[num(K) && `K ${s('k')}`, num(v('na')) && `Na ${s('na')}`].filter(Boolean).join(' / ')} mmol/L)`)]);
    }
    if (num(hco3)) sents.push([T(hco3 < 22 ? `Acidosis metabólica (HCO3- ${hv})` : hco3 > 28 ? `Alcalosis metabólica (HCO3- ${hv})` : `Aceptable control de ácido-base (HCO3- ${hv})`)]);
    else if (sents.length) sents.push([S('ácido-base sin datos en esta analítica')]);
    push(joinSent(sents), 'ion');
  }
  if ([caCorr, tP, tPth, tVd].some(num)) {
    const okCa = !num(caCorr) || (caCorr >= 8.4 && caCorr <= 10.2), okP = !num(tP) || (tP <= (dial ? 5.5 : 4.5) && tP >= (dial ? 3.5 : 2.5));
    const okPth = !num(tPth) || (dial ? tPth >= 130 && tPth <= 600 : tPth <= 150), okVd = !num(tVd) || tVd >= 30;
    push([T(okCa && okP && okPth && okVd ? 'Metabolismo Ca/P con buen control y aceptable manejo de vitD/HiperPTH secundario' : `Metabolismo Ca/P: ${capFacts}`)], 'cap');
  }
  if (num(tHb)) {
    const esa = med('esa'), lo = dial ? 10 : 11, hi = dial ? 12 : 11.5;
    const state = tHb < 10 ? 'Anemia mal controlada' : tHb < lo ? 'Límite control de anemia' : tHb > hi && esa ? 'Hb por encima de objetivo' : 'Buen control de anemia';
    const iron = { low: ' con déficit férrico', high: ' con reservas de hierro altas', ok: ' con aceptable control férrico' }[ironState] || '';
    push([T(`${state}${iron}${num(v('b12')) && num(v('fol')) && v('b12') >= 200 && v('fol') >= 3 ? ' sin déficit de fólico/vitB12' : ''}`)], 'anemia');
  }
  {
    const sents = [], ldl = v('ldl'), tr = ['ast', 'alt'].filter(k => rec(k));
    if (num(ldl) || num(v('chol'))) sents.push([T(`Perfil lipídico con ${!num(ldl) ? 'control no valorable (sin LDL)' : ldl <= 70 ? 'buen control' : ldl <= 100 ? 'aceptable control' : 'control insuficiente'}`)]);
    if (tr.length) sents.push([T(tr.some(k => high(k)) ? `Transaminasas elevadas (${tr.map(k => `${k.toUpperCase()} ${s(k)}`).join(' / ')})` : 'Transaminasas en rango')]);
    push(joinSent(sents), 'lip');
  }
  {
    const sents = [], urato = v('urato'), albv = v('alb'), pcrp = v('pcr'), rh = refOf('urato')?.[2], lim = rh != null ? +rh : 7;
    if (num(urato)) sents.push([T(urato <= lim ? 'Ac. úrico en rango' : `Ac. úrico ${urato <= lim + 1 ? 'ligeramente elevado' : 'elevado'} (${s('urato')})`)]);
    if (num(albv) || num(pcrp)) {
      const bad = [num(albv) && albv < 3.5 && `hipoalbuminemia (${s('alb')})`, num(pcrp) && pcrp > 5 && `PCR elevada (${s('pcr')})`].filter(Boolean);
      sents.push([T(bad.length ? `Alteración de parámetros nutricionales/inflamatorios: ${join(bad)}` : num(albv) && num(pcrp) ? 'Aceptables parámetros nutricionales e inflamatorios' : num(albv) ? 'Aceptables parámetros nutricionales' : 'Aceptables parámetros inflamatorios')]);
    }
    if (num(v('hba1c'))) sents.push([T(`HbA1c ${s('hba1c')}%`)]);
    push(joinSent(sents), 'misc');
  }
  if (hemoTxt) push([T(hemoTxt)], 'hemo');
  {
    const leu = rec('u_leu'), nit = rec('u_nit'), hem = rec('u_hem'), pos = r => r && !(/^(neg|normal|-|ausente)/i.test(r.valueStr) || r.num === 0);
    if (leu || nit) {
      const f = [pos(leu) && 'leucocituria', pos(nit) && 'nitritos positivos'].filter(Boolean);
      if (f.length) { DD = []; dec('solicito sedimento y urocultivo', { why: 'DRAS alterado' }); tpl.push([T(`DRAS con ${join(f)}${pos(hem) ? ' y hematuria' : ''}`), T(' '), S(`${DD.join(' y ')}.`)]); }
      else tpl.push([T(`DRAS sin datos de ITU${pos(hem) ? ', con hematuria' : ''}`)]);
    }
  }

  // 8. Reglas por fármaco (sólo si el fármaco está en el listado)
  if (dial) medNote('sglt2', 'Sin indicación de iSGLT2 en diálisis: valoro suspender');
  if (dial || (num(fg) && fg < 30)) medNote('metf', 'Metformina contraindicada con FGe <30 o diálisis: suspendo');
  else if (num(fg) && fg < 45) medNote('metf', 'FGe 30-44: reduzco metformina a máx. 1000 mg/día');
  medNote('nsaid', 'Evito AINE en ERC: valoro suspender');
  if (num(fg) && fg < 60) {
    medNote('sulf', 'Evito sulfonilureas de vida media larga con FGe <60 (hipoglucemias): valoro alternativa');
    medNote('gaba', 'Ajusto dosis de gabapentinoide al FGe');
    medNote('dpp4', 'Ajusto iDPP4 al FGe (alogliptina 12,5 mg si FGe 30-59 y 6,25 mg si <30; sitagliptina 50/25 mg; linagliptina sin ajuste)');
  }
  if (has('doac') && (!num(crClG) || crClG < 50)) medNote('doac', num(crClG) ? `CrCl (Cockcroft-Gault) ${f0(crClG)} mL/min: reviso dosis (edoxabán 30 mg si 15-50; rivaroxabán 15 mg si 15-49; dabigatrán contraindicado <30; apixabán 2,5 mg/12 h si ≥2 de edad ≥80, peso ≤60, Cr ≥1,5)` : 'Reviso dosis del anticoagulante oral directo según aclaramiento (Cockcroft-Gault)');
  return { bullets, tbullets: tpl, plan, adds, fg, K };
}

// ---- Evolución (series, pendiente y gráficas)
export function evolution(all, { age, female, months = 24 }) {
  const rows = [], charts = [];
  const keys = [['fg', 'FGe', 'mL/min/1,73 m²'], ['cr', 'CrS', 'mg/dL'], ['u_pcr', 'uPCR', 'mg/g'], ['u_acr', 'uACR', 'mg/g'], ['k', 'K', 'mmol/L'], ['hb', 'Hb', 'g/dL'], ['hco3', 'HCO3', 'mmol/L'], ['p', 'P', 'mg/dL'], ['pth', 'PTH', 'pg/mL']];
  for (const [k, label, unit] of keys) { const s = series(all, k); if (s.length > 1) { rows.push([label, trendText(s, 6)]); charts.push({ key: k, label, unit, ser: s }); } }
  let s = series(all, 'fg'), derived = false;
  if (s.length < 3) {
    const cr = series(all, 'cr');
    if (cr.length >= 3 && age) {
      const last = Date.parse(cr[cr.length - 1].date);
      s = cr.map(p => { const e = ckdepi2021(p.value, age - (last - Date.parse(p.date)) / 3.156e10, !!female); return { date: p.date, value: e, str: f0(e) }; });
      derived = true;
      charts.unshift({ key: 'fg', label: 'FGe (CKD-EPI 2021 calculado)', unit: 'mL/min/1,73 m²', ser: s });
    }
  }
  let sl = null;
  if (s.length >= 3) {
    const since = new Date(Date.parse(s[s.length - 1].date) - months * 30.44 * 864e5).toISOString().slice(0, 10);
    const r = regress(s.filter(p => p.date >= since)) || regress(s);
    if (r) {
      sl = { perYear: r.perYear, n: r.n, spanYears: r.spanYears, last: r.last, at5: Math.max(0, r.at(5)) };
      rows.push(['Pendiente FGe', `${fx(r.perYear, 1)} mL/min/año (${r.n} puntos, ${fx(r.spanYears, 1)} años${derived ? ', FGe calculado con CKD-EPI 2021' : ''}); FGe a 5 años ≈ ${f0(sl.at5)} mL/min (extrapolación lineal, orientativa${r.spanYears < 1 ? '; seguimiento <1 año: poco fiable' : ''})`]);
    }
  }
  return { rows, slope: sl, charts };
}

// ---- Documento: líneas de segmentos
const HEAD = /^\s*(an[aá]l[ií]ticamente|an[aá]l[ií]sis|an[aá]l[ií]tica)\b/i;
const TAIL_HEAD = /^\s*(comentario plan|medicaci[oó]n previa|medicaci[oó]n actualizada)\b/i;
const BUL = /^\s*(\\?-|•|\*(?!\*)|--?>|\d+[.)])\s*/;
const plainLine = l => l.replace(/\*\*/g, '');
const TITLES = { erca: 'REVISION ERCA', general: 'REVISION NEFROLOGÍA', glom: 'REVISION GLOMERULARES', tx: 'REVISION TRASPLANTE', dp: 'REVISION DIÁLISIS PERITONEAL', hd: 'REVISION HEMODIÁLISIS', hdd: 'REVISION HEMODIÁLISIS DOMICILIARIA', guardia: '' };
const B = t => ({ t, b: true });

export function buildReview(inp) {
  const { type, prev = '', medsText = '', bullet: bch = '- ', style = 'tpl' } = inp;
  const texts = inp.labTexts || [inp.labText || ''];
  const warnings = [];
  const sn = { ...sniffPatient(prev), ...sniffPatient(texts.join('\n')) };
  const age = inp.age ?? sn.age, female = inp.female ?? sn.female, kg = inp.kg ?? sn.weight, cm = inp.cm ?? sn.height;
  const cur = current(collect(texts), inp.defaultDate);
  if (!cur.date) return { warnings: ['No se reconoció ninguna analítica en el texto pegado.'], cur };
  const meds = parseMeds(medsText);
  const unknown = meds.filter(m => m.unknown).map(m => m.raw.split(/\s+\d/)[0].slice(0, 40));
  if (unknown.length) warnings.push(`Fármacos sin equivalente en el diccionario: ${unknown.join(', ')}.`);
  const res = analyze({ cur, all: cur.all, type, meds, age, female, kg, dm: inp.dm, session: inp.session });
  if (!age && !DIAL.has(type)) warnings.push('Sin edad: no se calculan FGe a partir de Cr ni reglas por edad (estatinas). Indica edad y sexo.');

  let lines = prev ? prev.split(/\r?\n/) : [];
  const cut = lines.findIndex(l => TAIL_HEAD.test(plainLine(l)));
  if (cut >= 0) lines = lines.slice(0, cut); // plan y medicación de la revisión anterior: se regeneran abajo
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (TITLES[type] && lines.length && lines[0].trim().length < 60 && /^\s*(\*\*)?\s*primera consulta\b/i.test(lines[0])) lines[0] = /^\s*\*\*/.test(lines[0]) ? `**${TITLES[type]}**` : TITLES[type];

  let h = lines.findIndex(l => HEAD.test(plainLine(l)));
  if (h < 0) {
    h = lines.findIndex((l, i) => /anal[ií]tica/i.test(plainLine(l)) && BUL.test(plainLine(lines[i + 1] || '')));
    if (h >= 0) warnings.push(`Sustituí desde la línea «${plainLine(lines[h]).slice(0, 60)}» hasta el final de sus viñetas.`);
  }
  const hdr = style === 'tpl' ? B('Analíticamente:') : { t: `Analítica (${fmtDate(cur.date)}):`, b: h >= 0 && /\*\*/.test(lines[h]) };
  const section = [[hdr], ...(style === 'tpl' ? [] : [[]]), ...(style === 'tpl' ? res.tbullets : res.bullets).map(b => [T(bch), ...b])];
  let doc;
  if (h < 0) {
    if (prev) warnings.push('No encontré una sección «Analítica/Análisis» en la revisión previa: la añado al final.');
    doc = [...(!prev && TITLES[type] ? [[B(TITLES[type])], []] : []), ...lines.map(parseInline), ...(lines.length ? [[]] : []), ...section];
  } else {
    let e = h + 1;
    const nextNonBlank = i => lines.slice(i + 1).find(l => l.trim());
    while (e < lines.length && (BUL.test(plainLine(lines[e])) || (!lines[e].trim() && nextNonBlank(e) && BUL.test(plainLine(nextNonBlank(e)))))) e++;
    doc = [...lines.slice(0, h).map(parseInline), ...section, ...lines.slice(e).map(parseInline)];
  }
  const medDoc = meds.map(m => [T(m.label), ...(m.notes.length ? [S(` → ${m.notes.join('; ')}`)] : [])]);
  res.adds.forEach(a => medDoc.push([S(`+ ${a}`)]));
  const planDoc = res.plan.map(p => [S(`- ${p}`)]);
  // bloques finales de la plantilla: comentario del plan y medicación previa/actualizada
  doc.push([], [B('Comentario plan')], ...(res.plan.length ? planDoc : [[T('[aquí añadir cambios de forma resumida]')]]));
  if (meds.length) {
    doc.push([], [B('Medicación previa:')], ...meds.map(m => [T(m.label)]), [], [B('Medicación actualizada:')],
      ...meds.map(m => [T(`- ${m.label}`), ...(m.notes.length ? [S(` → ${m.notes.join('; ')}`)] : [])]), ...res.adds.map(a => [S(`- Añadir: ${a}`)]));
  }
  const evo = evolution(cur.all, { age, female });
  return { cur, date: cur.date, doc, section, medDoc, planDoc, evo, ordered: formatOrdered(cur, { extras: inp.extras }), warnings, patient: { age, female, kg, cm }, res };
}

// ---- Render
const esc = x => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const toPlain = (doc, mark = true) => doc.map(l => l.reduce((acc, g) => acc + (g.s && mark ? `${!acc || /\s$/.test(acc) ? '' : ' '}[[${g.t.trim()}]]` : g.t), '')).join('\n');
export const toHtml = (doc, rich = false) => doc.map(l => l.map(g => (g.s ? (rich ? `<b style="color:#C00000">${esc(g.t)}</b>` : `<span class="sug">${esc(g.t)}</span>`) : g.b ? `<b>${esc(g.t)}</b>` : esc(g.t))).join('')).join('<br>');
