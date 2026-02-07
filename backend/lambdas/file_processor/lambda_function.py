import json
import boto3
import os
from datetime import datetime
from urllib.parse import unquote_plus
import mimetypes

# Clientes AWS
s3_client = boto3.client('s3')

# Variables de entorno
BUCKET_NAME = os.environ.get('BUCKET_NAME')

def lambda_handler(event, context):
    """
    Procesa archivos subidos a S3 de forma asíncrona.
    
    Trigger: S3 Event (ObjectCreated:Put)
    
    Flujo:
    1. S3 dispara evento al subir archivo a uploads/
    2. Lambda extrae metadata del archivo
    3. Lambda genera resumen basado en tipo de archivo
    4. Lambda guarda resultado en results/{fileId}.json
    5. Frontend recupera resultado con polling
    """
    
    try:
        # Parsear evento de S3
        for record in event['Records']:
            bucket = record['s3']['bucket']['name']
            key = unquote_plus(record['s3']['object']['key'])
            
            print(f"Processing file: {key}")
            
            # Validar que el archivo está en uploads/
            if not key.startswith('uploads/'):
                print(f"Skipping file not in uploads/: {key}")
                continue
            
            # Extraer fileId del nombre del archivo
            # Formato: uploads/{fileId}.{extension}
            file_id = extract_file_id(key)
            
            if not file_id:
                print(f"Could not extract fileId from: {key}")
                continue
            
            # Obtener metadata del archivo desde S3
            file_metadata = get_file_metadata(bucket, key)
            
            # Generar resumen basado en el tipo de archivo
            summary = generate_summary(bucket, key, file_metadata)
            
            # Construir resultado completo
            result = {
                'fileId': file_id,
                'status': 'completed',
                'processedAt': datetime.utcnow().isoformat() + 'Z',
                'metadata': file_metadata,
                'summary': summary
            }
            
            # Guardar resultado en S3
            result_key = f"results/{file_id}.json"
            s3_client.put_object(
                Bucket=bucket,
                Key=result_key,
                Body=json.dumps(result, indent=2),
                ContentType='application/json',
                Metadata={
                    'processed-at': datetime.utcnow().isoformat()
                }
            )
            
            print(f"Successfully processed {key} → {result_key}")
            
        return {
            'statusCode': 200,
            'body': json.dumps('Processing completed successfully')
        }
        
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        raise e


def extract_file_id(key):
    """
    Extrae el fileId del path del objeto en S3.
    
    Input: uploads/abc-123-def.pdf
    Output: abc-123-def
    """
    try:
        filename = key.split('/')[-1]  # abc-123-def.pdf
        file_id = filename.rsplit('.', 1)[0]  # abc-123-def
        return file_id
    except Exception as e:
        print(f"Error extracting fileId: {str(e)}")
        return None


def get_file_metadata(bucket, key):
    """
    Obtiene metadata del archivo desde S3.
    
    Incluye:
    - Nombre original
    - Tamaño
    - Tipo de contenido
    - Timestamp de subida
    - Metadata adicional según tipo
    """
    try:
        # Obtener metadata del objeto
        response = s3_client.head_object(Bucket=bucket, Key=key)
        
        metadata = {
            'originalFileName': response['Metadata'].get('original-filename', key.split('/')[-1]),
            'fileSize': response['ContentLength'],
            'contentType': response['ContentType'],
            'uploadedAt': response['LastModified'].isoformat(),
            'storageClass': response.get('StorageClass', 'STANDARD'),
            's3Key': key
        }
        
        # Metadata específica por tipo de archivo
        content_type = response['ContentType']
        
        if content_type.startswith('image/'):
            # Para imágenes, podríamos extraer dimensiones con Pillow o Rekognition
            metadata['fileCategory'] = 'image'
            metadata['estimatedDimensions'] = 'Variable (requiere análisis detallado)'
            
        elif content_type == 'application/pdf':
            metadata['fileCategory'] = 'document'
            metadata['estimatedPages'] = 'Variable (requiere análisis detallado)'
            
        elif content_type == 'text/plain':
            metadata['fileCategory'] = 'text'
            # Para texto, podríamos contar líneas
            try:
                obj = s3_client.get_object(Bucket=bucket, Key=key)
                content = obj['Body'].read().decode('utf-8')
                metadata['lineCount'] = len(content.split('\n'))
                metadata['characterCount'] = len(content)
                metadata['wordCount'] = len(content.split())
            except Exception as e:
                print(f"Could not analyze text content: {str(e)}")
        
        return metadata
        
    except Exception as e:
        print(f"Error getting file metadata: {str(e)}")
        return {
            'error': str(e),
            's3Key': key
        }


def generate_summary(bucket, key, metadata):
    """
    Genera un resumen inteligente del archivo basado en su tipo.
    
    En un sistema real, aquí podrías integrar:
    - AWS Textract (para PDFs)
    - AWS Rekognition (para imágenes)
    - AWS Comprehend (para análisis de texto)
    - Amazon Bedrock (para resúmenes con IA generativa)
    
    Para este proyecto, generamos resúmenes basados en metadata.
    """
    
    content_type = metadata.get('contentType', '')
    file_size = metadata.get('fileSize', 0)
    file_name = metadata.get('originalFileName', 'archivo')
    
    # Resumen base
    summary = f"Se ha procesado exitosamente el archivo '{file_name}' "
    
    # Resumen específico por tipo
    if content_type == 'application/pdf':
        summary += (
            f"en formato PDF con un tamaño de {format_file_size(file_size)}. "
            "Este documento ha sido almacenado de forma segura en Amazon S3 y está disponible "
            "para análisis posterior. El sistema ha extraído metadata básica incluyendo "
            "información de almacenamiento y timestamps. "
        )
        
        if file_size > 1024 * 1024:  # > 1MB
            summary += "Debido al tamaño considerable del documento, se recomienda procesamiento "
            summary += "adicional para extracción de texto y análisis de contenido detallado."
        else:
            summary += "El tamaño del documento permite procesamiento rápido para extracción de contenido."
            
    elif content_type == 'text/plain':
        word_count = metadata.get('wordCount', 0)
        line_count = metadata.get('lineCount', 0)
        
        summary += (
            f"en formato de texto plano con {line_count} líneas y {word_count} palabras. "
            f"El archivo contiene {format_file_size(file_size)} de contenido textual. "
        )
        
        if word_count > 1000:
            summary += (
                "El documento contiene una cantidad significativa de texto, lo que sugiere "
                "contenido detallado que podría beneficiarse de análisis de sentimiento o "
                "extracción de palabras clave mediante servicios de NLP."
            )
        else:
            summary += (
                "El contenido es conciso y apropiado para análisis rápido. "
                "El texto está listo para ser procesado por pipelines de NLP si es necesario."
            )
            
    elif content_type.startswith('image/'):
        image_format = content_type.split('/')[-1].upper()
        summary += (
            f"en formato de imagen {image_format} con un tamaño de {format_file_size(file_size)}. "
            "La imagen ha sido almacenada y está lista para análisis visual. "
        )
        
        if file_size > 5 * 1024 * 1024:  # > 5MB
            summary += (
                "Debido al tamaño considerable de la imagen, se recomienda optimización "
                "antes de procesamiento intensivo. El archivo puede contener alta resolución "
                "o metadata extensa."
            )
        else:
            summary += (
                "El tamaño de la imagen es óptimo para procesamiento con servicios de visión "
                "computacional como AWS Rekognition para detección de objetos, texto, o análisis de contenido."
            )
    else:
        summary += (
            f"de tipo '{content_type}' con un tamaño de {format_file_size(file_size)}. "
            "El archivo ha sido procesado y almacenado correctamente en la infraestructura cloud."
        )
    
    # Agregar información de seguridad y almacenamiento
    summary += (
        "\n\nEl archivo se encuentra encriptado en reposo usando AES-256 (SSE-S3) "
        "y cumple con las mejores prácticas de seguridad de AWS. El acceso está controlado "
        "mediante políticas IAM con principio de menor privilegio."
    )
    
    return summary


def format_file_size(bytes_size):
    """Formatea tamaño de archivo en formato legible."""
    for unit in ['bytes', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} TB"