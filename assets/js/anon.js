// Anonimizador básico para ejemplos y para la IA. No sustituye a la revisión manual: comprueba siempre el resultado.
const NAME = /\b[A-ZÁÉÍÓÚÑ]{2,}(?: [A-ZÁÉÍÓÚÑ]{2,}){0,3},\s+[A-ZÁÉÍÓÚÑ]+(?: [A-ZÁÉÍÓÚÑ]+){0,3}\b/g; // "APELLIDO APELLIDO, NOMBRE"

export const anonymize = text => text
  .replace(/FdN:\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi, 'FdN: [FECHA]')
  .replace(/(Solicitado por:)[^\n]*?(?=\s+(?:Edad:|Peso:|Altura:|Tipo de paciente:)|\n|$)/gi, '$1 [NOMBRE]')
  .replace(NAME, '[NOMBRE]')
  .replace(/\b\d{8}[A-Za-z]\b/g, '[DNI]')
  .replace(/\b\d{7,}\b/g, '[Nº]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
  .replace(/\b[6-9]\d{2}[ .-]\d{3}[ .-]\d{3}\b/g, '[TELÉFONO]');
