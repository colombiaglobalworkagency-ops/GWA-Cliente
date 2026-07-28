# Portal de Asesores — `asesor.html`

App para asesores de Global Work Agency. Misma base técnica que la app de clientes
(HTML/CSS/JS plano, sin build) y el mismo sistema de diseño.

**Estado: conectado y funcionando** contra los flujos n8n que ya existían. No se creó
ningún webhook nuevo — se reutilizan los que ya estaban vivos.

**Diferencia clave con la app del cliente:** aquí **no hay Bold ni links de pago**.
El asesor solo *registra* pagos que el cliente ya hizo: **precio + soporte**.

---

## Pantallas

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | Login | Teléfono del asesor → envía OTP por SMS |
| 2 | OTP | 6 dígitos, autoavance, pegar, reenviar |
| 3 | Mis clientes | Lista de perfilados, buscador, filtro por etapa, contadores |
| 4 | Detalle | WhatsApp, etapa del proceso, pagos, documentos |
| 5 | Registrar pago | Solo **precio + soporte** (foto o PDF) |
| 6 | Pago guardado | Confirmación |

Los admins (definidos en n8n) ven **todos** los clientes; el resto solo los suyos.

---

## Endpoints reales usados (ya activos en n8n)

Base: `https://app.rioagencymarketing.com/webhook`

| Función | Endpoint | Flujo n8n |
|---|---|---|
| Login / OTP | `asesor-login` | `ASESOR \| Login - OTP SMS` |
| Verificar OTP | `asesor-verificar-otp` | `ASESOR \| Verificar OTP` |
| Lista | `asesor-perfilados` | `ASESOR \| Perfilados (lista)` |
| Detalle | `asesor-detalle` | `ASESOR \| Detalle Perfilado` |
| Mover etapa | `asesor-etapa` | `ASESOR \| Cambiar Etapa` |
| Subir documento | `cliente-subir-documento` | `CLIENTE \| Subir Documento` (reutilizado) |
| Registrar pago | `registrar-abono` | `GLOBAL \| Registrar Abono` (reutilizado) |

### Contratos (verificados en vivo)

**`asesor-login`** → `{ telefono }` → `{ ok:true, nombre }` · si no es asesor `{ ok:false, error }`
Valida el teléfono contra los **usuarios de GHL** (location `fPuvVoCK3e5wQQVtSujb`) y
manda el OTP por SMS. El OTP se guarda en custom fields del contacto (expira 5 min).

**`asesor-verificar-otp`** → `{ telefono, otp }` → `{ ok:true, asesorId, nombre, isAdmin }`
`asesorId` = id del usuario GHL (owner de las oportunidades). Admins: lista `ADMINS` en el
código del flujo (hoy el teléfono `3123408459`).

**`asesor-perfilados`** → `{ asesorId, isAdmin }` →
`{ ok, total, resumen:{...}, perfilados:[ {contactId, opportunityId, nombre, pais,
etapaIndex, etapaLabel, stageId, total, pagado, restante, porcentaje, asesorNombre} ] }`
Cruza oportunidades de GHL (pipeline `lu0GBVYepcTiVxzhgfFI`) con el Sheet.

**`asesor-detalle`** → `{ contactId }` →
`{ ok, opportunityId, stageId, etapaIndex, editable:{...}, pago:{total,pagado,restante,
porcentaje}, documentos:{acuerdo,cv,documento,pasaporte}, historialPagos:[{concepto,fecha,
comprobante}] }`

**`asesor-etapa`** → `{ opportunityId, stageId }` → `{ ok:true }`
Actualiza el `pipelineStageId` de la oportunidad en GHL. Etapas:

| idx | Etapa | stageId |
|---|---|---|
| 0 | Perfilado | `49c81ecd-195b-436f-8914-ccb5744baa2b` |
| 1 | Documentos | `553471ca-d2f3-4551-965d-2149d924e48e` |
| 2 | En proceso | `26840b35-5d91-41a4-9ce5-c3c18e676355` |
| 3 | Finalizado | `f37a3e1a-4a80-4b61-b8ee-08f17355421e` |

**`cliente-subir-documento`** (multipart) → `contactId`, `tipoDoc`
(`acuerdo`·`cv`·`documento`·`pasaporte`), `archivo` → `{ ok:true }`
Sube a GHL y escribe la columna correspondiente del Sheet.

**`registrar-abono`** (multipart) → `contactId`, `valorPago_1`, `pdfPago_1` (archivo),
`fechaSubida` → `{ ok:true }`
Sube el soporte, lo pone en el primer slot de abono libre (1–6) del Sheet y suma el valor
a la columna `Pagado`. El front solo usa el slot 1 por pago.

Sheet compartido: `1N2c2SEwULpuNYuv-Vc80b8aX7fi0sSWe3nsKX0TbRcs` (pestaña gid `1578484327`).

---

## Acceso de asesores

Se controla desde los **usuarios de GHL**: si el teléfono del asesor coincide con el de un
usuario de la location, puede entrar. (El flujo de login NO lee una hoja `Asesores`; usa
`GET /users` de GHL. Si más adelante quieres controlarlo desde una hoja, se ajusta el
nodo *Match Asesor* del flujo `ASESOR | Login - OTP SMS`.)

Para dar acceso de **admin** (ver todos los clientes): agregar el teléfono a la lista
`ADMINS` en el nodo *Validar OTP Asesor* del flujo `ASESOR | Verificar OTP`.

---

## Notas

- Sesión en `sessionStorage` (`gwa_asesor`), se pierde al cerrar la pestaña.
- La app filtra del lado del cliente, pero la autorización real la hace n8n con el
  `asesorId` (owner de la oportunidad). Un no-admin solo recibe sus perfilados.
- El registro de pago solo pide precio + soporte, según lo definido. La fecha se toma
  automática del momento de la subida.
