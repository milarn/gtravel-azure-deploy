// routes/api.js - API routes for file management
const express = require('express');
const { 
    getFilesForUser, 
    getFileById, 
    logFileAccess,
    getUserCompany 
} = require('../services/database');
const { generateSecureDownloadUrl } = require('../services/azure-storage');
const router = express.Router();

// Get user's accessible files
router.get('/files', async (req, res) => {
    try {
        console.log(`📁 Getting files for user: ${req.session.user.displayName} (Company: ${req.session.user.companyId}, Role: ${req.session.user.role})`);
        
        const { companyId, role, accessLevel } = req.session.user;
        
        if (!companyId) {
            console.warn('⚠️ User has no company ID assigned');
            return res.json([]);
        }
        
        // Get files from database based on user's company and role
        const files = await getFilesForUser(companyId, role, accessLevel);
        
        console.log(`✅ Found ${files.length} accessible files for user`);
        
        // Format files for frontend
        const formattedFiles = files.map(file => ({
            id: file.FileId,
            name: file.FileName,
            category: file.Category,
            size: formatFileSize(file.SizeBytes),
            lastUpdated: file.LastUpdated,
            status: determineFileStatus(file, req.session.user),
            blobPath: file.BlobPath, // Don't expose full blob path to frontend
            requiredRole: file.RequiredRole,
            companyName: file.CompanyName
        }));
        
        res.json(formattedFiles);
        
    } catch (error) {
        console.error('❌ Error fetching files:', error);
        res.status(500).json({
            error: 'Failed to fetch files',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Get secure download URL for a file
router.get('/download', async (req, res) => {
    try {
        const { fileId, fileName } = req.query;
        
        if (!fileId && !fileName) {
            return res.status(400).json({ 
                error: 'Missing file identifier',
                message: 'Either fileId or fileName is required' 
            });
        }
        
        console.log(`📥 Download request for file: ${fileName || fileId} by user: ${req.session.user.displayName}`);
        
        // Get file details from database
        let file;
        if (fileId) {
            file = await getFileById(fileId);
        } else {
            // Find file by name and user's company
            const files = await getFilesForUser(req.session.user.companyId, req.session.user.role, req.session.user.accessLevel);
            file = files.find(f => f.FileName === fileName);
        }
        
        if (!file) {
            console.warn(`⚠️ File not found: ${fileName || fileId}`);
            return res.status(404).json({ 
                error: 'File not found',
                message: 'The requested file does not exist or you do not have access to it' 
            });
        }
        
        // Check if user has access to this specific file
        const hasAccess = await checkFileAccess(file, req.session.user);
        
        if (!hasAccess) {
            console.warn(`🚫 Access denied to file: ${file.FileName} for user: ${req.session.user.displayName}`);
            
            // Log access attempt
            await logFileAccess(
                req.session.user.id, 
                file.FileId, 
                'ACCESS_DENIED', 
                req.ip,
                req.get('User-Agent')
            );
            
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You do not have permission to download this file' 
            });
        }
        
        // Generate secure download URL (SAS token)
        try {
            const downloadUrl = await generateSecureDownloadUrl(
                file.BlobPath, 
                file.FileName,
                3600 // 1 hour expiry
            );
            
            // Log successful access
            await logFileAccess(
                req.session.user.id, 
                file.FileId, 
                'DOWNLOAD_STARTED', 
                req.ip,
                req.get('User-Agent')
            );
            
            console.log(`✅ Generated secure download URL for: ${file.FileName}`);
            
            res.json({
                downloadUrl: downloadUrl,
                fileName: file.FileName,
                fileSize: file.SizeBytes,
                expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
            });
            
        } catch (storageError) {
            console.error('❌ Azure Storage error:', storageError);
            
            // Log storage error
            await logFileAccess(
                req.session.user.id, 
                file.FileId, 
                'DOWNLOAD_FAILED', 
                req.ip,
                req.get('User-Agent'),
                storageError.message
            );
            
            res.status(500).json({
                error: 'Download URL generation failed',
                message: 'Unable to generate secure download link. Please try again later.'
            });
        }
        
    } catch (error) {
        console.error('❌ Download endpoint error:', error);
        res.status(500).json({
            error: 'Download failed',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Search files
router.get('/search', async (req, res) => {
    try {
        const { q: query, category, limit = 50 } = req.query;
        
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ 
                error: 'Invalid search query',
                message: 'Search query must be at least 2 characters long' 
            });
        }
        
        console.log(`🔍 Searching files for: "${query}" (category: ${category || 'all'})`);
        
        const { companyId, role, accessLevel } = req.session.user;
        
        // Get all accessible files first
        const allFiles = await getFilesForUser(companyId, role, accessLevel);
        
        // Filter files based on search query
        const searchResults = allFiles.filter(file => {
            const matchesQuery = file.FileName.toLowerCase().includes(query.toLowerCase()) ||
                                 (file.Category && file.Category.toLowerCase().includes(query.toLowerCase()));
            const matchesCategory = !category || file.Category === category;
            
            return matchesQuery && matchesCategory;
        });
        
        // Limit results
        const limitedResults = searchResults.slice(0, parseInt(limit));
        
        // Format for frontend
        const formattedResults = limitedResults.map(file => ({
            id: file.FileId,
            name: file.FileName,
            category: file.Category,
            size: formatFileSize(file.SizeBytes),
            lastUpdated: file.LastUpdated,
            status: determineFileStatus(file, req.session.user)
        }));
        
        console.log(`✅ Search found ${formattedResults.length} results`);
        
        res.json({
            query: query,
            category: category,
            totalResults: searchResults.length,
            results: formattedResults
        });
        
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({
            error: 'Search failed',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Get file categories available to user
router.get('/categories', async (req, res) => {
    try {
        const { companyId, role, accessLevel } = req.session.user;
        
        const files = await getFilesForUser(companyId, role, accessLevel);
        
        // Extract unique categories
        const categories = [...new Set(files.map(f => f.Category).filter(Boolean))];
        
        const categoryCounts = categories.map(category => ({
            name: category,
            count: files.filter(f => f.Category === category).length
        }));
        
        res.json(categoryCounts);
        
    } catch (error) {
        console.error('❌ Categories error:', error);
        res.status(500).json({
            error: 'Failed to fetch categories',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Get user's company information
router.get('/company', async (req, res) => {
    try {
        if (!req.session.user.companyId) {
            return res.json({ company: null });
        }
        
        const company = await getUserCompany(req.session.user.companyId);
        
        res.json({ 
            company: company ? {
                id: company.CompanyId,
                name: company.CompanyName,
                contactEmail: company.ContactEmail,
                isActive: company.IsActive
            } : null
        });
        
    } catch (error) {
        console.error('❌ Company info error:', error);
        res.status(500).json({
            error: 'Failed to fetch company information',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Get access audit log for user (last 50 entries)
router.get('/audit', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        // This would query your audit log table
        // For now, return empty array as audit logging depends on your specific requirements
        
        console.log(`📊 Audit log request for user: ${req.session.user.displayName}`);
        
        res.json({
            message: 'Audit logging not yet implemented',
            entries: []
        });
        
    } catch (error) {
        console.error('❌ Audit log error:', error);
        res.status(500).json({
            error: 'Failed to fetch audit log',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Helper functions

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function determineFileStatus(file, user) {
    // Determine file status based on user permissions and file properties
    if (file.RequiredRole && file.RequiredRole !== user.role && user.role !== 'Admin') {
        return 'restricted';
    }
    
    // Add more business logic here based on your requirements
    // For example: processing status, approval workflows, etc.
    
    return 'available';
}

async function checkFileAccess(file, user) {
    try {
        // Basic access control logic
        
        // 1. Check if file belongs to user's company
        if (file.CompanyId && file.CompanyId !== user.companyId) {
            return false;
        }
        
        // 2. Check role requirements
        if (file.RequiredRole) {
            if (user.role === 'Admin') {
                return true; // Admins can access everything
            }
            
            if (file.RequiredRole !== user.role) {
                return false;
            }
        }
        
        // 3. Check access level requirements
        const accessLevels = ['standard', 'europe', 'nordic', 'global'];
        const userLevelIndex = accessLevels.indexOf(user.accessLevel);
        const requiredLevelIndex = accessLevels.indexOf(file.RequiredAccessLevel || 'standard');
        
        if (userLevelIndex < requiredLevelIndex) {
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Access check error:', error);
        return false; // Deny access on error
    }
}

module.exports = router;
