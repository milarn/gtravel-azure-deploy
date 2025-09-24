// Fixed Dashboard JavaScript - Complete with working buttons

let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('G Travel Dashboard Loading...');
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

function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('loading');
            await loadFiles();
            refreshBtn.classList.remove('loading');
        });
    }
    
    // Date filter toggle
    const dateFilterToggle = document.getElementById('dateFilterToggle');
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilterToggle && dateFilter) {
        dateFilterToggle.addEventListener('click', () => {
            dateFilter.classList.toggle('active');
            dateFilterToggle.classList.toggle('active');
        });
    }
    
    // Apply date filter
    const applyDateFilter = document.getElementById('applyDateFilter');
    if (applyDateFilter) {
        applyDateFilter.addEventListener('click', () => {
            loadFiles();
        });
    }
    
    // Quick date filters
    document.querySelectorAll('.quick-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = e.target.getAttribute('data-days');
            const custom = e.target.getAttribute('data-custom');
            
            const fromDateEl = document.getElementById('fromDate');
            const toDateEl = document.getElementById('toDate');
            
            if (days) {
                const toDate = new Date();
                const fromDate = new Date();
                fromDate.setDate(toDate.getDate() - parseInt(days));
                
                fromDateEl.value = fromDate.toISOString().split('T')[0];
                toDateEl.value = toDate.toISOString().split('T')[0];
            } else if (custom === 'current-month') {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                
                fromDateEl.value = firstDay.toISOString().split('T')[0];
                toDateEl.value = lastDay.toISOString().split('T')[0];
            }
            
            // Remove active class from other buttons
            document.querySelectorAll('.quick-filter').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            loadFiles();
        });
    });
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterFiles(e.target.value);
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

async function checkAuth() {
    console.log('Checking authentication...');
    
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
                console.log('Authentication successful');
                
                updateUserInterface();
                await loadFiles();
                return;
            }
        }
        
        console.log('Authentication failed');
        throw new Error('Authentication failed');
        
    } catch (error) {
        console.error('Auth check error:', error);
        throw error;
    }
}

function updateUserInterface() {
    if (!currentUser) return;
    
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
    
    console.log('User interface updated');
}

function formatAccessLevel(level) {
    const levels = {
        'developer': 'Cipher Bergen AS',
        'customer': 'G Travel AS',
        'standard': 'Standard Access'
    };
    return levels[level] || (level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Standard');
}

async function loadFiles() {
    console.log('Loading files via secure server proxy...');
    
    const loadingElement = document.getElementById('loadingFiles');
    const noFilesElement = document.getElementById('noFilesMessage');
    const tableBody = document.getElementById('fileTableBody');
    const totalFilesElement = document.getElementById('totalFiles');
    
    if (loadingElement) loadingElement.style.display = 'block';
    if (noFilesElement) noFilesElement.style.display = 'none';
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log('Calling secure proxy: /api/function/files');
        
        const response = await fetch(`/api/function/files?${params}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Response status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            const files = data.files || [];
            
            console.log(`Loaded ${files.length} files securely for ${data.companyName || 'company'}`);
            
            if (totalFilesElement) totalFilesElement.textContent = files.length;
            
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
                        const row = createFileRow(file);
                        tableBody.appendChild(row);
                    });
                }
            }
            
        } else {
            console.error('Failed to load files:', response.status, response.statusText);
            
            if (response.status === 401) {
                console.log('Authentication required - redirecting to login');
                redirectToLogin();
                return;
            }
            
            if (noFilesElement) {
                noFilesElement.innerHTML = `
                    <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <h3>Loading Error</h3>
                    <p>Unable to load files. Please refresh and try again.</p>
                    <button onclick="loadFiles()" class="refresh-btn" style="margin-top: 10px;">Retry</button>
                `;
                noFilesElement.style.display = 'block';
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
                <button onclick="loadFiles()" class="refresh-btn" style="margin-top: 10px;">Retry</button>
            `;
            noFilesElement.style.display = 'block';
        }
    } finally {
        if (loadingElement) loadingElement.style.display = 'none';
    }
}

function createFileRow(file) {
    const row = document.createElement('tr');
    
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
            <span class="file-category">${file.category}</span>
        </td>
        <td class="file-size">${file.size}</td>
        <td class="file-date">${new Date(file.lastUpdated).toLocaleDateString()}</td>
        <td>
            <div class="file-actions">
                <button class="action-btn preview" onclick="previewFile('${file.accno}')">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    Preview
                </button>
                <button class="action-btn download" onclick="downloadFile('${file.accno}')">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
                    </svg>
                    Download
                </button>
            </div>
        </td>
    `;
    
    return row;
}

// Preview file function
window.previewFile = async function(accno) {
    console.log('Previewing file:', accno);
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`Calling secure preview proxy: /api/function/preview/${accno}/data`);
        
        const response = await fetch(`/api/function/preview/${accno}/data?${params}`, {
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

// Download file function
window.downloadFile = async function(accno) {
    console.log('Downloading file:', accno);
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        const params = new URLSearchParams();
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`Calling secure download proxy: /api/function/download/${accno}/data`);
        
        const response = await fetch(`/api/function/download/${accno}/data?${params}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${accno}_InvoiceData_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            console.log('Download completed');
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

function showPreviewModal(data) {
    const existingModal = document.getElementById('previewModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'preview-modal';
    
    const preview = data.preview || [];
    const columns = data.columns || [];
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Preview: ${data.accno}</h3>
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
                <button class="action-btn download" onclick="downloadFile('${data.accno}'); closePreviewModal();">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
                    </svg>
                    Download Full File
                </button>
                <button class="refresh-btn" onclick="closePreviewModal()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

window.closePreviewModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

function filterFiles(searchTerm) {
    const rows = document.querySelectorAll('#fileTableBody tr');
    searchTerm = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const fileName = row.querySelector('.file-name')?.textContent.toLowerCase() || '';
        const category = row.querySelector('.file-category')?.textContent.toLowerCase() || '';
        
        const matches = fileName.includes(searchTerm) || category.includes(searchTerm);
        row.style.display = matches ? '' : 'none';
    });
}

async function handleLogout() {
    console.log('Logging out...');
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
    console.log('Redirecting to login...');
    window.location.href = '/login';
}

console.log('Secure Dashboard script loaded - Authorization Fixed!');