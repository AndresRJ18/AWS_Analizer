# 🚀 Deployment Guide

Guía completa paso a paso para desplegar AWS Analizer en tu cuenta de AWS.

## Tabla de Contenidos

1. [Prerequisitos](#prerequisitos)
2. [Configuración Inicial](#configuración-inicial)
3. [Crear S3 Bucket](#1-crear-s3-bucket)
4. [Desplegar Lambda Functions](#2-desplegar-lambda-functions)
5. [Configurar API Gateway](#3-configurar-api-gateway)
6. [Configurar IAM](#4-configurar-iam)
7. [Configurar S3 Events](#5-configurar-s3-events)
8. [Desplegar Frontend](#6-desplegar-frontend)
9. [Configurar CORS](#7-configurar-cors)
10. [Testing](#8-testing)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisitos

### Software Requerido

- **AWS CLI** v2.x o superior
```bash
  aws --version
  aws configure  # Configurar credenciales
```

- **Python 3.12** (para Lambdas)
```bash
  python3 --version
```

- **Git** (para clonar repositorio)
```bash
  git --version
```

### Cuenta AWS

- Cuenta AWS activa
- Permisos IAM para crear:
  - Lambda functions
  - S3 buckets
  - API Gateway
  - IAM roles/policies
  - CloudWatch logs

### Costos Estimados

- **Free Tier**: $0/mes (primeros 12 meses)
- **Post Free Tier**: ~$5/mes (uso moderado: 1000 uploads/mes)

---

## Configuración Inicial

### 1. Clonar Repositorio
```bash
git clone https://github.com/tu-usuario/aws-analizer.git
cd aws-analizer
```

### 2. Configurar Variables de Entorno
```bash
# Copiar template
cp .env.example .env

# Editar con tus valores
nano .env  # o tu editor preferido
```

### 3. Definir Nombres de Recursos

Reemplaza `YOUR_NAME` con tu identificador único:
```bash
export PROJECT_NAME="aws-analizer-YOUR_NAME"
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

---

## 1. Crear S3 Bucket

### 1.1 Crear Bucket
```bash
# Crear bucket
aws s3 mb s3://${PROJECT_NAME} --region ${AWS_REGION}

# Crear estructura de carpetas
aws s3api put-object --bucket ${PROJECT_NAME} --key uploads/
aws s3api put-object --bucket ${PROJECT_NAME} --key results/
aws s3api put-object --bucket ${PROJECT_NAME} --key frontend/
```

### 1.2 Configurar Block Public Access
```bash
# Desbloquear acceso público (solo para frontend)
aws s3api put-public-access-block \
    --bucket ${PROJECT_NAME} \
    --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### 1.3 Aplicar Bucket Policy

Crea archivo `bucket-policy.json`:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadFrontend",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/frontend/*"
        }
    ]
}
```

Aplicar policy:
```bash
# Reemplazar YOUR_BUCKET_NAME en el archivo
sed -i "s/YOUR_BUCKET_NAME/${PROJECT_NAME}/g" bucket-policy.json

# Aplicar
aws s3api put-bucket-policy \
    --bucket ${PROJECT_NAME} \
    --policy file://bucket-policy.json
```

### 1.4 Habilitar Static Website Hosting
```bash
aws s3 website s3://${PROJECT_NAME} \
    --index-document index.html \
    --error-document index.html
```

---

## 2. Desplegar Lambda Functions

### 2.1 Crear IAM Role para Lambda
```bash
# Crear trust policy
cat > lambda-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Crear role
aws iam create-role \
    --role-name ${PROJECT_NAME}-lambda-role \
    --assume-role-policy-document file://lambda-trust-policy.json

# Attach basic execution policy
aws iam attach-role-policy \
    --role-name ${PROJECT_NAME}-lambda-role \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

### 2.2 Lambda: UrlGenerator
```bash
cd backend/lambda/url_generator

# Crear deployment package
zip -r function.zip lambda_function.py

# Crear función
aws lambda create-function \
    --function-name ${PROJECT_NAME}-url-generator \
    --runtime python3.12 \
    --role arn:aws:iam::${AWS_ACCOUNT_ID}:role/${PROJECT_NAME}-lambda-role \
    --handler lambda_function.lambda_handler \
    --zip-file fileb://function.zip \
    --timeout 10 \
    --memory-size 256 \
    --environment Variables="{BUCKET_NAME=${PROJECT_NAME}}"
```

### 2.3 Lambda: FileProcessor
```bash
cd ../file_processor

zip -r function.zip lambda_function.py

aws lambda create-function \
    --function-name ${PROJECT_NAME}-file-processor \
    --runtime python3.12 \
    --role arn:aws:iam::${AWS_ACCOUNT_ID}:role/${PROJECT_NAME}-lambda-role \
    --handler lambda_function.lambda_handler \
    --zip-file fileb://function.zip \
    --timeout 30 \
    --memory-size 512 \
    --environment Variables="{BUCKET_NAME=${PROJECT_NAME}}"
```

### 2.4 Lambda: ResultRetriever
```bash
cd ../result_retriever

zip -r function.zip lambda_function.py

aws lambda create-function \
    --function-name ${PROJECT_NAME}-result-retriever \
    --runtime python3.12 \
    --role arn:aws:iam::${AWS_ACCOUNT_ID}:role/${PROJECT_NAME}-lambda-role \
    --handler lambda_function.lambda_handler \
    --zip-file fileb://function.zip \
    --timeout 10 \
    --memory-size 256 \
    --environment Variables="{BUCKET_NAME=${PROJECT_NAME}}"
```

---

## 3. Configurar API Gateway

### 3.1 Crear REST API
```bash
# Crear API
API_ID=$(aws apigateway create-rest-api \
    --name "${PROJECT_NAME}-api" \
    --description "API for AWS Analizer" \
    --query 'id' --output text)

echo "API ID: ${API_ID}"

# Obtener root resource
ROOT_ID=$(aws apigateway get-resources \
    --rest-api-id ${API_ID} \
    --query 'items[0].id' --output text)
```

### 3.2 Crear Recurso: /get-upload-url
```bash
# Crear recurso
UPLOAD_RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id ${API_ID} \
    --parent-id ${ROOT_ID} \
    --path-part get-upload-url \
    --query 'id' --output text)

# Crear método POST
aws apigateway put-method \
    --rest-api-id ${API_ID} \
    --resource-id ${UPLOAD_RESOURCE_ID} \
    --http-method POST \
    --authorization-type NONE

# Integrar con Lambda
aws apigateway put-integration \
    --rest-api-id ${API_ID} \
    --resource-id ${UPLOAD_RESOURCE_ID} \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${PROJECT_NAME}-url-generator/invocations

# Dar permisos a API Gateway
aws lambda add-permission \
    --function-name ${PROJECT_NAME}-url-generator \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${AWS_REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/*"
```

### 3.3 Crear Recurso: /get-result/{fileId}
```bash
# Crear /get-result
RESULT_RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id ${API_ID} \
    --parent-id ${ROOT_ID} \
    --path-part get-result \
    --query 'id' --output text)

# Crear /{fileId}
FILEID_RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id ${API_ID} \
    --parent-id ${RESULT_RESOURCE_ID} \
    --path-part {fileId} \
    --query 'id' --output text)

# Crear método GET
aws apigateway put-method \
    --rest-api-id ${API_ID} \
    --resource-id ${FILEID_RESOURCE_ID} \
    --http-method GET \
    --authorization-type NONE \
    --request-parameters method.request.path.fileId=true

# Integrar con Lambda
aws apigateway put-integration \
    --rest-api-id ${API_ID} \
    --resource-id ${FILEID_RESOURCE_ID} \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${PROJECT_NAME}-result-retriever/invocations

# Dar permisos
aws lambda add-permission \
    --function-name ${PROJECT_NAME}-result-retriever \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${AWS_REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/*"
```

### 3.4 Deploy API
```bash
# Crear deployment
aws apigateway create-deployment \
    --rest-api-id ${API_ID} \
    --stage-name prod

# Obtener URL
API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/prod"
echo "API Gateway URL: ${API_URL}"
```

---

## 4. Configurar IAM

### 4.1 Policy para UrlGenerator

Ver: [`backend/iam/url-generator-policy.json`](../backend/iam/url-generator-policy.json)
```bash
aws iam put-role-policy \
    --role-name ${PROJECT_NAME}-lambda-role \
    --policy-name UrlGeneratorPolicy \
    --policy-document file://backend/iam/url-generator-policy.json
```

### 4.2 Policy para FileProcessor
```bash
aws iam put-role-policy \
    --role-name ${PROJECT_NAME}-lambda-role \
    --policy-name FileProcessorPolicy \
    --policy-document file://backend/iam/file-processor-policy.json
```

### 4.3 Policy para ResultRetriever
```bash
aws iam put-role-policy \
    --role-name ${PROJECT_NAME}-lambda-role \
    --policy-name ResultRetrieverPolicy \
    --policy-document file://backend/iam/result-retriever-policy.json
```

---

## 5. Configurar S3 Events
```bash
# Crear notificación de eventos
cat > s3-event-config.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${PROJECT_NAME}-file-processor",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "uploads/"
            }
          ]
        }
      }
    }
  ]
}
EOF

# Dar permiso a S3 para invocar Lambda
aws lambda add-permission \
    --function-name ${PROJECT_NAME}-file-processor \
    --statement-id s3-invoke \
    --action lambda:InvokeFunction \
    --principal s3.amazonaws.com \
    --source-arn arn:aws:s3:::${PROJECT_NAME}

# Aplicar configuración
aws s3api put-bucket-notification-configuration \
    --bucket ${PROJECT_NAME} \
    --notification-configuration file://s3-event-config.json
```

---

## 6. Desplegar Frontend

### 6.1 Configurar config.js
```bash
cd frontend

# Copiar template
cp config.example.js config.js

# Reemplazar con API Gateway URL real
sed -i "s|YOUR_API_GATEWAY_ID|${API_ID}|g" config.js
sed -i "s|YOUR_REGION|${AWS_REGION}|g" config.js
```

### 6.2 Subir Archivos a S3
```bash
# Subir frontend
aws s3 sync . s3://${PROJECT_NAME}/ \
    --exclude "config.example.js" \
    --exclude ".git/*" \
    --exclude "*.md"

# URL del sitio
WEBSITE_URL="http://${PROJECT_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
echo "Frontend URL: ${WEBSITE_URL}"
```

---

## 7. Configurar CORS

### 7.1 CORS en S3
```bash
cat > cors-config.json << EOF
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": [
            "http://localhost:8000",
            "http://${PROJECT_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
EOF

aws s3api put-bucket-cors \
    --bucket ${PROJECT_NAME} \
    --cors-configuration file://cors-config.json
```

---

## 8. Testing

### 8.1 Test Endpoints
```bash
# Test UrlGenerator
curl -X POST ${API_URL}/get-upload-url \
  -H "Content-Type: application/json" \
  -d '{"fileId":"test-123","fileName":"test.pdf","contentType":"application/pdf"}'

# Test ResultRetriever (debería retornar 404)
curl ${API_URL}/get-result/test-123
```

### 8.2 Test Frontend
```bash
open ${WEBSITE_URL}
```

---

## Troubleshooting

### Lambda no se ejecuta
```bash
# Ver logs
aws logs tail /aws/lambda/${PROJECT_NAME}-file-processor --follow
```

### Error CORS

- Verificar CORS en S3
- Verificar headers en Lambda response
- Verificar que API Gateway esté deployada

### Error 403 Forbidden

- Verificar IAM policies
- Verificar Block Public Access en S3
- Verificar Bucket Policy

---

## Cleanup (Eliminar Recursos)
```bash
# ADVERTENCIA: Esto eliminará TODOS los recursos

# Eliminar Lambda functions
aws lambda delete-function --function-name ${PROJECT_NAME}-url-generator
aws lambda delete-function --function-name ${PROJECT_NAME}-file-processor
aws lambda delete-function --function-name ${PROJECT_NAME}-result-retriever

# Eliminar API Gateway
aws apigateway delete-rest-api --rest-api-id ${API_ID}

# Eliminar S3 bucket (primero vaciar)
aws s3 rm s3://${PROJECT_NAME} --recursive
aws s3 rb s3://${PROJECT_NAME}

# Eliminar IAM role
aws iam delete-role --role-name ${PROJECT_NAME}-lambda-role
```

---

**Tiempo total estimado**: 45-60 minutos

**¿Problemas?** Abre un issue en GitHub