# Portal de Asesores — `asesor.html`

App para asesores de Global Work Agency. Misma base técnica que la app de clientes
(HTML/CSS/JS plano, sin build, sin dependencias) y el mismo sistema de diseño.

**Diferencia clave con la app del cliente:** aquí **no hay Bold ni links de pago**.
El asesor solo *registra* pagos que el cliente ya hizo, adjuntando el soporte y el valor.

---

## Pantallas

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | Login | Teléfono del asesor → envía OTP |
| 2 | OTP | 6 dígitos, autoavance, pegar, reenviar con cuenta atrás |
| 3 | Mis clientes | Lista de perfilados asignados, buscador, filtro por etapa, contadores |
| 4 | Detalle del cliente | WhatsApp, etapa del proceso, pagos, documentos |
| 5 | Registrar pago | Valor + divisa + fecha + medio + nota + **soporte obligatorio** |
| 6 | Pago guardado | Confirmación |

---

## Webhooks a crear en n8n

Base: `https://app.rioagencymarketing.com/webhook`

Todos responden JSON. Convención: `{ "ok": true, ... }` o `{ "ok": false, "mensaje": "..." }`.

### 1. `POST /asesor-login`
Busca el teléfono en la hoja **`Asesores`** del Sheet (ver abajo). Si existe, envía el
OTP por WhatsApp/SMS. Si no está en la hoja, `{ "ok": false }` → no puede entrar.

```json
// entrada
{ "telefono": "+57 300 000 0000" }
// salida
{ "ok": true }
// si el número no está en la hoja Asesores
{ "ok": false, "mensaje": "No encontramos un asesor con ese número" }
```

> **Quién es asesor** se controla 100% desde la hoja `Asesores`: agregar una fila
> habilita el acceso, borrarla lo quita. No se toca código.

### 2. `POST /asesor-verificar-otp`

```json
// entrada
{ "telefono": "+57 300 000 0000", "otp": "123456" }
// salida
{ "ok": true, "asesorId": "GHL_USER_ID", "nombre": "Laura Gómez" }
```

`asesorId` = el **id del usuario de GHL** que aparece como *owner* del contacto.

### 3. `POST /asesor-clientes`
Todos los contactos cuyo owner sea este asesor.

```json
// entrada
{ "asesorId": "GHL_USER_ID" }
// salida
{
  "ok": true,
  "nombre": "Laura Gómez",
  "clientes": [
    { "contactId": "abc123", "nombre": "Juan Pérez", "telefono": "+573001112233",
      "pais": "Polonia", "etapaIndex": 2 }
  ]
}
```

`etapaIndex`: `0` Perfilado · `1` Documentos · `2` En proceso · `3` Finalizado.
Si el cliente aún no tiene proceso, omite el campo o manda `null` (se muestra “Sin proceso”).

### 4. `POST /asesor-cliente`
Detalle. Mismo shape que `cliente-dashboard` de la app del cliente.

```json
// entrada
{ "asesorId": "GHL_USER_ID", "contactId": "abc123" }
// salida
{
  "ok": true,
  "cliente": {
    "nombre": "Juan Pérez", "telefono": "+573001112233",
    "pais": "Polonia", "proceso": "Trabajo", "divisa": "COP", "etapaIndex": 2,
    "pago": { "total": 4000000, "pagado": 1500000, "restante": 2500000, "porcentaje": 38 },
    "historialPagos": [
      { "valor": 500000, "divisa": "COP", "fecha": "2026-07-10",
        "metodo": "Transferencia", "registradoPor": "Laura Gómez",
        "soporte": "https://drive.google.com/..." }
    ],
    "documentos": {
      "acuerdo": "https://...", "cv": "https://...",
      "doc": null, "pasaporte": null
    }
  }
}
```

### 5. `POST /asesor-cambiar-etapa`

```json
// entrada
{ "asesorId": "...", "contactId": "abc123", "etapaIndex": 3, "etapa": "Finalizado" }
// salida
{ "ok": true }
```

Debe: actualizar el custom field de etapa en GHL **y** la fila del cliente en el Sheet.

### 6. `POST /asesor-subir-documento` — `multipart/form-data`

| Campo | Valor |
|---|---|
| `asesorId` | id del asesor |
| `contactId` | id del cliente |
| `tipoDoc` | `acuerdo` · `cv` · `doc` · `pasaporte` |
| `archivo` | PDF o imagen |

```json
// salida
{ "ok": true, "url": "https://drive.google.com/..." }
```

Si devuelves `url`, la tarjeta se actualiza al instante; si no, la app recarga el cliente.

### 7. `POST /asesor-registrar-pago` — `multipart/form-data`

| Campo | Valor |
|---|---|
| `asesorId` | id del asesor |
| `asesorNombre` | nombre (para la columna “Registrado por”) |
| `contactId` | id del cliente |
| `clienteNombre` | nombre del cliente |
| `valor` | número, sin separadores |
| `divisa` | `COP` · `USD` · `EUR` · `PLN` |
| `fecha` | `YYYY-MM-DD` |
| `metodo` | Transferencia · Nequi · Daviplata · Efectivo · Consignación · Otro |
| `nota` | texto libre, opcional |
| `soporte` | imagen o PDF del comprobante (**obligatorio**) |

```json
// salida
{ "ok": true }
```

Debe: guardar el archivo en Drive, escribir la fila en el Sheet de pagos y sumar el
abono al total pagado del cliente en GHL, para que se refleje en la app del cliente.

---

## Google Sheets

### Hoja `Asesores` (control de acceso)

El webhook `asesor-login` valida contra esta hoja. Para dar de alta a un asesor,
solo agrega una fila.

| Columna | Ejemplo | Uso |
|---|---|---|
| Nombre | Laura Gómez | se muestra en la app y en “Registrado por” |
| Teléfono | +573001112233 | debe coincidir con el número que escribe en el login |
| Asesor ID (GHL) | `GHL_USER_ID` | es el owner de los contactos → filtra sus clientes |
| Activo | SÍ / NO | opcional: `NO` bloquea el acceso sin borrar la fila |

> El `Asesor ID` es el id del usuario de GHL que ya figura como *owner* del contacto.
> Con eso, `asesor-clientes` filtra automáticamente los clientes de cada quien.

### Hoja `Pagos` (append por cada pago registrado)

| Columna | Origen |
|---|---|
| Fecha registro | timestamp de n8n |
| Fecha del pago | `fecha` |
| Contact ID | `contactId` |
| Cliente | `clienteNombre` |
| Asesor | `asesorNombre` |
| Valor | `valor` |
| Divisa | `divisa` |
| Medio de pago | `metodo` |
| Nota | `nota` |
| Soporte (link) | URL de Drive |

### Hoja `Clientes` (update de la fila por `Contact ID`)

| Columna | Se actualiza desde |
|---|---|
| Etapa | `asesor-cambiar-etapa` |
| Fecha último cambio de etapa | idem |
| Total pagado | `asesor-registrar-pago` |
| Restante | calculado |
| Acuerdo / CV / Documento / Pasaporte | `asesor-subir-documento` |

---

## Notas de seguridad

- La sesión vive en `sessionStorage` (`gwa_asesor`) y se pierde al cerrar la pestaña.
- **Cada webhook debe validar que el `contactId` recibido pertenezca al `asesorId`.**
  El front manda ambos, pero la autorización real tiene que hacerse en n8n: sin eso,
  un asesor podría consultar clientes de otro cambiando el id a mano.
- Conviene que el OTP expire (5 min) y limite intentos del lado de n8n.

---

## Pendientes / decisiones tomadas

- **Login por teléfono + OTP** (decidido), validando contra la hoja `Asesores`.
- Las 4 etapas son las mismas de la app del cliente. Si los asesores necesitan
  sub-etapas (ej. “Visa radicada”), hay que ampliar `ETAPAS` en los dos archivos.
- Los 4 tipos de documento son los del perfilamiento. Añadir más = una línea en `DOCS`.
- No hay control de roles (todos los asesores ven lo mismo, solo sus clientes).
  Si necesitas un perfil admin que vea todo, es un webhook extra.
