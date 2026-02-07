// ============================================
// STATE MANAGEMENT
// ============================================

const AppState = {
    currentFile: null,
    fileId: null,
    uploadProgress: 0,
    pollingAttempts: 0,
    abortController: null,
    currentStep: 0
};

// ============================================
// DOM ELEMENTS
// ============================================

const DOM = {
    // Sections
    uploadSection: document.getElementById('uploadSection'),
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    progressSection: document.getElementById('progressSection'),
    resultsSection: document.getElementById('resultsSection'),
    errorSection: document.getElementById('errorSection'),
    
    // Theme
    themeToggle: document.getElementById('themeToggle'),
    
    // Progress elements
    statusTitle: document.getElementById('statusTitle'),
    statusPercentage: document.getElementById('statusPercentage'),
    progressFill: document.getElementById('progressFill'),
    statusMessage: document.getElementById('statusMessage'),
    
    // Processing steps
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step4: document.getElementById('step4'),
    
    // Results elements
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    fileType: document.getElementById('fileType'),
    processedTime: document.getElementById('processedTime'),
    fileSummary: document.getElementById('fileSummary'),
    metadataContainer: document.getElementById('metadataContainer'),
    
    // Error elements
    errorMessage: document.getElementById('errorMessage'),
    
    // Buttons
    newAnalysisBtn: document.getElementById('newAnalysisBtn'),
    retryBtn: document.getElementById('retryBtn'),
    cancelErrorBtn: document.getElementById('cancelErrorBtn')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initializeEventListeners();
    console.log('AWS Analizer initialized - Professional Edition');
});

// ============================================
// THEME MANAGEMENT
// ============================================

function initializeTheme() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Theme toggle
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    // Upload zone click
    DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
    
    // File input change
    DOM.fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    DOM.uploadZone.addEventListener('dragover', handleDragOver);
    DOM.uploadZone.addEventListener('dragleave', handleDragLeave);
    DOM.uploadZone.addEventListener('drop', handleDrop);
    
    // Buttons
    DOM.newAnalysisBtn.addEventListener('click', resetApplication);
    DOM.retryBtn.addEventListener('click', () => {
        if (AppState.currentFile) {
            processFile(AppState.currentFile);
        }
    });
    DOM.cancelErrorBtn.addEventListener('click', resetApplication);
    
    // Prevent default drag behavior on document
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
}

// ============================================
// FILE HANDLING
// ============================================

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    DOM.uploadZone.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    DOM.uploadZone.classList.remove('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    DOM.uploadZone.classList.remove('drag-over');
    
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
}

// ============================================
// FILE VALIDATION
// ============================================

function validateFile(file) {
    // Validate size
    if (file.size > CONFIG.FILE_VALIDATION.MAX_SIZE) {
        throw new Error(`El archivo excede el tamaño máximo de ${CONFIG.FILE_VALIDATION.MAX_SIZE / 1024 / 1024} MB`);
    }
    
    // Validate MIME type
    if (!CONFIG.FILE_VALIDATION.ALLOWED_TYPES.includes(file.type)) {
        throw new Error('Tipo de archivo no permitido. Use PDF, TXT, PNG o JPG');
    }
    
    // Validate extension
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    if (!CONFIG.FILE_VALIDATION.ALLOWED_EXTENSIONS.includes(extension)) {
        throw new Error('Extensión de archivo no válida');
    }
    
    return true;
}

// ============================================
// MAIN PROCESSING FLOW
// ============================================

async function processFile(file) {
    try {
        // Validate file
        validateFile(file);
        
        // Save reference
        AppState.currentFile = file;
        AppState.fileId = generateFileId();
        
        // Show progress section
        showSection('progress');
        resetSteps();
        
        // 1. Get presigned URL
        updateProgress(10, 'Solicitando autorización', 'Conectando con AWS API Gateway...', 1);
        const uploadUrl = await getPresignedUrl(file);
        completeStep(1);
        
        // 2. Upload to S3
        updateProgress(20, 'Transfiriendo archivo', 'Subiendo a Amazon S3...', 2);
        await uploadToS3(uploadUrl, file);
        completeStep(2);
        
        // 3. Wait for processing
        updateProgress(60, 'Analizando contenido', 'AWS Lambda procesando documento...', 3);
        await waitForProcessing();
        completeStep(3);
        
        // 4. Get and display results
        updateProgress(90, 'Obteniendo resultados', 'Preparando visualización...', 4);
        const result = await getResult();
        completeStep(4);
        
        updateProgress(100, 'Análisis completado', 'Proceso finalizado exitosamente', 4);
        
        setTimeout(() => displayResults(result), 500);
        
    } catch (error) {
        console.error('Error processing file:', error);
        showError(error.message || 'Error desconocido al procesar el archivo');
    }
}

// ============================================
// STEP MANAGEMENT
// ============================================

function resetSteps() {
    const steps = [DOM.step1, DOM.step2, DOM.step3, DOM.step4];
    steps.forEach(step => {
        step.classList.remove('active', 'completed');
    });
    AppState.currentStep = 0;
}

function activateStep(stepNumber) {
    const steps = [DOM.step1, DOM.step2, DOM.step3, DOM.step4];
    
    // Remove active from all
    steps.forEach(step => step.classList.remove('active'));
    
    // Add active to current
    if (stepNumber > 0 && stepNumber <= steps.length) {
        steps[stepNumber - 1].classList.add('active');
        AppState.currentStep = stepNumber;
    }
}

function completeStep(stepNumber) {
    const steps = [DOM.step1, DOM.step2, DOM.step3, DOM.step4];
    
    if (stepNumber > 0 && stepNumber <= steps.length) {
        steps[stepNumber - 1].classList.remove('active');
        steps[stepNumber - 1].classList.add('completed');
    }
}

// ============================================
// API CALLS
// ============================================

async function getPresignedUrl(file) {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GET_UPLOAD_URL}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fileId: AppState.fileId,
            fileName: file.name,
            contentType: file.type
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al obtener URL de upload');
    }
    
    const data = await response.json();
    return data.uploadUrl;
}

async function uploadToS3(presignedUrl, file) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                const progressValue = 20 + (percentComplete * 0.4); // 20% to 60%
                updateProgress(
                    progressValue,
                    'Transfiriendo archivo',
                    `${Math.round(percentComplete)}% completado (${formatBytes(event.loaded)} / ${formatBytes(event.total)})`,
                    2
                );
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                resolve();
            } else {
                reject(new Error('Error al subir archivo a S3'));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Error de red al subir archivo'));
        });
        
        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelado'));
        });
        
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
    });
}

async function waitForProcessing() {
    AppState.pollingAttempts = 0;
    
    return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
            AppState.pollingAttempts++;
            
            const elapsed = AppState.pollingAttempts * CONFIG.POLLING.INTERVAL / 1000;
            updateProgress(
                60 + (AppState.pollingAttempts * 0.5),
                'Analizando contenido',
                `Procesamiento en curso... (${Math.round(elapsed)}s)`,
                3
            );
            
            if (AppState.pollingAttempts > CONFIG.POLLING.MAX_ATTEMPTS) {
                clearInterval(pollInterval);
                reject(new Error('Timeout: El procesamiento está tardando más de lo esperado. Intente con un archivo más pequeño.'));
                return;
            }
            
            try {
                const result = await checkProcessingStatus();
                
                if (result) {
                    clearInterval(pollInterval);
                    resolve();
                }
            } catch (error) {
                // Continue trying for transient errors
                console.log(`Polling attempt ${AppState.pollingAttempts}:`, error.message);
            }
        }, CONFIG.POLLING.INTERVAL);
    });
}

async function checkProcessingStatus() {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GET_RESULT}/${AppState.fileId}`;
    
    const response = await fetch(url);
    
    if (response.status === 404) {
        return false; // Not ready yet
    }
    
    if (!response.ok) {
        throw new Error('Error al verificar estado de procesamiento');
    }
    
    return true; // File processed
}

async function getResult() {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GET_RESULT}/${AppState.fileId}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al obtener resultados');
    }
    
    return await response.json();
}

// ============================================
// UI UPDATES
// ============================================

function showSection(section) {
    // Hide all sections
    DOM.uploadSection.classList.add('hidden');
    DOM.progressSection.classList.add('hidden');
    DOM.resultsSection.classList.add('hidden');
    DOM.errorSection.classList.add('hidden');
    
    // Show requested section
    switch(section) {
        case 'upload':
            DOM.uploadSection.classList.remove('hidden');
            break;
        case 'progress':
            DOM.progressSection.classList.remove('hidden');
            break;
        case 'results':
            DOM.resultsSection.classList.remove('hidden');
            break;
        case 'error':
            DOM.errorSection.classList.remove('hidden');
            break;
    }
}

function updateProgress(percentage, title, message, step = 0) {
    DOM.statusTitle.textContent = title;
    DOM.statusMessage.textContent = message;
    DOM.statusPercentage.textContent = `${Math.round(percentage)}%`;
    DOM.progressFill.style.width = `${percentage}%`;
    
    if (step > 0) {
        activateStep(step);
    }
}

function displayResults(result) {
    // Update file information
    DOM.fileName.textContent = AppState.currentFile.name;
    DOM.fileSize.textContent = formatBytes(AppState.currentFile.size);
    DOM.fileType.textContent = AppState.currentFile.type || 'unknown';
    DOM.processedTime.textContent = new Date().toLocaleString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Update summary
    DOM.fileSummary.textContent = result.summary || 'No se pudo generar un resumen del contenido.';
    
    // Update metadata
    if (result.metadata) {
        try {
            const metadataText = typeof result.metadata === 'string' 
                ? result.metadata 
                : JSON.stringify(result.metadata, null, 2);
            DOM.metadataContainer.querySelector('.metadata-content').textContent = metadataText;
        } catch (error) {
            DOM.metadataContainer.querySelector('.metadata-content').textContent = 'Error al formatear metadata';
        }
    } else {
        DOM.metadataContainer.querySelector('.metadata-content').textContent = 'No se encontró metadata';
    }
    
    showSection('results');
}

function showError(message) {
    DOM.errorMessage.textContent = message;
    showSection('error');
}

function resetApplication() {
    AppState.currentFile = null;
    AppState.fileId = null;
    AppState.uploadProgress = 0;
    AppState.pollingAttempts = 0;
    
    DOM.fileInput.value = '';
    showSection('upload');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateFileId() {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ============================================
// ERROR HANDLING
// ============================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
// ============================================
// UI UPDATES
// ============================================

function showSection(section) {
    // Ocultar todas las secciones
    DOM.uploadZone.classList.add('hidden');
    DOM.progressSection.classList.add('hidden');
    DOM.resultsSection.classList.add('hidden');
    DOM.errorSection.classList.add('hidden');
    
    // Mostrar la sección solicitada
    switch(section) {
        case 'upload':
            DOM.uploadZone.classList.remove('hidden');
            break;
        case 'progress':
            DOM.progressSection.classList.remove('hidden');
            break;
        case 'results':
            DOM.resultsSection.classList.remove('hidden');
            break;
        case 'error':
            DOM.errorSection.classList.remove('hidden');
            break;
    }
}

function updateProgress(percentage, title, message) {
    DOM.statusPercentage.textContent = `${Math.round(percentage)}%`;
    DOM.statusTitle.textContent = title;
    DOM.statusMessage.textContent = message;
    DOM.progressFill.style.width = `${percentage}%`;
}

function displayResults(result) {
    // Información del archivo
    DOM.fileName.textContent = result.metadata.originalFileName || AppState.currentFile.name;
    DOM.fileSize.textContent = formatFileSize(result.metadata.fileSize || AppState.currentFile.size);
    DOM.fileType.textContent = result.metadata.contentType || AppState.currentFile.type;
    DOM.processedTime.textContent = formatDate(result.metadata.processedAt || new Date().toISOString());
    
    // Resumen generado
    DOM.fileSummary.textContent = result.summary || 'No se pudo generar un resumen para este archivo.';
    
    // Metadata extraída
    displayMetadata(result.metadata);
    
    // Mostrar sección de resultados
    showSection('results');
}

function displayMetadata(metadata) {
    // Formatear metadata como JSON pretty-print
    const metadataFormatted = JSON.stringify(metadata, null, 2);
    
    // Crear elemento pre para mantener formato
    DOM.metadataContainer.innerHTML = `<pre>${escapeHtml(metadataFormatted)}</pre>`;
}

function showError(message) {
    DOM.errorMessage.textContent = message;
    showSection('error');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateFileId() {
    // Generar UUID v4 simplificado
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(isoString) {
    const date = new Date(isoString);
    
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    
    return date.toLocaleDateString('es-ES', options);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, m => map[m]);
}

function resetApplication() {
    // Limpiar estado
    AppState.currentFile = null;
    AppState.fileId = null;
    AppState.uploadProgress = 0;
    AppState.pollingAttempts = 0;
    
    // Limpiar input
    DOM.fileInput.value = '';
    
    // Resetear progress bar
    DOM.progressFill.style.width = '0%';
    
    // Volver a la pantalla inicial
    showSection('upload');
}

// ============================================
// ERROR HANDLING
// ============================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showError('Ha ocurrido un error inesperado. Por favor, intenta nuevamente.');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showError('Error de comunicación con el servidor. Verifica tu conexión.');
});

// ============================================
// CONSOLE WARNINGS
// ============================================

console.log('%cAWS Analizer', 'color: #FF9900; font-size: 24px; font-weight: bold;');
console.log('%cAplicación de análisis de documentos en la nube', 'color: #232F3E; font-size: 14px;');
console.log('%c⚠️ Advertencia de Seguridad', 'color: #D13212; font-size: 14px; font-weight: bold;');
console.log('No ejecutes código de terceros en esta consola. Podría comprometer tu seguridad.');