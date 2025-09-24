// Fixed Dashboard JavaScript - SECURE version with proper authorization

let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 G-Travel Dashboard Loading...');
    initDashboard();
});

async function initDashboard() {
    try {
        await checkAuth();
        setupEventListeners();
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        redirectToLogin();
    }
}

async function checkAuth() {
    console.log('🔍 Checking authentication...');
    
    try {
        const response = await fetch('/auth/user', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data?.authenticated === true && data?.user) {
                currentUser = data.user;
                console.log('✅ Authentication successful');
                
                // Load dashboard content
                updateUserInterface();
                await loadFiles();
                return;
            }
        }
        
        console.log('❌ Authentication failed');
        throw new Error('Authentication failed');
        
    } catch (error) {
        console.error('Auth check error:', error);
        throw error;
    }
}

function updateUserInterface() {
    if (!currentUser) return;
    
    // Update user info in sidebar
    const userName = document.getElementById('userName');
    const userCompany = document.getElementById('userCompany');
    const welcomeName = document.getElementById('welcomeName');
    const accessLevel = document.getElementById('accessLevel');
    const userInitials = document.getElementById('userInitials');
    
    const displayName = currentUser.displayName || currentUser.email || 'User';
    const firstName = displayName.split(' ')[0];
    
    if (userName) userName.textContent = displayName;
    if (userCompany) userCompany.textContent = currentUser.company || 'Unknown';
    if (welcomeName) welcomeName.textContent = firstName;
    if (accessLevel) accessLevel.textContent = formatAccessLevel(currentUser.accessLevel);
    if (userInitials) {
        const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
        userInitials.textContent = initials.substring(0, 2);
    }
    
    console.log('✅ User interface updated');
}

function formatAccessLevel(level) {
    const levels = {
        'developer': 'Cipher Bergen AS',
        'customer': 'G-Travel AS',
        'standard': 'Standard Access'
    };
    return levels[level] || (level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Standard');
}

async function loadFiles() {
    console.log('📁 Loading files via secure server proxy...');
    
    const loadingElement = document.getElementById('loadingFiles');
    const noFilesElement = document.getElementById('noFilesMessage');
    const tableBody = document.getElementById('fileTableBody');
    const totalFilesElement = document.getElementById('totalFiles');
    
    // Show loading state
    if (loadingElement) loadingElement.style.display = 'block';
    if (noFilesElement) noFilesElement.style.display = 'none';
    
    try {
        // Get date range parameters
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log('🔗 Calling secure proxy: /api/function/files');
        
        // FIXED: Call secure server proxy instead of Azure Function directly
        const response = await fetch(`/api/function/files?${params}`, {
            method: 'GET',
            credentials: 'include', // Include session cookie
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`📡 Response status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            const files = data.files || [];
            
            console.log(`📊 Loaded ${files.length} files securely for ${data.companyName || 'company'}`);
            
            // Update file count
            if (totalFilesElement) totalFilesElement.textContent = files.length;
            
            // Populate table with real data
            if (tableBody) {
                tableBody.innerHTML = '';
                
                if (files.length === 0) {
                    if (noFilesElement) {
                        noFilesElement.innerHTML = `
                            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                            </svg>
                            <h3>No files found</h3>
                            <p>No invoice data found for your organization in the selected date range.</p>
                            <p>Try adjusting the date filter or contact your administrator.</p>
                        `;
                        noFilesElement.style.display = 'block';
                    }
                } else {
                    files.forEach(file => {
                        const row = createRealFileRow(file);
                        tableBody.appendChild(row);
                    });
                }
            }
            
        } else {
            console.error('Failed to load files:', response.status, response.statusText);
            const errorData = await response.json().catch(() => ({}));
            
            if (response.status === 401) {
                console.log('🔒 Authentication required - redirecting to login');
                redirectToLogin();
                return;
            }
            
            if (response.status === 403) {
                if (noFilesElement) {
                    noFilesElement.innerHTML = `
                        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-7V6a3 3 0 00-3-3H6a3 3 0 00-3 3v1"/>
                        </svg>
                        <h3>Access Denied</h3>
                        <p>Your organization is not authorized to access this data.</p>
                        <p>Please contact your administrator to request access.</p>
                    `;
                    noFilesElement.style.display = 'block';
                }
            } else {
                if (noFilesElement) {
                    noFilesElement.innerHTML = `
                        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <h3>Loading Error</h3>
                        <p>Unable to load files: ${errorData.message || 'Unknown error'}</p>
                        <p>Please refresh and try again.</p>
                        <button onclick="loadFiles()" class="secondary-btn" style="margin-top: 10px;">Retry</button>
                    `;
                    noFilesElement.style.display = 'block';
                }
            }
        }
        
    } catch (error) {
        console.error('File loading error:', error);
        if (noFilesElement) {
            noFilesElement.innerHTML = `
                <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3>Connection Error</h3>
                <p>Unable to connect to the file service.</p>
                <p>Please check your internet connection and try again.</p>
                <button onclick="loadFiles()" class="secondary-btn" style="margin-top: 10px;">Retry</button>
            `;
            noFilesElement.style.display = 'block';
        }
    } finally {
        if (loadingElement) loadingElement.style.display = 'none';
    }
}

// Create file row for real database files
function createRealFileRow(file) {
    const row = document.createElement('tr');
    
    // Enhanced styling for different file types
    const categoryColors = {
        'Invoice Data': '#dbeafe #1e40af',
        'Travel Expenses': '#fef3c7 #d97706',
        'Business Reports': '#f0fdf4 #16a34a',
        'Analytics': '#f3e8ff #7c3aed',
        'Development': '#1f2937 #ffffff',
        'Testing': '#374151 #ffffff',
        'Documentation': '#6b7280 #ffffff',
        'Financial': '#ecfdf5 #059669',
        'Company Policies': '#e0f2fe #0891b2'
    };
    
    const colors = categoryColors[file.category] || '#f3f4f6 #6b7280';
    const [bgColor, textColor] = colors.split(' ');
    
    row.innerHTML = `
        <td>
            <div class="file-name">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 3l-6-6-6 6"/>
                </svg>
                ${file.name}
            </div>
            <div class="file-meta">
                AccNo: ${file.accno || 'N/A'} | Records: ${file.recordCount || 'N/A'}
            </div>
        </td>
        <td>
            <span class="category-badge" style="background-color: ${bgColor}; color: ${textColor};">
                ${file.category}
            </span>
        </td>
        <td>${file.size}</td>
        <td>${formatDate(file.lastUpdated)}</td>
        <td class="actions-cell">
            <button class="preview-btn" onclick="previewFile('${file.accno || 'unknown'}', '${file.src_file || 'unknown'}'); return false;">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                Preview
            </button>
            <button class="download-btn" onclick="downloadRealFile('${file.accno || 'unknown'}', '${file.src_file || 'unknown'}'); return false;">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
                </svg>
                Download
            </button>
        </td>
    `;
    
    return row;
}

function formatDate(dateString) {
    try {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dateString;
    }
}

function setupEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh files
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadFiles);
    }
    
    // Date filter toggle
    const dateFilterToggle = document.getElementById('dateFilterToggle');
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilterToggle && dateFilter) {
        dateFilterToggle.addEventListener('click', () => {
            dateFilter.classList.toggle('active');
        });
    }
    
    // Quick date filters
    const quickFilters = document.querySelectorAll('.quick-filter');
    quickFilters.forEach(filter => {
        filter.addEventListener('click', () => {
            const days = filter.dataset.days;
            const custom = filter.dataset.custom;
            
            if (days) {
                setDateRange(parseInt(days));
            } else if (custom === 'current-month') {
                setCurrentMonth();
            }
        });
    });
    
    // Apply date filter
    const applyFilterBtn = document.getElementById('applyDateFilter');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', applyDateFilter);
    }
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    
    console.log('✅ Event listeners setup complete');
}

function setDateRange(days) {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - days);
    
    const fromInput = document.getElementById('fromDate');
    const toInput = document.getElementById('toDate');
    
    if (fromInput) fromInput.value = fromDate.toISOString().split('T')[0];
    if (toInput) toInput.value = toDate.toISOString().split('T')[0];
}

function setCurrentMonth() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const fromInput = document.getElementById('fromDate');
    const toInput = document.getElementById('toDate');
    
    if (fromInput) fromInput.value = firstDay.toISOString().split('T')[0];
    if (toInput) toInput.value = lastDay.toISOString().split('T')[0];
}

function applyDateFilter() {
    console.log('Applying date filter...');
    loadFiles();
}

function handleSearch() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#fileTableBody tr');
    
    rows.forEach(row => {
        const fileName = row.querySelector('.file-name')?.textContent.toLowerCase() || '';
        const category = row.querySelector('.category-badge')?.textContent.toLowerCase() || '';
        
        const matches = fileName.includes(searchTerm) || category.includes(searchTerm);
        row.style.display = matches ? '' : 'none';
    });
}

async function handleLogout() {
    console.log('🚪 Logging out...');
    try {
        await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    redirectToLogin();
}

function redirectToLogin() {
    console.log('🔄 Redirecting to login...');
    window.location.href = '/login';
}

// FIXED: Preview file via secure server proxy
window.previewFile = async function(accno, srcFile) {
    console.log('🔍 Previewing file:', accno, srcFile);
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`🔗 Calling secure preview proxy: /api/function/preview/${accno}/${srcFile}`);
        
        // FIXED: Use secure server proxy
        const response = await fetch(`/api/function/preview/${accno}/${srcFile}?${params}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            showPreviewModal(data);
        } else {
            console.error('Preview failed:', response.status);
            if (response.status === 401) {
                redirectToLogin();
                return;
            }
            alert('Failed to load preview. Please try again.');
        }
        
    } catch (error) {
        console.error('Preview error:', error);
        alert('Error loading preview.');
    }
};

// FIXED: Download file via secure server proxy
window.downloadRealFile = async function(accno, srcFile) {
    console.log('📥 Downloading file:', accno, srcFile);
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`🔗 Calling secure download proxy: /api/function/download/${accno}/${srcFile}`);
        
        // FIXED: Use secure server proxy
        const response = await fetch(`/api/function/download/${accno}/${srcFile}?${params}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                // Handle JSON response (e.g., download URL)
                const data = await response.json();
                if (data.downloadUrl) {
                    const link = document.createElement('a');
                    link.href = data.downloadUrl;
                    link.download = `${accno}_${srcFile}_${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                // Handle direct file stream
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${accno}_${srcFile}_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }
            
            console.log('✅ Download completed');
        } else {
            console.error('Download failed:', response.status);
            if (response.status === 401) {
                redirectToLogin();
                return;
            }
            alert('Download failed. Please try again.');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        alert('Download failed. Please try again.');
    }
};

// Show preview modal
function showPreviewModal(data) {
    // Remove existing modal
    const existingModal = document.getElementById('previewModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'preview-modal';
    
    const preview = data.preview || [];
    const columns = data.columns || [];
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Preview: ${data.accno} - ${data.srcFile}</h3>
                <button class="close-modal" onclick="closePreviewModal()">&times;</button>
            </div>
            <div class="modal-body">
                <p class="preview-info">Showing first ${preview.length} rows</p>
                <div class="preview-table-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${preview.map(row => 
                                `<tr>${columns.map(col => 
                                    `<td>${row[col] !== null && row[col] !== undefined ? row[col] : ''}</td>`
                                ).join('')}</tr>`
                            ).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button class="download-btn" onclick="downloadRealFile('${data.accno}', '${data.srcFile}'); closePreviewModal();">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
                    </svg>
                    Download Full File
                </button>
                <button class="secondary-btn" onclick="closePreviewModal()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal
    setTimeout(() => modal.classList.add('show'), 10);
}

// Close preview modal
window.closePreviewModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

console.log('📋 Secure Dashboard script loaded - Authorization Fixed!');