# 🏗️ Architecture Deep Dive

Análisis detallado de las decisiones arquitectónicas de AWS Analizer.

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Patrones Arquitectónicos](#patrones-arquitectónicos)
3. [Componentes Detallados](#componentes-detallados)
4. [Flujo de Datos](#flujo-de-datos)
5. [Decisiones Técnicas](#decisiones-técnicas)
6. [Seguridad](#seguridad)
7. [Escalabilidad](#escalabilidad)
8. [Trade-offs](#trade-offs)

---

## Visión General

AWS Analizer implementa una arquitectura **serverless event-driven** que separa claramente las responsabilidades entre capas, garantizando escalabilidad, seguridad y bajo acoplamiento.

### Principios de Diseño

#### 1. Separation of Concerns
```
Frontend  → Solo presentación y UX
API Gateway → Routing y validación
Lambda    → Lógica de negocio
S3        → Persistencia
```

#### 2. Security by Design
- Presigned URLs: Sin credenciales expuestas
- IAM: Principio de menor privilegio
- CORS: Restrictivo por dominio
- Buckets privados: Solo frontend público

#### 3. Event-Driven Architecture
- Desacoplamiento total entre upload y procesamiento
- Escalabilidad automática
- Retry automático en fallos
- Sin polling innecesario del backend

---

## Patrones Arquitectónicos

### 1. Presigned URL Pattern

**Problema**: ¿Cómo permitir upload de archivos sin exponer credenciales AWS?

**Solución**:
```
1. Cliente solicita URL firmada
2. Lambda genera URL temporal con permisos específicos
3. Cliente hace PUT directo a S3 con la URL
4. URL expira después de N minutos
```

**Beneficios**:
- ✅ Sin credenciales en el frontend
- ✅ Upload directo (no pasa por Lambda)
- ✅ Control granular de permisos
- ✅ Expiración automática

**Implementación**:
```python
presigned_url = s3_client.generate_presigned_url(
    ClientMethod='put_object',
    Params={
        'Bucket': BUCKET_NAME,
        'Key': object_key,
        'ContentType': content_type
    },
    ExpiresIn=300  # 5 minutos
)
```

**Alternativas consideradas**:
| Alternativa | Pros | Contras | Razón descartada |
|------------|------|---------|------------------|
| Upload a Lambda | Simple | Límite 6MB, mayor costo | Límite de tamaño |
| Direct S3 credentials | Rápido | Inseguro | Riesgo de seguridad |
| Multipart upload | Archivos grandes | Complejidad | Over-engineering |

---

### 2. Event-Driven Processing

**Problema**: ¿Cómo procesar archivos sin hacer polling constante?

**Solución**:
```
S3 ObjectCreated Event → Lambda FileProcessor
```

**Beneficios**:
- ✅ Procesamiento inmediato
- ✅ Sin polling innecesario
- ✅ Escalabilidad automática
- ✅ Retry built-in

**Configuración**:
```json
{
  "LambdaFunctionConfigurations": [{
    "Events": ["s3:ObjectCreated:*"],
    "Filter": {
      "Key": { "FilterRules": [{"Name": "prefix", "Value": "uploads/"}] }
    }
  }]
}
```

**Alternativas consideradas**:
| Alternativa | Pros | Contras | Razón descartada |
|------------|------|---------|------------------|
| SQS + Lambda | Desacoplado | Complejidad adicional | Over-engineering |
| Step Functions | Orquestación | Costo adicional | Overkill para este caso |
| Polling desde frontend | Simple | Ineficiente, no escalable | Mala práctica |

---

### 3. Lambda Proxy Integration

**Problema**: ¿Cómo dar control total a las Lambdas sobre la respuesta HTTP?

**Solución**:
```
API Gateway → Lambda (Proxy) → Response completa
```

**Beneficios**:
- ✅ Control de status codes
- ✅ Headers CORS personalizados
- ✅ Response body flexible
- ✅ Error handling granular

**Formato de respuesta**:
```python
return {
    'statusCode': 200,
    'headers': {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    },
    'body': json.dumps(data)
}
```

**Alternativas consideradas**:
| Alternativa | Pros | Contras | Razón descartada |
|------------|------|---------|------------------|
| Lambda non-proxy | Transformaciones en API GW | Menos flexible | Límite de control |
| Direct integration | Sin Lambda | Sin lógica de negocio | No aplica aquí |

---

### 4. Polling Pattern (Frontend)

**Problema**: ¿Cómo saber cuándo el procesamiento terminó?

**Solución**:
```javascript
// Polling con backoff exponencial implícito
const pollInterval = setInterval(async () => {
    const result = await checkResult(fileId);
    if (result.status === 'completed') {
        clearInterval(pollInterval);
        displayResults(result);
    }
}, 3000);
```

**Configuración**:
- Intervalo: 3 segundos
- Máximo intentos: 40 (2 minutos total)
- Timeout: 120 segundos

**Alternativas consideradas**:
| Alternativa | Pros | Contras | Razón descartada |
|------------|------|---------|------------------|
| WebSockets | Real-time | Complejidad, costo | Over-engineering |
| Server-Sent Events | Push unidireccional | No soportado en API GW REST | Limitación técnica |
| Long polling | Menos requests | Complejo, timeouts | No necesario |

---

## Componentes Detallados

### Frontend (Static Website)

**Tecnologías**:
- HTML5 semántico
- CSS3 con Variables
- JavaScript ES6+ (Vanilla)

**Responsabilidades**:
- Validación de archivos en cliente
- Gestión de estado de UI
- Comunicación con API
- Feedback visual al usuario

**State Management**:
```javascript
const AppState = {
    currentFile: null,
    fileId: null,
    uploadProgress: 0,
    pollingAttempts: 0
};
```

**Decisión**: ¿Por qué Vanilla JS y no React/Vue?
- ✅ Sin build process
- ✅ Menor bundle size
- ✅ Más rápido para MVPs
- ✅ Demuestra conocimiento de fundamentos
- ❌ Menos escalable para apps grandes

---

### API Gateway (REST API)

**Tipo**: REST API (no HTTP API)

**Endpoints**:
```
POST   /get-upload-url        → Lambda UrlGenerator
GET    /get-result/{fileId}   → Lambda ResultRetriever
```

**Decisión**: ¿Por qué REST en lugar de HTTP API?

| Feature | REST API | HTTP API |
|---------|----------|----------|
| Costo | Más caro | ~70% más barato |
| Features | Completo | Básico |
| Transformations | ✅ | ❌ |
| WAF Integration | ✅ | ✅ |
| Request/Response validation | ✅ | Limitado |

**Elección**: REST API para:
- Mejor integración con IAM authorizers (futuro)
- Request/response transformations avanzadas
- Es el estándar en ambientes enterprise

---

### Lambda Functions

#### UrlGenerator

**Runtime**: Python 3.12  
**Memory**: 256 MB  
**Timeout**: 10 segundos  

**Responsabilidades**:
1. Validar request (fileId, fileName, contentType)
2. Validar tipo de archivo permitido
3. Generar presigned URL con S3 SDK
4. Retornar URL con expiración

**Por qué Python**:
- ✅ Boto3 (SDK AWS) nativo
- ✅ Cold start rápido para funciones simples
- ✅ Fácil mantenimiento
- ✅ Amplia comunidad

**Código crítico**:
```python
presigned_url = s3_client.generate_presigned_url(
    ClientMethod='put_object',
    Params={
        'Bucket': BUCKET_NAME,
        'Key': f"uploads/{file_id}{extension}",
        'ContentType': content_type,
        'Metadata': {'original-filename': file_name}
    },
    ExpiresIn=300
)
```

---

#### FileProcessor

**Runtime**: Python 3.12  
**Memory**: 512 MB (mayor memoria para procesamiento)  
**Timeout**: 30 segundos  

**Responsabilidades**:
1. Disparado por S3 Event (ObjectCreated)
2. Leer archivo de S3
3. Extraer metadata (tamaño, tipo, nombre)
4. Generar resumen basado en tipo
5. Guardar resultado en `results/{fileId}.json`

**Event Trigger**:
```json
{
  "Records": [{
    "eventName": "ObjectCreated:Put",
    "s3": {
      "bucket": {"name": "bucket-name"},
      "object": {"key": "uploads/file-id.pdf"}
    }
  }]
}
```

**Extensibilidad futura**:
```python
# Hooks para servicios AWS de ML
if content_type == 'application/pdf':
    # AWS Textract
    extracted_text = textract.extract_text(file)
elif content_type.startswith('image/'):
    # AWS Rekognition
    labels = rekognition.detect_labels(file)
```

---

#### ResultRetriever

**Runtime**: Python 3.12  
**Memory**: 256 MB  
**Timeout**: 10 segundos  

**Responsabilidades**:
1. Recibir fileId del path parameter
2. Leer `results/{fileId}.json` de S3
3. Retornar JSON con resultado
4. Retornar 404 si no está listo

**Manejo de estados**:
```python
try:
    response = s3_client.get_object(Bucket=BUCKET_NAME, Key=result_key)
    return create_response(200, json.loads(response['Body'].read()))
except s3_client.exceptions.NoSuchKey:
    return create_response(404, {'error': 'Result not ready'})
```

---

### S3 Buckets

**Estructura**:
```
bucket-name/
├── frontend/          # Público (Bucket Policy)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── uploads/           # Privado (solo Lambdas)
│   └── {uuid}.{ext}
└── results/           # Privado (solo Lambdas)
    └── {uuid}.json
```

**Seguridad**:
- Block Public Access: ON (excepto frontend/)
- Encryption: SSE-S3 (AES-256)
- Versioning: OFF (para reducir costos)
- Lifecycle: Opcional (eliminar después de 30 días)

---

## Flujo de Datos Completo

### 1. Upload Flow
```
Usuario selecciona archivo
    ↓
Frontend valida (tipo, tamaño)
    ↓
POST /get-upload-url
    ↓
Lambda genera presigned URL
    ↓
Frontend hace PUT directo a S3
    ↓
S3 guarda en uploads/{uuid}.{ext}
    ↓
S3 dispara ObjectCreated Event
    ↓
Lambda FileProcessor se ejecuta
```

### 2. Processing Flow
```
FileProcessor recibe evento S3
    ↓
Lee archivo de S3 (get_object)
    ↓
Extrae metadata:
  - Tamaño (ContentLength)
  - Tipo (ContentType)
  - Nombre original (Metadata)
  - Timestamp (LastModified)
    ↓
Genera resumen basado en tipo:
  - PDF: Info de documento
  - TXT: Conteo de palabras/líneas
  - IMG: Dimensiones estimadas
    ↓
Estructura resultado en JSON:
  {
    "fileId": "...",
    "status": "completed",
    "metadata": {...},
    "summary": "..."
  }
    ↓
Guarda en S3: results/{uuid}.json
```

### 3. Retrieval Flow
```
Frontend hace polling cada 3s
    ↓
GET /get-result/{fileId}
    ↓
Lambda lee results/{fileId}.json
    ↓
Si existe: return 200 + datos
Si no existe: return 404 (still processing)
    ↓
Frontend muestra resultados o sigue intentando
```

---

## Decisiones Técnicas

### 1. ¿Por qué Serverless?

**Ventajas**:
- ✅ Sin gestión de servidores
- ✅ Escalabilidad automática
- ✅ Pay-per-use (costo bajo)
- ✅ Alta disponibilidad por defecto
- ✅ Integración nativa con servicios AWS

**Desventajas aceptadas**:
- ❌ Cold starts (~500ms)
- ❌ Límites de ejecución (15 min Lambda)
- ❌ Vendor lock-in (AWS)

**Justificación**: Para un proyecto de análisis de documentos con tráfico variable, serverless es ideal.

---

### 2. ¿Por qué No DynamoDB?

Los resultados se guardan en S3 como JSON en lugar de DynamoDB:

**Razones**:
- ✅ S3 es más barato ($0.023/GB vs $0.25/GB)
- ✅ No necesitamos queries complejos
- ✅ Acceso por fileId (clave simple)
- ✅ Resultados son JSON estáticos (no mutan)

**Cuándo usar DynamoDB**:
- Queries complejos (GSI, LSI)
- Updates frecuentes
- TTL automático
- Relaciones entre datos

---

### 3. ¿Por qué No SQS?

S3 Events disparan Lambda directamente en lugar de usar SQS:

**Razones**:
- ✅ Menor latencia (sin hop intermedio)
- ✅ Menos complejidad
- ✅ Menos costo (sin SQS pricing)
- ✅ Retry automático de Lambda

**Cuándo usar SQS**:
- Necesitas buffering (rate limiting)
- Múltiples consumers
- Procesamiento batch
- Dead Letter Queue avanzado

---

## Seguridad

### Principio de Menor Privilegio (IAM)

Cada Lambda tiene **permisos mínimos**:

#### UrlGenerator
```json
{
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::bucket/uploads/*"
}
```

#### FileProcessor
```json
{
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::bucket/uploads/*"
},
{
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::bucket/results/*"
}
```

#### ResultRetriever
```json
{
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::bucket/results/*"
}
```

**Blast Radius**: Si una Lambda se compromete, solo afecta su scope.

---

### CORS Configuration

**S3**:
```json
{
  "AllowedOrigins": [
    "http://localhost:8000",
    "http://bucket.s3-website-region.amazonaws.com"
  ],
  "AllowedMethods": ["GET", "PUT", "POST"]
}
```

**Lambda Response Headers**:
```python
'Access-Control-Allow-Origin': origin if origin in allowed_origins else '*'
```

**Por qué no `*` siempre**:
- Menos seguro (cualquier sitio puede hacer requests)
- Recomendado: Lista explícita de dominios

---

### Data Encryption

**At Rest**:
- S3: SSE-S3 (AES-256) por defecto
- Alternative: SSE-KMS para control granular

**In Transit**:
- HTTPS obligatorio (API Gateway)
- TLS 1.2+ en todas las conexiones

---

## Escalabilidad

### Concurrent Executions

**Lambda**:
- Concurrencia por defecto: 1000 (por región)
- Auto-scaling: Automático
- Reserved concurrency: Opcional (garantiza disponibilidad)

**Bottlenecks**:
1. S3 request rate: 5,500 GET/s por prefix
   - **Solución**: Usar UUIDs (distribución aleatoria)
2. API Gateway: 10,000 req/s por región
   - **Solución**: Request throttling si necesario

---

### Performance Metrics

| Métrica | Valor | Notas |
|---------|-------|-------|
| Latencia upload | <2s | Depende de tamaño archivo |
| Latencia procesamiento | 2-5s | Depende de complejidad |
| Latencia retrieval | <500ms | Get de S3 |
| Cold start Lambda | ~500ms | Primera invocación |
| Warm start Lambda | <100ms | Invocaciones subsiguientes |

---

## Trade-offs

### 1. Polling vs WebSockets

**Decisión**: Polling

| Aspecto | Polling | WebSockets |
|---------|---------|------------|
| Complejidad | Baja | Alta |
| Latencia | ~3s | Real-time |
| Costo | Bajo | Medio |
| Browser support | Universal | Bueno |

**Justificación**: Para archivos que tardan 5-10s en procesarse, 3s de polling es aceptable.

---

### 2. Single Bucket vs Multiple Buckets

**Decisión**: Single bucket con prefixes

| Aspecto | Single | Multiple |
|---------|--------|----------|
| Gestión | Simple | Compleja |
| Costs | $0.023/GB | $0.023/GB × N |
| Policies | 1 policy | N policies |
| CORS | 1 config | N configs |

**Justificación**: Prefixes (`uploads/`, `results/`) son suficientes para segmentación.

---

### 3. Python vs Node.js

**Decisión**: Python

| Aspecto | Python | Node.js |
|---------|--------|---------|
| Cold start | ~500ms | ~300ms |
| Boto3 | Nativo | Requiere AWS SDK |
| Comunidad | Grande | Grande |
| Familiaridad | Alta (ML/Data) | Alta (Web) |

**Justificación**: Boto3 es más maduro y Python es estándar en ML (extensibilidad futura).

---

## Mejoras Futuras

### v1.1 - AI Integration
- AWS Textract para PDFs
- AWS Rekognition para imágenes
- Amazon Comprehend para análisis de sentimiento

### v1.2 - Advanced Features
- Cognito para autenticación
- CloudFront para CDN
- Step Functions para workflows complejos

### v2.0 - Enterprise
- Multi-region deployment
- DynamoDB para metadata queryable
- EventBridge para integraciones
- SageMaker para ML custom

---

## Referencias

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html)
- [API Gateway Proxy Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html)
- [IAM Least Privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)

---

**Autor**: [Tu Nombre]  
**Fecha**: 2026-02-07  
**Versión**: 1.0.0