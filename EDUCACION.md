# Apartado Educación (clientes y asesores)

Cursos por módulos, en escalera de lo básico a lo avanzado, con **desbloqueo secuencial**: el módulo N+1 se abre solo cuando el usuario terminó de ver el módulo N. Existe en la app del cliente (`index.html`) y en el panel de asesores (`asesor.html`).

## Cómo se ve (tres pantallas)
1. **Cursos:** tarjetas con imagen de portada, título, descripción, barra de avance, "X de N módulos" y el porcentaje. Se llega desde la tarjeta **Educación** (botón *Ver cursos*) del dashboard o del panel de asesores.
2. **Módulos del curso elegido:** "Tu avance", botón *Empezar/Continuar*, y los módulos por nivel (bloqueado / en curso / completado).
3. **Reproductor:** video, resumen y *Siguiente módulo* (siempre dentro del mismo curso).

Cada curso del catálogo puede traer `titulo`, `descripcion`, `imagen` (URL https) y `orden` (los cursos salen ordenados por `orden`; sin él quedan al final). Se publican con `educacion_publicar.js --descripcion ... --imagen ... --orden N`.

## Piezas
| Pieza | Dónde |
|---|---|
| Interfaz (lista de módulos + reproductor) | `educacion.js` y `educacion.css`, cargados por las dos páginas |
| Tarjeta de entrada | `index.html` (dashboard y pantalla "sin proceso") y `asesor.html` (listado de clientes). Solo se muestra si el servidor responde con cursos |
| Backend | Workflows de n8n `EDU \| Estado` (`edu-estado`) y `EDU \| Evento` (`edu-evento`) |
| Datos | Data Tables de n8n: `edu_cursos` (catálogos) y `edu_progreso` (una fila por usuario + módulo) |
| Videos | Repositorio público aparte `GWA-Educacion` con GitHub Pages (sirve `video/mp4` con reproducción por tramos; los Releases de GitHub se entregan como descarga y no se reproducen en iPhone). Las URLs viven en el catálogo, no en el repo de la app |

## Qué valida el servidor (no el navegador)
- **Quién es el usuario:** token de sesión firmado. Cliente = `c:<contactId>`, asesor = `a:<asesorId>`.
- **Audiencia:** cada curso declara para quién es (`cliente`, `asesor` o ambos).
- **Orden:** un módulo solo se puede iniciar o terminar si todos los anteriores están completados.
- **URL del video:** solo viaja en la respuesta de módulos desbloqueados. Los nombres de archivo no son adivinables.
- **"Visto":** el módulo se marca completado únicamente si la posición llegó al ≥ 92 % **y** el servidor acumuló al menos el 50 % de la duración en tiempo real de reproducción (pulsos cada 10 s, máx. 20 s por pulso). Abrir el video o saltar al final no cuenta; 2× de velocidad sí se tolera.
- El progreso persiste por usuario, así que se conserva al cambiar de dispositivo.

## Agregar o cambiar un curso (sin tocar código)
1. Preparar el catálogo JSON: `{ "curso": "...", "audiencia": ["cliente","asesor"], "niveles": [ { "nivel": 1, "nombre": "...", "modulos": [ { "id": "cli-01", "titulo": "...", "resumen": "...", "segundos": 418 } ] } ] }`. El orden de los módulos es el orden de desbloqueo.
2. Subir los videos al repo de videos (GitHub Pages) y armar `urls.json` (`{ "cli-01": "https://github.com/.../releases/download/.../cli-01-xxxx.mp4" }`).
3. Publicar: `node GWA/scripts/educacion_publicar.js catalogo.json --urls urls.json --aplicar`.

Para quitar un curso, poner `activo = false` en su fila de `edu_cursos`.

## Notas
- Los videos traen los subtítulos **incrustados en la imagen** (siempre visibles); no hay botón para activarlos o desactivarlos.
- El service worker no cachea videos (solo precarga los archivos de la app).
- Hasta que los workflows `EDU` estén activos en n8n, la tarjeta permanece oculta y nadie ve errores.
