# Nefro Revisión

Página estática (HTML + CSS + JS sin build ni dependencias) para actualizar revisiones de consultas de nefrología y calcular. Paleta de EPI-LAB sobre fondo blanco. **Todo se procesa en el navegador: no se envía ni se guarda nada** (CSP con `connect-src 'none'`).

## Qué hace
- **Revisión**: pegas la revisión previa, la analítica actual (línea con fecha del HCE y/o rejillas de evolución) y el tratamiento. Devuelve:
  - la revisión con la sección *Analítica* sustituida (resto intacto) y las sugerencias **en rojo y negrita** para validar;
  - *Analítica ordenada* por grupos, *Medicación propuesta*, *Plan sugerido* y *Evolución* (series y pendiente de FGe).
  - Copiar con formato (rojo + negrita) o en texto plano (sugerencias entre `[[ ]]`).
  - Consultas: ERCA, general, glomerulares, trasplante, DP, hemodiálisis, hemodomi y guardia (reglas de ERC no dialítica o de diálisis según el tipo).
- **Riesgo**: KFRE (4/8 variables, 2 y 5 años), ADPKD (clase de Mayo y proyección de FGe) y SCORE2/SCORE2-OP con recomendación de estatinas (KDIGO + objetivos ESC).
- **Calculadoras**: hematología, hemodiálisis/DP, nefroclínica (incluye Furst) y bioquímica/electrolitos/ácido-base.

Las sugerencias son **reglas fijas** (`assets/js/review.js`); el clínico las valida. No hay IA ni llamadas externas.

## Acceso
`index.html` tiene una puerta de acceso en el navegador (`assets/js/auth.js`). **No es seguridad real**: el código es público y el hash se puede romper. No pongas datos de pacientes en el repositorio.

## Estructura
| Archivo | Contenido |
|---|---|
| `assets/js/lab.js` | Parser de analítica, catálogo de analitos, series y pendiente |
| `assets/js/calc.js` | Fórmulas y catálogo de calculadoras |
| `assets/js/risk.js` | KFRE, Mayo, SCORE2 y estatinas |
| `assets/js/review.js` | Reglas, medicación, plan y construcción de la revisión |
| `assets/js/app.js` | Interfaz |
| `tests/run.mjs` | Tests con datos **sintéticos** (`node tests/run.mjs`) |

## Publicar (GitHub Pages)
Settings → Pages → *Deploy from a branch* → rama `main`, carpeta `/ (root)`. Los módulos ES requieren servir por HTTP(S); abrir `index.html` con doble clic no funciona. En local: `python3 -m http.server`.

## Fuentes de las fórmulas
KFRE: Tangri, JAMA 2016 (constantes del paquete `kfre`); uPCR→uACR: Sumida, Ann Intern Med 2020. SCORE2/OP: ESC 2021. Mayo: Irazabal, JASN 2015 (150 mL/m al nacer; cortes 1,5/3/4,5/6 %/año). CKD-EPI 2021 y EKFC. Kt/V: Daugirdas 2ª generación, Leypoldt (stdKt/V). KDIGO lípidos 2013. **Revisa umbrales y reglas con las guías vigentes antes de usarlo con pacientes.**

## Límites conocidos
- Las sugerencias de medicación son textuales (no calculan nuevas dosis).
- Las pendientes de FGe por clase de Mayo no se incluyen (sin fuente verificada); la proyección usa la pendiente observada o la que indiques.
- nPCR usa la ecuación de Depner/Daugirdas (válida para 3 sesiones/semana).
- Glomerulares, trasplante y guardia comparten las reglas generales; faltan reglas específicas.
- Fuentes tipográficas: Montserrat y Source Sans 3 si están instaladas; si no, se usa la fuente del sistema.
