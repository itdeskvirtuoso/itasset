// ==========================================
// SPA ROUTER LOGIC
// ==========================================

// Global Smart Cache for Fetch API
(function() {
    const originalFetch = window.fetch;
    const cache = new Map();
    const CACHE_TTL = 60000; // 60 seconds

    // Every call to our API carries the signed-in user's token; a rejected session signs out
    let signingOut = false;

    function withAuth(options) {
        let token = null;
        try { token = localStorage.getItem('token'); } catch (e) { /* storage blocked */ }
        if (!token) return options;
        const headers = new Headers(options.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        return Object.assign({}, options, { headers });
    }

    function watchSession(url, response) {
        if (signingOut || url.includes('/auth/login')) return response;
        if (response.status === 401) {
            signingOut = true;
            logoutUser();
        } else if (response.status === 403) {
            response.clone().json().then((data) => {
                if (data && data.code === 'ACCOUNT_BLOCKED' && !signingOut) {
                    signingOut = true;
                    logoutUser();
                }
            }).catch(() => { });
        }
        return response;
    }

    window.fetch = async function(url, options = {}) {
        if (typeof url === 'string' && url.includes('/api/')) {
            const authed = withAuth(options);
            return watchSession(url, await cachedFetch(url, authed));
        }
        return originalFetch(url, options);
    };

    async function cachedFetch(url, options) {
        const isGet = !options.method || options.method.toUpperCase() === 'GET';
        const noCache = options.cache === 'no-store' || (typeof url === 'string' && url.includes('_t='));
        
        // If it's a GET request to our API, use cache
        if (isGet && !noCache && typeof url === 'string' && url.includes('/api/')) {
            const cacheKey = url;
            const cached = cache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.response.clone(); // Return cached response
            }
            
            const response = await originalFetch(url, options);
            if (response.ok) {
                cache.set(cacheKey, {
                    response: response.clone(),
                    timestamp: Date.now()
                });
            }
            return response;
        }
        
        // If it's a mutation (POST, PUT, DELETE), clear the cache
        if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
            cache.clear();
        }
        
        return originalFetch(url, options);
    }
})();

// Escape text before it goes into innerHTML (database values can contain markup)
function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Best message for a failed API call: the server's own explanation when it sent one
async function apiErrorMessage(response, fallback) {
    try {
        const data = await response.clone().json();
        if (data && data.message) return data.message;
    } catch (e) { /* not JSON */ }
    return fallback;
}

function currentUserRole() {
    try {
        return (JSON.parse(localStorage.getItem('user')) || {}).role || '';
    } catch (e) {
        return '';
    }
}

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
        if (assignedByInput) {
            assignedByInput.value = user.username;
        }

        fetch(API_URL + '/roles')
            .then(res => res.json())
            .then(roles => {
                const roleObj = roles.find(r => r.name === user.role);
                const allowedPages = roleObj ? roleObj.permissions : ['index.html'];

                // Map hash to html page name for permission checking
                let pageName = hash.substring(1) + '.html';
                if (hash === '#index') pageName = 'index.html';

                // Check if they are allowed to access this route
                if (!allowedPages.includes(pageName) && !allowedPages.includes('*')) {
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
                        if (!allowedPages.includes(linkPage) && !allowedPages.includes('*')) {
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
    // Visual styling lives in components.css (.toast / .toast-{type})
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

// Header search. The dropdown is moved to <body> and positioned under the
// search bar so the header's clipping can never hide it.
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search-input');
    const dropdown = document.getElementById('global-search-results');
    if (!searchInput || !dropdown) return;

    document.body.appendChild(dropdown);
    dropdown.setAttribute('role', 'listbox');
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('spellcheck', 'false');

    let debounceTimer;
    let searchSeq = 0; // drops responses that arrive after a newer query
    let results = [];
    let activeIndex = -1;
    let lastQuery = '';

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const mark = (v, q) => {
        const text = String(v == null ? '' : v);
        const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
        if (i < 0) return esc(text);
        return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    };
    const statusClass = (s) => (s || 'unknown').toLowerCase().replace(/\s+/g, '-');

    function position() {
        const bar = searchInput.closest('.search-bar') || searchInput;
        const rect = bar.getBoundingClientRect();
        const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-zoom')) || 1;
        const vw = window.innerWidth;
        const width = Math.min(Math.max(rect.width, 440), vw - 16);
        let left = rect.right - width; // right-align with the search bar
        if (left < 8) left = 8;
        if (left + width > vw - 8) left = vw - 8 - width;
        // The dropdown is zoomed like the app, so its CSS pixels are scaled by `zoom`
        dropdown.style.width = (width / zoom) + 'px';
        dropdown.style.left = (left / zoom) + 'px';
        dropdown.style.top = ((rect.bottom + 6) / zoom) + 'px';
    }

    function open() {
        position();
        dropdown.classList.add('show');
        searchInput.setAttribute('aria-expanded', 'true');
    }

    function close() {
        dropdown.classList.remove('show');
        searchInput.setAttribute('aria-expanded', 'false');
        activeIndex = -1;
    }

    function setActive(index) {
        const items = dropdown.querySelectorAll('.search-result-item');
        if (!items.length) return;
        activeIndex = (index + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function openInReports(query) {
        close();
        searchInput.blur();
        const reportsSearch = document.getElementById('reports-search');
        if (reportsSearch) reportsSearch.value = query;
        if (window.location.hash === '#reports') {
            if (typeof renderReports === 'function') renderReports();
        } else {
            window.location.hash = '#reports'; // router loads the data and applies the search
        }
    }

    function choose(asset) {
        if (!asset) return;
        const perms = window.userPermissions || [];
        const canEdit = perms.includes('*') || perms.includes('edit_asset');
        if (canEdit && typeof window.openEditModal === 'function') {
            close();
            searchInput.blur();
            window.openEditModal(asset._id);
        } else {
            openInReports(asset.assetTagNumber || lastQuery);
        }
    }

    function render(message) {
        const q = lastQuery;
        let body;
        if (message) {
            body = '<div class="search-dropdown-empty">' + message + '</div>';
        } else if (!results.length) {
            body = '<div class="search-dropdown-empty"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px;"></i>No assets or software match “' + esc(q) + '”.</div>';
        } else {
            body = '<div class="search-dropdown-list">' + results.map((a, i) => {
                const makeModel = [a.make, a.model && a.model !== a.make ? a.model : ''].filter(Boolean).join(' ');
                const meta = [];
                if (a.serialNumber && a.serialNumber !== a.assetTagNumber) meta.push('S/N ' + mark(a.serialNumber, q));
                if (makeModel) meta.push(mark(makeModel, q));
                const who = [];
                if (a.assignedToName) who.push('<i class="fa-solid fa-user" style="margin-right:4px;"></i>' + mark(a.assignedToName, q));
                if (a.employeeId) who.push('Emp ID ' + mark(a.employeeId, q));
                return '<div class="search-result-item" role="option" data-index="' + i + '">' +
                    '<div class="search-result-info">' +
                    '<h4>' + mark(a.assetTagNumber || 'N/A', q) + ' <small>' + mark(a.deviceType || 'Unknown', q) + '</small></h4>' +
                    (meta.length ? '<p>' + meta.join(' · ') + '</p>' : '') +
                    (who.length ? '<p>' + who.join(' · ') + '</p>' : '') +
                    '</div>' +
                    '<span class="status-badge ' + statusClass(a.status) + '">' + esc(a.status || 'Unknown') + '</span>' +
                    '</div>';
            }).join('') + '</div>';
        }

        const head = results.length && !message
            ? '<div class="search-dropdown-head">' + (results.length >= 10 ? 'Top 10 matches' : results.length + (results.length === 1 ? ' match' : ' matches')) + '</div>'
            : '';
        const foot = q && !message
            ? '<div class="search-dropdown-foot"><span>↑↓ to move · Enter to open · Esc to close</span>' +
              '<button type="button" data-action="reports">See all in Reports <i class="fa-solid fa-arrow-right"></i></button></div>'
            : '';
        dropdown.innerHTML = head + body + foot;
        activeIndex = -1;
        open();
    }

    async function runSearch(query) {
        const seq = ++searchSeq;
        lastQuery = query;
        render('<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i>Searching…');
        try {
            const ownership = window.getOwnershipQuery(true);
            const response = await fetch(API_URL + '/assets/search' + ownership + (ownership ? '&q=' : '?q=') + encodeURIComponent(query));
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            if (seq !== searchSeq) return;
            results = Array.isArray(data) ? data : [];
            render();
        } catch (err) {
            if (seq !== searchSeq) return;
            console.error(err);
            results = [];
            render('<span style="color:#dc2626;">Search is unavailable. Is the backend running?</span>');
        }
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        if (query.length < 2) {
            searchSeq++;
            results = [];
            lastQuery = '';
            close();
            return;
        }
        debounceTimer = setTimeout(() => runSearch(query), 250);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2 && dropdown.innerHTML) open();
    });

    searchInput.addEventListener('keydown', (e) => {
        const visible = dropdown.classList.contains('show');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!visible && searchInput.value.trim().length >= 2) open();
            setActive(activeIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(activeIndex - 1);
        } else if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (!query) return;
            e.preventDefault();
            clearTimeout(debounceTimer);
            if (activeIndex >= 0) choose(results[activeIndex]);
            else if (results.length === 1 && lastQuery === query) choose(results[0]);
            else openInReports(query);
        } else if (e.key === 'Escape') {
            if (visible) {
                e.preventDefault();
                close();
            } else if (searchInput.value) {
                searchInput.value = '';
            }
        }
    });

    // mousedown (not click) so the input's blur doesn't close the list first
    dropdown.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.target.closest('[data-action="reports"]')) {
            openInReports(searchInput.value.trim() || lastQuery);
            return;
        }
        const item = e.target.closest('.search-result-item');
        if (item) choose(results[Number(item.dataset.index)]);
    });

    dropdown.addEventListener('mousemove', (e) => {
        const item = e.target.closest('.search-result-item');
        if (item && Number(item.dataset.index) !== activeIndex) setActive(Number(item.dataset.index));
    });

    document.addEventListener('mousedown', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) close();
    });

    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('show')) position();
    });
    window.addEventListener('hashchange', close);
});

// ====== EDIT & DELETE ALLOCATIONS ====== //
// Closes any edit modal; without an id it closes the asset editor
window.closeEditModal = function (modalId) {
    const modal = document.getElementById(modalId || 'edit-asset-modal');
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
        const res = await fetch(`${API_URL}/allocations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Error updating allocation'));

        closeEditModal('editAllocationModal');
        showToast('Allocation updated successfully', 'success');
        fetchAllocations();
        if (typeof fetchDashboardStats === 'function') fetchDashboardStats();

        // Also refresh KPI modal if it's open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Allocations') {
            openKpiModal('Allocations');
        }
    } catch (err) {
        showToast(err.message || 'Error updating allocation', 'error');
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
        const res = await fetch(`${API_URL}/allocations/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Error deleting allocation'));
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'Allocation deleted successfully', 'success');
        fetchAllocations();
        if (typeof fetchDashboardStats === 'function') fetchDashboardStats();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Allocations') {
            openKpiModal('Allocations');
        }
    } catch (err) {
        showToast(err.message || 'Error deleting allocation', 'error');
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
        const res = await fetch(`${API_URL}/returns/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Error updating return record'));

        closeEditModal('editReturnModal');
        showToast('Return record updated successfully', 'success');
        fetchReturns();
        if (typeof fetchDashboardStats === 'function') fetchDashboardStats();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Returns') {
            openKpiModal('Returns');
        }
    } catch (err) {
        showToast(err.message || 'Error updating return record', 'error');
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
        const res = await fetch(`${API_URL}/returns/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Error deleting return record'));
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'Return deleted successfully', 'success');
        fetchReturns();
        if (typeof fetchDashboardStats === 'function') fetchDashboardStats();

        // Refresh KPI modal if open
        const kpiModal = document.getElementById('kpi-modal');
        if (kpiModal && kpiModal.style.display === 'flex' && window.currentKpiCategory === 'Returns') {
            openKpiModal('Returns');
        }
    } catch (err) {
        showToast(err.message || 'Error deleting return record', 'error');
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

    // Re-check the session against the database: an expired token or a deleted /
    // blocked user is signed out; otherwise the header + sidebar show the user's
    // current database record. Network errors keep the session as it is.
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: 'Bearer ' + token } })
        .then((res) => {
            if (res.status === 401 || res.status === 403) {
                logoutUser();
                return null;
            }
            return res.ok ? res.json() : null;
        })
        .then((data) => {
            if (!data || !data.user) return;
            let saved = {};
            try { saved = JSON.parse(userStr) || {}; } catch (e) { /* replaced below */ }
            localStorage.setItem('user', JSON.stringify(Object.assign(saved, data.user)));
            renderSignedInUser(data.user);
        })
        .catch(() => { });

    // Set User Details in UI on the current page
    try {
        const user = JSON.parse(userStr);
        renderSignedInUser(user);

        // Fetch Role-Based Access Control (RBAC) dynamically
        const userRole = user.role;

        // Fetch role permissions from backend
        fetch(`${API_URL}/roles?_t=${Date.now()}`)
            .then(res => res.json())
            .then(roles => {
                const roleObj = roles.find(r => r.name === userRole);
                const allowedPages = roleObj ? roleObj.permissions : ['index.html'];
                window.userPermissions = allowedPages;

                // Asset Master save and Excel import both add assets
                const canAddAssets = allowedPages.includes('*') || allowedPages.includes('assets.html');
                const saveAssetBtn = document.getElementById('save-asset-btn');
                if (saveAssetBtn) saveAssetBtn.style.display = canAddAssets ? 'inline-block' : 'none';
                const importBtn = document.getElementById('import-excel-btn');
                if (importBtn) importBtn.hidden = !canAddAssets;

                // Hide unauthorized sidebar links (the server enforces the same permissions)
                const navLinks = document.querySelectorAll('.nav-links li a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href')?.substring(1) + '.html'; // e.g. #assets -> assets.html
                    const rawHref = link.getAttribute('href'); // e.g. #assets

                    if (rawHref === '#index') return; // Dashboard always allowed

                    if (href && !allowedPages.includes(href) && !allowedPages.includes('*')) {
                        link.parentElement.style.display = 'none';
                    } else {
                        link.parentElement.style.display = 'block';
                    }
                });
            })
            .catch(err => {
                console.error('Error fetching role permissions:', err);
                // Server unreachable: Super Admin keeps every link, everyone else only the dashboard
                const allowedPages = userRole === 'Super Admin' ? ['*'] : ['index.html'];
                window.userPermissions = allowedPages;

                const navLinks = document.querySelectorAll('.nav-links li a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href')?.substring(1) + '.html';
                    const rawHref = link.getAttribute('href');

                    if (rawHref === '#index') return;

                    if (href && !allowedPages.includes(href) && !allowedPages.includes('*')) {
                        link.parentElement.style.display = 'none';
                    } else {
                        link.parentElement.style.display = 'block';
                    }
                });
            });

    } catch (e) {
        console.error('Error parsing user data:', e);
        // Fallback or force logout if data is corrupted
        logoutUser();
    }
});

// Shows the signed-in user in the sidebar footer and the header chip
function renderSignedInUser(user) {
    if (!user) return;
    const name = user.username || '';
    const role = user.role || '';
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('user-name', name);
    setText('user-role', role);
    setText('hdr-user-name', name);
    setText('hdr-user-initial', name.charAt(0));
    const roleEl = document.getElementById('hdr-user-role');
    if (roleEl) {
        roleEl.textContent = role;
        roleEl.dataset.role = role;
    }
    const chip = document.getElementById('hdr-user');
    if (chip) chip.title = user.employeeId ? `My profile · ${name} (${user.employeeId})` : `My profile · ${name}`;
}

// Logout User globally
function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}


/* --- app.js --- */

// Global Configuration
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';

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

// =======================================================
// DASHBOARD — KPIs + charts, live from /assets/dashboard-stats.
// Charts are created once and updated in place. The dashboard refreshes every
// 30s while it is on screen, when the tab becomes visible again, and right after
// other screens change assets (they call fetchDashboardStats()).
// =======================================================
const DASHBOARD_REFRESH_MS = 30000;
const dashboardCharts = {}; // name -> Chart instance
let dashboardRequest = null; // { query, promise } — collapses duplicate loads
let dashboardLiveStarted = false;

// One palette for every chart, so a status keeps its colour everywhere
const CHART_THEME = {
    text: '#5b6472',
    ink: '#0f172a',
    grid: 'rgba(15, 23, 42, 0.06)',
    font: "'Inter', system-ui, sans-serif",
    series: ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'],
    status: {
        'In Use': '#4f46e5',
        'In Stock': '#10b981',
        'Under Repair': '#f59e0b',
        'Returned': '#0ea5e9',
        'Damaged': '#f97316',
        'Lost': '#ef4444',
        'Scrapped': '#94a3b8'
    },
    added: '#10b981',
    allocated: '#4f46e5',
    returned: '#f59e0b'
};

const CHART_TOOLTIP = {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    titleColor: '#fff',
    bodyColor: '#e2e8f0',
    padding: 10,
    cornerRadius: 10,
    boxPadding: 4,
    usePointStyle: true
};

const fmtCount = (n) => Number(n || 0).toLocaleString('en-IN');
const sharePct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
// "<1%" instead of a misleading "0%" when a non-zero share rounds down
const shareText = (part, whole) => (part > 0 && sharePct(part, whole) === 0 ? '<1%' : `${sharePct(part, whole)}%`);
const sumValues = (values) => (values || []).reduce((total, v) => total + (Number(v) || 0), 0);
const dashText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
};
const dashEscape = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Kept for any older callers; charts now use CHART_THEME
function getChartColors() {
    return { text: CHART_THEME.text, gridColor: CHART_THEME.grid, bg: CHART_THEME.series, border: CHART_THEME.series };
}

// Create the chart once; afterwards swap its data/options and animate the change
function upsertChart(name, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;
    Chart.defaults.font.family = CHART_THEME.font;
    Chart.defaults.color = CHART_THEME.text;

    const existing = dashboardCharts[name];
    if (existing && existing.canvas === canvas) {
        existing.data.labels = config.data.labels;
        config.data.datasets.forEach((dataset, i) => {
            if (existing.data.datasets[i]) Object.assign(existing.data.datasets[i], dataset);
            else existing.data.datasets.push(dataset);
        });
        existing.data.datasets.length = config.data.datasets.length;
        existing.options = config.options;
        existing.update();
        return existing;
    }
    if (existing) existing.destroy();
    dashboardCharts[name] = new Chart(canvas.getContext('2d'), config);
    return dashboardCharts[name];
}

// Initialize Dashboard (also the live refresh entry point)
async function initDashboard({ silent = false } = {}) {
    if (!document.getElementById('kpi-total')) return;
    startDashboardLive();

    const query = window.getOwnershipQuery();
    if (dashboardRequest && dashboardRequest.query === query) return dashboardRequest.promise;

    const promise = loadDashboard(query, silent).finally(() => {
        if (dashboardRequest && dashboardRequest.promise === promise) dashboardRequest = null;
    });
    dashboardRequest = { query, promise };
    return promise;
}

// Other screens call this after adding, allocating or returning an asset
window.fetchDashboardStats = () => initDashboard({ silent: true });

async function loadDashboard(query, silent) {
    if (!silent) {
        const loadingRow = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px; color:var(--primary);"></i>Loading...</td></tr>';
        ['recent-activities-body', 'recent-allocations-body', 'recent-returns-body'].forEach((id) => {
            const body = document.getElementById(id);
            if (body) body.innerHTML = loadingRow;
        });
    }

    try {
        const response = await fetch(`${API_URL}/assets/dashboard-stats${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch dashboard data. Backend may not be connected to DB.');
        const data = await response.json();

        // The ownership filter changed while this was loading; a newer request owns the screen
        if (query !== window.getOwnershipQuery()) return;

        renderDashboardKpis(data);
        try {
            renderDashboardCharts(data);
        } catch (chartErr) {
            console.warn('Charts failed to render, possibly Chart.js is not loaded', chartErr);
        }
        renderRecentActivities(data.recentActivities || []);
        setDashboardLiveStatus(true, data.generatedAt);
    } catch (error) {
        console.error('Backend connection error:', error);
        setDashboardLiveStatus(false);
        if (silent) return; // keep the last good numbers when a background refresh fails

        // Clean empty state if DB fails (No mock data as per user request)
        ['kpi-total', 'kpi-in-use', 'kpi-in-stock', 'kpi-repair', 'kpi-software', 'kpi-returns', 'kpi-allocations'].forEach((id) => dashText(id, 0));
        const recentActBody = document.getElementById('recent-activities-body');
        if (recentActBody) recentActBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Error: ${dashEscape(error.message)}</td></tr>`;
        renderDashboardCharts({ kpis: {}, charts: {} });
    }
}

function renderDashboardKpis(data) {
    const kpis = data.kpis || {};
    const types = (data.charts && data.charts.assetsByDeviceType) || [];
    // Device types arrive grouped case-insensitively from the server
    const typeCount = (...names) => {
        const match = types.find((item) => names.includes((item._id || '').toLowerCase()));
        return match ? match.count : 0;
    };

    dashText('kpi-total', kpis.totalAssets || 0);
    dashText('kpi-in-use', kpis.inUse || 0);
    dashText('kpi-in-stock', kpis.inStock || 0);
    dashText('kpi-repair', kpis.underRepair || 0);
    dashText('kpi-software', typeCount('software'));
    dashText('kpi-monitors', typeCount('monitor', 'monitors'));
    dashText('kpi-mouse', typeCount('mouse'));
    dashText('kpi-keyboard', typeCount('keyboard'));
    dashText('kpi-returns', kpis.returnedAssets || 0);
    dashText('kpi-allocations', kpis.activeAllocations || 0);
}

function renderDashboardCharts(data) {
    const kpis = data.kpis || {};
    const charts = data.charts || {};
    const statuses = charts.assetsByStatus || [];
    const total = kpis.totalAssets || sumValues(statuses.map((s) => s.count));

    renderDeviceTypeChart(charts.assetsByDeviceType || [], total);
    renderStatusChart(statuses, total);
    renderTrendChart(charts.trendData);
    renderUtilizationChart(statuses, kpis);
    renderFlowChart(charts.trendData, kpis);
}

// --- Assets by Device Type: doughnut + clickable legend with counts and shares ---
function renderDeviceTypeChart(types, total) {
    const hasData = types.length > 0;
    const colors = types.map((_, i) => CHART_THEME.series[i % CHART_THEME.series.length]);

    const chart = upsertChart('deviceType', 'deviceTypeChart', {
        type: 'doughnut',
        data: {
            labels: hasData ? types.map((t) => t._id) : ['No data'],
            datasets: [{
                data: hasData ? types.map((t) => t.count) : [1],
                backgroundColor: hasData ? colors : ['#e5e7eb'],
                borderColor: '#fff',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: hasData
                    ? { ...CHART_TOOLTIP, callbacks: { label: (item) => ` ${item.label}: ${fmtCount(item.raw)} (${shareText(item.raw, total)})` } }
                    : { enabled: false }
            }
        }
    });

    const legend = document.getElementById('device-type-legend');
    if (legend) {
        legend.innerHTML = hasData
            ? types.map((t, i) => {
                const merged = (t.variants || []).length > 1 ? ` title="Merged spellings: ${dashEscape(t.variants.join(', '))}"` : '';
                const off = chart && typeof chart.getDataVisibility === 'function' && !chart.getDataVisibility(i) ? ' is-off' : '';
                return `<li class="legend-item${off}" data-index="${i}"${merged}>
                    <span class="dot" style="background:${colors[i]}"></span>
                    <span class="name">${dashEscape(t._id)}</span>
                    <span class="value">${fmtCount(t.count)}</span>
                    <span class="share">${shareText(t.count, total)}</span>
                </li>`;
            }).join('')
            : '<li class="empty">No assets yet</li>';
    }
    dashText('device-type-total', fmtCount(total));
    dashText('device-type-meta', hasData ? `${types.length} type${types.length === 1 ? '' : 's'}` : '—');
}

// Count + share printed at the end of each status bar
const statusBarLabels = {
    id: 'statusBarLabels',
    afterDatasetsDraw(chart) {
        const dataset = chart.data.datasets[0];
        if (!dataset) return;
        const total = sumValues(dataset.data);
        const { ctx } = chart;
        ctx.save();
        ctx.font = `600 11px ${CHART_THEME.font}`;
        ctx.fillStyle = CHART_THEME.ink;
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const value = Number(dataset.data[i]) || 0;
            ctx.fillText(value > 0 ? `${fmtCount(value)} · ${shareText(value, total)}` : '0', bar.x + 6, bar.y);
        });
        ctx.restore();
    }
};

// --- Assets by Status: every status in a fixed order and colour ---
function renderStatusChart(statuses, total) {
    const labels = statuses.map((s) => s._id);
    const counts = statuses.map((s) => s.count);

    upsertChart('status', 'statusChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Assets',
                data: counts,
                backgroundColor: labels.map((label) => CHART_THEME.status[label] || '#64748b'),
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 14
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 78 } },
            plugins: {
                legend: { display: false },
                tooltip: { ...CHART_TOOLTIP, callbacks: { label: (item) => ` ${fmtCount(item.raw)} assets (${shareText(item.raw, total)})` } }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: CHART_THEME.text },
                    grid: { color: CHART_THEME.grid },
                    border: { display: false }
                },
                y: {
                    ticks: { color: CHART_THEME.ink, font: { weight: '600' } },
                    grid: { display: false },
                    border: { display: false }
                }
            }
        },
        plugins: [statusBarLabels]
    });

    const active = statuses.filter((s) => s.count > 0).length;
    dashText('status-meta', total > 0 ? `${active} of ${statuses.length} statuses in use` : 'No assets');
}

// --- Asset Lifecycle Trend: added / allocated / returned per month, toggle via the stat chips ---
function renderTrendChart(trend) {
    const t = trend || { labels: [], added: [], allocated: [], returned: [] };
    const series = [
        { label: 'Assets Added', key: 'added', color: CHART_THEME.added, fill: true },
        { label: 'Allocated', key: 'allocated', color: CHART_THEME.allocated, fill: false },
        { label: 'Returned', key: 'returned', color: CHART_THEME.returned, fill: false }
    ];

    const areaFill = (color) => (context) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return hexToRgba(color, 0.15);
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, hexToRgba(color, 0.28));
        gradient.addColorStop(1, hexToRgba(color, 0));
        return gradient;
    };

    const chart = upsertChart('trend', 'trendChart', {
        type: 'line',
        data: {
            labels: t.labels || [],
            datasets: series.map((s) => ({
                label: s.label,
                data: t[s.key] || [],
                borderColor: s.color,
                backgroundColor: s.fill ? areaFill(s.color) : s.color,
                fill: s.fill,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#fff',
                pointBorderColor: s.color,
                pointBorderWidth: 2
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false }, // the stat chips above act as the legend
                tooltip: CHART_TOOLTIP
            },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: { color: CHART_THEME.grid },
                    border: { display: false }
                }
            }
        }
    });

    const totals = t.totals || { added: sumValues(t.added), allocated: sumValues(t.allocated), returned: sumValues(t.returned) };
    const stats = document.getElementById('trend-stats');
    if (stats) {
        stats.innerHTML = series.map((s, i) => {
            const visible = !chart || chart.isDatasetVisible(i);
            return `<button type="button" class="trend-stat${visible ? '' : ' is-off'}" data-index="${i}" aria-pressed="${visible}">
                <span class="dot" style="background:${s.color}"></span>${s.label}<strong>${fmtCount(totals[s.key])}</strong>
            </button>`;
        }).join('') + '<span class="period">Last 6 months</span>';
    }
}

// --- Stock Utilization: in use vs deployable stock (lost and scrapped excluded) ---
function renderUtilizationChart(statuses, kpis) {
    const count = (name) => (statuses.find((s) => s._id === name) || {}).count || 0;
    const total = kpis.totalAssets || sumValues(statuses.map((s) => s.count));
    const inUse = kpis.inUse != null ? kpis.inUse : count('In Use');
    const inStock = kpis.inStock != null ? kpis.inStock : count('In Stock');
    const repair = kpis.underRepair != null ? kpis.underRepair : count('Under Repair');
    const deployable = Math.max(total - count('Lost') - count('Scrapped'), 0);
    const other = Math.max(deployable - inUse - inStock - repair, 0); // returned, damaged
    const percentage = sharePct(inUse, deployable);
    const hasData = deployable > 0;

    const segments = [
        { label: 'In Use', value: inUse, color: CHART_THEME.status['In Use'] },
        { label: 'In Stock', value: inStock, color: CHART_THEME.status['In Stock'] },
        { label: 'Under Repair', value: repair, color: CHART_THEME.status['Under Repair'] },
        { label: 'Other', value: other, color: '#cbd5e1' }
    ];

    upsertChart('utilization', 'utilizationChart', {
        type: 'doughnut',
        data: {
            labels: hasData ? segments.map((s) => s.label) : ['No data'],
            datasets: [{
                data: hasData ? segments.map((s) => s.value) : [1],
                backgroundColor: hasData ? segments.map((s) => s.color) : ['#e5e7eb'],
                borderWidth: 0,
                borderRadius: 4,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: '78%',
            plugins: {
                legend: { display: false },
                tooltip: hasData
                    ? { ...CHART_TOOLTIP, callbacks: { label: (item) => ` ${item.label}: ${fmtCount(item.raw)} (${shareText(item.raw, deployable)})` } }
                    : { enabled: false }
            }
        }
    });

    dashText('utilization-pct', hasData ? `${percentage}%` : '--%');
    const meta = document.getElementById('utilization-meta');
    if (meta) {
        const lowStock = hasData && inStock === 0;
        meta.textContent = !hasData ? 'No assets' : lowStock ? 'No spare stock' : `${fmtCount(inStock)} spare`;
        meta.classList.toggle('is-warn', lowStock || percentage >= 90);
    }
    const legend = document.getElementById('utilization-legend');
    if (legend) {
        legend.innerHTML = hasData
            ? segments.filter((s) => s.value > 0 || s.label !== 'Other').map((s) =>
                `<li><span class="dot" style="background:${s.color}"></span>${s.label} <strong>${fmtCount(s.value)}</strong></li>`).join('')
            : '';
    }
}

// --- Allocation Flow: allocations up, returns down, net line per month ---
function renderFlowChart(trend, kpis) {
    const t = trend || { labels: [], allocated: [], returned: [] };
    const allocated = t.allocated || [];
    const returned = t.returned || [];
    const net = t.net || allocated.map((v, i) => v - (returned[i] || 0));
    const hasActivity = sumValues(allocated) + sumValues(returned) > 0;

    upsertChart('flow', 'flowChart', {
        type: 'bar',
        data: {
            labels: t.labels || [],
            datasets: [
                { type: 'bar', label: 'Allocated', data: allocated, backgroundColor: CHART_THEME.allocated, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.55 },
                { type: 'bar', label: 'Returned', data: returned.map((v) => -v), backgroundColor: CHART_THEME.returned, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.55 },
                { type: 'line', label: 'Net out', data: net, borderColor: CHART_THEME.ink, borderWidth: 1.5, pointRadius: 2, pointBackgroundColor: CHART_THEME.ink, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { ...CHART_TOOLTIP, callbacks: { label: (item) => ` ${item.dataset.label}: ${fmtCount(Math.abs(item.raw))}` } }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } },
                y: {
                    ticks: { display: false },
                    border: { display: false },
                    grid: { color: (context) => (context.tick && context.tick.value === 0 ? 'rgba(15, 23, 42, 0.25)' : 'transparent') }
                }
            }
        }
    });

    const empty = document.getElementById('flow-empty');
    if (empty) empty.hidden = hasActivity;
    const open = kpis.openAllocations != null ? kpis.openAllocations : null;
    dashText('flow-meta', open != null ? `${fmtCount(open)} out now` : `${fmtCount(sumValues(allocated))} allocated`);
}

function setDashboardLiveStatus(ok, generatedAt) {
    const badge = document.getElementById('dashboard-live');
    if (!badge) return;
    badge.classList.toggle('is-offline', !ok);
    if (ok) {
        const at = generatedAt ? new Date(generatedAt) : new Date();
        dashText('dashboard-updated', `Live · ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
        badge.title = 'Updates automatically every 30 seconds';
    } else {
        dashText('dashboard-updated', 'Offline · retrying');
        badge.title = 'Could not reach the server; showing the last loaded numbers';
    }
}

function dashboardOnScreen() {
    const kpi = document.getElementById('kpi-total');
    return !document.hidden && !!kpi && kpi.offsetParent !== null;
}

function startDashboardLive() {
    if (dashboardLiveStarted) return;
    dashboardLiveStarted = true;

    setInterval(() => {
        if (dashboardOnScreen()) initDashboard({ silent: true });
    }, DASHBOARD_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
        if (dashboardOnScreen()) initDashboard({ silent: true });
    });

    // Legend clicks show / hide a device type slice
    const legend = document.getElementById('device-type-legend');
    if (legend) {
        legend.addEventListener('click', (e) => {
            const item = e.target.closest('li[data-index]');
            const chart = dashboardCharts.deviceType;
            if (!item || !chart) return;
            const index = Number(item.dataset.index);
            chart.toggleDataVisibility(index);
            chart.update();
            item.classList.toggle('is-off', !chart.getDataVisibility(index));
        });
    }

    // Trend stat chips show / hide a series
    const stats = document.getElementById('trend-stats');
    if (stats) {
        stats.addEventListener('click', (e) => {
            const chip = e.target.closest('button[data-index]');
            const chart = dashboardCharts.trend;
            if (!chip || !chart) return;
            const index = Number(chip.dataset.index);
            const visible = !chart.isDatasetVisible(index);
            chart.setDatasetVisibility(index, visible);
            chart.update();
            chip.classList.toggle('is-off', !visible);
            chip.setAttribute('aria-pressed', String(visible));
        });
    }
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
                <td><strong>${escapeHtml(act.assetTagNumber || 'N/A')}</strong></td>
                <td>${escapeHtml(act.deviceType || 'N/A')}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(act.status || 'Unknown')}</span></td>
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

});



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
        const response = await fetch(API_URL + '/assets', {
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
                if (assignedByInput) assignedByInput.value = user.username;
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
        const makeModelLabel = document.getElementById('makeModelLabel');
        if (makeModelLabel) makeModelLabel.textContent = 'Software Name';
    } else {
        softwareCategoryGroup.style.display = 'none';
        document.getElementById('softwareCategory').value = '';
        serialNumberLabel.textContent = 'Serial Number *';
        document.getElementById('serialNumber').placeholder = '';
        const makeModelLabel = document.getElementById('makeModelLabel');
        if (makeModelLabel) makeModelLabel.textContent = 'Make & Model';
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

// Mobile sidebar drawer (header menu and close buttons)
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
        const response = await fetch(API_URL + '/allocations', {
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

// Fetch and display allocations history
async function fetchAllocations() {
    try {
        const tbody = document.getElementById('all-allocations-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><br><br>Loading allocations...</td></tr>';

        const response = await fetch(API_URL + '/allocations' + window.getOwnershipQuery(true));
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
                    <td><strong>${escapeHtml(alloc.employeeName)}</strong></td>
                    <td style="color: var(--blue-primary); font-weight: 600;">${escapeHtml(alloc.assetTagNumber)}</td>
                    <td>${escapeHtml(assignDate)}</td>
                    <td>${escapeHtml(notes)}</td>
                    <td><span class="status-badge ${statusBadge}">${escapeHtml(alloc.status)}</span></td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="action-btn edit-btn" onclick="openEditAllocationModal('${escapeHtml(alloc._id)}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteAllocation('${escapeHtml(alloc._id)}')" title="Delete">
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
    const restockInput = document.getElementById('ret-auto-restock');
    const autoRestock = restockInput ? restockInput.checked : true;

    try {
        const response = await fetch(API_URL + '/returns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetTagNumber,
                employeeName,
                returnDate,
                deviceCondition,
                penaltyAmount: parseFloat(penaltyAmount),
                notes,
                autoRestock
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            showToast(data.message || 'Asset returned successfully!', 'success');
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

        const response = await fetch(API_URL + '/returns' + window.getOwnershipQuery(true));
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
                    <td style="color: var(--blue-primary); font-weight: 600;">${escapeHtml(ret.assetTagNumber)}</td>
                    <td><strong>${escapeHtml(ret.employeeName)}</strong></td>
                    <td>${escapeHtml(returnDate)}</td>
                    <td><span style="font-weight: 600; color: ${conditionColor};">${escapeHtml(ret.deviceCondition || 'Unknown')}</span></td>
                    <td style="color: var(--red-primary); font-weight: 600;">${escapeHtml(penalty)}</td>
                    <td>${escapeHtml(notes)}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="action-btn edit-btn" onclick="openEditReturnModal('${escapeHtml(ret._id)}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteReturn('${escapeHtml(ret._id)}')" title="Delete">
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

// ====== WARRANTY LOGIC ====== //

let allAssets = [];
let currentFilter = 'all';

// "Now" is read on every call so a tab left open overnight stays correct
function getWarrantyStatus(asset) {
    if (!asset.warrantyEndDate) return 'no-date';
    const expiry = new Date(asset.warrantyEndDate);
    if (isNaN(expiry.getTime())) return 'no-date';
    const now = new Date();
    if (expiry < now) return 'expired';
    if (expiry <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) return 'expiring';
    return 'valid';
}

function getDaysLeft(dateStr) {
    if (!dateStr) return '-';
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return '-';
    const diff = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
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
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><strong>' + escapeHtml(asset.assetTagNumber || 'N/A') + '</strong><br><small style="color:var(--text-muted);">' + escapeHtml(asset.srNo || '') + '</small></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);">' + escapeHtml(asset.deviceType || 'N/A') + (asset.make ? ' <span style="color:var(--text-muted);">(' + escapeHtml(asset.make) + ')</span>' : '') + '</td>' +

                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><div style="display:flex; flex-direction:column; gap:4px;"><span>' + (expiry && !isNaN(expiry.getTime()) ? expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-') + '</span><span style="font-size:0.75rem; color:var(--text-muted); font-weight:500; background:#f1f5f9; padding:2px 6px; border-radius:4px; width:fit-content;">' + daysLeft + '</span></div></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><span class="warranty-badge ' + badgeClass + '">' + badgeText + '</span></td>' +
                '<td style="padding:16px;border-bottom:1px solid var(--border-soft);"><button class="vendor-btn" data-tag="' + escapeHtml(asset.assetTagNumber || '') + '" onclick="contactVendor(this.dataset.tag)"><i class="fa-solid fa-phone"></i> Contact Vendor</button></td>';
            tbody.appendChild(row);
        } catch (err) {
            tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="5" style="color:red; padding:10px;">Error rendering asset ' + escapeHtml(asset.assetTagNumber) + ': ' + escapeHtml(err.message) + '</td></tr>');
        }
    });
}

function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('#view-warranty .filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('filter-' + filter)?.classList.add('active');
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

// ====== REPORTS LOGIC ====== //

// =======================================================
// REPORTS — live inventory. Data is fetched once per visit / ownership change;
// search and every filter run client-side on that cached list, so they are instant.
// =======================================================
const REPORTS_COLS = 13;
const REPORTS_STATUS_ORDER = ['In Stock', 'In Use', 'Under Repair', 'Lost', 'Damaged', 'Returned', 'Scrapped'];
const REPORTS_FILTER_IDS = ['reports-filter-day', 'reports-filter-month', 'reports-filter-year', 'reports-filter-device', 'reports-filter-status'];
// "key:value" search prefixes -> asset fields
const REPORTS_SEARCH_KEYS = {
    tag: ['assetTagNumber'], serial: ['serialNumber'], sn: ['serialNumber'],
    type: ['deviceType'], device: ['deviceType'], make: ['make'], model: ['model'],
    status: ['status'], user: ['assignedToName'], name: ['assignedToName'],
    emp: ['employeeId'], id: ['employeeId'], remark: ['remark'], sr: ['srNo'], vendor: ['vendorName']
};
const REPORTS_SEARCH_FIELDS = ['srNo', 'assetTagNumber', 'serialNumber', 'deviceType', 'make', 'model', 'softwareCategory',
    'status', 'assignedToName', 'employeeId', 'remark', 'vendorName', 'macAddress', 'processor', 'os'];

const reportsState = { data: [], loaded: false, requestId: 0 };

function reportsEsc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Lowercase and strip spaces/dashes etc. so "latitude 5400" matches "Latitude-5400"
function reportsCompact(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[\s\-_./\\:,]+/g, '');
}

// Dates before 1990 are Excel-import junk (e.g. 1905) — treat them as missing
function reportsValidDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d;
}

// Assign Date column; fall back to the record creation date
function reportsDate(asset) {
    return reportsValidDate(asset.purchaseDate) || reportsValidDate(asset.createdAt);
}

function parseReportsQuery(text) {
    const terms = [];
    (text || '').trim().split(/\s+/).filter(Boolean).forEach(part => {
        const m = part.match(/^([a-z]+):(.*)$/i);
        if (m && REPORTS_SEARCH_KEYS[m[1].toLowerCase()]) {
            if (m[2]) terms.push({ fields: REPORTS_SEARCH_KEYS[m[1].toLowerCase()], value: reportsCompact(m[2]), raw: m[2] });
        } else {
            terms.push({ fields: REPORTS_SEARCH_FIELDS, value: reportsCompact(part), raw: part });
        }
    });
    return terms.filter(t => t.value);
}

// Every term must match some field (AND across terms)
function reportsMatches(asset, terms) {
    return terms.every(t => t.fields.some(f => reportsCompact(asset[f]).includes(t.value)));
}

// Escape text and wrap search hits in <mark>
function reportsHighlight(value, terms) {
    const text = String(value == null ? '' : value);
    if (!text || !terms.length) return reportsEsc(text);
    const lower = text.toLowerCase();
    const ranges = [];
    terms.forEach(t => {
        const needle = t.raw.toLowerCase();
        if (!needle) return;
        let i = lower.indexOf(needle);
        while (i !== -1) {
            ranges.push([i, i + needle.length]);
            i = lower.indexOf(needle, i + needle.length);
        }
    });
    if (!ranges.length) return reportsEsc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    ranges.forEach(([s, e]) => {
        if (e <= pos) return;
        s = Math.max(s, pos);
        out += reportsEsc(text.slice(pos, s)) + '<mark>' + reportsEsc(text.slice(s, e)) + '</mark>';
        pos = e;
    });
    return out + reportsEsc(text.slice(pos));
}

function setSelectOptions(select, placeholder, options) {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">' + reportsEsc(placeholder) + '</option>' +
        options.map(o => '<option value="' + reportsEsc(o.value) + '">' + reportsEsc(o.label) + '</option>').join('');
    // Keep the user's choice if it still exists in the new data
    select.value = options.some(o => o.value === previous) ? previous : '';
}

function buildReportsFilterOptions(data) {
    const devices = new Map(); // lowercase -> label (merges "Laptop" / "LAPTOP")
    const statuses = new Set();
    data.forEach(a => {
        const type = (a.deviceType || '').trim();
        if (type && !devices.has(type.toLowerCase())) {
            devices.set(type.toLowerCase(), type.charAt(0).toUpperCase() + type.slice(1).toLowerCase());
        }
        if (a.status) statuses.add(a.status);
    });

    setSelectOptions(document.getElementById('reports-filter-device'), 'All device types',
        [...devices.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })));
    // Always offer every status, plus any unexpected ones found in the data
    const statusList = REPORTS_STATUS_ORDER
        .concat([...statuses].filter(s => !REPORTS_STATUS_ORDER.includes(s)).sort());
    setSelectOptions(document.getElementById('reports-filter-status'), 'All statuses',
        statusList.map(s => ({ value: s, label: s })));
}

function getReportsFilters() {
    const val = id => document.getElementById(id)?.value || '';
    return {
        query: document.getElementById('reports-search')?.value || '',
        day: val('reports-filter-day'),
        month: val('reports-filter-month'),
        year: val('reports-filter-year'),
        device: val('reports-filter-device'),
        status: val('reports-filter-status')
    };
}

function reportsStatusClass(status) {
    return (status || 'unknown').toLowerCase().replace(/\s+/g, '-');
}

function renderReports() {
    const tbody = document.getElementById('reports-table-body');
    const countEl = document.getElementById('reports-count');
    const resetBtn = document.getElementById('reports-reset');
    const clearBtn = document.getElementById('reports-search-clear');
    if (!tbody) return;

    const f = getReportsFilters();
    const terms = parseReportsQuery(f.query);
    const hasFilters = !!(f.query.trim() || f.day || f.month || f.year || f.device || f.status);
    if (clearBtn) clearBtn.hidden = !f.query;
    if (resetBtn) resetBtn.disabled = !hasFilters;

    const all = reportsState.data;
    const filtered = all.filter(a => {
        if (f.device && (a.deviceType || '').trim().toLowerCase() !== f.device) return false;
        if (f.status && a.status !== f.status) return false;
        if (f.day || f.month || f.year) {
            const d = reportsDate(a);
            if (!d) return false;
            if (f.year && String(d.getFullYear()) !== f.year) return false;
            if (f.month && String(d.getMonth()) !== f.month) return false;
            if (f.day && String(d.getDate()) !== f.day) return false;
        }
        return !terms.length || reportsMatches(a, terms);
    });

    window.currentReportsFilteredData = filtered;

    if (countEl) {
        countEl.innerHTML = filtered.length === all.length
            ? '<strong>' + all.length + '</strong> assets'
            : '<strong>' + filtered.length + '</strong> of ' + all.length + ' assets';
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="' + REPORTS_COLS + '" class="inventory-empty">' +
            (all.length
                ? 'No assets match your search or filters.<br><button type="button" class="secondary-btn btn-sm" onclick="clearReportsFilters()"><i class="fa-solid fa-rotate-left"></i> Clear filters</button>'
                : 'No assets found in database.') +
            '</td></tr>';
        return;
    }

    const perms = window.userPermissions || [];
    const canEdit = perms.includes('*') || perms.includes('edit_asset');
    const canDelete = perms.includes('*') || perms.includes('delete_asset');
    const hl = value => reportsHighlight(value, terms);
    const fmtDate = v => {
        const d = reportsValidDate(v);
        return d ? d.toLocaleDateString() : '-';
    };

    tbody.innerHTML = filtered.map(a => {
        const id = reportsEsc(a._id);
        return '<tr>' +
            '<td>' + (a.srNo ? hl(a.srNo) : 'N/A') + '</td>' +
            '<td><strong>' + (a.assetTagNumber ? hl(a.assetTagNumber) : 'N/A') + '</strong></td>' +
            '<td>' + (a.serialNumber ? hl(a.serialNumber) : 'N/A') + '</td>' +
            '<td>' + (a.deviceType ? hl(a.deviceType) : 'N/A') + '</td>' +
            '<td>' + (a.make ? hl(a.make) : 'N/A') +
            (a.model && a.model !== a.make ? '<div class="cell-sub">' + hl(a.model) + '</div>' : '') + '</td>' +
            '<td style="display:none;">' + reportsEsc(a.softwareCategory || '') + '</td>' +
            '<td>' + fmtDate(a.purchaseDate) + '</td>' +
            '<td>' + fmtDate(a.warrantyEndDate) + '</td>' +
            '<td>' + (a.remark ? hl(a.remark) : '-') + '</td>' +
            '<td><span class="status-badge ' + reportsStatusClass(a.status) + '">' + hl(a.status || 'Unknown') + '</span></td>' +
            '<td class="cell-user"><i class="fa-solid fa-user-circle"></i>' + (a.assignedToName ? hl(a.assignedToName) : 'Unassigned') + '</td>' +
            '<td>' + (a.employeeId ? hl(a.employeeId) : '-') + '</td>' +
            '<td>' +
            (canEdit ? '<button class="icon-action" title="Edit" onclick="openEditModal(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>' : '') +
            (canDelete ? '<button class="icon-action danger" title="Delete" onclick="deleteAsset(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</td></tr>';
    }).join('');
}

async function fetchReportsData() {
    const tbody = document.getElementById('reports-table-body');
    const countEl = document.getElementById('reports-count');
    if (!tbody) return;
    bindReportsControls();

    const requestId = ++reportsState.requestId;
    if (!reportsState.loaded) {
        tbody.innerHTML = '<tr><td colspan="' + REPORTS_COLS + '" class="inventory-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading data…</td></tr>';
    }
    if (countEl) countEl.textContent = 'Loading…';

    try {
        const response = await fetch(API_URL + '/assets' + window.getOwnershipQuery());
        if (!response.ok) throw new Error('Failed to fetch data (' + response.status + ')');
        const data = await response.json();
        if (requestId !== reportsState.requestId) return; // a newer load superseded this one

        reportsState.data = Array.isArray(data) ? data : (data.assets || data.data || []);
        reportsState.loaded = true;
        buildReportsFilterOptions(reportsState.data);
        renderReports();
    } catch (err) {
        if (requestId !== reportsState.requestId) return;
        console.error(err);
        showToast('Database loading failed. Is the backend running?', 'error');
        if (countEl) countEl.textContent = '';
        tbody.innerHTML = '<tr><td colspan="' + REPORTS_COLS + '" class="inventory-empty" style="color:#dc2626;">Error: ' + reportsEsc(err.message) + '</td></tr>';
    }
}

let reportsControlsBound = false;
function bindReportsControls() {
    if (reportsControlsBound) return;
    const search = document.getElementById('reports-search');
    if (!search) return;
    reportsControlsBound = true;

    let timer = null;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(renderReports, 120);
    });
    search.addEventListener('keydown', e => {
        if (e.key === 'Escape' && search.value) {
            e.preventDefault();
            search.value = '';
            renderReports();
        }
    });

    const clearBtn = document.getElementById('reports-search-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
        search.value = '';
        renderReports();
        search.focus();
    });

    REPORTS_FILTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderReports);
    });

    // "/" focuses the search while the Reports view is open
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const view = document.getElementById('view-reports');
        if (!view || view.style.display === 'none') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        e.preventDefault();
        search.focus();
        search.select();
    });
}

window.applyReportsFilters = renderReports;

window.clearReportsFilters = function () {
    const search = document.getElementById('reports-search');
    if (search) search.value = '';
    REPORTS_FILTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderReports();
};

// Every Year dropdown on the site (select[data-year-range]) lists 2026–2100
const YEAR_RANGE_START = 2026;
const YEAR_RANGE_END = 2100;
function fillYearSelects() {
    const options = [];
    for (let y = YEAR_RANGE_START; y <= YEAR_RANGE_END; y++) options.push('<option value="' + y + '">' + y + '</option>');
    document.querySelectorAll('select[data-year-range]').forEach(select => {
        const previous = select.value;
        select.innerHTML = '<option value="">Year</option>' + options.join('');
        select.value = previous;
    });
}

// Reports data loads via the router (#reports); only wire up the controls here
document.addEventListener('DOMContentLoaded', () => {
    fillYearSelects();
    bindReportsControls();
});

// ==========================================
// SETTINGS LOGIC
// ==========================================

var currentEditingRole = '';
var currentEditingRow = null;
var rolesCache = {};

function fetchSettingsData() {
    fetchRoles();

    // Creating logins is Super Admin only
    const addLoginBtn = document.getElementById('add-login-btn');
    if (addLoginBtn) addLoginBtn.hidden = currentUserRole() !== 'Super Admin';
}

// User Management Form Submission
document.addEventListener('DOMContentLoaded', () => {
    const intRegForm = document.getElementById('internal-register-form');
    if (intRegForm) {
        intRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('int-reg-username').value.trim();
            const role = document.getElementById('int-reg-role').value;
            const password = document.getElementById('int-reg-password').value;
            const btn = document.getElementById('int-reg-submit');

            // Same rules as the server, so the new user signs in with exactly these details
            if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
                showToast('Username must be 3–32 characters: letters, numbers, dot, dash or underscore.', 'error');
                return;
            }
            if (!role) {
                showToast('Please select a role.', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('Password must be at least 6 characters.', 'error');
                return;
            }

            const btnOriginalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

            const token = localStorage.getItem('token');

            try {
                const response = await fetch(API_URL + '/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ username, role, password })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    const created = (data.user && data.user.username) || username.toLowerCase();
                    showToast(`User "${created}" created. They can now sign in with this username and password.`, 'success');
                    closeUserManagementModal();
                    if (typeof fetchRoles === 'function') fetchRoles();
                } else if (response.status === 401) {
                    showToast('Your session has expired. Please sign in again.', 'error');
                } else {
                    showToast(data.message || 'Could not create the user.', 'error');
                }
            } catch (err) {
                showToast('Cannot connect to the server.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = btnOriginalHtml;
            }
        });
    }
});

function fetchRoles() {
    fetch(API_URL + '/roles')
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

            // Roles and their users are managed by a Super Admin only
            const isSuperAdmin = currentUserRole() === 'Super Admin';
            roles.forEach(role => {
                const count = role.userCount !== undefined ? role.userCount : 0;
                const permsText = role.permissions.includes('*') ? 'Full access' : `${role.permissions.length} pages allowed`;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(role.name)}</strong></td>
                    <td><span style="color:var(--text-muted);">${escapeHtml(permsText)}</span></td>
                    <td><span style="background:#f1f5f9; padding:4px 10px; border-radius:12px; font-weight:600; color:#334155; font-size:0.85rem;"><i class="fa-solid fa-users" style="color:#64748b; margin-right:5px;"></i>${isSuperAdmin ? escapeHtml(count) + ' Users' : '-'}</span></td>
                    <td>
                        ${isSuperAdmin ? `<button class="icon-btn action-btn" data-role="${escapeHtml(role.name)}" onclick="editRole(this.dataset.role, this.closest('tr'))"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
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
    document.getElementById('editing-role-name').innerHTML = '<i class="fa-solid fa-user-shield" style="color: var(--red-primary);"></i> Editing Permissions for: ' + escapeHtml(roleName);

    // Super Admin always has every permission; only its users can be managed here
    const fixedRole = roleName === 'Super Admin';
    const currentPerms = rolesCache[roleName] || [];
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.checked = fixedRole || currentPerms.includes('*') || currentPerms.includes(cb.value);
        cb.disabled = fixedRole;
    });
    const savePermsBtn = document.getElementById('save-role-perms-btn');
    if (savePermsBtn) savePermsBtn.hidden = fixedRole;

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
                    ? `<button onclick="toggleUserBlock('${escapeHtml(u._id)}', false)" style="background:#10b981; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-unlock"></i> Unblock</button>`
                    : `<button onclick="toggleUserBlock('${escapeHtml(u._id)}', true)" style="background:#ef4444; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-ban"></i> Block</button>`;

                usersContainer.innerHTML += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: ${isBlocked ? '#fff1f2' : '#fff'}; border: 1px solid ${isBlocked ? '#fecdd3' : '#e2e8f0'}; border-radius: 6px; transition: 0.2s;">
                        <div style="display: flex; align-items: center; gap: 10px; opacity: ${isBlocked ? '0.6' : '1'};">
                            <i class="fa-solid fa-user-circle" style="color: #94a3b8; font-size: 1.5rem;"></i>
                            <div>
                                <div style="font-weight: 600; color: #334155; font-size: 0.95rem;">${escapeHtml(u.username || 'User')} ${isBlocked ? '<span style="color:#ef4444; font-size:0.75rem; margin-left:5px;"><i class="fa-solid fa-lock"></i> Blocked</span>' : ''}</div>
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
        const response = await fetch(`${API_URL}/users/${userId}/block`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isBlocked: blockStatus })
        });
        if (response.ok) {
            showToast(blockStatus ? 'User has been blocked from accessing the system.' : 'User access has been restored.', 'success');
            cancelRoleEdit();
            fetchRoles();
        } else {
            showToast(await apiErrorMessage(response, 'Failed to update user status.'), 'error');
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
        const response = await fetch(API_URL + '/roles/' + encodeURIComponent(currentEditingRole), {
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
            showToast(await apiErrorMessage(response, 'Failed to save permissions.'), 'error');
        }
    } catch (err) {
        console.error('Error updating role:', err);
        showToast('Server error while saving.', 'error');
    }
}

// ==========================================
// KPI MODAL LOGIC
// ==========================================

// Data is fetched once when a card opens; day/month/year/device/search then
// filter that cached list instantly (and match the numbers on the cards).
const KPI_FILTER_IDS = ['kpi-filter-day', 'kpi-filter-month', 'kpi-filter-year', 'kpi-filter-device', 'kpi-filter-search'];
const KPI_ASSET_CATEGORIES = {
    'Total': () => true,
    'In Use': a => a.status === 'In Use',
    'In Stock': a => a.status === 'In Stock',
    'Repair': a => a.status === 'Under Repair',
    'Software': a => kpiType(a) === 'software',
    'Monitors': a => kpiType(a) === 'monitor' || kpiType(a) === 'monitors',
    'Mouse': a => kpiType(a) === 'mouse',
    'Keyboard': a => kpiType(a) === 'keyboard'
};
// Device type filter only makes sense where a card mixes several types
const KPI_DEVICE_FILTER_CATEGORIES = ['Total', 'In Use', 'In Stock', 'Repair'];
const KPI_TITLES = {
    'Total': 'Total IT Assets', 'In Use': 'Assets In Use', 'In Stock': 'Assets In Stock', 'Repair': 'Under Repair',
    'Software': 'Software Licenses', 'Monitors': 'Total Monitors', 'Mouse': 'Total Mouse', 'Keyboard': 'Total Keyboards',
    'Allocations': 'Total Allocations', 'Returns': 'Total Returns'
};
const KPI_SEARCH_FIELDS = {
    Allocations: ['employeeName', 'assetTagNumber', 'issueNotes', 'status'],
    Returns: ['assetTagNumber', 'employeeName', 'deviceCondition', 'missingAccessories', 'notes'],
    assets: REPORTS_SEARCH_FIELDS
};

const kpiState = { category: null, rows: [], requestId: 0 };

function kpiType(asset) {
    return (asset.deviceType || '').trim().toLowerCase();
}

function kpiRowDate(row) {
    if (kpiState.category === 'Allocations') return reportsValidDate(row.assignDate);
    if (kpiState.category === 'Returns') return reportsValidDate(row.returnDate) || reportsValidDate(row.createdAt);
    return reportsDate(row);
}

function kpiFmtDate(value) {
    const d = reportsValidDate(value);
    return d ? d.toLocaleDateString() : '-';
}

function kpiPermission(name) {
    const perms = window.userPermissions || [];
    return perms.includes('*') || perms.includes(name);
}

window.openKpiModal = async function (category) {
    const reopening = kpiState.category === category;
    kpiState.category = category;
    window.currentKpiCategory = category;
    bindKpiControls();

    const modal = document.getElementById('kpi-modal');
    const tbody = document.getElementById('kpi-modal-body');
    const countEl = document.getElementById('kpi-count');
    const isAssets = !!KPI_ASSET_CATEGORIES[category];
    document.getElementById('kpi-modal-title').innerText = KPI_TITLES[category] || (category + ' Assets');

    const deviceFilter = document.getElementById('kpi-filter-device');
    if (deviceFilter) {
        const showDevice = KPI_DEVICE_FILTER_CATEGORIES.includes(category);
        deviceFilter.hidden = !showDevice;
        if (!showDevice) deviceFilter.value = '';
    }

    renderKpiHead();
    if (!reopening || !kpiState.rows.length) {
        kpiState.rows = [];
        tbody.innerHTML = '<tr><td colspan="13" class="inventory-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading data…</td></tr>';
    }
    if (countEl) countEl.textContent = 'Loading…';

    if (modal.style.display !== 'flex') {
        modal.style.display = 'flex';
        void modal.offsetWidth; // reflow so the open transition runs
        modal.style.opacity = '1';
        modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }

    const requestId = ++kpiState.requestId;
    try {
        const endpoint = category === 'Allocations' ? '/allocations' : category === 'Returns' ? '/returns' : '/assets';
        const response = await fetch(API_URL + endpoint + window.getOwnershipQuery(true));
        if (!response.ok) throw new Error('Failed to fetch data (' + response.status + ')');
        const data = await response.json();
        if (requestId !== kpiState.requestId) return; // a newer card/refresh superseded this load

        const list = Array.isArray(data) ? data : [];
        if (category === 'Allocations') window.currentAllocationsData = list;
        if (category === 'Returns') window.currentReturnsData = list;
        kpiState.rows = isAssets ? list.filter(KPI_ASSET_CATEGORIES[category]) : list;

        if (deviceFilter && !deviceFilter.hidden) {
            const types = new Map();
            kpiState.rows.forEach(a => {
                const t = (a.deviceType || '').trim();
                if (t && !types.has(t.toLowerCase())) types.set(t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
            });
            setSelectOptions(deviceFilter, 'All Device Types',
                [...types.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })));
        }
        renderKpiRows();
    } catch (error) {
        if (requestId !== kpiState.requestId) return;
        console.error('Error fetching KPI data:', error);
        showToast('Database loading failed. Is the backend running?', 'error');
        if (countEl) countEl.textContent = '';
        tbody.innerHTML = '<tr><td colspan="13" class="inventory-empty" style="color:#dc2626;">Failed to load data: ' + reportsEsc(error.message) + '</td></tr>';
    }
};

function renderKpiHead() {
    const thead = document.getElementById('kpi-modal-thead');
    const category = kpiState.category;
    let cols;
    if (category === 'Allocations') {
        cols = ['Employee', 'Asset Tag', 'Assign Date', 'Expected Return', 'Status', 'Notes', 'Actions'];
    } else if (category === 'Returns') {
        cols = ['Asset Tag', 'Returned By', 'Date', 'Condition', 'Penalty', 'Notes', 'Actions'];
    } else {
        const isSoftware = category === 'Software';
        cols = ['SR No', 'Asset Tag', isSoftware ? 'Software License Key' : 'Serial/Key']
            .concat(isSoftware ? [] : ['Device Type'])
            .concat([isSoftware ? 'Software Name' : 'Make & Model', 'Assign Date', 'Valid Date', 'Remark', 'Status', 'Assign NAME', 'Emp ID', 'Actions']);
    }
    thead.innerHTML = '<tr>' + cols.map(c => '<th' + (c === 'Actions' ? ' style="text-align:center;"' : '') + '>' + c + '</th>').join('') + '</tr>';
    return cols.length;
}

function renderKpiRows() {
    const category = kpiState.category;
    if (!category) return;
    const tbody = document.getElementById('kpi-modal-body');
    const countEl = document.getElementById('kpi-count');
    const colCount = document.querySelectorAll('#kpi-modal-thead th').length || 13;
    const val = id => document.getElementById(id)?.value || '';
    const day = val('kpi-filter-day'), month = val('kpi-filter-month'), year = val('kpi-filter-year');
    const device = document.getElementById('kpi-filter-device')?.hidden ? '' : val('kpi-filter-device');
    const isAssets = !!KPI_ASSET_CATEGORIES[category];
    const searchFields = isAssets ? KPI_SEARCH_FIELDS.assets : KPI_SEARCH_FIELDS[category];
    const terms = parseReportsQuery(val('kpi-filter-search')).map(t =>
        t.fields === REPORTS_SEARCH_FIELDS ? Object.assign({}, t, { fields: searchFields }) : t);

    const all = kpiState.rows;
    const filtered = all.filter(row => {
        if (device && kpiType(row) !== device) return false;
        if (day || month || year) {
            const d = kpiRowDate(row);
            if (!d) return false;
            if (year && String(d.getFullYear()) !== year) return false;
            if (month && String(d.getMonth()) !== month) return false;
            if (day && String(d.getDate()) !== day) return false;
        }
        return !terms.length || reportsMatches(row, terms);
    });
    window.currentKpiFilteredData = filtered;

    if (countEl) {
        countEl.innerHTML = filtered.length === all.length
            ? '<strong>' + all.length + '</strong> records'
            : '<strong>' + filtered.length + '</strong> of ' + all.length + ' records';
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="inventory-empty">' +
            (all.length
                ? 'No records match your filters.<br><button type="button" class="secondary-btn btn-sm" onclick="clearKpiFilters()"><i class="fa-solid fa-rotate-left"></i> Clear filters</button>'
                : 'No records found for this category.') +
            '</td></tr>';
        return;
    }

    const hl = v => reportsHighlight(v, terms);
    const cell = (v, fallback) => (v || v === 0 ? hl(v) : fallback);
    const closeThen = 'document.getElementById(\'kpi-modal\').style.display=\'none\';';

    let html;
    if (category === 'Allocations') {
        html = filtered.map(a => {
            const id = reportsEsc(a._id);
            return '<tr>' +
                '<td class="cell-user"><i class="fa-solid fa-user-circle"></i>' + cell(a.employeeName, '-') + '</td>' +
                '<td><strong>' + cell(a.assetTagNumber, '-') + '</strong></td>' +
                '<td>' + kpiFmtDate(a.assignDate) + '</td>' +
                '<td>' + kpiFmtDate(a.expectedReturnDate) + '</td>' +
                '<td><span class="status-badge ' + (a.status === 'Returned' ? 'returned' : 'in-use') + '">' + cell(a.status || 'Active', '-') + '</span></td>' +
                '<td title="' + reportsEsc(a.issueNotes || '') + '">' + cell(a.issueNotes, '-') + '</td>' +
                '<td style="text-align:center; white-space:nowrap;">' +
                '<button class="icon-action" title="Edit" onclick="openEditAllocationModal(\'' + id + '\'); ' + closeThen + '"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="icon-action danger" title="Delete" onclick="deleteAllocation(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');
    } else if (category === 'Returns') {
        html = filtered.map(r => {
            const id = reportsEsc(r._id);
            let color = '#10B981';
            if (['Damaged', 'Poor', 'Scrap'].includes(r.deviceCondition)) color = '#EF4444';
            else if (r.deviceCondition === 'Fair') color = '#F59E0B';
            return '<tr>' +
                '<td><strong>' + cell(r.assetTagNumber, '-') + '</strong></td>' +
                '<td class="cell-user"><i class="fa-solid fa-user-circle"></i>' + cell(r.employeeName, 'N/A') + '</td>' +
                '<td>' + kpiFmtDate(r.returnDate) + '</td>' +
                '<td><span style="font-weight:600; color:' + color + ';">' + cell(r.deviceCondition, '-') + '</span></td>' +
                '<td style="color:#dc2626; font-weight:600;">' + (r.penaltyAmount ? '₹' + reportsEsc(r.penaltyAmount) : '-') + '</td>' +
                '<td title="' + reportsEsc(r.notes || '') + '">' + cell(r.notes, '-') + '</td>' +
                '<td style="text-align:center; white-space:nowrap;">' +
                '<button class="icon-action" title="Edit" onclick="openEditReturnModal(\'' + id + '\'); ' + closeThen + '"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="icon-action danger" title="Delete" onclick="deleteReturn(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');
    } else {
        const isSoftware = category === 'Software';
        const canEdit = kpiPermission('edit_asset');
        const canDelete = kpiPermission('delete_asset');
        html = filtered.map(a => {
            const id = reportsEsc(a._id);
            const makeModel = [a.make, a.model && a.model !== a.make ? a.model : ''].filter(Boolean).join(' ');
            return '<tr>' +
                '<td>' + cell(a.srNo, '-') + '</td>' +
                '<td><strong>' + cell(a.assetTagNumber, '-') + '</strong></td>' +
                '<td>' + cell(a.serialNumber, '-') + '</td>' +
                (isSoftware ? '' : '<td>' + cell(a.deviceType, '-') + '</td>') +
                '<td>' + cell(makeModel, '-') + '</td>' +
                '<td>' + kpiFmtDate(a.purchaseDate) + '</td>' +
                '<td>' + kpiFmtDate(a.warrantyEndDate) + '</td>' +
                '<td>' + cell(a.remark, '-') + '</td>' +
                '<td><span class="status-badge ' + reportsStatusClass(a.status) + '">' + cell(a.status, '-') + '</span></td>' +
                '<td class="cell-user"><i class="fa-solid fa-user-circle"></i>' + cell(a.assignedToName, 'Unassigned') + '</td>' +
                '<td>' + cell(a.employeeId, '-') + '</td>' +
                '<td style="text-align:center; white-space:nowrap;">' +
                (canEdit ? '<button class="icon-action" title="Edit" onclick="openEditModal(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>' : '') +
                (canDelete ? '<button class="icon-action danger" title="Delete" onclick="deleteAsset(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
                '</td></tr>';
        }).join('');
    }
    tbody.innerHTML = html;
}

let kpiControlsBound = false;
function bindKpiControls() {
    if (kpiControlsBound) return;
    const search = document.getElementById('kpi-filter-search');
    if (!search) return;
    kpiControlsBound = true;

    let timer = null;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(renderKpiRows, 120);
    });
    search.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(timer);
            renderKpiRows();
        } else if (e.key === 'Escape' && search.value) {
            e.preventDefault();
            e.stopPropagation();
            search.value = '';
            renderKpiRows();
        }
    });
    KPI_FILTER_IDS.filter(id => id !== 'kpi-filter-search').forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderKpiRows);
    });
}

function resetKpiFilterInputs() {
    KPI_FILTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

window.applyKpiFilters = renderKpiRows;

window.clearKpiFilters = function () {
    resetKpiFilterInputs();
    renderKpiRows();
};

window.closeKpiModal = function () {
    const modal = document.getElementById('kpi-modal');
    modal.style.opacity = '0';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    kpiState.requestId++; // ignore any load still in flight
    kpiState.category = null;
    kpiState.rows = [];
    resetKpiFilterInputs();
};

// ==========================================
// PROFILE MODAL LOGIC
// ==========================================
async function openProfileModal() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(API_URL + '/profile', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            response.json().then(data => {
                document.getElementById('prof-username').value = data.username || '';
                document.getElementById('prof-phone').value = data.phone || '';
                document.getElementById('prof-empId').value = data.employeeId || '';
            });
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

    // Username is the login name and can't be changed here
    const updateData = {
        phone: document.getElementById('prof-phone').value.trim(),
        employeeId: document.getElementById('prof-empId').value.trim()
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(API_URL + '/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(updateData)
        });

        if (response.ok) {
            const data = await response.json();
            showToast('Profile updated successfully!', 'success');

            // Keep the saved session and the header chip in step
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const lsUser = JSON.parse(userStr);
                lsUser.employeeId = data.employeeId;
                localStorage.setItem('user', JSON.stringify(lsUser));
                renderSignedInUser(lsUser);
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
        const response = await fetch(API_URL + '/assets/' + id, {
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
            showToast(await apiErrorMessage(response, 'Failed to delete asset.'), 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Could not connect to the server.', 'error');
    }
}

window.openEditModal = async function (id) {
    try {
        // Fetch asset data to populate form
        const response = await fetch(API_URL + '/assets/' + encodeURIComponent(id), { cache: 'no-store' });
        if (!response.ok) {
            showToast(await apiErrorMessage(response, 'Asset not found.'), 'error');
            return;
        }
        const asset = await response.json();

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
        const response = await fetch(API_URL + '/assets/' + id, {
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
            <p style="margin:0;color:#64748b;font-size:0.9rem;">${escapeHtml(file.name)}</p>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:0.8rem;">This may take a moment for large files</p>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = '1');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(API_URL + '/assets/import', {
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
                    extra = `<div class="res-scroll-item-error">Skipped rows due to: ${escapeHtml(info.skippedReasons.join(', '))}</div>`;
                }
                sheetsHtml += `<div class="res-scroll-item">
                    <div class="res-scroll-item-header">
                        <span>${icon} ${escapeHtml(name)}</span>
                        <span class="res-scroll-item-detail">${escapeHtml(detail)}</span>
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
                    <p class="res-msg">${escapeHtml(result.message || '')}</p>
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

// One CSV cell: always quoted, and a leading = + - @ is neutralised so a spreadsheet
// never runs imported text as a formula
function csvCell(value) {
    let text = value == null ? '' : (typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : String(value));
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}

function downloadCsv(filename, headers, rows) {
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.hidden = true;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.exportData = async function (type) {
    if (!['assets', 'allocations', 'returns'].includes(type)) return;
    showToast('Preparing export for ' + type + '...', 'info');
    try {
        const response = await fetch(API_URL + '/' + type);
        if (!response.ok) {
            throw new Error(await apiErrorMessage(response, 'Export failed. Data might not be available.'));
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            showToast('No data available to export.', 'error');
            return;
        }

        // Every field that appears in any record, not only the first one
        const headers = [...new Set(data.flatMap(row => Object.keys(row)))].filter(k => k !== '__v' && k !== '_id');
        downloadCsv(type + '_export_' + new Date().toISOString().split('T')[0] + '.csv', headers, data.map(row => headers.map(h => row[h])));

        showToast('Export successful!', 'success');
        closeExportModal();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Export failed. Data might not be available.', 'error');
    }
};
window.exportKpiData = function () {
    const data = window.currentKpiFilteredData;
    if (!data || data.length === 0) {
        if (window.showToast) window.showToast('No data available to export.', 'warning');
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

    const rows = data.map(item => {
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
        return row;
    });

    // Blob download: a data: URI would cut the file at the first "#" in any cell
    const filename = (window.currentKpiCategory || 'Export') + '_Assets_' + new Date().toISOString().split('T')[0] + '.csv';
    downloadCsv(filename, headers, rows);
};

window.exportReportsToPDF = function () {
    const data = window.currentReportsFilteredData;
    if (!data || data.length === 0) {
        if (window.showToast) window.showToast('No data available to export.', 'warning');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (window.showToast) window.showToast('PDF Library not loaded yet. Please wait a moment.', 'error');
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


// =======================================================
// USER MANAGEMENT MODAL
// =======================================================
function openUserManagementModal() {
    const modal = document.getElementById('user-management-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Trigger opacity transition
        setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

function closeUserManagementModal() {
    const modal = document.getElementById('user-management-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            document.getElementById('internal-register-form').reset();
        }, 300);
    }
}
