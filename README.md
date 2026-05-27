# Core Storage

Servicio centralizado de almacenamiento de archivos desarrollado por **Core Code Innovation**.

Permite que múltiples sistemas (ERP, CRM, apps, bots, etc.) suban, descarguen y gestionen archivos a través de una API REST, organizados automáticamente por sistema, colección y fecha.

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

Los archivos se organizan automáticamente en el filesystem:

```
{STORAGE_PATH}/
├── erp/                        ← Sistema "erp"
│   ├── invoices/               ← Colección directa
│   │   └── 2025/06/
│   │       ├── factura_001_a8Kd2mXp.pdf
│   │       └── factura_002_bR4nYq1z.pdf
│   └── reports/
│       ├── monthly/            ← Sub-carpeta dentro de colección
│       │   └── 2025/06/
│       │       └── reporte_junio_cT7wLm3x.xlsx
│       └── quarterly/
│           └── 2025/06/
│               └── q2_summary_dF9pNk5v.pdf
├── crm/                        ← Sistema "crm"
│   ├── avatars/
│   │   └── 2025/06/
│   │       └── profile_eH2jRs8w.jpg
│   └── documents/
│       └── contracts/
│           └── acme-corp/
│               └── 2025/06/
│                   └── contrato_fK4mTp6y.pdf
```

- Cada **sistema** tiene su carpeta raíz (el `slug` del sistema).
- Dentro, las **colecciones** y **sub-carpetas** las defines tú al subir archivos.
- La fecha (`YYYY/MM`) se agrega automáticamente.
- Los nombres de archivo se preservan pero se les agrega un sufijo único para evitar colisiones.

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
STORAGE_HOST_PATH=/mnt/data/core-storage

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
sudo mkdir -p /mnt/data/core-storage
sudo chown 1000:1000 /mnt/data/core-storage
```

### 4. Levantar con Docker

```bash
docker-compose up -d --build
```

El servicio estará disponible en `http://localhost:4400`.

### Verificar que está corriendo

```bash
curl http://localhost:4400/health
# {"status":"ok","service":"core-storage","timestamp":"2025-06-15T..."}
```

---

## Autenticación

El sistema usa dos niveles de autenticación:

| Nivel | Header | Uso |
|---|---|---|
| **Admin** | `Authorization: Bearer {ADMIN_API_KEY}` | Crear, listar y gestionar sistemas |
| **Sistema** | `Authorization: Bearer {system_api_key}` | Subir, descargar, listar y eliminar archivos |

La `ADMIN_API_KEY` se define en `.env`. Las API keys de cada sistema se generan al registrarlos.

---

## Guía de uso

### Paso 1: Registrar un sistema

Cada aplicación que necesite usar el storage se registra como un "sistema".

```bash
curl -X POST http://localhost:4400/api/v1/admin/systems \
  -H "Authorization: Bearer TU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ERP Principal",
    "slug": "erp"
  }'
```

**Respuesta:**

```json
{
  "id": 1,
  "name": "ERP Principal",
  "slug": "erp",
  "apiKey": "csk_erp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "isActive": true,
  "createdAt": "2025-06-15T10:30:00.000Z"
}
```

> ⚠️ **La API key se muestra UNA sola vez.** Guárdala de forma segura.
> Si la pierdes, puedes regenerarla (ver sección Administración).

**Reglas del slug:**
- Solo minúsculas, números y guiones: `mi-erp`, `crm`, `web-app-v2`
- Sin espacios, sin caracteres especiales
- Se usa como nombre de carpeta raíz del sistema

---

### Paso 2: Subir archivos

La URL de upload define la estructura de carpetas. Todo lo que va después de `/upload/` se convierte en la ruta de colección.

#### Colección simple (una carpeta)

```bash
curl -X POST http://localhost:4400/api/v1/upload/invoices \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..." \
  -F "file=@factura_001.pdf"
```

Resultado en disco:
```
storage/erp/invoices/2025/06/factura_001_a8Kd2mXp.pdf
```

#### Colección con sub-carpetas (dos niveles)

```bash
curl -X POST http://localhost:4400/api/v1/upload/reports/monthly \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..." \
  -F "file=@reporte_junio.xlsx"
```

Resultado en disco:
```
storage/erp/reports/monthly/2025/06/reporte_junio_bR4nYq1z.xlsx
```

#### Colección con múltiples niveles de sub-carpetas

```bash
curl -X POST http://localhost:4400/api/v1/upload/documents/contracts/acme-corp \
  -H "Authorization: Bearer csk_crm_x1y2z3..." \
  -F "file=@contrato_2025.pdf"
```

Resultado en disco:
```
storage/crm/documents/contracts/acme-corp/2025/06/contrato_2025_cT7wLm3x.pdf
```

#### Colección con estructura tipo entidad

```bash
# Archivos de un cliente específico
curl -X POST http://localhost:4400/api/v1/upload/clients/client-123/kyc \
  -H "Authorization: Bearer csk_crm_x1y2z3..." \
  -F "file=@cedula_frente.jpg"
```

Resultado en disco:
```
storage/crm/clients/client-123/kyc/2025/06/cedula_frente_dF9pNk5v.jpg
```

**Respuesta de upload (todos los casos):**

```json
{
  "id": "clx1a2b3c4d5e6f7",
  "originalName": "factura_001.pdf",
  "mimeType": "application/pdf",
  "size": 245890,
  "collection": "invoices",
  "subPath": null,
  "createdAt": "2025-06-15T10:35:00.000Z"
}
```

> `collection` siempre es el primer segmento de la ruta.
> `subPath` contiene el resto de segmentos (si los hay), por ejemplo `"contracts/acme-corp"`.

---

### Paso 3: Listar archivos

```bash
# Listar todos los archivos del sistema
curl http://localhost:4400/api/v1/files \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."

# Filtrar por colección
curl "http://localhost:4400/api/v1/files?collection=invoices" \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."

# Filtrar por tipo MIME
curl "http://localhost:4400/api/v1/files?mime_type=application/pdf" \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."

# Filtrar por rango de fechas
curl "http://localhost:4400/api/v1/files?from=2025-06-01T00:00:00Z&to=2025-06-30T23:59:59Z" \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."

# Paginación
curl "http://localhost:4400/api/v1/files?page=2&limit=10" \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

**Respuesta:**

```json
{
  "data": [
    {
      "id": "clx1a2b3c4d5e6f7",
      "originalName": "factura_001.pdf",
      "mimeType": "application/pdf",
      "size": 245890,
      "collection": "invoices",
      "subPath": null,
      "createdAt": "2025-06-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

> Cada sistema solo ve **sus propios archivos**. Un sistema no puede listar ni acceder a archivos de otro sistema.

---

### Paso 4: Descargar archivos

#### Descarga directa (requiere API key)

```bash
curl -O http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

#### Obtener solo la metadata

```bash
curl http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7/info \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

---

### Paso 5: URLs firmadas (acceso temporal sin API key)

Genera una URL temporal que cualquiera puede usar para descargar un archivo, sin necesidad de API key. Ideal para compartir con usuarios finales, incrustar en emails, o servir desde un frontend.

```bash
curl -X POST http://localhost:4400/api/v1/signed-url/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

**Respuesta:**

```json
{
  "url": "http://localhost:4400/api/v1/public/download?token=Y2x4MWEy...",
  "token": "Y2x4MWEy...",
  "expiresAt": 1718451300,
  "expiresIn": "3600 seconds"
}
```

La URL devuelta se puede abrir directamente en un navegador. Expira según `SIGNED_URL_EXPIRY` en `.env` (default: 1 hora).

---

### Paso 6: Eliminar archivos

```bash
curl -X DELETE http://localhost:4400/api/v1/files/clx1a2b3c4d5e6f7 \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

Elimina el archivo del disco y su registro de la base de datos.

---

### Paso 7: Listar colecciones

Ver todas las colecciones que tiene un sistema con estadísticas:

```bash
curl http://localhost:4400/api/v1/files/collections/list \
  -H "Authorization: Bearer csk_erp_a1b2c3d4..."
```

**Respuesta:**

```json
[
  {
    "collection": "invoices",
    "fileCount": 47,
    "totalSize": 12458900
  },
  {
    "collection": "reports",
    "fileCount": 12,
    "totalSize": 8234100
  }
]
```

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
  "apiKey": "csk_erp_NEW_KEY_HERE..."
}
```

> La key anterior queda invalidada inmediatamente. Actualiza la configuración del sistema cliente.

---

## Ejemplos de integración

### Node.js / TypeScript

```typescript
import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

const STORAGE_URL = 'http://storage.internal:4400';
const API_KEY = process.env.STORAGE_API_KEY;

// Subir archivo
async function uploadFile(filePath: string, collection: string) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const { data } = await axios.post(
    `${STORAGE_URL}/api/v1/upload/${collection}`,
    form,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...form.getHeaders(),
      },
    }
  );

  return data; // { id, originalName, mimeType, size, collection, createdAt }
}

// Uso
await uploadFile('./factura.pdf', 'invoices');
await uploadFile('./reporte.xlsx', 'reports/monthly');
await uploadFile('./contrato.pdf', 'documents/contracts/acme');
```

### Python

```python
import requests

STORAGE_URL = "http://storage.internal:4400"
API_KEY = "csk_erp_..."

# Subir archivo
def upload_file(file_path: str, collection: str):
    with open(file_path, "rb") as f:
        response = requests.post(
            f"{STORAGE_URL}/api/v1/upload/{collection}",
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"file": f},
        )
    return response.json()

# Uso
upload_file("factura.pdf", "invoices")
upload_file("reporte.xlsx", "reports/monthly")

# Descargar archivo
def download_file(file_id: str, output_path: str):
    response = requests.get(
        f"{STORAGE_URL}/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        stream=True,
    )
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
```

### cURL (scripts bash)

```bash
#!/bin/bash
STORAGE_URL="http://storage.internal:4400"
API_KEY="csk_erp_..."

# Subir
upload() {
  curl -s -X POST "$STORAGE_URL/api/v1/upload/$2" \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$1"
}

# Ejemplos
upload factura.pdf invoices
upload reporte.xlsx reports/monthly
upload contrato.pdf documents/contracts/acme
```

---

## Patrones de organización recomendados

### Por tipo de documento

```
/upload/invoices              → facturas
/upload/reports/monthly       → reportes mensuales
/upload/reports/quarterly     → reportes trimestrales
/upload/receipts              → recibos
```

### Por entidad / cliente

```
/upload/clients/acme-corp/contracts    → contratos de Acme Corp
/upload/clients/acme-corp/invoices     → facturas de Acme Corp
/upload/clients/globex/kyc             → documentos KYC de Globex
```

### Por módulo de la aplicación

```
/upload/auth/avatars          → fotos de perfil
/upload/products/images       → imágenes de productos
/upload/support/attachments   → adjuntos de tickets de soporte
```

### Por proyecto

```
/upload/project-alpha/designs       → diseños del proyecto
/upload/project-alpha/deliverables  → entregables
/upload/project-alpha/docs          → documentación
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
| `GET` | `/api/v1/files` | Listar archivos |
| `GET` | `/api/v1/files/:fileId` | Descargar archivo |
| `GET` | `/api/v1/files/:fileId/info` | Metadata del archivo |
| `DELETE` | `/api/v1/files/:fileId` | Eliminar archivo |
| `GET` | `/api/v1/files/collections/list` | Listar colecciones |
| `POST` | `/api/v1/signed-url/:fileId` | Generar URL firmada |

### Endpoints públicos

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/v1/public/download?token=xxx` | Descargar con URL firmada |
| `GET` | `/health` | Health check |

---

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servicio | `4400` |
| `HOST` | Host de escucha | `0.0.0.0` |
| `NODE_ENV` | Entorno (`development` / `production`) | `production` |
| `DATABASE_URL` | URL de conexión PostgreSQL | — |
| `STORAGE_PATH` | Ruta de storage **dentro del container** | `/data/storage` |
| `STORAGE_HOST_PATH` | Ruta de storage **en el host** (para docker-compose) | `./data/storage` |
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

*Core Code Innovation — v1.0.0*
