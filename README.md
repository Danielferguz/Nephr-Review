# Nefro Revisión

Página estática (HTML + CSS + JS sin build ni dependencias) para actualizar revisiones de consultas de nefrología y calcular. Paleta de EPI-LAB sobre fondo blanco.

**Privacidad:** los datos se procesan en el navegador y no se guardan. La CSP solo permite conectar con `api.anthropic.com`, y únicamente se usa si activas la opción de IA con tu propia clave y marcas el consentimiento.

## Qué hace
- **Revisión**: pegas cinco cuadros (revisión previa, **última analítica del sistema**, tratamiento, evolución de CrS/FGe/proteinuria y otra analítica). No hace falta analítica «de hoy»: se usa la fecha de la última que pegues. La **negrita** del HCE se conserva al pegar. Devuelve:
  - la revisión con la sección *Analítica (fecha)* sustituida y comentada en tu estilo, con las **decisiones propuestas en rojo y negrita**; el resto queda igual;
  - *Analítica ordenada* por grupos, *Medicación propuesta* (principio activo en lugar de marca, dosis diaria y fecha de inicio de los fármacos que alteran el FGe o la CrS), *Plan sugerido* y *Evolución y gráficas* (SVG con tendencia, copiables como imagen);
  - copiar con formato (rojo + negrita) o en texto plano (propuestas entre `[[ ]]`).
- **Detección automática**: lo pegado se analiza en vivo y rellena los campos de las calculadoras y de KFRE/Mayo/SCORE2 (edad y sexo incluidos).
- **Riesgo**: KFRE (4/8 variables, 2 y 5 años), ADPKD (clase de Mayo y proyección de FGe) y SCORE2/SCORE2-OP con estatinas (KDIGO + objetivos ESC).
- **Calculadoras**: hematología, hemodiálisis/DP, nefroclínica (incluye Furst) y bioquímica/electrolitos/ácido-base.
- **IA opcional**: Claude revisa y redacta la actualización (clave propia, solo en memoria; anonimización opcional).
- **Guardar ejemplo**: descarga un `.txt` (anonimizado si quieres) para adjuntarlo en el chat desde cualquier ordenador. No se envía nada automáticamente.

Las sugerencias por defecto son **reglas fijas** (`assets/js/review.js`); el clínico las valida.

## Acceso
`index.html` tiene una puerta de acceso en el navegador (`assets/js/auth.js`). **No es seguridad real**: el código es público y el hash se puede romper. No pongas datos de pacientes en el repositorio.

## Estructura
| Archivo | Contenido |
|---|---|
| `assets/js/lab.js` | Parser de analítica (con negrita), catálogo de analitos, series y regresión |
| `assets/js/drugs.js` | Diccionario de fármacos: principio activo, marcas, clases y marcas de riesgo renal (`h`/`s`) |
| `assets/js/review.js` | Reglas, comentario de analítica, medicación, plan y construcción de la revisión |
| `assets/js/calc.js`, `risk.js` | Fórmulas, calculadoras, KFRE, Mayo, SCORE2 y estatinas |
| `assets/js/chart.js` | Gráficas SVG |
| `assets/js/paste.js`, `anon.js`, `ia.js` | Pegado con negrita, anonimizador y cliente de IA |
| `assets/js/app.js` | Interfaz |
| `tests/run.mjs` | Tests con datos **sintéticos** (`node tests/run.mjs`) |

**Ampliar el diccionario de fármacos:** añade una línea `D('principio activo', ['marcas'], ['clases'], 'h|s')` en `drugs.js`. Las marcas sin entrada se avisan en pantalla.

## Publicar (GitHub Pages)
Settings → Pages → *Deploy from a branch* → rama `main`, carpeta `/ (root)`. Los módulos ES requieren servir por HTTP(S); abrir `index.html` con doble clic no funciona. En local: `python3 -m http.server`.

## Fuentes de las fórmulas
KFRE: Tangri, JAMA 2016 (constantes del paquete `kfre`); uPCR→uACR: Sumida, Ann Intern Med 2020. SCORE2/OP: ESC 2021. Mayo: Irazabal, JASN 2015 (150 mL/m al nacer; cortes 1,5/3/4,5/6 %/año). CKD-EPI 2021 y EKFC. Kt/V: Daugirdas 2ª generación, Leypoldt (stdKt/V). KDIGO lípidos 2013. **Revisa umbrales y reglas con las guías vigentes antes de usarlo con pacientes.**

## Límites conocidos
- La fecha de inicio de los fármacos sale de la columna de fecha del listado del HCE o de «desde dd/mm/aaaa» en el texto; puede ser la fecha de la última prescripción.
- Las sugerencias de medicación son textuales (no calculan nuevas dosis).
- La IA no está probada contra la API real en este repositorio (solo con respuestas simuladas); sin protección frente a refusals por fallback del servidor.
- Las pendientes de FGe por clase de Mayo no se incluyen (sin fuente verificada).
- nPCR usa la ecuación de Depner/Daugirdas (válida para 3 sesiones/semana).
- Glomerulares, trasplante y guardia comparten las reglas generales.
- Fuentes tipográficas: Montserrat y Source Sans 3 si están instaladas; si no, la fuente del sistema.
