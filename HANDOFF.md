# Hand-off — GWA Cliente / Asesores

Estado del proyecto al 2026-07-29. PWA sin build (HTML/CSS/JS plano) servida por
**GitHub Pages** en el dominio **`app.globalworkagency.com`** (CNAME en el repo).

## URLs en producción
- **Clientes:** https://app.globalworkagency.com/ (`index.html`)
- **Asesores:** https://app.globalworkagency.com/asesor.html
- Fallback GitHub Pages: https://colombiaglobalworkagency-ops.github.io/GWA-Cliente/

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | App del cliente (login OTP, dashboard, perfilamiento, abonos) |
| `asesor.html` | Portal de asesores (ver abajo). Etiqueta "Versión N" visible en el login para verificar caché |
| `pago-exitoso.html` | Retorno tras pago Bold |
| `manifest.json` / `asesor-manifest.json` | PWA instalable (cliente / asesor) |
| `sw.js` | Service worker (network-first). Cache `gwa-cliente-v6` |
| `ASESORES.md` | Doc funcional del portal de asesores |
| `CNAME` | `app.globalworkagency.com` |

---

## Portal de asesores (`asesor.html`)
Login por teléfono + OTP SMS (valida contra **usuarios de GHL**, no una hoja). Admin
definido por teléfono en el flujo de n8n (hoy `+573123408459`, David Arenas) → ve todos
los clientes; el resto solo los suyos.

Funciones: lista de perfilados con buscador/filtros, **resumen de pagos general**
(pagado/por cobrar/total; propio o de todos si admin), detalle del cliente, **cambio de
etapa**, **subir/actualizar documentos**, **registrar pago** (solo precio + soporte, sin
Bold), **notificar al cliente**, y **WhatsApp**.

### Endpoints que consume (todos en `https://app.rioagencymarketing.com/webhook`)
| Acción | Endpoint | Flujo n8n |
|---|---|---|
| Login / OTP | `asesor-login`, `asesor-verificar-otp` | ASESOR \| Login / Verificar OTP |
| Lista + resumen | `asesor-perfilados` | ASESOR \| Perfilados (lista) |
| Detalle | `asesor-detalle` | ASESOR \| Detalle Perfilado |
| Cambiar etapa | `asesor-etapa` | ASESOR \| Cambiar Etapa (usa opportunityId + stageId) |
| Subir documento | `cliente-subir-documento` | CLIENTE \| Subir Documento (reutilizado) |
| Registrar pago | `registrar-abono` | GLOBAL \| Registrar Abono (reutilizado) |
| Notificar cliente | `asesor-nota` | **ASESOR \| Notificar Cliente** (creado en esta sesión) |

Etapas → stageId (pipeline `lu0GBVYepcTiVxzhgfFI`):
`0 Perfilado 49c81ecd-…` · `1 Documentos 553471ca-…` · `2 Proceso 26840b35-…` · `3 Finalizado f37a3e1a-…`

---

## Notificaciones al cliente
Las notificaciones del cliente se leen de las **notas del contacto en GHL**. El dashboard
del cliente muestra como notificación cualquier nota cuyo cuerpo tenga `[cliente]` o 📢.
El flujo **`ASESOR | Notificar Cliente`** (`asesor-nota`, id `FaJfdkCBc0wTPygr`) crea la
nota con el prefijo `[cliente]`. Probado end-to-end.

---

## Pagos Bold (producción)
- Endpoint Bold: `https://integrations.api.bold.co/online/link/v1` (`Authorization: x-api-key <LLAVE>`).
- **Llave de identidad de PRODUCCIÓN ya configurada** en los dos flujos de link
  (perfilamiento `E6JhtrDCHerbqjnQ` y abono `0eHhl6KwjsD20ZNr`). Verificado: genera links
  reales de `checkout.bold.co`. El webhook de notificación **no** verifica firma (no usa la
  llave secreta).
- `callback_url` actualizado al dominio nuevo `app.globalworkagency.com/pago-exitoso.html`.
- **Precio de perfilamiento por origen (nacionalidad):** Colombiana → **COP 150.000**,
  resto de LATAM → **EUR 37**. Sin selector de divisa (se calcula solo en `index.html`).
  - "Total Proceso" del Sheet (COP 9.479.500 / EUR 2.859) **no** se tocó.
- ⚠️ Las llaves de Bold se pasaron por chat; conviene **rotarlas** en Bold por precaución.

---

## Infra / notas
- **Google Sheet:** `1N2c2SEwULpuNYuv-Vc80b8aX7fi0sSWe3nsKX0TbRcs`, pestaña gid `1578484327`.
- **Cuota Google Sheets:** 60 lecturas/min por cuenta (compartida con otros flujos). Bajo
  ráfaga puede agotarse; `asesor-detalle` quedó blindado (`alwaysOutputData` +
  `onError continue` + `retryOnFail`) y el front reintenta. Solución de fondo si crece el
  equipo: subir la cuota en Google Cloud o migrar a base de datos.
- **n8n:** API pública con `X-N8N-API-KEY` (no se guarda en el repo). Los cambios de flujo
  se hicieron vía API; se tomaron backups a un directorio temporal local antes de cada
  edición (no persistentes — re-descargar del API si se necesitan).
- **Codificación:** editar `asesor.html`/`index.html` solo con editores UTF-8. NO usar
  `Set-Content -Encoding UTF8` de PowerShell 5.1 (corrompió acentos una vez; se revirtió).

---

## Seguridad — endurecimiento (2026-07-29)

### 1. Firma del webhook de Bold (anti pagos falsos) — ACTIVO
El webhook `bold-pago-perfilamiento` ahora **valida la firma HMAC de Bold** antes de
procesar. Sin firma válida → no crea oportunidad ni toca el Sheet (nodo *Firma Rechazada*).
- Header `x-bold-signature`, HMAC-SHA256 sobre `base64(cuerpo_crudo)`, hex.
- Se habilitó **Raw Body** en el nodo *Webhook Bold*; dos nodos Crypto (*HMAC b64* / *HMAC raw*)
  cubren ambas variantes. IF *Firma Valida?* enruta.
- ⚠️ La **llave secreta de Bold** se pegó por chat una vez → **ROTARLA** en Bold y
  actualizar el campo *secret* de los nodos *HMAC b64* y *HMAC raw*.
- Backup del flujo previo: `bold_backup_pre_sig.json` (temporal local, no en repo).
- Ojo: ahora el webhook **rechaza POST sin firma válida** (pruebas manuales incluidas). El
  botón "Probar el webhook" de Bold sí firma, así que pasa.

### 2. Panel de asesores — token de sesión firmado — ACTIVO (falta merge del front)
El backend ya **no confía** en `asesorId`/`isAdmin` que mande el navegador.
- `asesor-verificar-otp` emite un **token firmado** (HMAC-SHA256 con un *secreto de servidor*)
  con `{asesorId, isAdmin, exp:+24h}`. Formato `base64(payload).hmacHex`.
- Los 5 endpoints (`asesor-perfilados`, `asesor-detalle`, `asesor-editar`, `asesor-etapa`,
  `asesor-nota`) tienen una puerta *Extraer Token → Verify HMAC → Validar Token → Token Valido?*
  que verifica la firma y saca la identidad **del token**. Token inválido/expirado → 401.
- **Autorización por propiedad:** no-admin solo ve/edita/mueve/notifica a SUS clientes
  (owner de la oportunidad); admin, todos. Nodos *Opp Owner → Check Owner → Autorizado?* (403).
- El **secreto de servidor** vive solo en los nodos de n8n (no en repo ni chat). No rotar.
- ⚠️ **El front debe merjear el PR #8** o el panel en vivo responde "sesión inválida"
  (backend ya exige token, front viejo no lo envía). Tras merge, los asesores re-inician sesión 1 vez.

### PRs abiertos (al 2026-07-29)
- **#8** `seguridad-tokens-asesor` → **merjear (urgente)**: front del panel envía el token.
- **#7** `fix-manifest-starturl` → merjear: `manifest.json` del cliente a `start_url` relativo.
- **#6** `panel-asesores` (asesores.html) → **cerrar sin merge**: obsoleto, el panel es `asesor.html`.

### Aún SIN blindar (writes compartidos)
- `cliente-subir-documento`: compartido con la app del cliente (no se puede exigir token de asesor).
- `registrar-abono` (registrar pago del asesor, suma a `Pagado`): flujo "GLOBAL"; solo lo usa el
  panel hoy, pero podría tener otros llamadores. **Recomendado blindarlo** (token + propiedad)
  tras confirmar que nada más lo llama.

---

## Pendientes / decisiones abiertas
- **Rotar la llave secreta de Bold** (ver Seguridad §1) y blindar `registrar-abono` (§ Aún sin blindar).
- Prueba de **pago real** con monto chico (solo el dueño puede: implica pagar) para validar
  el ciclo completo perfilamiento/abono → registro en proceso y Sheet.
- Origen del cliente se infiere por **nacionalidad**; alternativa: país de residencia o
  indicativo del celular. Confirmar si se cambia.
- Opcional: mostrar el precio (€37 / $150.000) al final del formulario antes de ir a Bold.
- `index.html` `manifest.json` `start_url` con ruta vieja `/GWA-Cliente/…` → **arreglado en PR #7**
  (relativo `index.html` + `scope ./`). Merjear para cerrar.
- **Repo público:** el código servido y `HANDOFF.md`/`ASESORES.md` son visibles en github.com.
  La seguridad NO depende de ocultar el código (las llaves viven en n8n), pero considerar repo
  privado o mover estos .md fuera del repo si se quiere reducir exposición de la infra.
