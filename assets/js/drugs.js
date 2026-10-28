// Diccionario de fármacos: principio activo (INN), marcas habituales en España, clases para las reglas y marcas de riesgo renal.
//   h = puede reducir el FGe por efecto hemodinámico; s = inhibe la secreción tubular de creatinina (sube la CrS sin dañar el riñón).
// Para ampliarlo basta añadir una línea D(...). Las marcas sin entrada se avisan en pantalla.
import { norm, fmtDate } from './lab.js';

const D = (inn, names = [], cls = [], fl = '') => ({ inn, names: [inn, ...names].map(norm), cls, hemo: fl.includes('h'), secr: fl.includes('s') });
export const DRUGS = [
  // SRAA, ARM, iSGLT2, diuréticos, AINE (efecto hemodinámico)
  D('enalapril', ['renitec'], ['raas'], 'h'), D('lisinopril', [], ['raas'], 'h'), D('ramipril', ['carasel', 'acovil'], ['raas'], 'h'), D('perindopril', ['coversyl'], ['raas'], 'h'), D('captopril', [], ['raas'], 'h'),
  D('losartán', ['cozaar', 'losartan'], ['raas'], 'h'), D('valsartán', ['diovan'], ['raas'], 'h'), D('candesartán', ['atacand', 'blopress'], ['raas'], 'h'), D('irbesartán', ['aprovel', 'karvea'], ['raas'], 'h'),
  D('irbesartán/hidroclorotiazida', ['karvezide', 'coaprovel'], ['raas', 'diur'], 'h'), D('telmisartán', ['micardis', 'pritor'], ['raas'], 'h'), D('olmesartán', ['openvas', 'olmetec'], ['raas'], 'h'),
  D('sacubitrilo/valsartán', ['entresto'], ['raas'], 'h'),
  D('finerenona', ['kerendia'], ['arm'], 'h'), D('espironolactona', ['aldactone'], ['arm', 'diur'], 'h'), D('eplerenona', ['inspra'], ['arm'], 'h'),
  D('dapagliflozina', ['forxiga', 'edistride'], ['sglt2'], 'h'), D('empagliflozina', ['jardiance'], ['sglt2'], 'h'), D('canagliflozina', ['invokana'], ['sglt2'], 'h'),
  D('dapagliflozina/metformina', ['xigduo', 'ebymect'], ['sglt2', 'metf'], 'h'), D('empagliflozina/metformina', ['synjardy'], ['sglt2', 'metf'], 'h'),
  D('furosemida', ['seguril'], ['diur'], 'h'), D('torasemida', ['sutril'], ['diur'], 'h'), D('hidroclorotiazida', [], ['diur'], 'h'), D('clortalidona', ['hygroton'], ['diur'], 'h'), D('indapamida', [], ['diur'], 'h'),
  D('ibuprofeno', [], ['nsaid'], 'h'), D('naproxeno', [], ['nsaid'], 'h'), D('diclofenaco', [], ['nsaid'], 'h'), D('dexketoprofeno', ['enantyum'], ['nsaid'], 'h'), D('etoricoxib', ['arcoxia'], ['nsaid'], 'h'), D('celecoxib', ['celebrex'], ['nsaid'], 'h'),
  // Inhibidores de la secreción tubular de creatinina
  D('trimetoprima/sulfametoxazol', ['septrin', 'cotrimoxazol', 'trimetoprim'], [], 's'), D('cimetidina', [], [], 's'), D('dolutegravir', ['tivicay'], [], 's'), D('dolutegravir/lamivudina', ['dovato'], [], 's'),
  D('bictegravir/emtricitabina/tenofovir alafenamida', ['biktarvy'], [], 's'), D('cobicistat', ['genvoya', 'stribild'], [], 's'), D('ranolazina', ['ranexa'], [], 's'), D('fenofibrato', ['secalip'], [], 's'), D('probenecid', [], [], 's'), D('pirimetamina', [], [], 's'),
  // Antidiabéticos
  D('metformina', ['dianben'], ['metf']), D('semaglutida', ['ozempic', 'rybelsus'], ['glp1']), D('linagliptina', ['trajenta'], ['dpp4']), D('alogliptina', ['vipidia'], ['dpp4']), D('sitagliptina', ['januvia'], ['dpp4']), D('vildagliptina', ['galvus'], ['dpp4']),
  D('vildagliptina/metformina', ['eucreas'], ['dpp4', 'metf']), D('glimepirida', ['amaryl'], ['sulf']), D('gliclazida', ['diamicron'], ['sulf']), D('glibenclamida', ['daonil'], ['sulf']), D('repaglinida', [], []),
  // Lípidos
  D('atorvastatina', ['zarator', 'prevencor', 'lipitor', 'sortis'], ['statin']), D('rosuvastatina', ['crestor'], ['statin']), D('simvastatina', ['zocor'], ['statin']), D('pravastatina', [], ['statin']), D('pitavastatina', ['livazo'], ['statin']),
  D('ezetimiba', ['ezetrol'], ['eze']), D('atorvastatina/ezetimiba', ['atozet'], ['statin', 'eze']),
  // Anticoagulación y antiagregación
  D('edoxabán', ['lixiana'], ['doac']), D('apixabán', ['eliquis'], ['doac']), D('rivaroxabán', ['xarelto'], ['doac']), D('dabigatrán', ['pradaxa'], ['doac']), D('acenocumarol', ['sintrom'], []),
  D('enoxaparina', ['clexane'], []), D('ácido acetilsalicílico', ['adiro', 'aspirina'], []),
  // Metabolismo mineral, anemia, K
  D('calcifediol', ['hidroferol'], ['vitd']), D('colecalciferol', ['deltius', 'vigantol'], ['vitd']), D('calcitriol', ['rocaltrol'], ['vitda']), D('paricalcitol', ['zemplar'], ['vitda']), D('cinacalcet', ['mimpara'], ['calcim']), D('etelcalcetida', ['parsabiv'], ['calcim']),
  D('sevelamer', ['renvela', 'renagel'], ['pbind']), D('carbonato de lantano', ['fosrenol', 'lantano'], ['pbind']), D('carbonato cálcico', ['mastical', 'mastical d'], ['pbind']), D('oxihidróxido sucroférrico', ['velphoro'], ['pbind']),
  D('darbepoetina alfa', ['aranesp'], ['esa']), D('metoxi-polietilenglicol epoetina beta', ['mircera'], ['esa']), D('epoetina', ['eporatin', 'binocrit', 'retacrit', 'neorecormon'], ['esa']),
  D('carboximaltosa férrica', ['ferinject'], ['iron']), D('sulfato ferroso', ['tardyferon', 'ferogradumet', 'fero-gradumet'], ['iron']), D('hierro oral', ['ferbisol'], ['iron']),
  D('ciclosilicato de sodio y zirconio', ['lokelma'], ['kbind']), D('patiromer', ['veltassa'], ['kbind']), D('bicarbonato sódico', ['bicarbonato sodico'], ['bicarb']), D('magnesio', ['magnogene'], ['mg']),
  D('alopurinol', ['zyloric'], ['allo']), D('febuxostat', ['adenuric'], ['allo']),
  // Otros frecuentes
  D('omeprazol', [], ['ppi']), D('pantoprazol', [], ['ppi']), D('esomeprazol', ['nexium'], ['ppi']), D('lansoprazol', [], ['ppi']), D('famotidina', [], []),
  D('gabapentina', ['neurontin'], ['gaba']), D('pregabalina', ['lyrica'], ['gaba']), D('amlodipino', [], []), D('manidipino', ['artedil'], []), D('lercanidipino', ['lercadip'], []), D('bisoprolol', [], []), D('carvedilol', [], []), D('atenolol', [], []),
  D('doxazosina', ['carduran neo', 'carduran'], []), D('silodosina', ['urorec'], []), D('dutasterida/tamsulosina', ['duodart'], []), D('tamsulosina', [], []), D('mirabegrón', ['betmiga'], []), D('levotiroxina', ['eutirox'], []), D('amiodarona', ['trangorex'], []),
  D('paracetamol', [], []), D('metamizol', ['nolotil'], []), D('prednisona', [], []), D('tiotropio', ['spiriva respimat', 'spiriva'], []), D('salbutamol', ['ventolin'], []), D('budesónida/formoterol', ['symbicort'], []), D('vortioxetina', ['brintellix'], []),
  D('sertralina', [], []), D('trazodona', [], []), D('mirtazapina', [], []), D('quetiapina', [], []), D('lorazepam', ['orfidal'], []), D('lormetazepam', [], []), D('zolpidem', ['stilnox'], []), D('clonazepam', ['rivotril'], []), D('cianocobalamina', [], []), D('risedronato', ['actonel'], []),
].sort((a, b) => b.names[0].length - a.names[0].length);

const MAKERS = 'mundogen|normon|kern pharma|cinfa|neo teva|teva|belmac|alter|aurovitas|almus|rovi|stada|sandoz|ratiopharm|qualigen|tecnigen|accord|pensa|davur|cuve|apotex|mylan|viatris|aristo|zentiva|krka|bluefish|cantabria|gamma';
const MAKER_RE = new RegExp(`^\\s+(?:${MAKERS})\\b`, 'i');
const nameRe = new Map(); // regex por nombre, creada una vez
const re = n => nameRe.get(n) || nameRe.set(n, new RegExp(`(^|[^a-z])(${n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})(?![a-z])`)).get(n);

export function findDrug(raw) {
  const n = norm(raw);
  for (const d of DRUGS) for (const name of d.names) {
    const m = re(name).exec(n);
    if (m) return { d, start: m.index + m[1].length, end: m.index + m[1].length + name.length };
  }
  return null;
}

const num = s => parseFloat(String(s).replace(',', '.'));
const fmtN = x => String(Math.round(x * 100) / 100).replace('.', ',');
const toIso = (d, m, y) => `${y.length === 2 ? '20' + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function startDate(raw) {
  const m = raw.match(/(?:desde|inicio|iniciad[oa])\s*(?:el\s*)?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i) || raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+CRONICA/i) || raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? toIso(m[1], m[2], m[3]) : null;
}

// Dosis diaria a partir de "6,25 mg ... 1-0-1" o de "1 Desayuno,1 Cena".
export function dailyDose(raw) {
  const d = raw.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ui)\b/i);
  const p = raw.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?/);
  const tomas = p ? p.slice(1).filter(Boolean).reduce((a, x) => a + num(x), 0)
    : [...raw.matchAll(/(\d+(?:[.,]\d+)?)\s+(?:desayuno|almuerzo|comida|merienda|cena|acostarse)/gi)].reduce((a, x) => a + num(x[1]), 0);
  return d && tomas ? `${fmtN(num(d[1]) * tomas)} ${d[2].toLowerCase()}/día` : '';
}


// "1 g 0-2-2" o "6,25 mg … 1 Desayuno,1 Cena" -> "2 g en comida y 2 g en cena". null si no se puede repartir la dosis.
const SLOTS = ['desayuno', 'comida', 'cena', 'al acostarse'];
const slotName = w => ({ almuerzo: 'comida', acostarse: 'al acostarse' }[w.toLowerCase()] || w.toLowerCase());
const joinEs = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}` : a[0] || '');
function expandPosology(label, tail, inn) {
  if (inn?.includes('/')) return null; // combinaciones: cada componente tiene su dosis
  const p = label.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ui)\s+(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?/i);
  if (p) {
    const items = p.slice(3).filter(x => x !== undefined).map((c, i) => (num(c) > 0 ? `${fmtN(num(p[1]) * num(c))} ${p[2].toLowerCase()} en ${SLOTS[i]}` : null)).filter(Boolean);
    return items.length ? label.slice(0, p.index) + joinEs(items) + label.slice(p.index + p[0].length) : null;
  }
  const d = label.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ui)\b/i), t = [...tail.matchAll(/(\d+(?:[.,]\d+)?)\s+(desayuno|almuerzo|comida|merienda|cena|acostarse)/gi)];
  if (!d || !t.length) return null;
  const items = t.map(x => `${fmtN(num(d[1]) * num(x[1]))} ${d[2].toLowerCase()} en ${slotName(x[2])}`);
  return label.slice(0, d.index) + joinEs(items) + label.slice(d.index + d[0].length);
}

export function parseMeds(text) {
  return text.split(/\r?\n|;/).map(l => l.trim()).filter(Boolean).map(raw => {
    const tail = raw.match(/CRONICA\s+(.*)$/i);
    let label = raw.replace(/^(?:f[aá]rmacos|tratamiento|medicaci[oó]n)[^:]{0,20}:\s*/i, '').split(/,\s/)[0]
      .replace(/\s+\d+\s+(comprimidos?|capsulas?|sobres?|ampollas?|comp)\b.*$/i, '').trim();
    if (label === label.toUpperCase()) label = label.toLowerCase();
    const hit = findDrug(label);
    if (hit) {
      const after = label.slice(hit.end).replace(MAKER_RE, '');
      label = (label.slice(0, hit.start) + hit.d.inn + after).trim();
    }
    const start = hit ? startDate(raw) : null;
    const flagged = hit && (hit.d.hemo || hit.d.secr);
    if (flagged) label = label.replace(/\s*(?:desde|inicio|iniciad[oa])\s*(?:el\s*)?\d{1,2}\/\d{1,2}\/\d{2,4}/i, '');
    const ex = expandPosology(label, tail ? tail[1] : '', hit?.d.inn);
    if (ex) label = ex;
    return {
      raw, inn: hit?.d.inn || null, classes: hit?.d.cls || [], hemo: !!hit?.d.hemo, secr: !!hit?.d.secr, start, dose: dailyDose(raw), notes: [], unknown: !hit,
      label: label + (tail && !ex ? ` — ${tail[1].trim()}` : '') + (flagged ? ` (inicio ${start ? fmtDate(start) : 'no consta'})` : ''),
    };
  });
}
