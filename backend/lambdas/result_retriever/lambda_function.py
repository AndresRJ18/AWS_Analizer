import json
import boto3
import os
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

def lambda_handler(event, context):
    """
    Recupera el resultado procesado de S3.
    """
    
    try:
        file_id = event.get('pathParameters', {}).get('fileId')
        
        if not file_id:
            return create_response(event, 400, {
                'error': 'Missing fileId parameter'
            })
        
        if not is_valid_uuid(file_id):
            return create_response(event, 400, {
                'error': 'Invalid fileId format'
            })
        
        result_key = f"results/{file_id}.json"
        
        try:
            response = s3_client.get_object(
                Bucket=BUCKET_NAME,
                Key=result_key
            )
            
            result_content = response['Body'].read().decode('utf-8')
            result_data = json.loads(result_content)
            
            print(f"Retrieved result for fileId: {file_id}")
            
            return create_response(event, 200, result_data)
            
        except s3_client.exceptions.NoSuchKey:
            print(f"Result not ready for fileId: {file_id}")
            return create_response(event, 404, {
                'error': 'Result not ready',
                'message': 'File is still being processed',
                'fileId': file_id
            })
        
    except ClientError as e:
        print(f"S3 ClientError: {str(e)}")
        return create_response(event, 500, {
            'error': 'Failed to retrieve result',
            'message': str(e)
        })
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return create_response(event, 500, {
            'error': 'Internal server error',
            'message': str(e)
        })


def is_valid_uuid(uuid_string):
    """Valida formato UUID v4."""
    import re
    uuid_pattern = re.compile(
        r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(uuid_string))


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
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key'
        },
        'body': json.dumps(body)
    }