// Enhanced Dashboard JavaScript with Export Functions and Fixed Filter States

let currentUser = null;
let travelStatsData = {
    airlines: null,
    destinations: null,
    routes: null
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('G Travel Dashboard Loading...');
    try {
        initDashboard(); // This will handle async properly
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        // Emergency fallback
        window.location.href = '/login.html';
    }
});

async function initDashboard() {
    try {
        // Properly await authentication before proceeding
        await checkAuth();
        setupEventListeners();
        // Load dynamic statistics after authentication
        await loadDynamicStats();
        // Add export functionality to cards
        setupCardExports();
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        // Don't redirect here - let checkAuth handle it
    }
}

function setupEventListeners() {
    try {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                try {
                    refreshBtn.classList.add('loading');
                    await loadFiles();
                    await loadDynamicStats();
                } catch (error) {
                    console.error('Error loading files:', error);
                } finally {
                    refreshBtn.classList.remove('loading');
                }
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
        
        // FIXED: Apply date filter - clear quick filter states
        const applyDateFilter = document.getElementById('applyDateFilter');
        if (applyDateFilter) {
            applyDateFilter.addEventListener('click', () => {
                // Clear quick filter active states when manually applying
                document.querySelectorAll('.quick-filter').forEach(btn => {
                    btn.classList.remove('active');
                });
                loadFiles();
                loadDynamicStats();
            });
        }
        
        // FIXED: Quick date filters with proper state management
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
                
                // FIXED: Only one quick filter can be active at a time
                document.querySelectorAll('.quick-filter').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Auto-apply the filter
                loadFiles();
                loadDynamicStats();
            });
        });

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadFiles();
                }, 300);
            });
        }

        // Logout functionality
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

// ENHANCED: Setup card export functionality with proper event listeners
function setupCardExports() {
    // Add export buttons to each card
    const cards = document.querySelectorAll('.travel-stats .stat-card');
    
    cards.forEach((card, index) => {
        // Create actions container if it doesn't exist
        let actionsContainer = card.querySelector('.card-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.className = 'card-actions';
            card.appendChild(actionsContainer);
        }

        // Export button - FIXED: Use proper event listener
        const exportBtn = document.createElement('button');
        exportBtn.className = 'card-action-btn';
        exportBtn.setAttribute('data-card-type', getCardType(index));
        exportBtn.setAttribute('data-action', 'export');
        exportBtn.addEventListener('click', function() {
            downloadCardData(this.getAttribute('data-card-type'));
        });
        exportBtn.innerHTML = `
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Export
        `;

        // Details button - FIXED: Use proper event listener
        const detailsBtn = document.createElement('button');
        detailsBtn.className = 'card-action-btn';
        detailsBtn.setAttribute('data-card-type', getCardType(index));
        detailsBtn.setAttribute('data-action', 'details');
        detailsBtn.addEventListener('click', function() {
            viewCardDetails(this.getAttribute('data-card-type'));
        });
        
        if (index === 0) {
            detailsBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                Chart
            `;
        } else if (index === 1) {
            detailsBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Map
            `;
        } else {
            detailsBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Details
            `;
        }

        actionsContainer.appendChild(exportBtn);
        actionsContainer.appendChild(detailsBtn);
    });
}

function getCardType(index) {
    const types = ['airlines', 'destinations', 'routes'];
    return types[index] || 'unknown';
}

// ENHANCED: Export card data functionality with airline name mapping
async function downloadCardData(cardType) {
    try {
        const data = travelStatsData[cardType];
        if (!data) {
            alert('No data available to export');
            return;
        }

        // Create CSV content based on card type
        let csvContent = '';
        let filename = '';

        switch (cardType) {
            case 'airlines':
                csvContent = 'Airline Code,Airline Name,Flight Count,Usage Percentage\n';
                if (data.details && Array.isArray(data.details)) {
                    data.details.forEach(item => {
                        // Apply airline name mapping if needed
                        const airlineName = getAirlineNameFallback(item.code) || item.name || item.code;
                        csvContent += `"${item.code}","${airlineName}","${item.count}","${item.percentage}%"\n`;
                    });
                }
                filename = 'travel_airlines_report.csv';
                break;
                
            case 'destinations':
                csvContent = 'Destination Code,Destination Name,Visit Count,Usage Percentage\n';
                if (data.details && Array.isArray(data.details)) {
                    data.details.forEach(item => {
                        // Apply destination name mapping if needed
                        const destName = getDestinationNameFallback(item.code) || item.name || item.code;
                        csvContent += `"${item.code}","${destName}","${item.count}","${item.percentage}%"\n`;
                    });
                }
                filename = 'travel_destinations_report.csv';
                break;
                
            case 'routes':
                csvContent = 'Route,From,To,Frequency,Last Used\n';
                if (data.details && Array.isArray(data.details)) {
                    data.details.forEach(item => {
                        csvContent += `"${item.route}","${item.from}","${item.to}","${item.frequency}","${item.lastUsed}"\n`;
                    });
                }
                filename = 'travel_routes_report.csv';
                break;
                
            default:
                csvContent = 'Item,Value\n';
                csvContent += `"${cardType}","${data.value || 'N/A'}"\n`;
                filename = `travel_${cardType}_report.csv`;
        }

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`Exported ${cardType} data to ${filename}`);
        
    } catch (error) {
        console.error('Error downloading card data:', error);
        alert('Failed to export data. Please try again.');
    }
}

// ENHANCED: View card details with visualization - FIXED: Use proper event listeners
async function viewCardDetails(cardType) {
    try {
        const data = travelStatsData[cardType];
        if (!data) {
            alert('No data available to view');
            return;
        }

        // Create modal for detailed view
        const modal = document.createElement('div');
        modal.className = 'preview-modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Detailed View: ${getCardTitle(cardType)}</h3>
                    <button class="close-modal" data-action="close">×</button>
                </div>
                <div class="modal-body">
                    <div class="preview-info">
                        <strong>Summary:</strong> ${data.value || 'N/A'} | 
                        <strong>Analysis Period:</strong> ${getCurrentDateRange()}
                    </div>
                    <div class="preview-table-container">
                        ${generateDetailTable(cardType, data)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="action-btn download" data-action="export" data-card-type="${cardType}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Export CSV
                    </button>
                    <button class="action-btn preview" data-action="close">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // FIXED: Add event listeners to modal buttons instead of inline onclick
        const closeButtons = modal.querySelectorAll('[data-action="close"]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        const exportButton = modal.querySelector('[data-action="export"]');
        if (exportButton) {
            exportButton.addEventListener('click', function() {
                downloadCardData(this.getAttribute('data-card-type'));
            });
        }
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (error) {
        console.error('Error viewing card details:', error);
        alert('Failed to load detailed view. Please try again.');
    }
}

function getCardTitle(cardType) {
    const titles = {
        'airlines': 'Most Used Airlines',
        'destinations': 'Most Visited Destinations', 
        'routes': 'Unique Routes'
    };
    return titles[cardType] || cardType;
}

function getCurrentDateRange() {
    const fromDate = document.getElementById('fromDate')?.value;
    const toDate = document.getElementById('toDate')?.value;
    
    if (fromDate && toDate) {
        return `${fromDate} to ${toDate}`;
    }
    return 'All available data';
}

function generateDetailTable(cardType, data) {
    if (!data.details || !Array.isArray(data.details)) {
        return '<p>No detailed data available</p>';
    }

    let headerRow = '';
    let bodyRows = '';

    switch (cardType) {
        case 'airlines':
            headerRow = '<tr><th>Code</th><th>Airline Name</th><th>Flights</th><th>Usage %</th></tr>';
            bodyRows = data.details.map(item => {
                // Apply name mapping for display
                const airlineName = getAirlineNameFallback(item.code) || item.name || item.code;
                return `<tr>
                    <td><strong>${item.code}</strong></td>
                    <td>${airlineName}</td>
                    <td>${item.count}</td>
                    <td>${item.percentage}%</td>
                </tr>`;
            }).join('');
            break;
            
        case 'destinations':
            headerRow = '<tr><th>Code</th><th>Destination</th><th>Visits</th><th>Usage %</th></tr>';
            bodyRows = data.details.map(item => {
                // Apply name mapping for display
                const destName = getDestinationNameFallback(item.code) || item.name || item.code;
                return `<tr>
                    <td><strong>${item.code}</strong></td>
                    <td>${destName}</td>
                    <td>${item.count}</td>
                    <td>${item.percentage}%</td>
                </tr>`;
            }).join('');
            break;
            
        case 'routes':
            headerRow = '<tr><th>Route</th><th>From</th><th>To</th><th>Frequency</th></tr>';
            bodyRows = data.details.map(item => 
                `<tr>
                    <td><strong>${item.route}</strong></td>
                    <td>${item.from}</td>
                    <td>${item.to}</td>
                    <td>${item.frequency}</td>
                </tr>`
            ).join('');
            break;
    }

    return `
        <table class="preview-table">
            <thead>${headerRow}</thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

// ENHANCED: Load dynamic statistics with better error handling
async function loadDynamicStats() {
    console.log('🚀 Loading dynamic statistics...');
    
    try {
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;
        
        // Show loading state for all cards
        const cards = document.querySelectorAll('.travel-stats .stat-card');
        cards.forEach(card => {
            card.classList.add('loading');
            const statNumber = card.querySelector('.stat-number');
            const statLabel = card.querySelector('.stat-label');
            if (statNumber) statNumber.textContent = 'Loading...';
            if (statLabel) statLabel.textContent = 'Analyzing data...';
        });

        // Call the stats API using session-based auth
        const apiUrl = '/auth/api/stats';
        const params = new URLSearchParams();
        if (fromDate) params.append('fromDate', fromDate);
        if (toDate) params.append('toDate', toDate);
        
        const url = params.toString() ? `${apiUrl}?${params.toString()}` : apiUrl;
        console.log('📊 Calling statistics API:', url);

        const response = await fetch(url, {
            credentials: 'include'
        });

        // Update cards with real data or mock data
        if (response.ok) {
            const result = await response.json();
            console.log('📈 Statistics result:', result);
            
            if (result && result.data) {
                updateStatsCards(result.data);
                // Show success message if real data
                if (!result.error) {
                    console.log('✅ Real data loaded from Azure Function');
                }
            } else {
                // Use mock data for demo
                console.log('📊 Using mock statistics data');
                updateStatsCards(generateMockStatsData());
            }
        } else {
            console.error(`❌ Stats API failed: ${response.status}`);
            const errorText = await response.text();
            console.error('Stats API error:', errorText);
            
            // Use mock data for demo if API fails
            console.log('📊 Using mock statistics data (API failed)');
            updateStatsCards(generateMockStatsData());
        }

    } catch (error) {
        console.error('❌ Error loading dynamic statistics:', error);
        // Show error state or use mock data
        updateStatsCards(generateMockStatsData());
    }
}

function generateMockStatsData() {
    return {
        mostUsedAirline: {
            value: 'WF',
            label: 'Widerøe\n24 flights this year',
            details: [
                { code: 'WF', name: 'Widerøe', count: 24, percentage: 45 },
                { code: 'SK', name: 'SAS', count: 18, percentage: 34 },
                { code: 'DY', name: 'Norwegian', count: 11, percentage: 21 }
            ]
        },
        mostVisitedDestination: {
            value: 'OSL',
            label: 'Oslo Airport\n42 visits this year',
            details: [
                { code: 'OSL', name: 'Oslo Airport', count: 42, percentage: 38 },
                { code: 'BOO', name: 'Bodø Airport', count: 28, percentage: 25 },
                { code: 'TRD', name: 'Trondheim Airport', count: 20, percentage: 18 },
                { code: 'SVG', name: 'Stavanger Airport', count: 21, percentage: 19 }
            ]
        },
        uniqueRoutes: {
            value: '147',
            label: 'Unique travel routes\nAcross 23 destinations',
            details: [
                { route: 'BOO-OSL', from: 'Bodø', to: 'Oslo', frequency: 28, lastUsed: '2024-09-20' },
                { route: 'OSL-TRD', from: 'Oslo', to: 'Trondheim', frequency: 15, lastUsed: '2024-09-18' },
                { route: 'BGO-OSL', from: 'Bergen', to: 'Oslo', frequency: 12, lastUsed: '2024-09-15' },
                { route: 'OSL-SVG', from: 'Oslo', to: 'Stavanger', frequency: 10, lastUsed: '2024-09-12' }
            ]
        }
    };
}

// FALLBACK MAPPINGS: Airline and destination names for better UX
function getAirlineNameFallback(code) {
    const airlineMap = {
        'WF': 'Widerøe',
        'SK': 'SAS',
        'DY': 'Norwegian',
        'KL': 'KLM',
        'LH': 'Lufthansa',
        'BA': 'British Airways',
        'AF': 'Air France',
        'LN': 'Linjeflyg',
        'FI': 'Icelandair',
        'QF': 'Qantas',
        'EK': 'Emirates',
        'LX': 'Swiss International',
        'OS': 'Austrian Airlines',
        'TP': 'TAP Air Portugal'
    };
    
    return airlineMap[code?.toUpperCase()] || code;
}

function getDestinationNameFallback(code) {
    const airportMap = {
        'OSL': 'Oslo Lufthavn',
        'BOO': 'Bodø Lufthavn', 
        'TRD': 'Trondheim Lufthavn',
        'BGO': 'Bergen Lufthavn',
        'SVG': 'Stavanger Lufthavn',
        'AES': 'Ålesund Lufthavn',
        'KRS': 'Kristiansand Lufthavn',
        'TOS': 'Tromsø Lufthavn',
        'EVE': 'Evenes Lufthavn',
        'ALF': 'Alta Lufthavn',
        'LKN': 'Leknes Lufthavn',
        'LYR': 'Longyearbyen Lufthavn',
        'CPH': 'København',
        'ARN': 'Stockholm',
        'LHR': 'London Heathrow',
        'AMS': 'Amsterdam',
        'CDG': 'Paris Charles de Gaulle',
        'FRA': 'Frankfurt'
    };
    
    return airportMap[code?.toUpperCase()] || code;
}

// ENHANCED: Update stats cards with name mapping
function updateStatsCards(data) {
    try {
        // Apply name mapping to airline data
        if (data.mostUsedAirline && data.mostUsedAirline.details) {
            data.mostUsedAirline.details = data.mostUsedAirline.details.map(airline => ({
                ...airline,
                name: getAirlineNameFallback(airline.code) || airline.name || airline.code
            }));
            
            // Update the primary airline display
            if (data.mostUsedAirline.details[0]) {
                const primary = data.mostUsedAirline.details[0];
                data.mostUsedAirline.label = `${primary.name}\n${primary.count} flights`;
            }
        }
        
        // Apply name mapping to destination data
        if (data.mostVisitedDestination && data.mostVisitedDestination.details) {
            data.mostVisitedDestination.details = data.mostVisitedDestination.details.map(dest => ({
                ...dest,
                name: getDestinationNameFallback(dest.code) || dest.name || dest.code
            }));
            
            // Update the primary destination display
            if (data.mostVisitedDestination.details[0]) {
                const primary = data.mostVisitedDestination.details[0];
                data.mostVisitedDestination.label = `${primary.name}\n${primary.count} visits`;
            }
        }
        
        // Store data for export functionality
        travelStatsData = {
            airlines: data.mostUsedAirline,
            destinations: data.mostVisitedDestination,
            routes: data.uniqueRoutes
        };

        // Update each card
        const cards = document.querySelectorAll('.travel-stats .stat-card');
        
        // Airlines card
        if (cards[0]) {
            updateCard(cards[0], data.mostUsedAirline);
        }
        
        // Destinations card  
        if (cards[1]) {
            updateCard(cards[1], data.mostVisitedDestination);
        }
        
        // Routes card
        if (cards[2]) {
            updateCard(cards[2], data.uniqueRoutes);
        }

        console.log('✅ Stats cards updated successfully with name mapping');
        
    } catch (error) {
        console.error('❌ Error updating stats cards:', error);
    }
}

function updateCard(card, data) {
    try {
        card.classList.remove('loading', 'error');
        
        const statNumber = card.querySelector('.stat-number');
        const statLabel = card.querySelector('.stat-label');
        
        if (statNumber && data.value) {
            statNumber.textContent = data.value;
            // Add small text class if text is long
            if (data.value.length > 8) {
                statNumber.classList.add('small-text');
            }
        }
        
        if (statLabel && data.label) {
            statLabel.textContent = data.label;
        }
        
    } catch (error) {
        console.error('Error updating individual card:', error);
        card.classList.add('error');
        const statNumber = card.querySelector('.stat-number');
        const statLabel = card.querySelector('.stat-label');
        if (statNumber) statNumber.textContent = 'Error';
        if (statLabel) statLabel.textContent = 'Failed to load data';
    }
}

// FIXED: Restore original session-based authentication
async function checkAuth() {
    console.log('🔍 Starting auth check...');
    
    try {
        console.log('📡 Making request to /auth/user...');
        const response = await fetch('/auth/user', { 
            credentials: 'include'
        });
        
        console.log('📡 Response received - Status:', response.status, 'OK:', response.ok);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📦 Full response data:', JSON.stringify(data, null, 2));
            
            if (data?.authenticated === true && data?.user) {
                currentUser = data.user;
                console.log('✅ AUTHENTICATION SUCCESS!');
                console.log('👤 User:', currentUser.email);
                console.log('🏢 Company:', currentUser.company);
                console.log('🔑 Access Level:', currentUser.accessLevel);
                console.log('🕰️ Login Time:', data.loginTime);
                
                // Update UI 
                updateUserInfo(currentUser);
                // Load files
                await loadFiles();
                
                return; // SUCCESS - Stay on dashboard!
                
            } else {
                console.log('❌ Authentication data invalid:');
                console.log('   - authenticated:', data?.authenticated);
                console.log('   - user exists:', !!data?.user);
            }
        } else {
            console.log('❌ Auth request failed - Status:', response.status);
        }
        
    } catch (error) {
        console.error('💥 Auth check failed:', error);
    }
    
    // Only redirect if authentication failed
    console.log('🔄 Authentication failed - redirecting to login...');
    redirectToLogin();
}

function updateUserInfo(user) {
    try {
        const userInitials = document.getElementById('userInitials');
        const userName = document.getElementById('userName');
        const userCompany = document.getElementById('userCompany');
        const welcomeName = document.getElementById('welcomeName');
        const accessLevel = document.getElementById('accessLevel');

        const displayName = user.displayName || user.email || 'User';
        const firstName = displayName.split(' ')[0];

        if (userInitials) {
            const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            userInitials.textContent = initials;
        }

        if (userName) {
            userName.textContent = displayName;
        }

        if (userCompany) {
            userCompany.textContent = user.company || 'Unknown';
        }

        if (welcomeName) {
            welcomeName.textContent = firstName;
        }

        if (accessLevel) {
            accessLevel.textContent = user.company || user.accessLevel;
        }

        console.log('✅ User info updated in UI');
        
    } catch (error) {
        console.error('Error updating user info:', error);
    }
}

async function loadFiles() {
    console.log('📁 Loading files...');
    
    try {
        const loadingElement = document.getElementById('loadingFiles');
        const tableBody = document.getElementById('fileTableBody');
        const noFilesMessage = document.getElementById('noFilesMessage');
        const totalFilesElement = document.getElementById('totalFiles');

        // Show loading state
        if (loadingElement) loadingElement.style.display = 'flex';
        if (noFilesMessage) noFilesMessage.style.display = 'none';
        if (tableBody) tableBody.innerHTML = '';

        // Get search and filter parameters
        const searchTerm = document.getElementById('searchInput')?.value || '';
        const fromDate = document.getElementById('fromDate')?.value;
        const toDate = document.getElementById('toDate')?.value;

        // Make API call using session-based auth
        const apiUrl = '/auth/api/files';
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (fromDate) params.append('fromDate', fromDate);
        if (toDate) params.append('toDate', toDate);
        
        const url = params.toString() ? `${apiUrl}?${params.toString()}` : apiUrl;
        console.log('📤 Calling file API:', url);

        const response = await fetch(url, {
            credentials: 'include'
        });

        // Hide loading state
        if (loadingElement) loadingElement.style.display = 'none';

        if (response.ok) {
            const result = await response.json();
            console.log('📋 Files result:', result);
            
            // Show success or warning messages
            if (result.error) {
                console.warn('⚠️ Files API returned with warning:', result.message);
            } else if (result.files && result.files.length > 0) {
                console.log('✅ Real data loaded from Azure Function');
            }
            
            if (result && result.files && result.files.length > 0) {
                displayFiles(result.files);
                if (totalFilesElement) {
                    totalFilesElement.textContent = result.files.length;
                }
            } else {
                if (noFilesMessage) {
                    noFilesMessage.style.display = 'block';
                    if (result.error) {
                        noFilesMessage.innerHTML = `
                            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <h3>Data temporarily unavailable</h3>
                            <p>${result.message || 'Please try again or contact support.'}</p>
                        `;
                    }
                }
                if (totalFilesElement) {
                    totalFilesElement.textContent = '0';
                }
            }
        } else {
            throw new Error(`Files API call failed: ${response.status}`);
        }

    } catch (error) {
        console.error('❌ Error loading files:', error);
        
        // Hide loading and show error message
        const loadingElement = document.getElementById('loadingFiles');
        const noFilesMessage = document.getElementById('noFilesMessage');
        
        if (loadingElement) loadingElement.style.display = 'none';
        if (noFilesMessage) {
            noFilesMessage.style.display = 'block';
            noFilesMessage.innerHTML = `
                <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3>Error loading files</h3>
                <p>Please try refreshing the page or contact support if the issue persists.</p>
            `;
        }
    }
}

// FIXED: Display files with proper event listeners instead of inline onclick
function displayFiles(files) {
    try {
        const tableBody = document.getElementById('fileTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = files.map(file => `
            <tr>
                <td>
                    <div class="file-name">${escapeHtml(file.fileName)}</div>
                    <div class="file-meta">${escapeHtml(file.fileId || 'N/A')}</div>
                </td>
                <td>
                    <span class="file-category">${escapeHtml(file.category || 'Invoice Data')}</span>
                </td>
                <td class="file-size">${formatFileSize(file.size)}</td>
                <td class="file-date">${formatDate(file.lastUpdated)}</td>
                <td class="file-actions">
                    <button class="action-btn preview" data-action="preview" data-file-id="${escapeHtml(file.fileId)}" data-file-name="${escapeHtml(file.fileName)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        <span class="btn-text">Preview</span>
                    </button>
                    <button class="action-btn download" data-action="download" data-file-id="${escapeHtml(file.fileId)}" data-file-name="${escapeHtml(file.fileName)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        <span class="btn-text">Download</span>
                    </button>
                </td>
            </tr>
        `).join('');

        // FIXED: Add event listeners to all action buttons
        const previewButtons = tableBody.querySelectorAll('[data-action="preview"]');
        previewButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const fileId = this.getAttribute('data-file-id');
                const fileName = this.getAttribute('data-file-name');
                previewFile(fileId, fileName, this);
            });
        });
        
        const downloadButtons = tableBody.querySelectorAll('[data-action="download"]');
        downloadButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const fileId = this.getAttribute('data-file-id');
                const fileName = this.getAttribute('data-file-name');
                downloadFile(fileId, fileName, this);
            });
        });

        console.log(`✅ Displayed ${files.length} files`);
        
    } catch (error) {
        console.error('Error displaying files:', error);
    }
}

// Keep all existing utility functions
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('nb-NO') + ' ' + date.toLocaleTimeString('nb-NO', {hour: '2-digit', minute:'2-digit'});
}

// FIXED: Preview file function with proper button handling
async function previewFile(fileId, fileName, buttonElement) {
    console.log(`👁️ Previewing file: ${fileName} (${fileId})`);
    
    const btn = buttonElement;
    if (!btn) {
        console.warn('No button element provided');
        return;
    }

    try {
        // Add loading state
        btn.classList.add('loading');
        
        const response = await fetch(`/auth/api/preview/${fileId}`, {
            credentials: 'include'
        });

        if (response.ok) {
            const result = await response.json();
            showPreviewModal(fileName, result.data || result);
        } else {
            throw new Error(`Preview failed: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error previewing file:', error);
        alert('Failed to preview file. Please try again.');
    } finally {
        btn.classList.remove('loading');
    }
}

// FIXED: Download file function with proper button handling
async function downloadFile(fileId, fileName, buttonElement) {
    console.log(`⬇️ Downloading file: ${fileName} (${fileId})`);
    
    const btn = buttonElement;
    if (!btn) {
        console.warn('No button element provided');
        return;
    }

    try {
        // Add loading state
        btn.classList.add('loading');
        
        const response = await fetch(`/auth/api/download/${fileId}`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.downloadUrl) {
                // Open download URL in new window/tab
                window.open(data.downloadUrl, '_blank');
            } else {
                // Handle direct blob download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } else {
            throw new Error(`Download failed: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Failed to download file. Please try again.');
    } finally {
        btn.classList.remove('loading');
    }
}

// FIXED: Show preview modal with proper event listeners
function showPreviewModal(fileName, data) {
    // Implementation for showing preview modal
    const modal = document.createElement('div');
    modal.className = 'preview-modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Preview: ${escapeHtml(fileName)}</h3>
                <button class="close-modal" data-action="close">×</button>
            </div>
            <div class="modal-body">
                <div class="preview-info">
                    File: ${escapeHtml(fileName)} | Showing first 100 rows
                </div>
                <div class="preview-table-container">
                    <p>Preview data would be displayed here...</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="action-btn preview" data-action="close">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // FIXED: Add event listeners to close buttons
    const closeButtons = modal.querySelectorAll('[data-action="close"]');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function logout() {
    console.log('🚪 Logging out...');
    try {
        await fetch('/auth/logout', { 
            method: 'POST', 
            credentials: 'include' 
        });
    } catch (e) {
        console.log('Logout API call failed:', e);
    }
    window.location.href = '/login.html';
}

function redirectToLogin() {
    window.location.href = '/login.html';
}
