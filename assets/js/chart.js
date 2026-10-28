// Gráfica de evolución en SVG (sin librerías): línea, puntos con valor, tendencia lineal y fechas.
import { regress } from './lab.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const YEAR = 365.25 * 864e5;
const dmy = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const fmt = (v, step) => (Math.abs(v) >= 100 || step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2));

export function chartSvg(ser, { label, unit = '' }) {
  const W = 560, H = 240, L = 54, R = 16, T = 34, B = 34;
  const t = ser.map(p => Date.parse(p.date)), y = ser.map(p => p.value);
  const t0 = Math.min(...t), t1 = Math.max(...t);
  let lo = Math.min(...y), hi = Math.max(...y);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad; hi += pad;
  const X = v => L + ((v - t0) / (t1 - t0 || 1)) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = (hi - lo) / 4;
  const grid = [0, 1, 2, 3, 4].map(i => { const v = lo + step * i, yy = Y(v); return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E6E6E6"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#777">${fmt(v, step)}</text>`; }).join('');
  const idx = [...new Set([0, Math.round((ser.length - 1) / 3), Math.round(((ser.length - 1) * 2) / 3), ser.length - 1])];
  const xl = idx.map(i => `<text x="${X(t[i])}" y="${H - 12}" text-anchor="${i === 0 ? 'start' : i === ser.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#777">${dmy(ser[i].date)}</text>`).join('');
  const r = regress(ser);
  const trend = r ? `<clipPath id="c-${esc(label).replace(/\W/g, '')}"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/></clipPath><line clip-path="url(#c-${esc(label).replace(/\W/g, '')})" x1="${X(t0)}" y1="${Y(r.intercept + (r.perYear * t0) / YEAR)}" x2="${X(t1)}" y2="${Y(r.intercept + (r.perYear * t1) / YEAR)}" stroke="#8B2E3B" stroke-width="1.5" stroke-dasharray="5 4"/>` : '';
  const pts = ser.map((p, i) => `${X(t[i])},${Y(p.value)}`).join(' ');
  const dots = ser.map((p, i) => `<circle cx="${X(t[i])}" cy="${Y(p.value)}" r="3.5" fill="#fff" stroke="#5BA7B8" stroke-width="2"/>${i === ser.length - 1 || i === 0 ? `<text x="${X(t[i])}" y="${Y(p.value) - 9}" text-anchor="${i === 0 ? 'start' : 'end'}" font-size="11" font-weight="700" fill="#4D4D4D">${esc(p.str)}</text>` : ''}`).join('');
  const title = `${label}${unit ? ` (${unit})` : ''}${r ? `   tendencia ${r.perYear >= 0 ? '+' : '−'}${fmt(Math.abs(r.perYear), Math.abs(r.perYear))}/año` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}: ${ser.map(p => `${p.str} (${dmy(p.date)})`).join(', ')}" font-family="Montserrat, 'Segoe UI', sans-serif"><rect width="${W}" height="${H}" fill="#fff"/><text x="${L}" y="20" font-size="13" font-weight="700" fill="#8B2E3B">${esc(title)}</text>${grid}${trend}<polyline points="${pts}" fill="none" stroke="#5BA7B8" stroke-width="2"/>${dots}${xl}</svg>`;
}

// Copia la gráfica como imagen PNG (para pegar en informes o chats).
export async function copyChartPng(svg) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
