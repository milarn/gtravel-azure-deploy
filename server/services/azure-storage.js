// services/azure-storage.js - Azure Storage service for secure file downloads
const { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters } = require('@azure/storage-blob');

// Azure Storage configuration
const accountName = process.env.AZURE_STORAGE_ACCOUNT;
const accountKey = process.env.AZURE_STORAGE_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER;

let blobServiceClient = null;

// Initialize Azure Storage client
function initializeStorageClient() {
    try {
        if (!accountName || !accountKey) {
            console.warn('⚠️ Azure Storage credentials not configured - file downloads will not work');
            return null;
        }
        
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            sharedKeyCredential
        );
        
        console.log('✅ Azure Storage client initialized');
        return blobServiceClient;
    } catch (error) {
        console.error('❌ Failed to initialize Azure Storage client:', error);
        return null;
    }
}

// Generate secure download URL with SAS token
async function generateSecureDownloadUrl(blobPath, fileName, expiryMinutes = 60) {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            throw new Error('Azure Storage client not initialized');
        }
        
        // Clean blob path (remove leading slash if present)
        const cleanBlobPath = blobPath.startsWith('/') ? blobPath.substring(1) : blobPath;
        
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(cleanBlobPath);
        
        // Check if blob exists
        const exists = await blobClient.exists();
        if (!exists) {
            throw new Error(`File not found in storage: ${cleanBlobPath}`);
        }
        
        // Generate SAS token
        const sasOptions = {
            containerName: containerName,
            blobName: cleanBlobPath,
            permissions: BlobSASPermissions.parse('r'), // Read permission only
            startsOn: new Date(),
            expiresOn: new Date(Date.now() + (expiryMinutes * 60 * 1000)),
            contentDisposition: `attachment; filename="${fileName}"`,
            contentType: getContentType(fileName)
        };
        
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
        
        const downloadUrl = `${blobClient.url}?${sasToken}`;
        
        console.log(`🔗 Generated secure download URL for: ${fileName} (expires in ${expiryMinutes} minutes)`);
        
        return downloadUrl;
    } catch (error) {
        console.error('❌ Error generating secure download URL:', error);
        throw new Error(`Failed to generate download URL: ${error.message}`);
    }
}

// Upload file to Azure Storage (for future use)
async function uploadFile(fileBuffer, fileName, containerPath = '') {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            throw new Error('Azure Storage client not initialized');
        }
        
        const blobPath = containerPath ? `${containerPath}/${fileName}` : fileName;
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
        
        const uploadOptions = {
            blobHTTPHeaders: {
                blobContentType: getContentType(fileName)
            },
            metadata: {
                uploadedAt: new Date().toISOString(),
                originalName: fileName
            }
        };
        
        const uploadResult = await blockBlobClient.upload(fileBuffer, fileBuffer.length, uploadOptions);
        
        console.log(`✅ File uploaded successfully: ${fileName} → ${blobPath}`);
        
        return {
            blobPath: blobPath,
            uploadResult: uploadResult,
            url: blockBlobClient.url
        };
    } catch (error) {
        console.error('❌ Error uploading file:', error);
        throw new Error(`Failed to upload file: ${error.message}`);
    }
}

// Delete file from Azure Storage (for future use)
async function deleteFile(blobPath) {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            throw new Error('Azure Storage client not initialized');
        }
        
        const cleanBlobPath = blobPath.startsWith('/') ? blobPath.substring(1) : blobPath;
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(cleanBlobPath);
        
        const deleteResult = await blobClient.delete();
        
        console.log(`🗑️ File deleted successfully: ${cleanBlobPath}`);
        
        return deleteResult;
    } catch (error) {
        console.error('❌ Error deleting file:', error);
        throw new Error(`Failed to delete file: ${error.message}`);
    }
}

// List files in container (for future use)
async function listFiles(prefix = '') {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            throw new Error('Azure Storage client not initialized');
        }
        
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const files = [];
        
        const listOptions = {
            prefix: prefix,
            includeMetadata: true
        };
        
        for await (const blob of containerClient.listBlobsFlat(listOptions)) {
            files.push({
                name: blob.name,
                size: blob.properties.contentLength,
                lastModified: blob.properties.lastModified,
                contentType: blob.properties.contentType,
                metadata: blob.metadata
            });
        }
        
        console.log(`📁 Listed ${files.length} files from container (prefix: '${prefix}')`);
        
        return files;
    } catch (error) {
        console.error('❌ Error listing files:', error);
        throw new Error(`Failed to list files: ${error.message}`);
    }
}

// Check if container exists and is accessible
async function checkContainerHealth() {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            return false;
        }
        
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const exists = await containerClient.exists();
        
        if (exists) {
            console.log(`✅ Azure Storage container '${containerName}' is accessible`);
            return true;
        } else {
            console.error(`❌ Azure Storage container '${containerName}' does not exist`);
            return false;
        }
    } catch (error) {
        console.error('❌ Azure Storage health check failed:', error);
        return false;
    }
}

// Get file metadata without downloading
async function getFileMetadata(blobPath) {
    try {
        if (!blobServiceClient) {
            blobServiceClient = initializeStorageClient();
        }
        
        if (!blobServiceClient) {
            throw new Error('Azure Storage client not initialized');
        }
        
        const cleanBlobPath = blobPath.startsWith('/') ? blobPath.substring(1) : blobPath;
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(cleanBlobPath);
        
        const properties = await blobClient.getProperties();
        
        return {
            size: properties.contentLength,
            lastModified: properties.lastModified,
            contentType: properties.contentType,
            metadata: properties.metadata
        };
    } catch (error) {
        console.error('❌ Error getting file metadata:', error);
        throw new Error(`Failed to get file metadata: ${error.message}`);
    }
}

// Helper function to determine content type based on file extension
function getContentType(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();
    
    const contentTypes = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'zip': 'application/zip',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'mp4': 'video/mp4',
        'mp3': 'audio/mpeg'
    };
    
    return contentTypes[extension] || 'application/octet-stream';
}

// Initialize storage client on module load
initializeStorageClient();

module.exports = {
    generateSecureDownloadUrl,
    uploadFile,
    deleteFile,
    listFiles,
    checkContainerHealth,
    getFileMetadata
};
