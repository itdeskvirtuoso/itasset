
// ==========================================
// SPA ROUTER LOGIC
// ==========================================

function handleRouting() {
    let hash = window.location.hash || '#index';
    const userStr = localStorage.getItem('user');

    if (!userStr && !window.location.pathname.includes('auth.html')) {
        window.location.href = 'auth.html';
        return;
    }

    if (userStr) {
        const user = JSON.parse(userStr);

        // Pre-fill Assigned By name for new assets
        const assignedByInput = document.getElementById('assignedBy');
        if (assignedByInput && !assignedByInput.value) {
            assignedByInput.value = user.name;
        }

        fetch('http://localhost:5000/api/roles')
            .then(res => res.json())
            .then(roles => {
                const roleObj = roles.find(r => r.name === user.role);
                const allowedPages = roleObj ? roleObj.permissions : ['index.html'];

                // Map hash to html page name for permission checking
                let pageName = hash.substring(1) + '.html';
                if (hash === '#index') pageName = 'index.html';

                // Check if they are allowed to access this route
                if (!allowedPages.includes(pageName)) {
                    showToast(`Access Denied! As a ${user.role}, you cannot view this.`, 'error');
                    window.location.hash = '#index';
                    return;
                }

                // Hide unauthorized sidebar links
                document.querySelectorAll('.nav-links li a').forEach(link => {
                    const href = link.getAttribute('href'); // e.g. "#assets"
                    if (href) {
                        let linkPage = href.substring(1) + '.html';
                        if (href === '#index') linkPage = 'index.html';
                        if (!allowedPages.includes(linkPage)) {
                            link.parentElement.style.display = 'none';
                        } else {
                            link.parentElement.style.display = 'block';
                        }
                    }
                });

                executeRoute(hash);
            })
            .catch(err => {
                console.error('Failed to load RBAC roles:', err);
                executeRoute(hash); // Fallback allow
            });
    } else {
        executeRoute(hash);
    }
}

function executeRoute(hash) {
    // Hide all views
    document.querySelectorAll('.page-view').forEach(view => {
        view.style.display = 'none';
    });

    // Show active view
    const viewId = 'view-' + hash.substring(1);
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.style.display = 'block';
    } else {
        const indexView = document.getElementById('view-index');
        if (indexView) indexView.style.display = 'block';
    }

    // Update sidebar active class
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    const activeLink = document.querySelector('.nav-links a[href="' + hash + '"]');
    if (activeLink) {
        activeLink.parentElement.classList.add('active');
    }

    // Call page-specific initialization
    if (hash === '#assets' && typeof fetchAssets === 'function') fetchAssets();
    if (hash === '#allocations' && typeof fetchAllocations === 'function') fetchAllocations();
    if (hash === '#returns' && typeof fetchReturns === 'function') fetchReturns();
    if (hash === '#warranty' && typeof loadWarrantyData === 'function') loadWarrantyData();
    if (hash === '#reports' && typeof fetchReportsData === 'function') fetchReportsData();
    if (hash === '#settings' && typeof fetchSettingsData === 'function') fetchSettingsData();
    if (hash === '#index' && typeof initDashboard === 'function') initDashboard();
}

window.addEventListener('hashchange', handleRouting);
document.addEventListener('DOMContentLoaded', () => {
    // --- Header Scroll Effect ---
    const mainContentArea = document.querySelector('.main-content');
    const topHeaderEl = document.querySelector('.top-header');
    if (mainContentArea && topHeaderEl) {
        mainContentArea.addEventListener('scroll', () => {
            if (mainContentArea.scrollTop > 10) {
                topHeaderEl.classList.add('scrolled');
            } else {
                topHeaderEl.classList.remove('scrolled');
            }
        });
    }

    // Small delay to ensure all DOM is loaded before routing
    setTimeout(handleRouting, 100);
});

// ==========================================
// COMBINED APP LOGIC
// ==========================================


/* --- toast.js --- */

function showToast(message, type = 'success') {
    if (type === 'error' || type === 'warning') {
        const audio = new Audio('freesound_community-beep-warning-6387.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
    }

    // Check if toast container exists, if not create it
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.top = '20px'; // Move to top for better visibility over modals
        container.style.right = '20px';
        container.style.zIndex = '9999999'; // Ensure it's higher than all modals (which are 99999)
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.background = type === 'success' ? '#10B981' : '#E11D48';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.fontFamily = 'Outfit, sans-serif';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '500';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    toast.innerText = message;

    // Add Speech Synthesis for Messages (Only for success/info, not for errors playing alarms)
    if ('speechSynthesis' in window && type !== 'error' && type !== 'warning') {
        window.speechSynthesis.cancel(); // Stop any currently playing audio
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.0;
        utterance.pitch = 1.1; // Slightly higher pitch for a more pleasant notification sound
        window.speechSynthesis.speak(utterance);
    }

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            if (container.contains(toast)) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}


/* --- search.js --- */

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search-input');
    const searchResults = document.getElementById('global-search-results');

    if (!searchInput || !searchResults) return;

    // ------------------------------------

    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch('http://localhost:5000/api/assets/search' + window.getOwnershipQuery(true) + (window.currentOwnershipFilter === 'All' ? '?q=' : '&q=') + encodeURIComponent(query));
                if (!response.ok) throw new Error('Search failed');

                const results = await response.json();

                searchResults.innerHTML = '';

                if (results.length === 0) {
                    searchResults.innerHTML = '<div class="search-result-item"><div class="search-result-info"><p>No assets or software found.</p></div></div>';
                } else {
                    results.forEach(asset => {
                        const item = document.createElement('div');
                        item.className = 'search-result-item';
                        item.style.cursor = 'pointer'; // Make it look clickable

                        // Show assigned user and employee ID if available
                        let assignedHtml = '';
                        if (asset.assignedToName || asset.employeeId) {
                            let parts = [];
                            if (asset.assignedToName) parts.push(`Assign NAME: <strong>${asset.assignedToName}</strong>`);
                            if (asset.employeeId) parts.push(`Emp ID: <strong>${asset.employeeId}</strong>`);
                            assignedHtml = `<p style="font-size: 0.8rem; color: #64748b; margin-top: 4px;"><i class="fa-solid fa-user" style="margin-right: 4px;"></i> ${parts.join(' | ')}</p>`;
                        }

                        item.innerHTML = `
                            <div class="search-result-info">
                                <h4>${asset.assetTagNumber || 'N/A'} <span style="font-size: 0.8em; color: #64748b;">(${asset.deviceType || 'Unknown'})</span></h4>
                                <p>${asset.make || ''} ${asset.model || ''}</p>
                                ${assignedHtml}
                            </div>
                            <span class="status-badge" style="font-size: 0.7rem; align-self: flex-start;">${asset.status || 'Unknown'}</span>
                        `;

                        item.addEventListener('click', () => {
                            // Close search results dropdown
                            searchResults.classList.remove('show');

                            // Open the popup modal accurately using the ID without redirecting
                            if (typeof window.openEditModal === 'function') {
                                window.openEditModal(asset._id);
                            }
                        });

                        searchResults.appendChild(item);
                    });
                }

                searchResults.classList.add('show');
            } catch (err) {
                console.error(err);
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
});

// ====== EDIT & DELETE ALLOCATIONS ====== //
window.closeEditModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.opacity = '0';
    const content = modal.querySelector('.modal-content');
    if (content) content.style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

window.openEditAllocationModal = function (id) {
    const alloc = window.currentAllocationsData.find(a => a._id === id);
    if (!alloc) return;

    document.getElementById('edit-alloc-id').value = alloc._id;
    document.getElementById('edit-alloc-employee').value = alloc.employeeName || '';
    document.getElementById('edit-alloc-asset').value = alloc.assetTagNumber || '';
    document.getElementById('edit-alloc-date').value = alloc.assignDate ? alloc.assignDate.split('T')[0] : '';
    document.getElementById('edit-alloc-return-date').value = alloc.expectedReturnDate ? alloc.expectedReturnDate.split('T')[0] : '';
    document.getElementById('edit-alloc-notes').value = alloc.issueNotes || '';

    const modal = document.getElementById('editAllocationModal');
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.style.opacity = '1';
    modal.querySelector('.modal-content').style.transform = 'scale(1)';
};

document.getElementById('edit-allocation-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-alloc-id').value;
    const payload = {
        employeeName: document.getElementById('edit-alloc-employee').value,
        assetTagNumber: document.getElementById('edit-alloc-asset').value,
        assignDate: document.getElementById('edit-alloc-date').value,
        expectedReturnDate: document.getElementById('edit-alloc-return-date').value,
        issueNotes: document.getElementById('edit-alloc-notes').value
    };

    try {
        const res = await fetch(`http://localhost:5000/api/allocations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Update failed');

        closeEditModal('editAllocationModal');
        showToast('Allocation updated successfully', 'success');
        fetchAllocations();

        // Also refresh KPI modal if it's open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Allocations') {
            openKpiModal('Allocations');
        }
    } catch (err) {
        showToast('Error updating allocation', 'error');
    }
});

window.deleteAllocation = async function (id) {
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: 'Are you sure you want to delete this allocation record?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!',
        background: '#1e293b',
        color: '#f8fafc',
        backdrop: `rgba(0,0,0,0.4)`
    });
    if (!result.isConfirmed) return;
    try {
        const res = await fetch(`http://localhost:5000/api/allocations/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        showToast('Allocation deleted successfully', 'success');
        fetchAllocations();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Allocations') {
            openKpiModal('Allocations');
        }
    } catch (err) {
        showToast('Error deleting allocation', 'error');
    }
};

// ====== EDIT & DELETE RETURNS ====== //
window.openEditReturnModal = function (id) {
    const ret = window.currentReturnsData.find(r => r._id === id);
    if (!ret) return;

    document.getElementById('edit-ret-id').value = ret._id;
    document.getElementById('edit-ret-asset').value = ret.assetTagNumber || '';
    document.getElementById('edit-ret-employee').value = ret.employeeName || '';
    document.getElementById('edit-ret-date').value = ret.returnDate ? ret.returnDate.split('T')[0] : '';
    document.getElementById('edit-ret-condition').value = ret.deviceCondition || 'Good';
    document.getElementById('edit-ret-penalty').value = ret.penaltyAmount || '';
    document.getElementById('edit-ret-notes').value = ret.notes || '';

    const modal = document.getElementById('editReturnModal');
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.style.opacity = '1';
    modal.querySelector('.modal-content').style.transform = 'scale(1)';
};

document.getElementById('edit-return-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-ret-id').value;
    const payload = {
        assetTagNumber: document.getElementById('edit-ret-asset').value,
        employeeName: document.getElementById('edit-ret-employee').value,
        returnDate: document.getElementById('edit-ret-date').value,
        deviceCondition: document.getElementById('edit-ret-condition').value,
        penaltyAmount: document.getElementById('edit-ret-penalty').value || 0,
        notes: document.getElementById('edit-ret-notes').value
    };

    try {
        const res = await fetch(`http://localhost:5000/api/returns/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Update failed');

        closeEditModal('editReturnModal');
        showToast('Return record updated successfully', 'success');
        fetchReturns();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Returns') {
            openKpiModal('Returns');
        }
    } catch (err) {
        showToast('Error updating return record', 'error');
    }
});

window.deleteReturn = async function (id) {
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: 'Are you sure you want to delete this return record?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!',
        background: '#1e293b',
        color: '#f8fafc',
        backdrop: `rgba(0,0,0,0.4)`
    });
    if (!result.isConfirmed) return;
    try {
        const res = await fetch(`http://localhost:5000/api/returns/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        showToast('Return deleted successfully', 'success');
        fetchReturns();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Returns') {
            openKpiModal('Returns');
        }
    } catch (err) {
        showToast('Error deleting return record', 'error');
    }
};

/* --- auth-guard.js --- */

// auth-guard.js
// This script must be included on every protected page

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    // Redirect to auth.html if not logged in
    if (!token || !userStr) {
        if (!window.location.pathname.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
        return;
    }

    // Set User Details in UI on the current page
    try {
        const user = JSON.parse(userStr);
        const nameEl = document.getElementById('user-name');
        const roleEl = document.getElementById('user-role');
        const avatarEl = document.getElementById('user-avatar');

        if (nameEl && roleEl && avatarEl) {
            nameEl.textContent = user.name;
            roleEl.textContent = user.role;
            const nameParam = encodeURIComponent(user.name);
            avatarEl.src = `https://ui-avatars.com/api/?name=${nameParam}&background=A855F7&color=fff`;
        }

        // Settings page specific fields
        const profileNameInput = document.getElementById('profile-name');
        const profileEmailInput = document.getElementById('profile-email');
        const profileRoleInput = document.getElementById('profile-role');

        if (profileNameInput) profileNameInput.value = user.name || '';
        if (profileEmailInput) profileEmailInput.value = user.email || '';
        if (profileRoleInput) profileRoleInput.value = user.role || '';

        // Fetch Role-Based Access Control (RBAC) dynamically
        const userRole = user.role;

        // Fetch role permissions from backend
        fetch(`http://localhost:5000/api/roles?_t=${Date.now()}`)
            .then(res => res.json())
            .then(roles => {
                const roleObj = roles.find(r => r.name === userRole);
                const allowedPages = roleObj ? roleObj.permissions : ['index.html'];

                // 1. Check current page access
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';

                // TEMPORARILY DISABLED FOR TESTING:
                // if (currentPage !== 'auth.html' && !allowedPages.includes(currentPage)) {
                //     showToast(`Access Denied! As a ${userRole}, you do not have permission to view this page.`, 'error');
                //     window.location.hash = '#index';
                //     return;
                // }

                // 2. Hide unauthorized sidebar links
                const navLinks = document.querySelectorAll('.nav-links li a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    // TEMPORARILY DISABLED FOR TESTING: 
                    // if (href && !allowedPages.includes(href)) {
                    //     link.parentElement.style.display = 'none';
                    // }
                });
            })
            .catch(err => {
                console.error('Error fetching dynamic roles, falling back to local defaults:', err);

                // Graceful fallback using hardcoded permissions if the server hasn't been restarted yet
                const fallbackPermissions = {
                    'Super Admin': ['index.html', 'assets.html', 'allocations.html', 'returns.html', 'warranty.html', 'reports.html', 'settings.html'],
                    'User 1': ['index.html', 'assets.html', 'returns.html', 'warranty.html', 'reports.html'],
                    'User 2': ['index.html', 'allocations.html', 'reports.html']
                };

                const allowedPages = fallbackPermissions[userRole] || ['index.html'];

                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                // if (currentPage !== 'auth.html' && !allowedPages.includes(currentPage)) {
                //     showToast(`Access Denied! As a ${userRole}, you do not have permission to view this page.`, 'error');
                //     window.location.hash = '#index';
                //     return;
                // }

                const navLinks = document.querySelectorAll('.nav-links li a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    // if (href && !allowedPages.includes(href)) {
                    //     link.parentElement.style.display = 'none';
                    // }
                });
            });

    } catch (e) {
        console.error('Error parsing user data:', e);
        // Fallback or force logout if data is corrupted
        logoutUser();
    }
});

// Logout User globally
function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}


/* --- app.js --- */

// Global Configuration
var API_URL = 'http://localhost:5000/api';

window.currentOwnershipFilter = 'All';

window.setGlobalOwnership = function (company, btnElement) {
    window.currentOwnershipFilter = company;

    // Update button UI
    if (btnElement) {
        document.querySelectorAll('.company-switcher .switcher-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }

    // Refresh active data
    if (typeof initDashboard === 'function') initDashboard();
    handleRouting(); // Reloads active tab data
};

window.getOwnershipQuery = function (isFirstParam = true) {
    if (window.currentOwnershipFilter === 'All') return '';
    return (isFirstParam ? '?' : '&') + 'ownership=' + encodeURIComponent(window.currentOwnershipFilter);
};

// Chart instances
let deviceTypeChartInstance = null;
let statusChartInstance = null;

// Initialize Dashboard
async function initDashboard() {
    try {
        const actBody = document.getElementById('recent-activities-body');
        const allocBody = document.getElementById('recent-allocations-body');
        const retBody = document.getElementById('recent-returns-body');
        const loadingRow = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px; color:var(--primary);"></i>Loading...</td></tr>';
        if (actBody) actBody.innerHTML = loadingRow;
        if (allocBody) allocBody.innerHTML = loadingRow;
        if (retBody) retBody.innerHTML = loadingRow;

        // Fetch Dashboard Stats from Backend
        let url = `${API_URL}/assets/dashboard-stats${window.getOwnershipQuery()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch dashboard data. Backend may not be connected to DB.');

        const data = await response.json();

        // Update KPIs with real data
        document.getElementById('kpi-total').textContent = data.kpis?.totalAssets || 0;
        document.getElementById('kpi-in-use').textContent = data.kpis?.inUse || 0;
        document.getElementById('kpi-in-stock').textContent = data.kpis?.inStock || 0;
        document.getElementById('kpi-repair').textContent = data.kpis?.underRepair || 0;
        // Extract software, monitor, mouse, and keyboard count from the chart data
        let softwareCount = 0;
        let monitorCount = 0;
        let mouseCount = 0;
        let keyboardCount = 0;
        if (data.charts && data.charts.assetsByDeviceType) {
            const softwareData = data.charts.assetsByDeviceType.find(item => (item._id || '').toLowerCase() === 'software');
            if (softwareData) softwareCount = softwareData.count;

            const monitorData = data.charts.assetsByDeviceType.find(item => {
                const type = (item._id || '').toLowerCase();
                return type === 'monitor' || type === 'monitors';
            });
            if (monitorData) monitorCount = monitorData.count;

            const mouseData = data.charts.assetsByDeviceType.find(item => {
                const type = (item._id || '').toLowerCase();
                return type === 'mouse';
            });
            if (mouseData) mouseCount = mouseData.count;

            const keyboardData = data.charts.assetsByDeviceType.find(item => {
                const type = (item._id || '').toLowerCase();
                return type === 'keyboard';
            });
            if (keyboardData) keyboardCount = keyboardData.count;
        }
        document.getElementById('kpi-software').textContent = softwareCount;

        const monitorKpiEl = document.getElementById('kpi-monitors');
        if (monitorKpiEl) monitorKpiEl.textContent = monitorCount;

        const mouseKpiEl = document.getElementById('kpi-mouse');
        if (mouseKpiEl) mouseKpiEl.textContent = mouseCount;

        const keyboardKpiEl = document.getElementById('kpi-keyboard');
        if (keyboardKpiEl) keyboardKpiEl.textContent = keyboardCount;
        if (document.getElementById('kpi-returns')) {
            document.getElementById('kpi-returns').textContent = data.kpis?.returnedAssets || 0;
        }
        if (document.getElementById('kpi-allocations')) {
            document.getElementById('kpi-allocations').textContent = data.kpis?.activeAllocations || 0;
        }

        // Render Charts with real data
        try {
            renderDeviceTypeChart(data.charts?.assetsByDeviceType || []);
            renderStatusChart(data.charts?.assetsByStatus || []);
        } catch (chartErr) {
            console.warn('Charts failed to render, possibly Chart.js is not loaded', chartErr);
        }

        // Render Recent Activities
        renderRecentActivities(data.recentActivities || []);

    } catch (error) {
        console.error('Backend connection error:', error);
        // Clean empty state if DB fails (No mock data as per user request)
        document.getElementById('kpi-total').textContent = 0;
        document.getElementById('kpi-in-use').textContent = 0;
        document.getElementById('kpi-in-stock').textContent = 0;
        document.getElementById('kpi-repair').textContent = 0;
        if (document.getElementById('kpi-software')) document.getElementById('kpi-software').textContent = 0;
        if (document.getElementById('kpi-returns')) document.getElementById('kpi-returns').textContent = 0;
        if (document.getElementById('kpi-allocations')) document.getElementById('kpi-allocations').textContent = 0;

        const recentActBody = document.getElementById('recent-activities-body');
        if (recentActBody) recentActBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Error: ${error.message}</td></tr>`;

        renderDeviceTypeChart([]);
        renderStatusChart([]);
    }
}

// Chart Configurations for Premium Red Theme
function getChartColors() {
    return {
        text: '#030712',
        gridColor: '#E5E7EB',
        bg: [
            '#E11D48', // premium red
            '#030712', // deep black
            '#10B981', // green
            '#F59E0B', // orange
            '#3B82F6', // blue
            '#8B5CF6'  // purple
        ],
        border: [
            '#E11D48',
            '#030712',
            '#10B981',
            '#F59E0B',
            '#3B82F6',
            '#8B5CF6'
        ]
    };
}

function renderDeviceTypeChart(data) {
    const ctx = document.getElementById('deviceTypeChart');
    if (!ctx) return;

    const colors = getChartColors();

    // Transform data
    const labels = data.length > 0 ? data.map(d => d._id) : ['No Data'];
    const counts = data.length > 0 ? data.map(d => d.count) : [1];

    // Light gray if no data
    const bgColors = data.length > 0 ? colors.bg : ['#E5E7EB'];

    if (deviceTypeChartInstance) deviceTypeChartInstance.destroy();

    deviceTypeChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { color: colors.text, usePointStyle: true, padding: 20 } }
            }
        }
    });
}

function renderStatusChart(data) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    const colors = getChartColors();

    // Transform data
    const labels = data.length > 0 ? data.map(d => d._id) : ['No Data'];
    const counts = data.length > 0 ? data.map(d => d.count) : [0];
    const bgColors = data.length > 0 ? colors.bg : ['#E5E7EB'];

    if (statusChartInstance) statusChartInstance.destroy();

    statusChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Assets',
                data: counts,
                backgroundColor: bgColors,
                borderRadius: 8,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    ticks: { color: colors.text, stepSize: 1, precision: 0 },
                    grid: { color: colors.gridColor, drawBorder: false }
                },
                x: {
                    ticks: { color: colors.text },
                    grid: { display: false, drawBorder: false }
                }
            }
        }
    });
}

function renderRecentActivities(activities) {
    const tbody = document.getElementById('recent-activities-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!activities || activities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #A3AED0;">No recent activities found in database.</td></tr>';
        return;
    }

    activities.forEach(act => {
        let statusClass = 'in-stock';
        if (act.status === 'In Use') statusClass = 'in-use';
        if (act.status === 'Under Repair') statusClass = 'under-repair';

        const row = `
            <tr>
                <td><strong>${act.assetTagNumber || 'N/A'}</strong></td>
                <td>${act.deviceType || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${act.status || 'Unknown'}</span></td>
                <td>${new Date(act.updatedAt || act.createdAt).toLocaleDateString()}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Run on load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('kpi-total')) {
        initDashboard();
    }
});


/* --- settings.js --- */

// Settings Page Tab Switching Logic
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    // Fetch and populate accurate user role stats
    fetch('http://localhost:5000/api/auth/role-stats')
        .then(res => res.json())
        .then(data => {
            let superAdminCount = 0;
            let itAdminCount = 0;
            let managerCount = 0;
            let employeeCount = 0;

            if (Array.isArray(data)) {
                data.forEach(stat => {
                    if (stat._id === 'Super Admin') superAdminCount = stat.count;
                    if (stat._id === 'User 1') itAdminCount = stat.count;
                    if (stat._id === 'User 2') managerCount = stat.count;
                    if (stat._id === 'Employee') employeeCount = stat.count;
                });
            }

            if (document.getElementById('count-super-admin')) document.getElementById('count-super-admin').textContent = superAdminCount;
            if (document.getElementById('count-it-admin')) document.getElementById('count-it-admin').textContent = itAdminCount;
            if (document.getElementById('count-manager')) document.getElementById('count-manager').textContent = managerCount;
            if (document.getElementById('count-employee')) document.getElementById('count-employee').textContent = employeeCount;
        })
        .catch(err => console.error('Error fetching role stats:', err));

    // Fetch roles to cache their permissions
    fetchRoles();
});

var rolesCache = {};
var currentEditingRole = '';
var currentEditingRow = null;

function fetchRoles() {
    fetch(`http://localhost:5000/api/roles?_t=${Date.now()}`)
        .then(res => res.json())
        .then(roles => {
            roles.forEach(r => rolesCache[r.name] = r.permissions);
        })
        .catch(err => console.error('Error fetching roles:', err));
}



// ====== ASSETS LOGIC ====== //

// Form submission
document.getElementById('asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const assetData = {
        srNo: document.getElementById('srNo').value.trim(),
        assetTagNumber: document.getElementById('assetTagNumber').value.trim(),
        serialNumber: document.getElementById('serialNumber').value.trim(),
        deviceType: document.getElementById('deviceType').value,
        softwareCategory: document.getElementById('softwareCategory').value || undefined,
        make: document.getElementById('make').value.trim(),
        model: document.getElementById('model').value.trim(),
        processor: document.getElementById('processor').value.trim(),
        generation: document.getElementById('generation').value.trim(),
        ram: document.getElementById('ram').value.trim(),
        storage: document.getElementById('storage').value.trim(),
        os: document.getElementById('os').value.trim(),
        macAddress: document.getElementById('macAddress').value.trim(),
        ownership: document.getElementById('ownership').value,
        vendorName: document.getElementById('vendorName').value.trim(),
        purchaseDate: document.getElementById('purchaseDate').value || undefined,
        warrantyEndDate: document.getElementById('warrantyEndDate').value || undefined,
        status: document.getElementById('status').value,
        assignedToName: document.getElementById('assignedToName') ? document.getElementById('assignedToName').value.trim() : '',
        employeeId: document.getElementById('employeeId') ? document.getElementById('employeeId').value.trim() : '',
        assignedBy: document.getElementById('assignedBy') ? document.getElementById('assignedBy').value.trim() : ''
    };

    try {
        const response = await fetch('http://localhost:5000/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assetData)
        });

        if (response.ok) {
            showToast('Asset saved successfully!', 'success');
            document.getElementById('asset-form').reset();
            const dtSelect = document.getElementById('deviceType');
            if (dtSelect) dtSelect.dispatchEvent(new Event('change'));

            // Re-fill Assigned By after reset
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const assignedByInput = document.getElementById('assignedBy');
                if (assignedByInput) assignedByInput.value = user.name;
            }

            window.location.hash = '#index';
        } else {
            const err = await response.json();
            showToast('Error saving asset: ' + err.message, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Could not connect to the backend. Server might be down.', 'error');
    }
});

// Toggle Software Category + Label swap
const deviceTypeSelect = document.getElementById('deviceType');
const softwareCategoryGroup = document.getElementById('softwareCategoryGroup');
const serialNumberLabel = document.getElementById('serialNumberLabel');

deviceTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;

    // Software specific logic
    if (type === 'Software') {
        softwareCategoryGroup.style.display = 'block';
        serialNumberLabel.textContent = 'Software License Key *';
        document.getElementById('serialNumber').placeholder = 'XXXX-XXXX-XXXX-XXXX';
    } else {
        softwareCategoryGroup.style.display = 'none';
        document.getElementById('softwareCategory').value = '';
        serialNumberLabel.textContent = 'Serial Number *';
        document.getElementById('serialNumber').placeholder = '';
    }

    // Hide Configuration Details for accessories/software
    const configSection = document.getElementById('config-details-section');
    if (configSection) {
        if (['Mouse', 'Keyboard', 'Printer', 'Monitor', 'Software'].includes(type)) {
            configSection.style.display = 'none';
            // Clear the fields so they aren't accidentally saved
            document.getElementById('processor').value = '';
            document.getElementById('generation').value = '';
            document.getElementById('ram').value = '';
            document.getElementById('storage').value = '';
            document.getElementById('os').value = '';
        } else {
            configSection.style.display = 'block';
        }
    }
});

// Notifications dropdown
function toggleNotifications() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});


function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show-menu');
}


// ====== ALLOCATIONS LOGIC ====== //

document.getElementById('allocation-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const employeeName = document.getElementById('alloc-employee').value.trim();
    const assetTagNumber = document.getElementById('alloc-asset').value.trim();
    const assignDate = document.getElementById('alloc-date').value;
    const expectedReturnDate = document.getElementById('alloc-return-date').value || null;
    const issueNotes = document.getElementById('alloc-notes').value.trim();
    const digitalSignatureRequested = document.getElementById('alloc-signature').checked;

    try {
        const response = await fetch('http://localhost:5000/api/allocations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeName,
                assetTagNumber,
                assignDate,
                expectedReturnDate,
                issueNotes,
                digitalSignatureRequested
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Asset allocated successfully!', 'success');
            document.getElementById('allocation-form').reset();

            // Refresh dashboards and data
            if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
            if (typeof fetchAssets === 'function') fetchAssets();
            if (typeof fetchAllocations === 'function') fetchAllocations();
        } else {
            showToast(data.message || 'Failed to process allocation', 'error');
        }
    } catch (err) {
        console.error('Allocation Error:', err);
        showToast('Server error processing allocation', 'error');
    }
});

function toggleNotifications() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});
// Fetch and display allocations history
async function fetchAllocations() {
    try {
        const tbody = document.getElementById('all-allocations-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><br><br>Loading allocations...</td></tr>';

        const response = await fetch('http://localhost:5000/api/allocations' + window.getOwnershipQuery(true));
        if (!response.ok) throw new Error('Failed to fetch allocations');

        const allocations = await response.json();
        if (!tbody) return;

        tbody.innerHTML = '';

        if (allocations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No allocations found.</td></tr>';
            return;
        }

        window.currentAllocationsData = allocations;
        allocations.forEach(alloc => {
            const assignDate = alloc.assignDate ? new Date(alloc.assignDate).toLocaleDateString() : 'N/A';
            const notes = alloc.issueNotes ? (alloc.issueNotes.length > 30 ? alloc.issueNotes.substring(0, 30) + '...' : alloc.issueNotes) : '-';
            const statusBadge = alloc.status === 'Active' ? 'in-use' : 'in-stock';

            tbody.innerHTML += `
                <tr>
                    <td><strong>${alloc.employeeName}</strong></td>
                    <td style="color: var(--blue-primary); font-weight: 600;">${alloc.assetTagNumber}</td>
                    <td>${assignDate}</td>
                    <td>${notes}</td>
                    <td><span class="status-badge ${statusBadge}">${alloc.status}</span></td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="action-btn edit-btn" onclick="openEditAllocationModal('${alloc._id}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteAllocation('${alloc._id}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error('Error fetching allocations:', err);
        const tbody = document.getElementById('all-allocations-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: red;">Error loading allocations.</td></tr>';
    }
}

// ====== RETURNS LOGIC ====== //

document.getElementById('return-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const assetTagNumber = document.getElementById('ret-asset').value.trim();
    const employeeName = document.getElementById('ret-employee').value.trim();
    const returnDate = document.getElementById('ret-date').value;
    const deviceCondition = document.getElementById('ret-condition').value;
    const penaltyAmount = document.getElementById('ret-penalty').value || 0;
    const notes = document.getElementById('ret-notes').value.trim();

    try {
        const response = await fetch('http://localhost:5000/api/returns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetTagNumber,
                employeeName,
                returnDate,
                deviceCondition,
                penaltyAmount: parseFloat(penaltyAmount),
                notes
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Asset returned successfully!', 'success');
            document.getElementById('return-form').reset();

            // Refresh dashboards and data
            if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
            if (typeof fetchAssets === 'function') fetchAssets();
            if (typeof fetchAllocations === 'function') fetchAllocations();
            if (typeof fetchReturns === 'function') fetchReturns();
        } else {
            showToast(data.message || 'Failed to process return', 'error');
        }
    } catch (err) {
        console.error('Return Error:', err);
        showToast('Server error processing return', 'error');
    }
});

// Fetch and display returns history
async function fetchReturns() {
    try {
        const tbody = document.getElementById('all-returns-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><br><br>Loading returns...</td></tr>';

        const response = await fetch('http://localhost:5000/api/returns' + window.getOwnershipQuery(true));
        if (!response.ok) throw new Error('Failed to fetch returns');

        const returns = await response.json();
        if (!tbody) return;

        tbody.innerHTML = '';

        if (returns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No returns found.</td></tr>';
            return;
        }

        window.currentReturnsData = returns;
        returns.forEach(ret => {
            const returnDate = ret.returnDate ? new Date(ret.returnDate).toLocaleDateString() : 'N/A';
            const notes = ret.notes ? (ret.notes.length > 30 ? ret.notes.substring(0, 30) + '...' : ret.notes) : '-';
            const penalty = ret.penaltyAmount ? '$' + ret.penaltyAmount : '-';
            let conditionColor = '#10B981';
            if (['Damaged', 'Poor', 'Scrap'].includes(ret.deviceCondition)) conditionColor = '#EF4444';
            else if (ret.deviceCondition === 'Fair') conditionColor = '#F59E0B';

            tbody.innerHTML += `
                <tr>
                    <td style="color: var(--blue-primary); font-weight: 600;">${ret.assetTagNumber}</td>
                    <td><strong>${ret.employeeName}</strong></td>
                    <td>${returnDate}</td>
                    <td><span style="font-weight: 600; color: ${conditionColor};">${ret.deviceCondition || 'Unknown'}</span></td>
                    <td style="color: var(--red-primary); font-weight: 600;">${penalty}</td>
                    <td>${notes}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="action-btn edit-btn" onclick="openEditReturnModal('${ret._id}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteReturn('${ret._id}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error('Error fetching returns:', err);
        const tbody = document.getElementById('all-returns-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: red;">Error loading returns.</td></tr>';
    }
}

function toggleNotifications() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});


function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show-menu');
}


// ====== WARRANTY LOGIC ====== //

let allAssets = [];
let currentFilter = 'all';

const now = new Date();
const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

function getWarrantyStatus(asset) {
    if (!asset.warrantyEndDate) return 'no-date';
    const expiry = asset.warrantyEndDate ? new Date(asset.warrantyEndDate) : null;
    if (expiry < now) return 'expired';
    if (expiry <= next30) return 'expiring';
    return 'valid';
}

function getDaysLeft(dateStr) {
    if (!dateStr) return '-';
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return '-';
    const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return Math.abs(diff) + ' days ago';
    if (diff === 0) return 'Today';
    return diff + ' days left';
}

function renderTable(assets) {
    const tbody = document.getElementById('warranty-table-body');
    const filtered = assets.filter(a => {
        if (currentFilter === 'all') return true;
        return getWarrantyStatus(a) === currentFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No assets found for this filter.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(asset => {
        try {
            const status = getWarrantyStatus(asset);
            const expiry = new Date(asset.warrantyEndDate);
            const daysLeft = getDaysLeft(asset.warrantyEndDate);

            let badgeClass = 'valid';
            let badgeText = 'Active';
            if (status === 'expired') { badgeClass = 'expired'; badgeText = 'Expired'; }
            if (status === 'expiring') { badgeClass = 'expiring'; badgeText = 'Expiring Soon'; }
            if (status === 'no-date') { badgeClass = 'no-date'; badgeText = 'No Warranty Info'; }

            const row = document.createElement('tr');
            row.setAttribute('data-status', status);
            row.innerHTML =
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><strong>' + (asset.assetTagNumber || 'N/A') + '</strong><br><small style="color:var(--text-muted);">' + (asset.srNo || '') + '</small></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);">' + (asset.deviceType || 'N/A') + (asset.make ? ' <span style="color:var(--text-muted);">(' + asset.make + ')</span>' : '') + '</td>' +

                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><div style="display:flex; flex-direction:column; gap:4px;"><span>' + (expiry && !isNaN(expiry.getTime()) ? expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-') + '</span><span style="font-size:0.75rem; color:var(--text-muted); font-weight:500; background:#f1f5f9; padding:2px 6px; border-radius:4px; width:fit-content;">' + daysLeft + '</span></div></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><span class="warranty-badge ' + badgeClass + '">' + badgeText + '</span></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><button class="vendor-btn" onclick="contactVendor(\'' + (asset.assetTagNumber || '') + '\')"><i class="fa-solid fa-phone"></i> Contact Vendor</button></td>';
            tbody.appendChild(row);
        } catch (err) {
            tbody.innerHTML += '<tr><td colspan="5" style="color:red; padding:10px;">Error rendering asset ' + asset.assetTagNumber + ': ' + err.message + '</td></tr>';
        }
    });
}

function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('filter-' + filter).classList.add('active');
    renderTable(allAssets);
}

function contactVendor(assetTag) {
    showToast('Contact your vendor regarding asset: ' + assetTag, 'warning');
}

async function loadWarrantyData() {
    try {
        const tbody = document.getElementById('warranty-table-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><br><br>Loading warranty data...</td></tr>';

        const response = await fetch(`${API_URL}/assets${window.getOwnershipQuery()}`);
        if (!response.ok) throw new Error('Backend error');
        const assets = await response.json();

        allAssets = assets;

        let expiring = 0, expired = 0, valid = 0;
        assets.forEach(a => {
            const s = getWarrantyStatus(a);
            if (s === 'expiring') expiring++;
            else if (s === 'expired') expired++;
            else if (s === 'valid') valid++;
        });

        document.getElementById('kpi-expiring').textContent = expiring;
        document.getElementById('kpi-expired').textContent = expired;
        document.getElementById('kpi-valid').textContent = valid + expiring;
        document.getElementById('kpi-total-tracked').textContent = allAssets.length;

        renderTable(allAssets);

    } catch (err) {
        console.error(err);
        showToast('Database loading failed. Is the backend running?', 'error');
        document.getElementById('warranty-table-body').innerHTML =
            '<tr><td colspan="5" style="text-align:center;padding:40px;color:#C0392B;"><i class="fa-solid fa-circle-exclamation"></i> Failed to load data. Is the backend running?</td></tr>';
        ['kpi-expiring', 'kpi-expired', 'kpi-valid', 'kpi-total-tracked'].forEach(id => {
            document.getElementById(id).textContent = '0';
        });
    }
}

function toggleNotifications() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

document.addEventListener('DOMContentLoaded', loadWarrantyData);


function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show-menu');
}


// ====== REPORTS LOGIC ====== //

async function exportData(type) {
    try {
        let endpoint = 'http://localhost:5000/api/' + type;
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Failed to fetch data');

        const data = await response.json();

        if (!data || data.length === 0) {
            showToast('No data available in the database to export.', 'warning');
            return;
        }

        const allKeys = new Set();
        data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
        const headers = Array.from(allKeys).filter(k => k !== '_id' && k !== '__v');
        const csvRows = [];

        csvRows.push(headers.join(','));

        data.forEach(row => {
            const values = headers.map(header => {
                let val = row[header] === null || row[header] === undefined ? '' : row[header];
                val = val.toString().replace(/"/g, '""');
                if (val.search(/("|,|)/g) >= 0) {
                    val = '"' + val + '"';
                }
                return val;
            });
            csvRows.push(values.join(','));
        });

        const csvString = csvRows.join('\n');

        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', type + '_export_' + new Date().toISOString().split('T')[0] + '.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (err) {
        console.error(err);
        showToast('Export failed. Ensure backend is running.', 'error');
    }
}

async function fetchReportsData() {
    try {
        const tbody = document.getElementById('reports-table-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><br><br>Loading data...</td></tr>';

        const response = await fetch('http://localhost:5000/api/assets' + window.getOwnershipQuery());
        if (!response.ok) throw new Error('Failed to fetch data');

        const data = await response.json();
        if (tbody) tbody.innerHTML = '';

        let filtered = data;

        // Apply UI Filters
        const filterDay = document.getElementById('reports-filter-day')?.value || '';
        const filterMonth = document.getElementById('reports-filter-month')?.value || '';
        const filterYear = document.getElementById('reports-filter-year')?.value || '';
        const filterDevice = document.getElementById('reports-filter-device')?.value || '';

        if (filterDevice) {
            filtered = filtered.filter(a => (a.deviceType || '').toLowerCase() === filterDevice.toLowerCase());
        }

        if (filterDay || filterMonth || filterYear) {
            filtered = filtered.filter(a => {
                if (!a.createdAt) return false;
                const date = new Date(a.createdAt);
                let match = true;
                if (filterYear && date.getFullYear().toString() !== filterYear) match = false;
                if (filterMonth && date.getMonth().toString() !== filterMonth) match = false;
                if (filterDay && date.getDate().toString() !== filterDay) match = false;
                return match;
            });
        }
        
        window.currentReportsFilteredData = filtered;

        if (!filtered || filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 40px; color: var(--text-muted);">No assets found in database.</td></tr>';
            return;
        }

        filtered.forEach(asset => {
            try {
                let statusClass = 'in-stock';
                if (asset.status === 'In Use') statusClass = 'in-use';
                if (asset.status === 'Under Repair') statusClass = 'under-repair';

                const row = document.createElement('tr');
                row.innerHTML =
                    '<td style="padding:16px;">' + (asset.srNo || 'N/A') + '</td>' +
                    '<td style="padding:16px;"><strong>' + (asset.assetTagNumber || 'N/A') + '</strong></td>' +
                    '<td style="padding:16px;">' + (asset.serialNumber || 'N/A') + '</td>' +
                    '<td style="padding:16px;">' + (asset.deviceType || 'N/A') + '</td>' +
                    '<td style="padding:16px;">' + (asset.make || 'N/A') + '</td>' +
                    '<td style="padding:16px; display:none;">' + (asset.model || 'N/A') + '</td>' +
                    '<td style="padding:16px;">' + (asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '-') + '</td>' +
                    '<td style="padding:16px;">' + (asset.warrantyEndDate ? new Date(asset.warrantyEndDate).toLocaleDateString() : '-') + '</td>' +
                    '<td style="padding:16px;">' + (asset.remark || '-') + '</td>' +
                    '<td style="padding:16px;"><span class="status-badge ' + statusClass + '">' + (asset.status || 'Unknown') + '</span></td>' +
                    '<td style="padding:16px; color: var(--text-main); font-weight: 500;"><i class="fa-solid fa-user-circle" style="color: #cbd5e1; margin-right: 5px;"></i>' + (asset.assignedToName || 'Unassigned') + '</td>' +
                    '<td style="padding:16px;">' + (asset.employeeId || '-') + '</td>' +
                    '<td style="padding:16px;">' +
                    `<button onclick="openEditModal('${asset._id}')" style="background:none;border:none;color:var(--primary);cursor:pointer;margin-right:12px;font-size:1.1rem;transition:0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-pen"></i></button>` +
                    `<button onclick="deleteAsset('${asset._id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;transition:0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-trash"></i></button>` +
                    '</td>';
                tbody.appendChild(row);
            } catch (err) { console.error('Error rendering row for asset', asset, err); }
        });
    } catch (err) {
        console.error(err);
        showToast('Database loading failed. Is the backend running?', 'error');
        document.getElementById('reports-table-body').innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 40px; color: var(--red-primary);">Error: ${err.message}</td></tr>`;
    }
}

window.applyReportsFilters = function () {
    fetchReportsData();
};

window.clearReportsFilters = function () {
    if (document.getElementById('reports-filter-day')) document.getElementById('reports-filter-day').value = '';
    if (document.getElementById('reports-filter-month')) document.getElementById('reports-filter-month').value = '';
    if (document.getElementById('reports-filter-year')) document.getElementById('reports-filter-year').value = '';
    if (document.getElementById('reports-filter-device')) document.getElementById('reports-filter-device').value = '';
    fetchReportsData();
};

function toggleNotifications() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

document.addEventListener('DOMContentLoaded', fetchReportsData);


function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show-menu');
}


// ====== SETTINGS LOGIC ====== //

function toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});


function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show-menu');
}



// ==========================================
// SETTINGS LOGIC
// ==========================================

var currentEditingRole = '';
var currentEditingRow = null;
var rolesCache = {};

function fetchSettingsData() {
    fetchRoles();
}

function fetchRoles() {
    fetch('http://localhost:5000/api/roles')
        .then(res => res.json())
        .then(roles => {
            const tbody = document.getElementById('roles-body');
            tbody.innerHTML = '';
            rolesCache = {};
            window.roleUsersCache = {};
            roles.forEach(r => {
                rolesCache[r.name] = r.permissions;
                window.roleUsersCache[r.name] = r.assignedUsers || [];
            });

            roles.forEach(role => {
                const count = role.userCount !== undefined ? role.userCount : 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${role.name}</strong></td>
                    <td><span style="color:var(--text-muted);">${role.permissions.length} pages allowed</span></td>
                    <td><span style="background:#f1f5f9; padding:4px 10px; border-radius:12px; font-weight:600; color:#334155; font-size:0.85rem;"><i class="fa-solid fa-users" style="color:#64748b; margin-right:5px;"></i>${count} Users</span></td>
                    <td>
                        <button class="icon-btn action-btn" onclick="editRole('${role.name}', this.closest('tr'))"><i class="fa-solid fa-pen-to-square"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error('Error fetching roles:', err);
            showToast('Failed to load roles from server.', 'error');
        });
}

window.editRole = function (roleName, trElement) {
    currentEditingRole = roleName;
    currentEditingRow = trElement;
    document.getElementById('editing-role-name').innerHTML = '<i class="fa-solid fa-user-shield" style="color: var(--red-primary);"></i> Editing Permissions for: ' + roleName;

    const currentPerms = rolesCache[roleName] || [];
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.checked = currentPerms.includes(cb.value);
    });

    const assignedUsers = window.roleUsersCache ? (window.roleUsersCache[roleName] || []) : [];
    const usersContainer = document.getElementById('role-users-list');
    if (usersContainer) {
        usersContainer.innerHTML = '';
        if (assignedUsers.length === 0) {
            usersContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.9rem; font-style: italic;">No users are currently assigned to this role.</div>';
        } else {
            assignedUsers.forEach(u => {
                const isBlocked = u.isBlocked || false;
                const blockBtnHtml = isBlocked
                    ? `<button onclick="toggleUserBlock('${u._id}', false)" style="background:#10b981; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-unlock"></i> Unblock</button>`
                    : `<button onclick="toggleUserBlock('${u._id}', true)" style="background:#ef4444; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-ban"></i> Block</button>`;

                usersContainer.innerHTML += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: ${isBlocked ? '#fff1f2' : '#fff'}; border: 1px solid ${isBlocked ? '#fecdd3' : '#e2e8f0'}; border-radius: 6px; transition: 0.2s;">
                        <div style="display: flex; align-items: center; gap: 10px; opacity: ${isBlocked ? '0.6' : '1'};">
                            <i class="fa-solid fa-user-circle" style="color: #94a3b8; font-size: 1.5rem;"></i>
                            <div>
                                <div style="font-weight: 600; color: #334155; font-size: 0.95rem;">${u.name} ${isBlocked ? '<span style="color:#ef4444; font-size:0.75rem; margin-left:5px;"><i class="fa-solid fa-lock"></i> Blocked</span>' : ''}</div>
                                <div style="color: #64748b; font-size: 0.8rem;">${u.email}</div>
                            </div>
                        </div>
                        <div>
                            ${blockBtnHtml}
                        </div>
                    </div>
                `;
            });
        }
    }

    const modal = document.getElementById('role-edit-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Force reflow for transition
        void modal.offsetWidth;
        modal.style.opacity = '1';
        const content = modal.querySelector('.modal-content');
        if (content) content.style.transform = 'scale(1)';
    }
}

window.cancelRoleEdit = function () {
    const modal = document.getElementById('role-edit-modal');
    if (modal) {
        modal.style.opacity = '0';
        const content = modal.querySelector('.modal-content');
        if (content) content.style.transform = 'scale(0.95)';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
    currentEditingRole = '';
}

window.toggleUserBlock = async function (userId, blockStatus) {
    try {
        const response = await fetch(`http://localhost:5000/api/users/${userId}/block`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isBlocked: blockStatus })
        });
        if (response.ok) {
            showToast(blockStatus ? 'User has been blocked from accessing the system.' : 'User access has been restored.', 'success');
            cancelRoleEdit();
            fetchRoles();
        } else {
            showToast('Failed to update user status.', 'error');
        }
    } catch (e) {
        showToast('Error updating user status.', 'error');
    }
}

window.saveRolePermissions = async function () {
    if (!currentEditingRole) return;

    const newPerms = Array.from(document.querySelectorAll('.perm-checkbox'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    try {
        const response = await fetch('http://localhost:5000/api/roles/' + encodeURIComponent(currentEditingRole), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: newPerms })
        });

        if (response.ok) {
            showToast('Permissions saved successfully!', 'success');
            rolesCache[currentEditingRole] = newPerms;
            cancelRoleEdit();
            if (currentEditingRow) {
                currentEditingRow.cells[1].innerHTML = `<span style="color:var(--text-muted);">${newPerms.length} pages allowed</span>`;
            }
        } else {
            showToast('Failed to save permissions.', 'error');
        }
    } catch (err) {
        console.error('Error updating role:', err);
        showToast('Server error while saving.', 'error');
    }
}

// ==========================================
// KPI MODAL LOGIC
// ==========================================

window.openKpiModal = async function (category) {
    window.currentKpiCategory = category;
    document.getElementById('kpi-modal-title').innerText = category + ' Assets';
    const tbody = document.getElementById('kpi-modal-body');
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px;">Loading data...</td></tr>';

    const modal = document.getElementById('kpi-modal');
    modal.style.display = 'flex';
    // Trigger reflow
    void modal.offsetWidth;
    modal.style.opacity = '1';
    modal.querySelector('.modal-content').style.transform = 'scale(1)';

    try {
        const thead = document.getElementById('kpi-modal-thead');

        // Hide device filter for Allocations and Returns
        const deviceFilter = document.getElementById('kpi-filter-device');
        if (deviceFilter) {
            deviceFilter.style.display = (category === 'Allocations' || category === 'Returns') ? 'none' : 'inline-block';
        }

        // Get filter values
        const filterDay = document.getElementById('kpi-filter-day')?.value || '';
        const filterMonth = document.getElementById('kpi-filter-month')?.value || '';
        const filterYear = document.getElementById('kpi-filter-year')?.value || '';
        const filterSearch = document.getElementById('kpi-filter-search')?.value.toLowerCase() || '';

        if (category === 'Allocations') {
            document.getElementById('kpi-modal-title').innerText = 'Total Allocations';
            thead.innerHTML = `
                <tr>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Employee</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Asset Tag</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Assign Date</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Expected Return</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Notes</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: center;">Actions</th>
                </tr>
            `;
            const response = await fetch('http://localhost:5000/api/allocations' + window.getOwnershipQuery(true));
            const allocations = await response.json();
            window.currentAllocationsData = allocations;
            let activeAllocs = allocations;

            // Apply Date Filters
            if (filterDay || filterMonth || filterYear) {
                activeAllocs = activeAllocs.filter(a => {
                    if (!a.assignDate) return false;
                    const date = new Date(a.assignDate);
                    let match = true;
                    if (filterYear && date.getFullYear().toString() !== filterYear) match = false;
                    if (filterMonth && date.getMonth().toString() !== filterMonth) match = false;
                    if (filterDay && date.getDate().toString() !== filterDay) match = false;
                    return match;
                });
            }

            // Apply Search Filter
            if (filterSearch) {
                activeAllocs = activeAllocs.filter(a => {
                    return (a.employeeName || '').toLowerCase().includes(filterSearch) ||
                        (a.assetTagNumber || '').toLowerCase().includes(filterSearch) ||
                        (a.issueNotes || '').toLowerCase().includes(filterSearch);
                });
            }
            
            window.currentKpiFilteredData = activeAllocs;

            if (activeAllocs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No active allocations found matching your filters.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            activeAllocs.forEach(alloc => {
                const assignStr = alloc.assignDate ? new Date(alloc.assignDate).toLocaleDateString() : 'N/A';
                const returnStr = alloc.expectedReturnDate ? new Date(alloc.expectedReturnDate).toLocaleDateString() : '-';
                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background-color 0.2s;">
                        <td style="padding: 12px;"><i class="fa-solid fa-user-circle" style="color: #94a3b8; margin-right:5px;"></i> <strong>${alloc.employeeName}</strong></td>
                        <td style="padding: 12px; color: var(--blue-primary); font-weight: 600;">${alloc.assetTagNumber}</td>
                        <td style="padding: 12px;">${assignStr}</td>
                        <td style="padding: 12px;">${returnStr}</td>
                        <td style="padding: 12px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${alloc.issueNotes || ''}">${alloc.issueNotes || '-'}</td>
                        <td style="padding: 12px; text-align: center; white-space: nowrap;">
                            <button class="action-btn edit-btn" onclick="openEditAllocationModal('${alloc._id}'); document.getElementById('kpi-modal').style.display='none';" title="Edit">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteAllocation('${alloc._id}'); document.getElementById('kpi-modal').style.display='none';" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            return;
        }

        if (category === 'Returns') {
            document.getElementById('kpi-modal-title').innerText = 'Total Returns';
            thead.innerHTML = `
                <tr>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Asset Tag</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Returned By</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Date</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Condition</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Penalty</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Notes</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: center;">Actions</th>
                </tr>
            `;
            const response = await fetch('http://localhost:5000/api/returns' + window.getOwnershipQuery(true));
            const returns = await response.json();
            window.currentReturnsData = returns;

            let filteredReturns = returns;

            // Apply Date Filters
            if (filterDay || filterMonth || filterYear) {
                filteredReturns = filteredReturns.filter(a => {
                    if (!a.returnDate) return false;
                    const date = new Date(a.returnDate);
                    let match = true;
                    if (filterYear && date.getFullYear().toString() !== filterYear) match = false;
                    if (filterMonth && date.getMonth().toString() !== filterMonth) match = false;
                    if (filterDay && date.getDate().toString() !== filterDay) match = false;
                    return match;
                });
            }

            // Apply Search Filter
            if (filterSearch) {
                filteredReturns = filteredReturns.filter(a => {
                    return (a.employeeName || '').toLowerCase().includes(filterSearch) ||
                        (a.assetTagNumber || '').toLowerCase().includes(filterSearch) ||
                        (a.notes || '').toLowerCase().includes(filterSearch) ||
                        (a.deviceCondition || '').toLowerCase().includes(filterSearch);
                });
            }
            
            window.currentKpiFilteredData = filteredReturns;

            if (filteredReturns.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No returns found matching your filters.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            filteredReturns.forEach(ret => {
                let conditionColor = '#10B981';
                if (['Damaged', 'Poor', 'Scrap'].includes(ret.deviceCondition)) conditionColor = '#EF4444';
                else if (ret.deviceCondition === 'Fair') conditionColor = '#F59E0B';

                const dateStr = ret.returnDate ? new Date(ret.returnDate).toLocaleDateString() : 'N/A';
                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background-color 0.2s;">
                        <td style="padding: 12px;"><strong>${ret.assetTagNumber}</strong></td>
                        <td style="padding: 12px;"><i class="fa-solid fa-user-circle" style="color: #94a3b8; margin-right:5px;"></i> ${ret.employeeName || 'N/A'}</td>
                        <td style="padding: 12px;">${dateStr}</td>
                        <td style="padding: 12px;"><span style="font-weight: 600; color: ${conditionColor};">${ret.deviceCondition}</span></td>
                        <td style="padding: 12px; color: var(--red-primary); font-weight: 600;">${ret.penaltyAmount ? '$' + ret.penaltyAmount : '-'}</td>
                        <td style="padding: 12px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ret.notes || ''}">${ret.notes || '-'}</td>
                        <td style="padding: 12px; text-align: center; white-space: nowrap;">
                            <button class="action-btn edit-btn" onclick="openEditReturnModal('${ret._id}'); document.getElementById('kpi-modal').style.display='none';" title="Edit">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteReturn('${ret._id}'); document.getElementById('kpi-modal').style.display='none';" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            return;
        }

        // Default Asset View for all other categories
        const isSoftware = category.toLowerCase() === 'software';

        thead.innerHTML = `
            <tr>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">SR No</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Asset Tag</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Serial/Key</th>
                ${!isSoftware ? '<th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Device Type</th>' : ''}
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Make & Model</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Assign Date</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Valid Date</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Remark</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Status</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Assign NAME</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Emp ID</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: center;">Actions</th>
            </tr>
        `;

        const response = await fetch('http://localhost:5000/api/assets' + window.getOwnershipQuery());
        const assets = await response.json();

        let filtered = assets;
        if (category === 'In Use') filtered = assets.filter(a => a.status === 'In Use');
        if (category === 'In Stock') filtered = assets.filter(a => a.status === 'In Stock');
        if (category === 'Repair') filtered = assets.filter(a => a.status === 'Under Repair' || a.status === 'Damage' || a.status === 'Damaged');
        if (category === 'Software') filtered = assets.filter(a => (a.deviceType || '').toLowerCase().includes('software') || (a.category || '').toLowerCase().includes('software'));
        if (category === 'Monitors') filtered = assets.filter(a => (a.deviceType || '').toLowerCase() === 'monitor');
        if (category === 'Mouse') filtered = assets.filter(a => (a.deviceType || '').toLowerCase() === 'mouse');
        if (category === 'Keyboard') filtered = assets.filter(a => (a.deviceType || '').toLowerCase() === 'keyboard');

        if (filterSearch) {
            filtered = filtered.filter(a => {
                return (a.assetTagNumber || '').toLowerCase().includes(filterSearch) ||
                    (a.serialNumber || '').toLowerCase().includes(filterSearch) ||
                    (a.make || '').toLowerCase().includes(filterSearch) ||
                    (a.model || '').toLowerCase().includes(filterSearch) ||
                    (a.assignedToName || '').toLowerCase().includes(filterSearch) ||
                    (a.employeeId || '').toLowerCase().includes(filterSearch);
            });
        }

        if (filterDay || filterMonth || filterYear) {
            filtered = filtered.filter(a => {
                if (!a.createdAt) return false;
                const date = new Date(a.createdAt);
                let match = true;
                if (filterYear && date.getFullYear().toString() !== filterYear) match = false;
                if (filterMonth && date.getMonth().toString() !== filterMonth) match = false;
                if (filterDay && date.getDate().toString() !== filterDay) match = false;
                return match;
            });
        }
        
        window.currentKpiFilteredData = filtered;

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 30px; color: #94a3b8; font-style: italic;">No assets found for this category.</td></tr>';
            return;
        }

        filtered.forEach(asset => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';
            let statusClass = 'in-stock';
            if (asset.status === 'In Use') statusClass = 'in-use';
            if (asset.status === 'Under Repair') statusClass = 'under-repair';

            tr.innerHTML = `
                <td style="padding: 12px 16px;">${asset.srNo || '-'}</td>
                <td style="padding: 12px 16px;"><strong>${asset.assetTagNumber || '-'}</strong></td>
                <td style="padding: 12px 16px;">${asset.serialNumber || '-'}</td>
                ${!isSoftware ? `<td style="padding: 12px 16px;">${asset.deviceType || '-'}</td>` : ''}
                <td style="padding: 12px 16px;">${asset.make || ''} ${asset.model || ''}</td>
                <td style="padding: 12px 16px;">${asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '-'}</td>
                <td style="padding: 12px 16px;">${asset.warrantyEndDate ? new Date(asset.warrantyEndDate).toLocaleDateString() : '-'}</td>
                <td style="padding: 12px 16px;">${asset.remark || '-'}</td>
                <td style="padding: 12px 16px;"><span class="status-badge ${statusClass}">${asset.status || '-'}</span></td>
                <td style="padding: 12px 16px; color: var(--text-main); font-weight: 500;"><i class="fa-solid fa-user-circle" style="color: #cbd5e1; margin-right: 5px;"></i>${asset.assignedToName || 'Unassigned'}</td>
                <td style="padding: 12px 16px;">${asset.employeeId || '-'}</td>
                <td style="padding: 12px 16px;">
                    <button onclick="openEditModal('${asset._id}')" style="background:none;border:none;color:var(--primary);cursor:pointer;margin-right:12px;font-size:1.1rem;transition:0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteAsset('${asset._id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;transition:0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error fetching KPI data:', error);
        showToast('Database loading failed. Is the backend running?', 'error');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color: #ef4444;">Failed to load data.</td></tr>';
    }
}

window.applyKpiFilters = function () {
    if (window.currentKpiCategory) {
        openKpiModal(window.currentKpiCategory);
    }
};

window.clearKpiFilters = function () {
    if (document.getElementById('kpi-filter-day')) document.getElementById('kpi-filter-day').value = '';
    if (document.getElementById('kpi-filter-month')) document.getElementById('kpi-filter-month').value = '';
    if (document.getElementById('kpi-filter-year')) document.getElementById('kpi-filter-year').value = '';
    if (document.getElementById('kpi-filter-device')) document.getElementById('kpi-filter-device').value = '';
    if (document.getElementById('kpi-filter-search')) document.getElementById('kpi-filter-search').value = '';
    if (window.currentKpiCategory) {
        openKpiModal(window.currentKpiCategory);
    }
};

window.closeKpiModal = function () {
    const modal = document.getElementById('kpi-modal');
    modal.style.opacity = '0';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    // Clear filters when closing
    if (document.getElementById('kpi-filter-day')) document.getElementById('kpi-filter-day').value = '';
    if (document.getElementById('kpi-filter-month')) document.getElementById('kpi-filter-month').value = '';
    if (document.getElementById('kpi-filter-device')) document.getElementById('kpi-filter-device').value = '';
    if (document.getElementById('kpi-filter-search')) document.getElementById('kpi-filter-search').value = '';
}

// ==========================================
// PROFILE MODAL LOGIC
// ==========================================
async function openProfileModal() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/profile', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById('prof-name').value = data.name || '';
            document.getElementById('prof-email').value = data.email || '';
            document.getElementById('prof-phone').value = data.phone || '';
            document.getElementById('prof-empId').value = data.employeeId || '';
        }
    } catch (err) {
        console.error('Error fetching profile:', err);
    }
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'flex';
    void modal.offsetWidth; // Reflow
    modal.style.opacity = '1';
    modal.querySelector('.modal-content').style.transform = 'scale(1)';
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    modal.style.opacity = '0';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

async function submitProfileForm(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const profileData = {
        name: document.getElementById('prof-name').value.trim(),
        email: document.getElementById('prof-email').value.trim(),
        phone: document.getElementById('prof-phone').value.trim(),
        employeeId: document.getElementById('prof-empId').value.trim()
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(profileData)
        });

        if (response.ok) {
            const data = await response.json();
            showToast('Profile updated successfully!', 'success');

            // Update UI headers
            const nameEl = document.getElementById('user-name');
            const avatarEl = document.getElementById('user-avatar');
            if (nameEl) nameEl.textContent = data.name;
            if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=A855F7&color=fff`;

            // Update localStorage to keep it in sync if user refreshes
            let lsUser = localStorage.getItem('user');
            if (lsUser) {
                lsUser = JSON.parse(lsUser);
                lsUser.name = data.name;
                lsUser.email = data.email;
                localStorage.setItem('user', JSON.stringify(lsUser));
            }

            closeProfileModal();
        } else {
            const errData = await response.json();
            showToast(errData.message || 'Failed to update profile', 'error');
        }
    } catch (err) {
        console.error('Error updating profile:', err);
        showToast('Server error while saving profile', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// ASSET CRUD LOGIC (EDIT & DELETE)
// ==========================================

window.deleteAsset = async function (id) {
    const result = await Swal.fire({
        title: 'Are you absolutely sure?',
        text: 'Are you absolutely sure you want to delete this asset from the database? This cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!',
        background: '#1e293b',
        color: '#f8fafc',
        backdrop: `rgba(0,0,0,0.4)`
    });
    if (!result.isConfirmed) {
        return;
    }

    try {
        const response = await fetch('http://localhost:5000/api/assets/' + id, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Asset successfully deleted from database.', 'success');
            fetchReportsData(); // Refresh the table
            if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
            if (document.getElementById('kpi-modal') && document.getElementById('kpi-modal').style.display === 'flex') {
                openKpiModal(window.currentKpiCategory);
            }
        } else {
            showToast('Failed to delete asset.', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Could not connect to the server.', 'error');
    }
}

window.openEditModal = async function (id) {
    try {
        // Fetch asset data to populate form
        const response = await fetch('http://localhost:5000/api/assets' + window.getOwnershipQuery());
        const assets = await response.json();
        const asset = assets.find(a => a._id === id);

        if (!asset) {
            showToast('Asset not found.', 'error');
            return;
        }

        document.getElementById('edit-asset-id').value = asset._id;
        document.getElementById('edit-assetTagNumber').value = asset.assetTagNumber || '';
        document.getElementById('edit-serialNumber').value = asset.serialNumber || '';
        // Combine Make and Model into the single edit-make field
        const combinedMakeModel = `${asset.make || ''} ${asset.model || ''}`.trim();
        document.getElementById('edit-make').value = combinedMakeModel;
        document.getElementById('edit-model').value = '';
        document.getElementById('edit-assignedToName').value = asset.assignedToName || '';
        document.getElementById('edit-employeeId').value = asset.employeeId || '';
        document.getElementById('edit-assignedBy').value = asset.assignedBy || '';
        document.getElementById('edit-status').value = asset.status || 'In Stock';

        if (asset.warrantyEndDate) {
            document.getElementById('edit-warrantyEndDate').value = new Date(asset.warrantyEndDate).toISOString().split('T')[0];
        } else {
            document.getElementById('edit-warrantyEndDate').value = '';
        }

        const modal = document.getElementById('edit-asset-modal');
        modal.style.display = 'flex';
        void modal.offsetWidth; // Reflow
        modal.style.opacity = '1';
        modal.querySelector('.modal-content').style.transform = 'scale(1)';

    } catch (error) {
        console.error('Error fetching asset:', error);
        showToast('Failed to load asset details.', 'error');
    }
}

window.closeEditModal = function () {
    const modal = document.getElementById('edit-asset-modal');
    modal.style.opacity = '0';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

window.submitEditForm = async function (e) {
    e.preventDefault();

    const id = document.getElementById('edit-asset-id').value;
    const updatedData = {
        assetTagNumber: document.getElementById('edit-assetTagNumber').value.trim(),
        serialNumber: document.getElementById('edit-serialNumber').value.trim(),
        make: document.getElementById('edit-make').value.trim(),
        model: document.getElementById('edit-model').value.trim(),
        status: document.getElementById('edit-status').value,
        assignedToName: document.getElementById('edit-assignedToName') ? document.getElementById('edit-assignedToName').value.trim() : '',
        employeeId: document.getElementById('edit-employeeId') ? document.getElementById('edit-employeeId').value.trim() : '',
        assignedBy: document.getElementById('edit-assignedBy') ? document.getElementById('edit-assignedBy').value.trim() : '',
        warrantyEndDate: document.getElementById('edit-warrantyEndDate').value || undefined
    };

    try {
        const response = await fetch('http://localhost:5000/api/assets/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            showToast('Asset updated successfully!', 'success');
            closeEditModal();
            fetchReportsData(); // Refresh table
            if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
            if (document.getElementById('kpi-modal') && document.getElementById('kpi-modal').style.display === 'flex') {
                openKpiModal(window.currentKpiCategory);
            }
        } else {
            const err = await response.json();
            showToast('Error updating asset: ' + err.message, 'error');
        }
    } catch (error) {
        console.error('Update error:', error);
        showToast('Could not connect to the server.', 'error');
    }
};

// ==========================================
// EXPORT LOGIC
// ==========================================

// ====== IMPORT EXCEL LOGIC ====== //
window.importExcelFile = async function (input) {
    const file = input.files[0];
    if (!file) return;

    // Create loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'import-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.7);backdrop-filter:blur(8px);z-index:999999;display:flex;justify-content:center;align-items:center;opacity:0;transition:opacity 0.3s;';
    overlay.innerHTML = `
        <div style="background:rgba(255,255,255,0.95);padding:40px;border-radius:20px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.3);max-width:400px;width:90%;">
            <div style="width:60px;height:60px;margin:0 auto 20px;border:4px solid #e2e8f0;border-top-color:#e74c3c;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <h3 style="margin:0 0 8px;color:#0f172a;font-size:1.2rem;">Importing Excel File...</h3>
            <p style="margin:0;color:#64748b;font-size:0.9rem;">${file.name}</p>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:0.8rem;">This may take a moment for large files</p>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = '1');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://localhost:5000/api/assets/import', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Remove loading overlay
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);

        // Build sheet results HTML
        let sheetsHtml = '';
        if (result.sheetResults) {
            sheetsHtml = '<div class="res-scroll">';
            sheetsHtml += '<p class="res-scroll-title">Detailed Breakdown (Laptops, Monitors, Software, etc):</p>';
            for (const [name, info] of Object.entries(result.sheetResults)) {
                const icon = info.status === 'skipped' ? '⚠️' : '✅';
                const detail = info.status === 'skipped' ? info.reason : `${info.rows} rows parsed`;
                let extra = '';
                if (info.skippedReasons && info.skippedReasons.length > 0) {
                    extra = `<div class="res-scroll-item-error">Skipped rows due to: ${info.skippedReasons.join(', ')}</div>`;
                }
                sheetsHtml += `<div class="res-scroll-item">
                    <div class="res-scroll-item-header">
                        <span>${icon} ${name}</span>
                        <span class="res-scroll-item-detail">${detail}</span>
                    </div>
                    ${extra}
                </div>`;
            }
            sheetsHtml += '</div>';
        }

        // Show result modal
        const resultModal = document.createElement('div');
        resultModal.className = 'res-modal-backdrop';
        resultModal.innerHTML = `
            <div class="res-modal">
                <span class="res-modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <div class="res-header">
                    <div class="res-icon ${response.ok ? 'success' : 'error'}">
                        <i class="fa-solid ${response.ok ? 'fa-check' : 'fa-xmark'}"></i>
                    </div>
                    <h2 class="res-title">${response.ok ? 'Import Successful!' : 'Import Failed'}</h2>
                    <p class="res-msg">${result.message}</p>
                </div>
                ${response.ok ? `
                <div class="res-grid">
                    <div class="res-stat imported">
                        <div class="num">${result.imported || 0}</div>
                        <div class="lbl">Imported</div>
                    </div>
                    <div class="res-stat skipped">
                        <div class="num">${result.skipped || 0}</div>
                        <div class="lbl">Skipped</div>
                    </div>
                    <div class="res-stat failed">
                        <div class="num">${result.failed || 0}</div>
                        <div class="lbl">Failed</div>
                    </div>
                </div>
                ${sheetsHtml}
                ` : ''}
                <div class="res-footer">
                    <button class="res-btn" onclick="this.parentElement.parentElement.parentElement.remove(); if(typeof fetchReportsData === 'function') fetchReportsData(); if(typeof fetchDashboardStats === 'function') fetchDashboardStats(); if(typeof loadWarrantyData === 'function') loadWarrantyData();">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(resultModal);

        // Reset file input
        input.value = '';

    } catch (err) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
        alert('Import failed: ' + err.message);
        input.value = '';
    }
};

window.openExportModal = function () {
    const modal = document.getElementById('export-modal');
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.style.opacity = '1';
    modal.querySelector('.modal-content').style.transform = 'scale(1)';
};

window.closeExportModal = function () {
    const modal = document.getElementById('export-modal');
    modal.style.opacity = '0';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

window.exportData = async function (type) {
    showToast('Preparing export for ' + type + '...', 'info');
    try {
        let endpoint = 'http://localhost:5000/api/' + type;
        const response = await fetch('' + endpoint);

        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            showToast('No data available to export.', 'error');
            return;
        }

        // Convert json to csv
        const headers = Object.keys(data[0]).filter(k => k !== '__v' && k !== '_id');
        const csvRows = [];
        csvRows.push(headers.join(','));

        for (const row of data) {
            const values = headers.map(header => {
                const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', type + '_export.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast('Export successful!', 'success');
        closeExportModal();

    } catch (err) {
        console.error(err);
        showToast('Export failed. Data might not be available.', 'error');
    }
};
// --- AUTH.JS MERGED CONTENT ---
var API_URL = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('auth.html') || window.location.pathname.endsWith('/frontend/') || window.location.pathname.endsWith('/frontend')) {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'index.html';
        }
    }
});

window.switchTab = function (tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const subtitle = document.getElementById('auth-subtitle');
    const alertMsg = document.getElementById('alert-message');

    if (!loginForm) return;
    alertMsg.style.display = 'none';

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        btnLogin.classList.add('active');
        btnRegister.classList.remove('active');
        subtitle.textContent = 'Sign in to continue';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        btnLogin.classList.remove('active');
        btnRegister.classList.add('active');
        subtitle.textContent = 'Create a new account';
    }
}

window.togglePasswordVisibility = function (inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    } else {
        input.type = 'password';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    }
}

window.showAlert = function (message, type = 'error') {
    if (type === 'error' || type === 'warning') {
        const audio = new Audio('freesound_community-beep-warning-6387.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
    const alertBox = document.getElementById('alert-message');
    if (alertBox) {
        alertBox.textContent = message;
        alertBox.className = "alert-message " + type;
        alertBox.style.display = 'block';
    }
}

window.validateEmailRealtime = function (email) {
    const icon = document.getElementById('email-valid-icon');
    if (!icon) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
        icon.style.display = 'block';
    } else {
        icon.style.display = 'none';
    }
}

window.validatePasswordRealtime = function (password) {
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('login-submit');

            btn.disabled = true;
            btn.innerHTML = '<span>Logging in...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(API_URL + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = 'index.html';
                } else {
                    window.showAlert(data.message || 'Login failed');
                }
            } catch (err) {
                window.showAlert('Cannot connect to server.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Login</span> <i class="fa-solid fa-arrow-right"></i>';
            }
        });
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const role = document.getElementById('register-role').value;
            const password = document.getElementById('register-password').value;
            const btn = document.getElementById('register-submit');

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                window.showAlert('Please enter a valid email address.');
                return;
            }
            if (password.length < 6) {
                window.showAlert('Password must be at least 6 characters.');
                return;
            }
            if (!role) {
                window.showAlert('Please select a role.');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span>Registering...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(API_URL + '/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, role, password })
                });

                const data = await response.json();

                if (response.ok) {
                    window.showAlert('Registration successful! Logging in...', 'success');
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1000);
                } else {
                    window.showAlert(data.message || 'Registration failed');
                }
            } catch (err) {
                window.showAlert('Cannot connect to server.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Register Account</span> <i class="fa-solid fa-arrow-right"></i>';
            }
        });
    }
});

// --- Interactive Ambient Background Logic ---
document.addEventListener("DOMContentLoaded", () => {
    const ambientBg = document.getElementById("ambient-bg");
    if (ambientBg) {
        document.addEventListener("mousemove", (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            ambientBg.style.backgroundImage = `radial-gradient(circle at ${x}% ${y}%, rgba(225, 29, 72, 0.20) 0%, rgba(255, 255, 255, 0) 60%)`;
        });
    }
});


// --- Interactive Ambient Background Logic ---
document.addEventListener("DOMContentLoaded", () => {
    const ambientBg = document.getElementById("ambient-bg");
    if (ambientBg) {
        document.addEventListener("mousemove", (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            ambientBg.style.backgroundImage = `radial-gradient(circle at ${x}% ${y}%, rgba(225, 29, 72, 0.20) 0%, rgba(255, 255, 255, 0) 60%)`;
        });
    }
});

// ====== QUICK ALLOCATIONS (MOUSE & KEYBOARD) ======
window.submitQuickAllocation = async function (type) {
    const prefix = type.toLowerCase();
    const serial = document.getElementById(prefix + '-serial').value;
    const empId = document.getElementById(prefix + '-emp-id').value;
    const empName = document.getElementById(prefix + '-emp-name').value;
    const assetName = document.getElementById(prefix + '-asset-name').value;
    const assetSerial = document.getElementById(prefix + '-asset-serial').value;
    const remark = document.getElementById(prefix + '-remark').value;

    if (!serial || !empId || !empName) {
        window.showAlert('Please fill all required fields (Serial Number, Employee ID, Employee Name)', 'error');
        return;
    }

    const payload = {
        deviceType: type,
        serialNumber: serial,
        employeeId: empId,
        employeeName: empName,
        assetName: assetName,
        assetSerialNumber: assetSerial,
        remark: remark
    };

    try {
        const response = await fetch(API_URL + '/quick-allocations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            window.showToast(type + ' allocated successfully!', 'success');
            document.getElementById(prefix + '-assign-form').reset();
        } else {
            const data = await response.json();
            window.showAlert(data.message || 'Failed to allocate', 'error');
        }
    } catch (err) {
        window.showAlert('Cannot connect to server.', 'error');
    }
};


window.openModal = function (id) { const modal = document.getElementById(id); if (modal) { modal.style.display = 'flex'; void modal.offsetWidth; modal.style.opacity = '1'; const content = modal.querySelector('.modal-content'); if (content) content.style.transform = 'scale(1)'; } };
window.closeModal = function (id) { const modal = document.getElementById(id); if (modal) { modal.style.opacity = '0'; const content = modal.querySelector('.modal-content'); if (content) content.style.transform = 'scale(0.95)'; setTimeout(() => modal.style.display = 'none', 300); } };

window.exportKpiData = function () {
    const data = window.currentKpiFilteredData;
    if (!data || data.length === 0) {
        if(window.showToast) window.showToast('No data available to export.', 'warning');
        return;
    }

    let headers = [];
    if (window.currentKpiCategory === 'Allocations') {
        headers = ['Employee Name', 'Asset Tag Number', 'Assign Date', 'Expected Return Date', 'Issue Notes'];
    } else if (window.currentKpiCategory === 'Returns') {
        headers = ['Asset Tag Number', 'Returned By', 'Return Date', 'Device Condition', 'Penalty Amount', 'Notes'];
    } else {
        headers = ['SR No', 'Asset Tag', 'Serial/Key', 'Device Type', 'Make & Model', 'Purchase Date', 'Warranty End', 'Remark', 'Status', 'Assign Name', 'Employee ID'];
    }

    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    data.forEach(item => {
        let row = [];
        if (window.currentKpiCategory === 'Allocations') {
            row = [
                item.employeeName || '',
                item.assetTagNumber || '',
                item.assignDate ? new Date(item.assignDate).toLocaleDateString() : '',
                item.expectedReturnDate ? new Date(item.expectedReturnDate).toLocaleDateString() : '',
                item.issueNotes || ''
            ];
        } else if (window.currentKpiCategory === 'Returns') {
            row = [
                item.assetTagNumber || '',
                item.employeeName || '',
                item.returnDate ? new Date(item.returnDate).toLocaleDateString() : '',
                item.deviceCondition || '',
                item.penaltyAmount || '',
                item.notes || ''
            ];
        } else {
            row = [
                item.srNo || '',
                item.assetTagNumber || '',
                item.serialNumber || '',
                item.deviceType || '',
                (item.make || '') + ' ' + (item.model || ''),
                item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : '',
                item.warrantyEndDate ? new Date(item.warrantyEndDate).toLocaleDateString() : '',
                item.remark || '',
                item.status || '',
                item.assignedToName || '',
                item.employeeId || ''
            ];
        }

        let rowStr = row.map(cell => {
            let cellStr = String(cell).replace(/"/g, '""');
            if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
                cellStr = '"' + cellStr + '"';
            }
            return cellStr;
        }).join(",");
        
        csvContent += rowStr + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = (window.currentKpiCategory || 'Export') + '_Assets_' + new Date().toISOString().split('T')[0] + '.csv';
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportReportsToPDF = function() {
    const data = window.currentReportsFilteredData;
    if (!data || data.length === 0) {
        if(window.showToast) window.showToast('No data available to export.', 'warning');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        if(window.showToast) window.showToast('PDF Library not loaded yet. Please wait a moment.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Asset Inventory Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("Generated on: " + new Date().toLocaleString(), 14, 30);

    const headers = [['SR No', 'Asset Tag', 'Serial/Key', 'Device Type', 'Make & Model', 'Assign Date', 'Valid Date', 'Remark', 'Status', 'Assign Name', 'Emp ID']];
    const body = data.map(item => [
        item.srNo || '-',
        item.assetTagNumber || '-',
        item.serialNumber || '-',
        item.deviceType || '-',
        (item.make || '') + ' ' + (item.model || ''),
        item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : '-',
        item.warrantyEndDate ? new Date(item.warrantyEndDate).toLocaleDateString() : '-',
        item.remark || '-',
        item.status || '-',
        item.assignedToName || 'Unassigned',
        item.employeeId || '-'
    ]);

    doc.autoTable({
        head: headers,
        body: body,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 35 }
    });

    const filename = 'Asset_Report_' + new Date().toISOString().split('T')[0] + '.pdf';
    doc.save(filename);
};

