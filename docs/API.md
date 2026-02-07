# 📡 API Documentation

Documentación completa de los endpoints de AWS Analizer.

## Base URL
```
https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod
```

**Ejemplo**:
```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
```

---

## Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Headers Comunes](#headers-comunes)
3. [Endpoints](#endpoints)
4. [Modelos de Datos](#modelos-de-datos)
5. [Códigos de Error](#códigos-de-error)
6. [Rate Limiting](#rate-limiting)
7. [Ejemplos de Uso](#ejemplos-de-uso)

---

## Autenticación

**Versión actual**: Sin autenticación

**Versión futura**: AWS Cognito con JWT tokens
```javascript
// Futuro
headers: {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
}
```

---

## Headers Comunes

### Request Headers
```http
Content-Type: application/json
Accept: application/json
Origin: http://your-frontend-domain.com
```

### Response Headers
```http
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## Endpoints

### 1. Generate Upload URL

Genera una URL prefirmada para subir un archivo a S3.

#### Request
```http
POST /get-upload-url
Content-Type: application/json
```

**Body**:
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "document.pdf",
  "contentType": "application/pdf"
}
```

**Campos**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fileId` | string (UUID v4) | ✅ | Identificador único del archivo |
| `fileName` | string | ✅ | Nombre original del archivo |
| `contentType` | string | ✅ | MIME type del archivo |

**Content Types Permitidos**:
- `application/pdf`
- `text/plain`
- `image/png`
- `image/jpeg`

#### Response

**Success (200)**:
```json
{
  "uploadUrl": "https://bucket-name.s3.amazonaws.com/uploads/550e8400...?X-Amz-Algorithm=...",
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "objectKey": "uploads/550e8400-e29b-41d4-a716-446655440000.pdf",
  "expiresIn": 300
}
```

**Campos de Respuesta**:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `uploadUrl` | string | URL prefirmada para hacer PUT |
| `fileId` | string | ID del archivo (mismo del request) |
| `objectKey` | string | Path del archivo en S3 |
| `expiresIn` | number | Segundos hasta expiración (300 = 5 min) |

**Error (400 - Bad Request)**:
```json
{
  "error": "Missing required parameters",
  "required": ["fileId", "fileName", "contentType"]
}
```

**Error (400 - Invalid Content Type)**:
```json
{
  "error": "Invalid content type",
  "allowed": ["application/pdf", "text/plain", "image/png", "image/jpeg"]
}
```

**Error (500 - Server Error)**:
```json
{
  "error": "Failed to generate upload URL",
  "message": "Error details..."
}
```

#### Ejemplo de Uso

**JavaScript**:
```javascript
const response = await fetch(`${API_BASE_URL}/get-upload-url`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileId: crypto.randomUUID(),
    fileName: file.name,
    contentType: file.type
  })
});

const data = await response.json();
console.log(data.uploadUrl);
```

**cURL**:
```bash
curl -X POST https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/get-upload-url \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "fileName": "document.pdf",
    "contentType": "application/pdf"
  }'
```

**Python**:
```python
import requests
import uuid

response = requests.post(
    f"{API_BASE_URL}/get-upload-url",
    json={
        "fileId": str(uuid.uuid4()),
        "fileName": "document.pdf",
        "contentType": "application/pdf"
    }
)

data = response.json()
print(data["uploadUrl"])
```

---

### 2. Upload File to S3

Usa la URL prefirmada para subir el archivo directamente a S3.

#### Request
```http
PUT {presignedUrl}
Content-Type: {contentType}
Body: {file binary data}
```

**Headers**:
```http
Content-Type: application/pdf
```

**IMPORTANTE**: No agregues headers adicionales (como Authorization) ya que invalidarían la firma.

#### Response

**Success (200)**:
```
(Empty body)
```

**Error (403 - Forbidden)**:
```xml
<Error>
  <Code>SignatureDoesNotMatch</Code>
  <Message>The request signature we calculated does not match...</Message>
</Error>
```

#### Ejemplo de Uso

**JavaScript**:
```javascript
// Usando XMLHttpRequest para progress tracking
const xhr = new XMLHttpRequest();

xhr.upload.addEventListener('progress', (event) => {
  if (event.lengthComputable) {
    const percentComplete = (event.loaded / event.total) * 100;
    console.log(`Upload: ${percentComplete}%`);
  }
});

xhr.addEventListener('load', () => {
  if (xhr.status === 200) {
    console.log('Upload successful');
  }
});

xhr.open('PUT', presignedUrl);
xhr.setRequestHeader('Content-Type', file.type);
xhr.send(file);
```

**cURL**:
```bash
curl -X PUT "{presignedUrl}" \
  -H "Content-Type: application/pdf" \
  --data-binary "@document.pdf"
```

**Python**:
```python
import requests

with open('document.pdf', 'rb') as f:
    response = requests.put(
        presigned_url,
        data=f,
        headers={'Content-Type': 'application/pdf'}
    )

print(response.status_code)  # 200
```

---

### 3. Get Processing Result

Obtiene el resultado del análisis de un archivo.

#### Request
```http
GET /get-result/{fileId}
```

**Path Parameters**:

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fileId` | string (UUID v4) | ID del archivo a consultar |

#### Response

**Success (200 - File Processed)**:
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "processedAt": "2026-02-07T17:12:36.222871Z",
  "metadata": {
    "originalFileName": "document.pdf",
    "fileSize": 245760,
    "contentType": "application/pdf",
    "uploadedAt": "2026-02-07T17:12:35+00:00",
    "storageClass": "STANDARD",
    "s3Key": "uploads/550e8400-e29b-41d4-a716-446655440000.pdf",
    "fileCategory": "document",
    "estimatedPages": "Variable (requiere análisis detallado)"
  },
  "summary": "Se ha procesado exitosamente el archivo 'document.pdf' en formato PDF con un tamaño de 240.00 KB. Este documento ha sido almacenado de forma segura en Amazon S3..."
}
```

**Pending (404 - Still Processing)**:
```json
{
  "error": "Result not ready",
  "message": "File is still being processed",
  "fileId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error (400 - Invalid File ID)**:
```json
{
  "error": "Invalid fileId format"
}
```

**Error (500 - Server Error)**:
```json
{
  "error": "Failed to retrieve result",
  "message": "Error details..."
}
```

#### Polling Strategy

**Recomendado**:
```javascript
async function waitForResult(fileId, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${API_BASE_URL}/get-result/${fileId}`);
    
    if (response.status === 200) {
      return await response.json();
    }
    
    if (response.status === 404) {
      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, 3000));
      continue;
    }
    
    // Other error
    throw new Error(`HTTP ${response.status}`);
  }
  
  throw new Error('Timeout: Processing took too long');
}
```

#### Ejemplo de Uso

**JavaScript**:
```javascript
const response = await fetch(
  `${API_BASE_URL}/get-result/550e8400-e29b-41d4-a716-446655440000`
);

if (response.status === 200) {
  const result = await response.json();
  console.log(result.summary);
} else if (response.status === 404) {
  console.log('Still processing...');
}
```

**cURL**:
```bash
curl https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/get-result/550e8400-e29b-41d4-a716-446655440000
```

**Python**:
```python
import requests
import time

def wait_for_result(file_id, max_attempts=40):
    for _ in range(max_attempts):
        response = requests.get(f"{API_BASE_URL}/get-result/{file_id}")
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            time.sleep(3)
            continue
        else:
            response.raise_for_status()
    
    raise TimeoutError("Processing took too long")

result = wait_for_result("550e8400-e29b-41d4-a716-446655440000")
print(result["summary"])
```

---

## Modelos de Datos

### FileMetadata
```typescript
interface FileMetadata {
  originalFileName: string;      // Nombre original del archivo
  fileSize: number;               // Tamaño en bytes
  contentType: string;            // MIME type
  uploadedAt: string;             // ISO 8601 timestamp
  storageClass: string;           // S3 storage class (STANDARD)
  s3Key: string;                  // Path en S3
  fileCategory?: string;          // document | text | image
  lineCount?: number;             // Solo para text/plain
  characterCount?: number;        // Solo para text/plain
  wordCount?: number;             // Solo para text/plain
  estimatedDimensions?: string;   // Solo para imágenes
  estimatedPages?: string;        // Solo para PDFs
}
```

### ProcessingResult
```typescript
interface ProcessingResult {
  fileId: string;                 // UUID v4
  status: 'completed' | 'failed'; // Estado del procesamiento
  processedAt: string;            // ISO 8601 timestamp
  metadata: FileMetadata;         // Metadata del archivo
  summary: string;                // Resumen generado
}
```

---

## Códigos de Error

| Código | Significado | Descripción |
|--------|-------------|-------------|
| 200 | OK | Request exitoso |
| 400 | Bad Request | Parámetros inválidos o faltantes |
| 403 | Forbidden | Permisos insuficientes o URL expirada |
| 404 | Not Found | Recurso no encontrado (archivo aún procesando) |
| 500 | Internal Server Error | Error en el servidor |
| 503 | Service Unavailable | Servicio temporalmente no disponible |

---

## Rate Limiting

**Actual**: Sin límites explícitos

**API Gateway Defaults**:
- Burst: 5,000 requests
- Steady state: 10,000 requests/segundo

**Lambda Concurrent Executions**:
- Default: 1,000 (por región)
- Configurable: Reserved concurrency

**Recomendación**:
- Implementar retry con exponential backoff
- Respetar los 429 (Too Many Requests) si se implementa

---

## Ejemplos de Uso

### Flujo Completo - JavaScript
```javascript
class AWSAnalyzerClient {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
  }

  async analyzeFile(file) {
    // 1. Generate file ID
    const fileId = crypto.randomUUID();
    
    // 2. Get presigned URL
    const urlResponse = await fetch(`${this.apiBaseUrl}/get-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        fileName: file.name,
        contentType: file.type
      })
    });
    
    const { uploadUrl } = await urlResponse.json();
    
    // 3. Upload file
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });
    
    // 4. Wait for processing
    return await this.waitForResult(fileId);
  }

  async waitForResult(fileId, maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(`${this.apiBaseUrl}/get-result/${fileId}`);
      
      if (response.status === 200) {
        return await response.json();
      }
      
      if (response.status === 404) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      throw new Error(`HTTP ${response.status}`);
    }
    
    throw new Error('Timeout');
  }
}

// Uso
const client = new AWSAnalyzerClient('https://abc123.execute-api.us-east-1.amazonaws.com/prod');
const result = await client.analyzeFile(fileInput.files[0]);
console.log(result.summary);
```

---

### Flujo Completo - Python
```python
import requests
import uuid
import time

class AWSAnalyzerClient:
    def __init__(self, api_base_url):
        self.api_base_url = api_base_url
    
    def analyze_file(self, file_path, content_type):
        # 1. Generate file ID
        file_id = str(uuid.uuid4())
        
        # 2. Get presigned URL
        url_response = requests.post(
            f"{self.api_base_url}/get-upload-url",
            json={
                "fileId": file_id,
                "fileName": file_path.split('/')[-1],
                "contentType": content_type
            }
        )
        
        upload_url = url_response.json()["uploadUrl"]
        
        # 3. Upload file
        with open(file_path, 'rb') as f:
            requests.put(
                upload_url,
                data=f,
                headers={"Content-Type": content_type}
            )
        
        # 4. Wait for processing
        return self.wait_for_result(file_id)
    
    def wait_for_result(self, file_id, max_attempts=40):
        for _ in range(max_attempts):
            response = requests.get(f"{self.api_base_url}/get-result/{file_id}")
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                time.sleep(3)
                continue
            else:
                response.raise_for_status()
        
        raise TimeoutError("Processing took too long")

# Uso
client = AWSAnalyzerClient("https://abc123.execute-api.us-east-1.amazonaws.com/prod")
result = client.analyze_file("document.pdf", "application/pdf")
print(result["summary"])
```

---

## Changelog

### v1.0.0 (2026-02-07)
- Initial release
- POST /get-upload-url
- GET /get-result/{fileId}

### Próximas versiones

#### v1.1.0 (Planned)
- Autenticación con Cognito
- Rate limiting
- Webhooks para notificaciones

#### v1.2.0 (Planned)
- Batch processing
- Advanced metadata extraction (Textract, Rekognition)

---

## Soporte

**Issues**: [GitHub Issues](https://github.com/tu-usuario/aws-analizer/issues)  
**Email**: tu-email@example.com  
**Documentación**: [GitHub Wiki](https://github.com/tu-usuario/aws-analizer/wiki)

---

**Última actualización**: 2026-02-07  
**Versión API**: 1.0.0