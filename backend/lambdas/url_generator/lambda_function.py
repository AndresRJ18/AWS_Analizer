import json
import boto3
import os
from datetime import datetime
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME')
UPLOAD_EXPIRATION = 300  # 5 minutos

def lambda_handler(event, context):
    """
    Genera una presigned URL para que el frontend suba archivos directamente a S3.
    
    Este enfoque evita que los archivos pasen por Lambda (límite de 6MB),
    permitiendo uploads directos y seguros a S3 con URLs temporales.
    """
    
    try:
        body = json.loads(event.get('body', '{}'))
        
        file_id = body.get('fileId')
        file_name = body.get('fileName')
        content_type = body.get('contentType')
        
        if not all([file_id, file_name, content_type]):
            return create_response(event, 400, {
                'error': 'Missing required parameters',
                'required': ['fileId', 'fileName', 'contentType']
            })
        
        # Whitelist de tipos de archivo permitidos
        allowed_types = [
            'application/pdf',
            'text/plain',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'image/webp'
        ]
        
        if content_type not in allowed_types:
            return create_response(event, 400, {
                'error': 'Invalid content type',
                'allowed': allowed_types
            })
        
        extension = get_extension(file_name)
        object_key = f"uploads/{file_id}{extension}"
        
        # Generar presigned URL con tiempo de expiración
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': object_key,
                'ContentType': content_type,
                'Metadata': {
                    'original-filename': file_name,
                    'uploaded-at': datetime.utcnow().isoformat()
                }
            },
            ExpiresIn=UPLOAD_EXPIRATION
        )
        
        print(f"Generated presigned URL for fileId: {file_id}")
        
        return create_response(event, 200, {
            'uploadUrl': presigned_url,
            'fileId': file_id,
            'objectKey': object_key,
            'expiresIn': UPLOAD_EXPIRATION
        })
        
    except ClientError as e:
        print(f"S3 ClientError: {str(e)}")
        return create_response(event, 500, {
            'error': 'Failed to generate upload URL',
            'message': str(e)
        })
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return create_response(event, 500, {
            'error': 'Internal server error',
            'message': str(e)
        })


def get_extension(filename):
    """Extrae la extensión del archivo incluyendo el punto."""
    if '.' in filename:
        return '.' + filename.rsplit('.', 1)[1].lower()
    return ''


def create_response(event, status_code, body):
    """
    Crea respuesta HTTP con headers CORS dinámicos.
    """
    # Obtener origin del request
    origin = event.get('headers', {}).get('origin', '')
    
    # Lista de orígenes permitidos (configurar según tu deployment)
    allowed_origins = [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        # Agregar aquí tu URL de S3 static hosting o CloudFront
        # Ejemplo: 'https://your-bucket.s3-website-region.amazonaws.com'
    ]
    
    # Si el origin está en la lista, usarlo; si no, usar '*'
    cors_origin = origin if origin in allowed_origins else '*'
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': cors_origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key'
        },
        'body': json.dumps(body)
    }