/* ============================================
   Qualium AI - Employee Portal
   Shared Utilities, Auth & Routing
   ============================================ */

// ==================== Constants ====================
const ROLES = ['admin', 'frontend', 'backend', 'uiux', 'research', 'marketing', 'pr', 'design', 'hardware'];
const ROLE_LABELS = {
    admin: 'Admin', frontend: 'Frontend', backend: 'Backend',
    uiux: 'UI/UX', research: 'Research', marketing: 'Marketing',
    pr: 'PR', design: 'Design', hardware: 'Hardware'
};
const ROLE_COLORS = {
    admin: '#EF4444', frontend: '#3B82F6', backend: '#10B981',
    uiux: '#8B5CF6', research: '#F59E0B', marketing: '#EC4899',
    pr: '#06B6D4', design: '#F97316', hardware: '#6366F1'
};
const TASK_STATUSES = ['assigned', 'in-progress', 'submitted', 'completed'];
const TASK_STATUS_LABELS = {
    'assigned': 'Assigned', 'in-progress': 'In Progress',
    'submitted': 'Submitted', 'completed': 'Completed'
};
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// ==================== Toast System ====================
const ToastManager = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(type, title, message, duration = 4000) {
        this.init();
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${this.escapeHtml(title)}</div>
                ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
            </div>
            <button class="toast-close" onclick="this.closest('.toast').remove()">&times;</button>
        `;
        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(title, msg) { this.show('success', title, msg); },
    error(title, msg) { this.show('error', title, msg); },
    warning(title, msg) { this.show('warning', title, msg); },
    info(title, msg) { this.show('info', title, msg); },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ==================== Theme Manager ====================
const ThemeManager = {
    init() {
        const saved = localStorage.getItem('portal-theme') || 'light';
        this.setTheme(saved);
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        this.setTheme(current === 'dark' ? 'light' : 'dark');
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('portal-theme', theme);
    },

    get current() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }
};

// ==================== Auth Helpers ====================
const AuthManager = {
    currentUser: null,
    userData: null,
    unsubAuth: null,
    unsubUser: null,

    init(onReady) {
        this.unsubAuth = auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            if (user) {
                await this.loadUserData(user.uid);
            } else {
                this.userData = null;
            }
            if (onReady) onReady(user, this.userData);
        });
    },

    async loadUserData(uid) {
        // Try up to 3 times with small delays
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const doc = await db.collection('users').doc(uid).get();
                if (doc.exists) {
                    this.userData = { id: uid, ...doc.data() };
                    return;
                }
            } catch (e) {
                console.warn(`Load user data attempt ${attempt + 1} failed:`, e);
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 500));
        }

        // If still no data, auto-create a basic profile from Firebase Auth info
        if (!this.userData && this.currentUser) {
            console.warn('No Firestore profile found — creating one automatically');
            const user = this.currentUser;
            const defaultData = {
                email: user.email || '',
                name: user.displayName || user.email?.split('@')[0] || 'User',
                firstName: user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'User',
                lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
                phone: user.phoneNumber || '',
                role: this._guessRoleFromEmail(user.email),
                department: 'General',
                totpEnabled: false,
                totpSecret: '',
                status: 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                await db.collection('users').doc(uid).set(defaultData);
                this.userData = { id: uid, ...defaultData };
                console.log('Auto-created Firestore profile');
            } catch (e) {
                console.error('Failed to auto-create profile:', e);
                // Still set local data so the app works
                this.userData = { id: uid, ...defaultData };
            }
        }
    },

    _guessRoleFromEmail(email) {
        if (!email) return 'frontend';
        const local = email.split('@')[0].toLowerCase();
        const roleMap = { admin: 'admin', frontend: 'frontend', backend: 'backend', uiux: 'uiux', research: 'research', marketing: 'marketing', pr: 'pr', design: 'design', hardware: 'hardware' };
        return roleMap[local] || 'frontend';
    },

    async login(email, password) {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        return cred.user;
    },

    async logout() {
        if (this.unsubUser) this.unsubUser();
        await auth.signOut();
        this.currentUser = null;
        this.userData = null;
        window.location.href = '../login/';
    },

    getUserRole() {
        return this.userData?.role || 'frontend';
    },

    isAdmin() {
        return this.getUserRole() === 'admin';
    },

    getInitials(name) {
        if (!name) return '?';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    },

    destroy() {
        if (this.unsubAuth) this.unsubAuth();
        if (this.unsubUser) this.unsubUser();
    }
};

// ==================== API Helpers ====================
async function apiPost(endpoint, data) {
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : '';
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(err.message || 'Request failed');
    }
    return res.json();
}

async function apiGet(endpoint) {
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : '';
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(err.message || 'Request failed');
    }
    return res.json();
}

// ==================== Utility Functions ====================
function formatDate(timestamp) {
    if (!timestamp) return '—';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '—';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(timestamp);
}

function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() :
        'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== SVG Icons ====================
const Icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    invite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    moreVertical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
};

// ==================== Sidebar Builder ====================
function buildSidebar(role, activePage) {
    const userName = AuthManager.userData?.name || 'User';
    const userRole = ROLE_LABELS[role] || role;
    const initials = AuthManager.getInitials(userName);

    let navItems = '';

    if (role === 'admin') {
        navItems = `
            <div class="sidebar-section">
                <div class="sidebar-section-title">Overview</div>
                <a href="../admin/" class="sidebar-link ${activePage === 'dashboard' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.dashboard}</span> Dashboard
                </a>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-section-title">Management</div>
                <a href="../admin/#users" class="sidebar-link ${activePage === 'users' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.users}</span> Users
                </a>
                <a href="../admin/#tasks" class="sidebar-link ${activePage === 'tasks' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.tasks}</span> Tasks
                </a>
                <a href="../admin/#resources" class="sidebar-link ${activePage === 'resources' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.folder}</span> Resources
                </a>
                <a href="../admin/#announcements" class="sidebar-link ${activePage === 'announcements' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.megaphone}</span> Announcements
                </a>
                <a href="../admin/#invites" class="sidebar-link ${activePage === 'invites' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.invite}</span> Invitations
                </a>
                <a href="../admin/#notifications" class="sidebar-link ${activePage === 'notifications' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.bell}</span> Notifications
                    <span class="sidebar-link-badge" id="notifBadge" style="display:none">0</span>
                </a>
            </div>
        `;
    } else {
        navItems = `
            <div class="sidebar-section">
                <div class="sidebar-section-title">Main</div>
                <a href="../${role}/" class="sidebar-link ${activePage === 'dashboard' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.dashboard}</span> Dashboard
                </a>
                <a href="../${role}/#tasks" class="sidebar-link ${activePage === 'tasks' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.tasks}</span> My Tasks
                </a>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-section-title">Department</div>
                <a href="../${role}/#team" class="sidebar-link ${activePage === 'team' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.users}</span> Team Directory
                </a>
                <a href="../${role}/#resources" class="sidebar-link ${activePage === 'resources' ? 'active' : ''}">
                    <span class="sidebar-link-icon">${Icons.folder}</span> Resources
                </a>
            </div>
        `;
    }

    navItems += `
        <div class="sidebar-section">
            <div class="sidebar-section-title">Account</div>
            <a href="../profile/" class="sidebar-link ${activePage === 'profile' ? 'active' : ''}">
                <span class="sidebar-link-icon">${Icons.profile}</span> Profile
            </a>
            <a href="../settings/" class="sidebar-link ${activePage === 'settings' ? 'active' : ''}">
                <span class="sidebar-link-icon">${Icons.settings}</span> Settings
            </a>
        </div>
    `;

    return `
        <div class="sidebar-header">
            <a href="../" class="sidebar-logo">
                <img src="../assets/logo-white.png" alt="Qualium AI">
                <span class="sidebar-logo-text">Qualium AI</span>
                <span class="sidebar-logo-badge">Portal</span>
            </a>
        </div>
        <nav class="sidebar-nav">
            ${navItems}
        </nav>
        <div class="sidebar-footer">
            <div class="sidebar-user" onclick="document.getElementById('userDropdown').classList.toggle('open')">
                <div class="sidebar-avatar" style="background:${ROLE_COLORS[role] || '#2563EB'}">${escapeHtml(initials)}</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${escapeHtml(userName)}</div>
                    <div class="sidebar-user-role">${escapeHtml(userRole)}</div>
                </div>
            </div>
            <div class="dropdown" style="margin-top:4px">
                <div class="dropdown-menu" id="userDropdown">
                    <button class="dropdown-item" onclick="window.location.href='../profile/'">
                        <span style="width:16px;height:16px">${Icons.profile}</span> Profile
                    </button>
                    <button class="dropdown-item" onclick="window.location.href='../settings/'">
                        <span style="width:16px;height:16px">${Icons.settings}</span> Settings
                    </button>
                    <div class="dropdown-divider"></div>
                    <button class="dropdown-item danger" onclick="AuthManager.logout()">
                        <span style="width:16px;height:16px">${Icons.logout}</span> Sign Out
                    </button>
                </div>
            </div>
        </div>
    `;
}

function buildTopbar(breadcrumb, pageTitle) {
    const themeIcon = ThemeManager.current === 'dark' ? Icons.sun : Icons.moon;
    return `
        <div class="topbar-left">
            <button class="mobile-menu-btn" onclick="document.querySelector('.portal-sidebar').classList.toggle('open')">
                <span style="width:22px;height:22px">${Icons.menu}</span>
            </button>
            <div class="topbar-breadcrumb">
                <span>${escapeHtml(breadcrumb)}</span>
                <span class="topbar-breadcrumb-sep">/</span>
                <span class="topbar-breadcrumb-current">${escapeHtml(pageTitle)}</span>
            </div>
        </div>
        <div class="topbar-right">
            <button class="topbar-btn" onclick="ThemeManager.toggle(); location.reload()" title="Toggle theme">
                <span style="width:18px;height:18px">${themeIcon}</span>
            </button>
            <button class="topbar-btn" onclick="window.location.href='../admin/#notifications'" title="Notifications">
                <span style="width:18px;height:18px">${Icons.bell}</span>
                <span class="notif-dot" id="topbarNotifDot" style="display:none"></span>
            </button>
        </div>
    `;
}

// ==================== Auth Guard ====================
function requireAuth(allowedRoles, callback) {
    ThemeManager.init();
    AuthManager.init((user, userData) => {
        const loadingEl = document.getElementById('loadingOverlay');
        if (!user) {
            window.location.href = '../login/';
            return;
        }
        // userData should always exist now (auto-created if missing)
        if (!userData) {
            // This shouldn't happen with the new loadUserData, but just in case
            console.error('Failed to load or create user profile');
            if (loadingEl) loadingEl.innerHTML = '<div class="spinner spinner-lg"></div><div class="loading-text">Retrying...</div>';
            // Retry once more after 2 seconds
            setTimeout(async () => {
                await AuthManager.loadUserData(user.uid);
                if (AuthManager.userData) {
                    location.reload();
                } else {
                    window.location.href = '../login/';
                }
            }, 2000);
            return;
        }
        const role = userData.role || 'frontend';
        if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
            window.location.href = `../${role}/`;
            return;
        }
        if (loadingEl) {
            loadingEl.classList.add('hide');
            setTimeout(() => loadingEl.remove(), 300);
        }
        callback(user, userData);
    });
}

// ==================== Modal Helpers ====================
function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    document.querySelectorAll('.dropdown-menu.open').forEach(menu => {
        if (!menu.parentElement.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
});

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
        e.target.classList.remove('open');
    }
});
