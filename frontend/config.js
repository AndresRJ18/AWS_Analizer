// ============================================
// AWS DOCUMENT ANALYZER - CONFIGURATION
// ============================================

/**
 * API Gateway Configuration
 * 
 * IMPORTANT: Update these values after deploying your AWS infrastructure
 * 
 * To find your API Gateway URL:
 * 1. Go to AWS Console → API Gateway
 * 2. Select your API
 * 3. Go to "Stages" → Select your stage (e.g., "prod")
 * 4. Copy the "Invoke URL"
 * 
 * Format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
 * Example: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
 */

const CONFIG = {
    // API Gateway Base URL
    // TODO: Replace with your actual API Gateway URL
    API_BASE_URL: 'https://YOUR_API_GATEWAY_ID.execute-api.YOUR_REGION.amazonaws.com/YOUR_STAGE',
    
    // API Endpoints
    ENDPOINTS: {
        GET_UPLOAD_URL: '/upload-url',  // POST - Get presigned S3 URL
        GET_RESULT: '/results'          // GET - Retrieve processing results
    },
    
    // Polling Configuration
    POLLING: {
        INTERVAL: 3000,        // Time between status checks (milliseconds)
        MAX_ATTEMPTS: 40,      // Maximum polling attempts (40 × 3s = 2 minutes)
        TIMEOUT: 120000        // Total timeout (milliseconds)
    },
    
    // File Validation Rules
    FILE_VALIDATION: {
        MAX_SIZE: 10 * 1024 * 1024,  // 10 MB in bytes
        
        ALLOWED_TYPES: [
            'application/pdf',
            'text/plain',
            'image/png',
            'image/jpeg',
            'image/jpg'
        ],
        
        ALLOWED_EXTENSIONS: [
            '.pdf',
            '.txt',
            '.png',
            '.jpg',
            '.jpeg'
        ]
    },
    
    // Feature Flags
    FEATURES: {
        ENABLE_ANALYTICS: false,
        ENABLE_ERROR_REPORTING: false,
        DEBUG_MODE: false  // Set to true for development debugging
    }
};

// ============================================
// ENVIRONMENT DETECTION
// ============================================

const ENV = {
    isDevelopment: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1',
    isProduction: window.location.hostname !== 'localhost' && 
                  window.location.hostname !== '127.0.0.1'
};

// Log configuration in development
if (ENV.isDevelopment && CONFIG.FEATURES.DEBUG_MODE) {
    console.log('📋 AWS Document Analyzer Configuration:', CONFIG);
    console.log('🌍 Environment:', ENV);
}

// ============================================
// CONFIGURATION VALIDATION
// ============================================

function validateConfig() {
    const warnings = [];
    
    // Check if API URL is configured
    if (CONFIG.API_BASE_URL.includes('YOUR_API_GATEWAY_ID') || 
        CONFIG.API_BASE_URL.includes('YOUR_REGION') ||
        CONFIG.API_BASE_URL.includes('YOUR_STAGE')) {
        warnings.push('⚠️ API_BASE_URL not configured. Update with your actual API Gateway URL.');
    }
    
    // Check polling interval
    if (CONFIG.POLLING.INTERVAL < 1000) {
        warnings.push('⚠️ POLLING.INTERVAL is very low. Consider increasing to avoid rate limits.');
    }
    
    // Check file size limits
    if (CONFIG.FILE_VALIDATION.MAX_SIZE > 10 * 1024 * 1024) {
        warnings.push('⚠️ MAX_SIZE exceeds 10MB. Ensure your infrastructure can handle larger files.');
    }
    
    // Display warnings in development
    if (warnings.length > 0 && ENV.isDevelopment) {
        console.warn('⚙️ Configuration Warnings:');
        warnings.forEach(w => console.warn(w));
    }
    
    return warnings.length === 0;
}

// Validate configuration on load
if (ENV.isDevelopment) {
    validateConfig();
}

// ============================================
// EXPORT FOR ES6 MODULES (if needed)
// ============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, ENV };
}