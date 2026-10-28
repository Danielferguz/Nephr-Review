// Puerta de acceso SIMPLE en el navegador. No es seguridad real: el código es público y el hash se
// puede romper por fuerza bruta. Sirve para ocultar la página a visitantes casuales; no pongas datos
// de pacientes en el repositorio ni confíes en esto para protegerlos.
const HASH = 'c76c32cfec6e9077d036ec9316c85a71fbaab84f4a475878915462dff8b113a8'; // sha256("usuario\ncontraseña")
const KEY = 'nr-ok';

const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const isLogged = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
export const logout = () => { try { sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };
export async function login(user, pass) {
  const ok = (await sha(`${user.trim()}\n${pass}`)) === HASH;
  if (ok) try { sessionStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento: vale para esta pestaña */ }
  return ok;
}
