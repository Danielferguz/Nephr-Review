// IA opcional: pide a Claude que revise/redacte la actualización. Se llama directamente desde el navegador con la
// clave del propio usuario (se guarda sólo en memoria). Fetch directo y no SDK: la página es estática, sin build.
export const IA_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (más capaz)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (más barato)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (rápido)']];

const SYSTEM = `Eres un asistente de apoyo para un nefrólogo. Recibes la revisión previa de una consulta, la analítica actual, la evolución, el tratamiento y un borrador generado por reglas fijas. Devuelve la revisión ACTUALIZADA completa, en español, con estas normas:
1. Conserva intacto todo el texto de la revisión previa salvo la sección «Analítica (fecha):», que reescribes con la fecha de la última analítica recibida.
2. Estilo del comentario de analítica: viñetas con «- », parsimonioso, frases cortas y primera persona para las decisiones. Ejemplo de estilo (valores inventados):
- Función renal estable, CKD_EPI 20 mL/min con CrS 3.1 (19 mL/min en junio). Proteinuria en ascenso, uPCR 900 y uACR 400 mg/g frente a 500/250 mg/g previos, sin hematuria.
- Control iónico ok (K 4.4 / Na 142). Acidosis metabólica con HCO3 21 pese a bicarbonato 2 g/día: [[aumento aportes]].
- Metabolismo Ca/P: Ca ajustado 8.9, P 5.2 y PTH 320, en ascenso: [[refuerzo quelante con las comidas]].
- resto aceptable.
3. Toda decisión o sugerencia nueva (iniciar, aumentar, reducir, suspender, solicitar, derivar) va entre [[ ]]. Lo demás es descripción factual de los datos aportados.
4. No inventes datos, valores ni dosis. Si falta un dato necesario, indícalo entre [[ ]].
5. Usa principios activos, no nombres comerciales.
6. Respeta la negrita marcada con ** en la revisión previa.
7. Sin explicaciones fuera de la revisión. Al final, si procede, añade «DATOS QUE FALTAN (no pegar en HCIS)» con viñetas.
Las propuestas las valida el clínico: sé prudente.`;

export function buildRequest({ model, type, prev, labs, meds, draft }) {
  const block = (tag, txt) => `<${tag}>\n${txt || '(vacío)'}\n</${tag}>`;
  return {
    model, max_tokens: 16000, system: SYSTEM,
    messages: [{ role: 'user', content: [`Tipo de consulta: ${type}`, block('revision_previa', prev), block('analitica_y_evolucion', labs), block('tratamiento', meds), block('borrador_de_reglas', draft)].join('\n\n') }],
  };
}

export async function askClaude({ key, request, fetchImpl = fetch }) {
  const res = await fetchImpl(IA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(request),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status} de la API`);
  if (data.stop_reason === 'refusal') throw new Error('La IA declinó responder a esta solicitud (filtros de seguridad).');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new Error(`Respuesta vacía${data.stop_reason === 'max_tokens' ? ' (límite de longitud)' : ''}`);
  return text;
}
