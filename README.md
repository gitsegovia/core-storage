# Core Vault

Servicio centralizado de almacenamiento de archivos desarrollado por **Core Code Innovation**.

Permite que múltiples sistemas (ERP, CRM, apps, bots, etc.) suban, descarguen y gestionen archivos a través de una API REST, organizados automáticamente por sistema, colección y sub-carpetas.

---

## Stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Fastify 5
- **Base de datos**: PostgreSQL 16 (metadata y registro de sistemas)
- **ORM**: Prisma
- **Almacenamiento**: Filesystem con bind mount Docker
- **Auth**: API keys por sistema + master key para administración

---

## Arquitectura de almacenamiento

Los archivos se organizan en el filesystem según la ruta que defines al subir:

```
{STORAGE_PATH}/
├── erp/                                  ← Sistema "erp"
│   ├── invoices/                         ← Colección directa
│   │   ├── factura_001_a8Kd2mXp.pdf
│   │   └── factura_002_bR4nYq1z.pdf
│   └── reports/
│       ├── monthly/                      ← Sub-carpeta dentro de colección
│       │   └── reporte_junio_cT7wLm3x.xlsx
│       └── quarterly/
│           └── q2_summary_dF9pNk5v.pdf
├── crm/                                  ← Sistema "crm"
│   ├── avatars/
│   │   └── profile_eH2jRs8w.jpg
│   └── documents/
│       └── contracts/
│           └── acme-corp/                ← Sub-carpetas anidadas
│               └── contrato_fK4mTp6y.pdf
├── sipeg/                                ← Sistema "sipeg"
│   └── documentos/
│       ├── 13457724/                     ← Sub-carpeta por ID de persona
│       │   ├── cedula.pdf
│       │   ├── rif.pdf
│       │   └── titulo.pdf
│       └── 13732346/
│           ├── cedula.pdf
│           └── rif.pdf
```

- Cada **sistema** tiene su carpeta raíz (el `slug` del sistema).
- Dentro, las **colecciones** y **sub-carpetas** las defines tú al subir archivos.
- Los nombres de archivo se preservan pero se les agrega un sufijo único para evitar colisiones al subir vía API.
- Los archivos subidos manualmente al filesystem se pueden registrar con el script de sincronización (ver sección Sincronización).

---

## Instalación y despliegue

### 1. Clonar el repositorio

```bash
git clone <tu-repo-url> core-storage
cd core-storage
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus valores:

```env
# Ruta en el HOST donde se almacenarán los archivos.
# Esta carpeta debe existir y tener espacio suficiente.
STORAGE_HOST_PATH=/mnt/data/core-vault

# Ruta dentro del container — NO cambiar
STORAGE_PATH=/data/storage

# Keys de seguridad — generar con: openssl rand -hex 32
ADMIN_API_KEY=tu_admin_key_segura
SIGNED_URL_SECRET=tu_secret_para_urls

# Credenciales PostgreSQL
POSTGRES_USER=corestorage
POSTGRES_PASSWORD=una_password_segura
POSTGRES_DB=corestorage
DATABASE_URL=postgresql://corestorage:una_password_segura@db:5432/corestorage
```

> **Importante**: `STORAGE_HOST_PATH` es la ruta en tu servidor (host), no dentro del container.
> Apunta esta variable a un disco o partición con espacio suficiente.

### 3. Crear la carpeta de storage en el host

```bash
sudo mkdir -p /mnt/data/core-vault
sudo chmod 777 /mnt/data/core-vault
```

### 4. Levantar con Docker

```bash
docker-compose up -d --build
```

El servicio estará disponible en `http://localhost:4400`.

### Verificar que está corriendo

```bash
curl http://localhost:4400/health
# {"status":"ok","service":"core-storage","timestamp":"2026-05-27T..."}
```

---

## Autenticación

El sistema usa dos niveles de autenticación:

| Nivel | Header | Uso |
|---|---|---|
| **Admin** | `Authorization: Bearer {ADMIN_API_KEY}` | Crear, listar y gestionar sistemas |
| **Sistema** | `Authorization: Bearer {system_api_key}` | Subir, descargar, listar y eliminar archivos |

La `ADMIN_API_KEY` se define en `.env`. Las API keys de cada sistema se generan al registrarlos.

En los sistemas cliente, se recomienda usar estas variables de entorno:

```env
CORE_VAULT_API_KEY=csk_sipeg_...
CORE_VAULT_URL=https://storage.tudominio.com
```

---

## Guía de uso

### Paso 1: Registrar un sistema

Cada aplicación que necesite usar el storage se registra como un "sistema".

```bash
curl -X POST http://localhost:4400/api/v1/admin/systems \
  -H "Authorization: Bearer TU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sistema de Personal",
    "slug": "sipeg"
  }'
```

**Respuesta:**

```json
{
  "id": 1,
  "name": "Sistema de Personal",
  "slug": "sipeg",
  "apiKey": "csk_sipeg_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "isActive": true,
  "createdAt": "2026-05-27T10:30:00.000Z"
}
```

> ⚠️ **La API key se muestra UNA sola vez.** Guárdala de forma segura.
> Si la pierdes, puedes regenerarla (ver sección Administración).

**Reglas del slug:**
- Solo minúsculas, números y guiones: `sipeg`, `mi-erp`, `crm`, `web-app-v2`
- Sin espacios, sin caracteres especiales
- Se usa como nombre de carpeta raíz del sistema

---

### Paso 2: Subir archivos

La URL de upload define la estructura de carpetas. Todo lo que va después de `/upload/` se convierte en la ruta de colección y sub-carpetas.

#### Colección simple (una carpeta)

```bash
curl -X POST http://localhost:4400/api/v1/upload/invoices \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..." \
  -F "file=@factura_001.pdf"
```

Resultado en disco:
```
storage/erp/invoices/factura_001_a8Kd2mXp.pdf
```

#### Colección con una sub-carpeta

```bash
curl -X POST http://localhost:4400/api/v1/upload/reports/monthly \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..." \
  -F "file=@reporte_junio.xlsx"
```

Resultado en disco:
```
storage/erp/reports/monthly/reporte_junio_bR4nYq1z.xlsx
```

#### Colección con sub-carpeta por ID (caso típico: expedientes de personas)

```bash
curl -X POST http://localhost:4400/api/v1/upload/documentos/13457724 \
  -H "Authorization: Bearer csk_sipeg_x1y2z3..." \
  -F "file=@cedula.pdf"
```

Resultado en disco:
```
storage/sipeg/documentos/13457724/cedula_cT7wLm3x.pdf
```

#### Colección con múltiples niveles de sub-carpetas

```bash
curl -X POST http://localhost:4400/api/v1/upload/documents/contracts/acme-corp \
  -H "Authorization: Bearer csk_crm_x1y2z3..." \
  -F "file=@contrato_2026.pdf"
```

Resultado en disco:
```
storage/crm/documents/contracts/acme-corp/contrato_2026_dF9pNk5v.pdf
```

**Respuesta de upload (todos los casos):**

```json
{
  "id": "clx1a2b3c4d5e6f7",
  "originalName": "cedula.pdf",
  "mimeType": "application/pdf",
  "size": 180940,
  "collection": "documentos",
  "subPath": "13457724",
  "createdAt": "2026-05-27T10:35:00.000Z"
}
```

> `collection` siempre es el primer segmento de la ruta.
> `subPath` contiene el resto de segmentos (si los hay), por ejemplo `"13457724"` o `"contracts/acme-corp"`.

---

### Paso 3: Buscar un archivo por nombre (lookup)

Si tu sistema sabe el nombre del archivo y la ruta donde está, puedes buscarlo sin necesidad de conocer el ID interno:

```bash
# Buscar solo por nombre
curl "http://localhost:4400/api/v1/files/lookup?name=cedula.pdf" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Buscar por nombre + colección
curl "http://localhost:4400/api/v1/files/lookup?name=cedula.pdf&collection=documentos" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Buscar por nombre + colección + sub-carpeta (más preciso)
curl "http://localhost:4400/api/v1/files/lookup?name=cedula.pdf&collection=documentos&sub_path=13457724" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

**Respuesta:**

```json
{
  "id": "clx1a2b3c4d5e6f7",
  "originalName": "cedula.pdf",
  "mimeType": "application/pdf",
  "size": 180940,
  "collection": "documentos",
  "subPath": "13457724",
  "createdAt": "2026-05-27T10:35:00.000Z"
}
```

> Si hay múltiples archivos con el mismo nombre (ej: `cedula.pdf` en diferentes carpetas), usa `collection` y `sub_path` para precisar cuál quieres.

---

### Paso 4: Listar archivos

```bash
# Listar todos los archivos del sistema
curl http://localhost:4400/api/v1/files \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Filtrar por colección
curl "http://localhost:4400/api/v1/files?collection=documentos" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Filtrar por tipo MIME
curl "http://localhost:4400/api/v1/files?mime_type=application/pdf" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Filtrar por rango de fechas
curl "http://localhost:4400/api/v1/files?from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."

# Paginación
curl "http://localhost:4400/api/v1/files?page=2&limit=10" \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

**Respuesta:**

```json
{
  "data": [
    {
      "id": "clx1a2b3c4d5e6f7",
      "originalName": "cedula.pdf",
      "mimeType": "application/pdf",
      "size": 180940,
      "collection": "documentos",
      "subPath": "13457724",
      "createdAt": "2026-05-27T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 68,
    "totalPages": 4
  }
}
```

> Cada sistema solo ve **sus propios archivos**. Un sistema no puede listar ni acceder a archivos de otro sistema.

---

### Paso 5: Descargar archivos

#### Descarga directa (requiere API key)

```bash
curl -O http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

#### Obtener solo la metadata

```bash
curl http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7/info \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

---

### Paso 6: URLs firmadas (acceso público temporal)

Las URLs firmadas permiten acceder a un archivo **sin API key**, con un enlace temporal que expira automáticamente. Son ideales para:
- Mostrar archivos en un frontend (visor de PDF, imágenes)
- Botones de descarga para usuarios finales
- Incrustar en emails o reportes
- Compartir temporalmente con terceros

#### Generar una URL firmada

```bash
curl -X POST http://localhost:4400/api/v1/signed-url/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

**Respuesta:**

```json
{
  "url": "https://storage.tudominio.com/api/v1/public/download?token=Y2x4MWEy...",
  "token": "Y2x4MWEy...",
  "expiresAt": 1779900000,
  "expiresIn": "3600 seconds"
}
```

#### Usar la URL en el frontend

La URL devuelta no requiere autenticación. Se puede usar directamente:

**Botón de descarga:**
```html
<a href="https://storage.tudominio.com/api/v1/public/download?token=Y2x4MWEy..." download>
  Descargar documento
</a>
```

**Visor de PDF embebido:**
```html
<iframe
  src="https://storage.tudominio.com/api/v1/public/download?token=Y2x4MWEy..."
  width="100%"
  height="600px">
</iframe>
```

**Abrir en nueva pestaña:**
```html
<a href="https://storage.tudominio.com/api/v1/public/download?token=Y2x4MWEy..." target="_blank">
  Ver documento
</a>
```

**Mostrar imagen:**
```html
<img src="https://storage.tudominio.com/api/v1/public/download?token=Y2x4MWEy..." alt="Foto" />
```

> La URL expira según `SIGNED_URL_EXPIRY` en `.env` (default: 1 hora).
> Una vez expirada, devuelve error 401 y se debe generar una nueva.

---

### Flujo completo: mostrar un archivo en el frontend

Este es el flujo típico cuando un usuario quiere ver un documento desde tu aplicación web:

```
┌─────────┐         ┌──────────────┐         ┌─────────────┐
│ Frontend │────────▶│ Tu Backend   │────────▶│ Core Vault  │
│ (browser)│         │ (SIPEG, etc) │         │ (storage)   │
└─────────┘         └──────────────┘         └─────────────┘
```

**Paso 1** — El frontend pide ver un documento (ej: cédula del empleado 13457724).

**Paso 2** — Tu backend busca el archivo en Core Vault por nombre:

```bash
GET /api/v1/files/lookup?name=cedula.pdf&collection=documentos&sub_path=13457724
Authorization: Bearer {CORE_VAULT_API_KEY}
```

Respuesta: `{"id": "clx1a2b3c4d5e6f7", ...}`

**Paso 3** — Tu backend genera una URL firmada con el ID obtenido:

```bash
POST /api/v1/signed-url/clx1a2b3c4d5e6f7
Authorization: Bearer {CORE_VAULT_API_KEY}
```

Respuesta: `{"url": "https://storage.tudominio.com/api/v1/public/download?token=Y2x4...", ...}`

**Paso 4** — Tu backend devuelve la URL al frontend.

**Paso 5** — El frontend usa la URL directamente, sin exponer ninguna API key:

```html
<iframe src="https://storage.tudominio.com/api/v1/public/download?token=Y2x4..." width="100%" height="600px"></iframe>
```

#### Ejemplo completo en Node.js (backend de tu sistema)

```typescript
import axios from 'axios';

const VAULT_URL = process.env.CORE_VAULT_URL;  // https://storage.tudominio.com
const VAULT_KEY = process.env.CORE_VAULT_API_KEY;

const headers = { Authorization: `Bearer ${VAULT_KEY}` };

// Función: obtener URL pública de un documento
async function getPublicUrl(fileName: string, collection: string, subPath: string): Promise<string> {
  // 1. Buscar el archivo
  const { data: file } = await axios.get(
    `${VAULT_URL}/api/v1/files/lookup`,
    { headers, params: { name: fileName, collection, sub_path: subPath } }
  );

  // 2. Generar URL firmada
  const { data: signed } = await axios.post(
    `${VAULT_URL}/api/v1/signed-url/${file.id}`,
    null,
    { headers }
  );

  return signed.url;
}

// Uso en un endpoint de tu API
app.get('/empleado/:cedula/documento/:tipo', async (req, res) => {
  const url = await getPublicUrl(
    `${req.params.tipo}.pdf`,    // "cedula.pdf", "rif.pdf", etc.
    'documentos',
    req.params.cedula             // "13457724"
  );
  res.json({ url });
});
```

#### Ejemplo completo en Python (backend de tu sistema)

```python
import requests
import os

VAULT_URL = os.getenv("CORE_VAULT_URL")
VAULT_KEY = os.getenv("CORE_VAULT_API_KEY")
HEADERS = {"Authorization": f"Bearer {VAULT_KEY}"}

def get_public_url(file_name: str, collection: str, sub_path: str) -> str:
    # 1. Buscar el archivo
    resp = requests.get(
        f"{VAULT_URL}/api/v1/files/lookup",
        headers=HEADERS,
        params={"name": file_name, "collection": collection, "sub_path": sub_path},
    )
    file_data = resp.json()

    # 2. Generar URL firmada
    resp = requests.post(
        f"{VAULT_URL}/api/v1/signed-url/{file_data['id']}",
        headers=HEADERS,
    )
    return resp.json()["url"]

# Uso
url = get_public_url("cedula.pdf", "documentos", "13457724")
# Devolver al frontend para mostrar en iframe o como link de descarga
```

---

### Paso 7: Eliminar archivos

```bash
curl -X DELETE http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

Elimina el archivo del disco y su registro de la base de datos.

---

### Paso 8: Listar colecciones

Ver todas las colecciones que tiene un sistema con estadísticas:

```bash
curl http://localhost:4400/api/v1/files/collections/list \
  -H "Authorization: Bearer csk_sipeg_a1b2c3d4..."
```

**Respuesta:**

```json
[
  {
    "collection": "documentos",
    "fileCount": 68,
    "totalSize": 24580000
  }
]
```

---

## Sincronización de archivos manuales

Si subes archivos directamente al filesystem (por FTP, SCP, o copiando carpetas), estos no tendrán registro en la base de datos y no aparecerán en la API.

El script `sync-files.ts` escanea el disco y registra en la DB cualquier archivo que no exista aún:

```bash
# Copiar el script al container (solo la primera vez o después de rebuild)
docker exec -u root core-storage mkdir -p /app/scripts
docker cp scripts/sync-files.ts core-storage:/app/scripts/sync-files.ts

# Ejecutar sincronización
docker exec core-storage npx tsx scripts/sync-files.ts
```

**Salida esperada:**

```
Scanning /data/storage...
Found 68 files on disk
  ✓ sipeg/documentos/13457724/cedula.pdf
  ✓ sipeg/documentos/13457724/rif.pdf
  ...
Done. Created: 68 | Skipped: 0 | Errors: 0
```

Se puede ejecutar múltiples veces sin riesgo de duplicados — los archivos ya registrados se saltan automáticamente.

> **Importante:** para que el sync funcione, la estructura en disco debe seguir el formato:
> `{system_slug}/{collection}/{sub_carpetas_opcionales}/{archivo}`

---

## Administración de sistemas

Todos los endpoints de admin requieren la `ADMIN_API_KEY`.

### Listar todos los sistemas

```bash
curl http://localhost:4400/api/v1/admin/systems \
  -H "Authorization: Bearer TU_ADMIN_API_KEY"
```

### Ver detalle de un sistema

```bash
curl http://localhost:4400/api/v1/admin/systems/1 \
  -H "Authorization: Bearer TU_ADMIN_API_KEY"
```

### Desactivar un sistema (revocar acceso)

```bash
curl -X PATCH http://localhost:4400/api/v1/admin/systems/1 \
  -H "Authorization: Bearer TU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

El sistema no podrá subir ni descargar archivos, pero sus archivos existentes permanecen en disco.

### Reactivar un sistema

```bash
curl -X PATCH http://localhost:4400/api/v1/admin/systems/1 \
  -H "Authorization: Bearer TU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"isActive": true}'
```

### Regenerar API key de un sistema

```bash
curl -X POST http://localhost:4400/api/v1/admin/systems/1/regenerate-key \
  -H "Authorization: Bearer TU_ADMIN_API_KEY"
```

**Respuesta:**

```json
{
  "apiKey": "csk_sipeg_NEW_KEY_HERE..."
}
```

> La key anterior queda invalidada inmediatamente. Actualiza la configuración del sistema cliente.

---

## Patrones de organización recomendados

### Por tipo de documento

```
/upload/invoices                    → storage/{sistema}/invoices/archivo.pdf
/upload/reports/monthly             → storage/{sistema}/reports/monthly/archivo.xlsx
/upload/receipts                    → storage/{sistema}/receipts/archivo.pdf
```

### Por entidad / persona / cliente

```
/upload/documentos/13457724         → storage/{sistema}/documentos/13457724/archivo.pdf
/upload/clients/acme-corp/contracts → storage/{sistema}/clients/acme-corp/contracts/archivo.pdf
/upload/clients/globex/kyc          → storage/{sistema}/clients/globex/kyc/archivo.jpg
```

### Por módulo de la aplicación

```
/upload/auth/avatars                → storage/{sistema}/auth/avatars/foto.jpg
/upload/products/images             → storage/{sistema}/products/images/producto.png
/upload/support/attachments         → storage/{sistema}/support/attachments/captura.png
```

---

## Referencia de API

### Endpoints de administración

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/v1/admin/systems` | Registrar nuevo sistema |
| `GET` | `/api/v1/admin/systems` | Listar todos los sistemas |
| `GET` | `/api/v1/admin/systems/:id` | Detalle de un sistema |
| `PATCH` | `/api/v1/admin/systems/:id` | Actualizar sistema |
| `POST` | `/api/v1/admin/systems/:id/regenerate-key` | Regenerar API key |

### Endpoints de archivos (requieren API key de sistema)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/v1/upload/{collection_path}` | Subir archivo |
| `GET` | `/api/v1/files` | Listar archivos (con filtros y paginación) |
| `GET` | `/api/v1/files/lookup?name=X&collection=Y&sub_path=Z` | Buscar archivo por nombre |
| `GET` | `/api/v1/files/:fileId` | Descargar archivo |
| `GET` | `/api/v1/files/:fileId/info` | Metadata del archivo |
| `DELETE` | `/api/v1/files/:fileId` | Eliminar archivo |
| `GET` | `/api/v1/files/collections/list` | Listar colecciones |
| `POST` | `/api/v1/signed-url/:fileId` | Generar URL firmada temporal |

### Endpoints públicos (sin autenticación)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/v1/public/download?token=xxx` | Descargar/visualizar con URL firmada |
| `GET` | `/health` | Health check |

---

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servicio | `4400` |
| `HOST` | Host de escucha | `0.0.0.0` |
| `NODE_ENV` | Entorno (`development` / `production`) | `production` |
| `DATABASE_URL` | URL de conexión PostgreSQL | — |
| `STORAGE_PATH` | Ruta de storage **dentro del container** (no cambiar) | `/data/storage` |
| `STORAGE_HOST_PATH` | Ruta de storage **en el host** (para docker-compose) | — |
| `ADMIN_API_KEY` | Master key para endpoints admin | — |
| `SIGNED_URL_SECRET` | Secret para firmar URLs temporales | — |
| `SIGNED_URL_EXPIRY` | Expiración de URLs firmadas (segundos) | `3600` |
| `MAX_FILE_SIZE` | Tamaño máximo de archivo (bytes) | `104857600` (100MB) |
| `POSTGRES_USER` | Usuario PostgreSQL | `corestorage` |
| `POSTGRES_PASSWORD` | Password PostgreSQL | — |
| `POSTGRES_DB` | Base de datos PostgreSQL | `corestorage` |

---

## Migración a otro servidor

1. Copiar la carpeta del proyecto (código + `.env`)
2. Copiar la carpeta de storage completa (`STORAGE_HOST_PATH`)
3. Exportar la base de datos: `docker exec core-storage-db pg_dump -U corestorage corestorage > backup.sql`
4. En el nuevo servidor: ajustar `STORAGE_HOST_PATH` en `.env`
5. Levantar: `docker-compose up -d --build`
6. Importar la DB: `docker exec -i core-storage-db psql -U corestorage corestorage < backup.sql`

---

## Desarrollo local

```bash
# Levantar solo la DB
docker-compose up db -d

# Instalar dependencias
npm install

# Crear archivo .env con DATABASE_URL apuntando a localhost:5432
# STORAGE_PATH=./data/storage (carpeta local)

# Ejecutar migraciones
npm run db:migrate

# Iniciar en modo desarrollo
npm run dev
```

---

*Core Code Innovation — Core Vault v1.1.0*