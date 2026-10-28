// Pegado que conserva la negrita del HCE: el HTML del portapapeles se convierte en texto con **negrita**.
const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BR']);
const isBold = el => el.tagName === 'B' || el.tagName === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/i.test(el.getAttribute?.('style') || '');

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parts = []; // {t, b}
  const walk = (n, b) => {
    if (n.nodeType === 3) { parts.push({ t: n.nodeValue.replace(/[ \t\r\n ]+/g, ' '), b }); return; }
    if (n.nodeType !== 1 || ['STYLE', 'SCRIPT', 'HEAD'].includes(n.tagName)) return;
    const blk = BLOCK.has(n.tagName);
    if (blk) parts.push({ t: '\n', b: false });
    n.childNodes.forEach(c => walk(c, b || isBold(n)));
    if (n.tagName === 'TD' || n.tagName === 'TH') parts.push({ t: '\t', b: false });
    if (blk) parts.push({ t: '\n', b: false });
  };
  walk(doc.body, false);
  for (let i = parts.length - 1; i > 0; i--) if (parts[i].b === parts[i - 1].b && parts[i].t !== '\n' && parts[i - 1].t !== '\n') { parts[i - 1].t += parts[i].t; parts.splice(i, 1); } // une tramos contiguos
  const total = parts.reduce((a, p) => a + p.t.trim().length, 0), boldLen = parts.reduce((a, p) => a + (p.b ? p.t.trim().length : 0), 0);
  const useBold = total > 0 && boldLen / total < 0.8; // todo en negrita = envoltorio del HCE, no énfasis
  const text = parts.map(p => (useBold && p.b && p.t.trim() ? `${/^\s/.test(p.t) ? ' ' : ''}**${p.t.trim()}**${/\s$/.test(p.t) ? ' ' : ''}` : p.t)).join('')
    .replace(/\*\*\s*\*\*/g, ' ').replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  return text;
}

export function enableBoldPaste(el) {
  el.addEventListener('paste', e => {
    const html = e.clipboardData?.getData('text/html');
    if (!html || !/<(b|strong)\b|font-weight/i.test(html)) return; // sin negrita: pegado normal
    e.preventDefault();
    el.setRangeText(htmlToText(html), el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
