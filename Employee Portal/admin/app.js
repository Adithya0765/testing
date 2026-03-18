/* ============================================
   Admin Panel Logic
   ============================================ */

(function() {
    let allUsers = [];
    let allTasks = [];
    let allInvites = [];
    let allNotifications = [];
    let allResources = [];
    let allAnnouncements = [];
    let currentTab = 'dashboard';
    let unsubUsers = null;
    let unsubTasks = null;
    let unsubNotifs = null;
    let unsubResources = null;
    let unsubAnnouncements = null;

    // Auth guard: admin only
    requireAuth(['admin'], (user, userData) => {
        document.getElementById('portalLayout').style.display = '';
        initAdmin(user, userData);
    });

    function initAdmin(user, userData) {
        // Build sidebar & topbar
        document.getElementById('sidebar').innerHTML = buildSidebar('admin', 'dashboard');
        document.getElementById('topbar').innerHTML = buildTopbar('Admin', 'Dashboard');

        // Check hash for tab
        handleHash();
        window.addEventListener('hashchange', handleHash);

        // Setup real-time listeners
        setupListeners();

        // Setup modals
        // Setup modals
        setupInviteModal();
        setupTaskModal();
        injectAdminResourceModal();
        injectAdminAnnouncementModal();
    }

    function handleHash() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        const tabMap = { '': 'dashboard', 'users': 'users', 'tasks': 'tasks', 'resources': 'resources', 'announcements': 'announcements', 'invites': 'invites', 'notifications': 'notifications' };
        currentTab = tabMap[hash] || 'dashboard';
        renderCurrentTab();
        updateSidebarActive();
    }

    function updateSidebarActive() {
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href') || '';
            if (currentTab === 'dashboard' && (href.endsWith('/admin/') || href.endsWith('/admin/#'))) {
                link.classList.add('active');
            } else if (currentTab !== 'dashboard' && href.includes('#' + currentTab)) {
                link.classList.add('active');
            }
        });
    }

    function setupListeners() {
        // Users
        unsubUsers = db.collection('users').onSnapshot(snap => {
            allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (currentTab === 'dashboard' || currentTab === 'users') renderCurrentTab();
            populateAssigneeDropdown();
        });

        // Tasks
        unsubTasks = db.collection('tasks').orderBy('createdAt', 'desc').onSnapshot(snap => {
            allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (currentTab === 'dashboard' || currentTab === 'tasks') renderCurrentTab();
        });

        // Invitations
        db.collection('invitations').orderBy('createdAt', 'desc').onSnapshot(snap => {
            allInvites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (currentTab === 'invites') renderCurrentTab();
        });

        // Resources
        unsubResources = db.collection('resources').orderBy('createdAt', 'desc').onSnapshot(snap => {
            allResources = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (currentTab === 'resources') renderCurrentTab();
        });

        // Announcements
        unsubAnnouncements = db.collection('announcements').orderBy('createdAt', 'desc').onSnapshot(snap => {
            allAnnouncements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (currentTab === 'announcements') renderCurrentTab();
        });

        // Notifications
        unsubNotifs = db.collection('notifications').orderBy('createdAt', 'desc').limit(50).onSnapshot(snap => {
            allNotifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const unread = allNotifications.filter(n => !n.read).length;
            const badge = document.getElementById('notifBadge');
            if (badge) {
                badge.textContent = unread;
                badge.style.display = unread > 0 ? '' : 'none';
            }
            const topDot = document.getElementById('topbarNotifDot');
            if (topDot) topDot.style.display = unread > 0 ? '' : 'none';
            if (currentTab === 'notifications') renderCurrentTab();
        });
    }

    function populateAssigneeDropdown() {
        const sel = document.getElementById('taskAssignee');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Unassigned</option>' +
            allUsers.filter(u => u.status === 'active').map(u =>
                `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`
            ).join('');
        sel.value = current;
    }

    function renderCurrentTab() {
        const content = document.getElementById('mainContent');
        const topbar = document.getElementById('topbar');

        switch (currentTab) {
            case 'dashboard': renderDashboard(content); topbar.innerHTML = buildTopbar('Admin', 'Dashboard'); break;
            case 'users': renderUsers(content); topbar.innerHTML = buildTopbar('Admin', 'Users'); break;
            case 'tasks': renderTasks(content); topbar.innerHTML = buildTopbar('Admin', 'Tasks'); break;
            case 'resources': renderResources(content); topbar.innerHTML = buildTopbar('Admin', 'Resources'); break;
            case 'announcements': renderAnnouncements(content); topbar.innerHTML = buildTopbar('Admin', 'Announcements'); break;
            case 'invites': renderInvites(content); topbar.innerHTML = buildTopbar('Admin', 'Invitations'); break;
            case 'notifications': renderNotifications(content); topbar.innerHTML = buildTopbar('Admin', 'Notifications'); break;
        }
    }

    // ==================== Dashboard View ====================
    function renderDashboard(container) {
        const activeUsers = allUsers.filter(u => u.status === 'active').length;
        const pendingTasks = allTasks.filter(t => t.status !== 'completed').length;
        const submittedTasks = allTasks.filter(t => t.status === 'submitted').length;
        const completedTasks = allTasks.filter(t => t.status === 'completed').length;

        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Admin Dashboard</h1>
                        <p class="page-subtitle">Overview of your organization</p>
                    </div>
                    <div style="display:flex;gap:10px">
                        <button class="btn btn-secondary" onclick="openModal('taskModal')">
                            <span style="width:16px;height:16px">${Icons.plus}</span> New Task
                        </button>
                        <button class="btn btn-primary" onclick="openModal('inviteModal')">
                            <span style="width:16px;height:16px">${Icons.invite}</span> Invite Employee
                        </button>
                    </div>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">${Icons.users}</div>
                    <div class="stat-content">
                        <div class="stat-value">${activeUsers}</div>
                        <div class="stat-label">Active Members</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon warning">${Icons.clipboard}</div>
                    <div class="stat-content">
                        <div class="stat-value">${pendingTasks}</div>
                        <div class="stat-label">Pending Tasks</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon info">${Icons.upload}</div>
                    <div class="stat-content">
                        <div class="stat-value">${submittedTasks}</div>
                        <div class="stat-label">Awaiting Review</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon success">${Icons.check}</div>
                    <div class="stat-content">
                        <div class="stat-value">${completedTasks}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                </div>
            </div>

            <div class="admin-grid">
                <div class="card">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">Tasks Awaiting Review</h3>
                            <p class="card-subtitle">Tasks submitted by team members</p>
                        </div>
                    </div>
                    <div id="submittedTasksList">
                        ${renderSubmittedTasks()}
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">Recent Activity</h3>
                            <p class="card-subtitle">Latest notifications</p>
                        </div>
                    </div>
                    <div class="activity-list">
                        ${allNotifications.slice(0, 8).map(n => `
                            <div class="activity-item">
                                <div class="activity-dot" style="background:${n.read ? 'var(--color-border)' : 'var(--color-accent)'}"></div>
                                <div class="activity-content">
                                    <div class="activity-text"><strong>${escapeHtml(n.title)}</strong> ${escapeHtml(n.message || '')}</div>
                                    <div class="activity-time">${timeAgo(n.createdAt)}</div>
                                </div>
                            </div>
                        `).join('') || '<div class="empty-state"><p class="empty-state-text">No recent activity</p></div>'}
                    </div>
                </div>
                <div class="card admin-grid-full">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">Team Members</h3>
                            <p class="card-subtitle">${activeUsers} active members</p>
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="window.location.hash='users'">View All</button>
                    </div>
                    ${renderUsersCompact()}
                </div>
            </div>
        `;
    }

    function renderSubmittedTasks() {
        const submitted = allTasks.filter(t => t.status === 'submitted');
        if (!submitted.length) return '<div class="empty-state"><p class="empty-state-text">No tasks awaiting review</p></div>';

        return submitted.map(t => {
            const assignee = allUsers.find(u => u.id === t.assignedTo);
            return `
                <div class="task-card" style="margin-bottom:12px">
                    <div class="task-card-header">
                        <div class="task-card-title">${escapeHtml(t.title)}</div>
                        <span class="badge badge-primary">Submitted</span>
                    </div>
                    <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:8px">${escapeHtml(t.description || '')}</p>
                    ${t.notes && t.notes.length ? t.notes.map(n => `<div class="task-note">${escapeHtml(n)}</div>`).join('') : ''}
                    <div class="task-card-meta">
                        <span class="task-meta-item">${Icons.profile} ${escapeHtml(assignee?.name || 'Unknown')}</span>
                        <span class="task-meta-item">${Icons.calendar} ${formatDate(t.submittedAt || t.createdAt)}</span>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn btn-success btn-sm" onclick="markTaskComplete('${t.id}')">
                            ${Icons.check} Mark Complete
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="returnTask('${t.id}')">
                            Return for Revision
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderUsersCompact() {
        if (!allUsers.length) return '<div class="empty-state"><p class="empty-state-text">No team members yet</p></div>';

        return `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Member</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
                    <tbody>
                        ${allUsers.slice(0, 10).map(u => `
                            <tr>
                                <td style="display:flex;align-items:center;gap:10px">
                                    <div class="avatar avatar-sm" style="background:${ROLE_COLORS[u.role] || '#2563EB'}">${escapeHtml(AuthManager.getInitials(u.name))}</div>
                                    <div>
                                        <div style="font-weight:600;font-size:14px">${escapeHtml(u.name || u.email)}</div>
                                        <div style="font-size:12px;color:var(--color-text-tertiary)">${escapeHtml(u.email)}</div>
                                    </div>
                                </td>
                                <td><span class="badge badge-primary">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</span></td>
                                <td>${escapeHtml(u.department || '—')}</td>
                                <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-neutral'}">${escapeHtml(u.status || 'active')}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==================== Users View ====================
    function renderUsers(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Team Members</h1>
                        <p class="page-subtitle">${allUsers.length} total members</p>
                    </div>
                    <button class="btn btn-primary" onclick="openModal('inviteModal')">
                        <span style="width:16px;height:16px">${Icons.invite}</span> Invite Employee
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Member</th><th>Role</th><th>Department</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr></thead>
                        <tbody>
                            ${allUsers.map(u => `
                                <tr>
                                    <td style="display:flex;align-items:center;gap:12px">
                                        <div class="avatar" style="background:${ROLE_COLORS[u.role] || '#2563EB'}">${escapeHtml(AuthManager.getInitials(u.name))}</div>
                                        <div>
                                            <div style="font-weight:600">${escapeHtml(u.name || 'No Name')}</div>
                                            <div style="font-size:12px;color:var(--color-text-tertiary)">${escapeHtml(u.email)}</div>
                                        </div>
                                    </td>
                                    <td><span class="badge badge-primary">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</span></td>
                                    <td>${escapeHtml(u.department || '—')}</td>
                                    <td style="font-size:13px">${escapeHtml(u.phone || '—')}</td>
                                    <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-warning'}">${escapeHtml(u.status || 'active')}</span></td>
                                    <td style="font-size:13px;color:var(--color-text-tertiary)">${formatDate(u.createdAt)}</td>
                                    <td>
                                        <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}', '${u.status}')">
                                            ${u.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="7"><div class="empty-state"><p class="empty-state-text">No team members yet</p></div></td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ==================== Tasks View ====================
    function renderTasks(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Task Management</h1>
                        <p class="page-subtitle">${allTasks.length} total tasks</p>
                    </div>
                    <button class="btn btn-primary" onclick="openModal('taskModal')">
                        <span style="width:16px;height:16px">${Icons.plus}</span> Create Task
                    </button>
                </div>
            </div>

            <div class="tabs" id="taskTabs">
                <button class="tab-btn active" data-tab="all">All (${allTasks.length})</button>
                <button class="tab-btn" data-tab="assigned">Assigned (${allTasks.filter(t=>t.status==='assigned').length})</button>
                <button class="tab-btn" data-tab="in-progress">In Progress (${allTasks.filter(t=>t.status==='in-progress').length})</button>
                <button class="tab-btn" data-tab="submitted">Submitted (${allTasks.filter(t=>t.status==='submitted').length})</button>
                <button class="tab-btn" data-tab="completed">Completed (${allTasks.filter(t=>t.status==='completed').length})</button>
            </div>

            <div id="tasksGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
                ${renderTaskCards(allTasks)}
            </div>
        `;

        // Tab click handlers
        document.querySelectorAll('#taskTabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#taskTabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                const filtered = tab === 'all' ? allTasks : allTasks.filter(t => t.status === tab);
                document.getElementById('tasksGrid').innerHTML = renderTaskCards(filtered);
            });
        });
    }

    function renderTaskCards(tasks) {
        if (!tasks.length) return '<div class="empty-state" style="grid-column:1/-1"><p class="empty-state-text">No tasks found</p></div>';

        return tasks.map(t => {
            const assignee = allUsers.find(u => u.id === t.assignedTo);
            const statusBadge = {
                'assigned': 'badge-primary', 'in-progress': 'badge-warning',
                'submitted': 'badge-info', 'completed': 'badge-success'
            };
            return `
                <div class="task-card">
                    <div class="task-card-header">
                        <div class="task-card-title">${escapeHtml(t.title)}</div>
                        <span class="badge ${statusBadge[t.status] || 'badge-neutral'}">${escapeHtml(TASK_STATUS_LABELS[t.status] || t.status)}</span>
                    </div>
                    <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:8px;line-height:1.5">${escapeHtml((t.description || '').slice(0, 100))}${(t.description || '').length > 100 ? '...' : ''}</p>
                    ${t.progress > 0 ? `
                        <div style="margin-bottom:8px">
                            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px">
                                <span>Progress</span><span>${t.progress}%</span>
                            </div>
                            <div class="progress-bar"><div class="progress-fill ${t.progress >= 100 ? 'success' : ''}" style="width:${t.progress}%"></div></div>
                        </div>
                    ` : ''}
                    <div class="task-card-meta">
                        <span class="task-meta-item">
                            <span class="task-priority ${t.priority || 'medium'}"></span>
                            ${escapeHtml((t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1))}
                        </span>
                        <span class="task-meta-item">${Icons.profile} ${escapeHtml(assignee?.name || 'Unassigned')}</span>
                        ${t.deadline ? `<span class="task-meta-item">${Icons.calendar} ${formatDate(t.deadline)}</span>` : ''}
                    </div>
                    ${t.status === 'submitted' ? `
                        <div style="display:flex;gap:8px;margin-top:12px">
                            <button class="btn btn-success btn-sm" onclick="markTaskComplete('${t.id}')">Complete</button>
                            <button class="btn btn-secondary btn-sm" onclick="returnTask('${t.id}')">Return</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // ==================== Invites View ====================
    function renderInvites(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Invitations</h1>
                        <p class="page-subtitle">${allInvites.length} invitations sent</p>
                    </div>
                    <button class="btn btn-primary" onclick="openModal('inviteModal')">
                        <span style="width:16px;height:16px">${Icons.invite}</span> Send Invite
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Employee</th><th>Email</th><th>Role</th><th>Status</th><th>Sent</th></tr></thead>
                        <tbody>
                            ${allInvites.map(inv => {
                                const statusCls = { pending: 'badge-warning', accepted: 'badge-success', expired: 'badge-error' };
                                return `
                                    <tr>
                                        <td style="font-weight:600">${escapeHtml((inv.firstName || '') + ' ' + (inv.lastName || ''))}</td>
                                        <td>${escapeHtml(inv.email)}</td>
                                        <td><span class="badge badge-primary">${escapeHtml(ROLE_LABELS[inv.role] || inv.role)}</span></td>
                                        <td><span class="badge ${statusCls[inv.status] || 'badge-neutral'}">${escapeHtml(inv.status)}</span></td>
                                        <td style="font-size:13px;color:var(--color-text-tertiary)">${formatDate(inv.createdAt)}</td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">No invitations sent yet</p></div></td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ==================== Notifications View ====================
    function renderNotifications(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Notifications</h1>
                        <p class="page-subtitle">${allNotifications.filter(n => !n.read).length} unread</p>
                    </div>
                    <button class="btn btn-secondary" onclick="markAllNotificationsRead()">Mark All Read</button>
                </div>
            </div>

            <div class="card">
                <div class="activity-list">
                    ${allNotifications.map(n => `
                        <div class="activity-item" style="cursor:pointer;${n.read ? 'opacity:0.6' : ''}" onclick="markNotificationRead('${n.id}')">
                            <div class="activity-dot" style="background:${n.read ? 'var(--color-border)' : 'var(--color-accent)'}"></div>
                            <div class="activity-content">
                                <div class="activity-text"><strong>${escapeHtml(n.title)}</strong></div>
                                <div style="font-size:13px;color:var(--color-text-secondary);margin-top:2px">${escapeHtml(n.message || '')}</div>
                                <div class="activity-time">${timeAgo(n.createdAt)}</div>
                            </div>
                        </div>
                    `).join('') || '<div class="empty-state"><p class="empty-state-text">No notifications</p></div>'}
                </div>
            </div>
        `;
    }

    // ==================== Invite Modal ====================
    function setupInviteModal() {
        document.getElementById('inviteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('sendInviteBtn');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            const firstName = document.getElementById('invFirstName').value.trim();
            const lastName = document.getElementById('invLastName').value.trim();
            const email = document.getElementById('invEmail').value.trim();
            const role = document.getElementById('invRole').value;
            const department = document.getElementById('invDepartment').value.trim();
            const phone = document.getElementById('invPhone').value.trim();

            if (!firstName || !lastName || !email) {
                document.getElementById('inviteError').textContent = 'Please fill in all required fields';
                document.getElementById('inviteError').style.display = '';
                btn.disabled = false;
                btn.textContent = 'Send Invitation';
                return;
            }

            try {
                const token = generateId();
                const invRef = await db.collection('invitations').add({
                    firstName, lastName, email, role,
                    department: department || 'General',
                    phone,
                    token,
                    status: 'pending',
                    invitedBy: AuthManager.currentUser.uid,
                    invitedByName: AuthManager.userData?.name || 'Admin',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Send invitation email via API
                try {
                    await fetch('../api/invite', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${await AuthManager.currentUser.getIdToken()}`
                        },
                        body: JSON.stringify({
                            inviteId: invRef.id, token, email, firstName, lastName, role, department
                        })
                    });
                } catch (apiErr) {
                    // Email may fail, but invitation is saved
                    console.warn('Email send failed:', apiErr);
                }

                // Create notification
                await db.collection('notifications').add({
                    userId: 'admin',
                    title: 'Invitation Sent',
                    message: `Invitation sent to ${firstName} ${lastName} (${email})`,
                    type: 'invite',
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                closeModal('inviteModal');
                document.getElementById('inviteForm').reset();
                ToastManager.success('Invitation Sent', `Invitation sent to ${firstName} ${lastName}`);
            } catch (err) {
                document.getElementById('inviteError').textContent = err.message || 'Failed to send invitation';
                document.getElementById('inviteError').style.display = '';
            }

            btn.disabled = false;
            btn.textContent = 'Send Invitation';
        });
    }

    // ==================== Task Modal ====================
    function setupTaskModal() {
        document.getElementById('taskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveTaskBtn');
            btn.disabled = true;

            const editId = document.getElementById('taskEditId').value;
            const title = document.getElementById('taskTitle').value.trim();
            const description = document.getElementById('taskDesc').value.trim();
            const assignedTo = document.getElementById('taskAssignee').value;
            const priority = document.getElementById('taskPriority').value;
            const department = document.getElementById('taskDept').value.trim();
            const deadline = document.getElementById('taskDeadline').value;

            if (!title) {
                document.getElementById('taskError').textContent = 'Task title is required';
                document.getElementById('taskError').style.display = '';
                btn.disabled = false;
                return;
            }

            const taskData = {
                title, description, assignedTo, priority,
                department: department || 'General',
                deadline: deadline || null,
                status: 'assigned',
                progress: 0,
                notes: [],
                screenshots: [],
                assignedBy: AuthManager.currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                if (editId) {
                    await db.collection('tasks').doc(editId).update(taskData);
                    ToastManager.success('Task Updated', `"${title}" has been updated`);
                } else {
                    taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('tasks').add(taskData);

                    // Notify assignee
                    if (assignedTo) {
                        await db.collection('notifications').add({
                            userId: assignedTo,
                            title: 'New Task Assigned',
                            message: `You have been assigned: "${title}"`,
                            type: 'task',
                            read: false,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    ToastManager.success('Task Created', `"${title}" has been assigned`);
                }

                closeModal('taskModal');
                document.getElementById('taskForm').reset();
                document.getElementById('taskEditId').value = '';
            } catch (err) {
                document.getElementById('taskError').textContent = err.message;
                document.getElementById('taskError').style.display = '';
            }

            btn.disabled = false;
        });
    }

    // ==================== Global Actions ====================
    window.markTaskComplete = async function(taskId) {
        try {
            await db.collection('tasks').doc(taskId).update({
                status: 'completed',
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const task = allTasks.find(t => t.id === taskId);
            if (task && task.assignedTo) {
                await db.collection('notifications').add({
                    userId: task.assignedTo,
                    title: 'Task Completed',
                    message: `Your task "${task.title}" has been marked as complete`,
                    type: 'task',
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            ToastManager.success('Task Completed', 'Task has been marked as complete');
        } catch (e) {
            ToastManager.error('Error', e.message);
        }
    };

    window.returnTask = async function(taskId) {
        try {
            await db.collection('tasks').doc(taskId).update({
                status: 'in-progress',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const task = allTasks.find(t => t.id === taskId);
            if (task && task.assignedTo) {
                await db.collection('notifications').add({
                    userId: task.assignedTo,
                    title: 'Task Returned',
                    message: `Your task "${task.title}" has been returned for revision`,
                    type: 'task',
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            ToastManager.info('Task Returned', 'Task returned for revision');
        } catch (e) {
            ToastManager.error('Error', e.message);
        }
    };

    window.toggleUserStatus = async function(userId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
        try {
            await db.collection('users').doc(userId).update({ status: newStatus });
            ToastManager.success('User Updated', `User has been ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
        } catch (e) {
            ToastManager.error('Error', e.message);
        }
    };

    window.markNotificationRead = async function(notifId) {
        try {
            await db.collection('notifications').doc(notifId).update({ read: true });
        } catch (e) {}
    };

    window.markAllNotificationsRead = async function() {
        try {
            const batch = db.batch();
            allNotifications.filter(n => !n.read).forEach(n => {
                batch.update(db.collection('notifications').doc(n.id), { read: true });
            });
            await batch.commit();
            ToastManager.success('Done', 'All notifications marked as read');
        } catch (e) {
            ToastManager.error('Error', e.message);
        }
    };

    // ==================== Admin Resources View ====================
    function renderResources(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Global Resources Manager</h1>
                        <p class="page-subtitle">Manage resources across all departments</p>
                    </div>
                    <button class="btn btn-primary" onclick="openModal('adminResourceModal')">
                        <span style="width:16px;height:16px">${Icons.plus}</span> Add Resource
                    </button>
                </div>
            </div>

            <div class="tabs" id="adminResourceTabs">
                <button class="tab-btn active" data-dept="all">All</button>
                ${[...new Set(allResources.map(r => r.department))].filter(Boolean).map(d => `<button class="tab-btn" data-dept="${d}">${escapeHtml(d)}</button>`).join('')}
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Title</th><th>Type</th><th>Department</th><th>Added By</th><th>Status</th><th></th></tr></thead>
                        <tbody id="adminResourceTbody">
                            ${renderResourceTableRows(allResources)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.querySelectorAll('#adminResourceTabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#adminResourceTabs .tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const dept = e.target.dataset.dept;
                const filtered = dept === 'all' ? allResources : allResources.filter(r => r.department === dept);
                document.getElementById('adminResourceTbody').innerHTML = renderResourceTableRows(filtered);
            });
        });
    }

    function renderResourceTableRows(resources) {
        if (!resources.length) return '<tr><td colspan="6"><div class="empty-state"><p class="empty-state-text">No resources found</p></div></td></tr>';

        return resources.map(r => {
            const addedByUser = allUsers.find(u => u.id === r.addedBy);
            return `
                <tr>
                    <td>
                        <div style="font-weight:600">${escapeHtml(r.title)}</div>
                        ${r.url ? `<a href="${r.url}" target="_blank" style="font-size:12px;color:var(--color-primary)">View Link</a>` : ''}
                    </td>
                    <td><span class="badge badge-neutral">${escapeHtml(r.type)}</span></td>
                    <td>${escapeHtml(r.department)}</td>
                    <td style="font-size:13px">${escapeHtml(addedByUser?.name || 'Unknown')}</td>
                    <td><span class="badge ${r.status === 'outdated' ? 'badge-warning' : 'badge-success'}">${escapeHtml(r.status)}</span></td>
                    <td>
                        <button class="btn btn-ghost btn-sm" style="color:var(--color-error)" onclick="deleteAdminResource('${r.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==================== Admin Announcements View ====================
    function renderAnnouncements(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Global Noticeboard</h1>
                        <p class="page-subtitle">Post company-wide announcements</p>
                    </div>
                    <button class="btn btn-primary" onclick="openModal('adminAnnounceModal')">
                        <span style="width:16px;height:16px">${Icons.megaphone || Icons.plus}</span> New Announcement
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Title / Message</th><th>Type</th><th>Posted By</th><th>Date</th><th></th></tr></thead>
                        <tbody>
                            ${allAnnouncements.map(a => {
                                const poster = allUsers.find(u => u.id === a.postedBy);
                                const badgeClass = a.type === 'critical' ? 'badge-error' : (a.type === 'update' ? 'badge-primary' : 'badge-neutral');
                                return `
                                    <tr>
                                        <td>
                                            <div style="font-weight:600">${escapeHtml(a.title)}</div>
                                            <div style="font-size:13px;color:var(--color-text-secondary);max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.message)}</div>
                                        </td>
                                        <td><span class="badge ${badgeClass}">${escapeHtml(a.type.toUpperCase())}</span></td>
                                        <td style="font-size:13px">${escapeHtml(poster?.name || 'Admin')}</td>
                                        <td style="font-size:13px;color:var(--color-text-tertiary)">${timeAgo(a.createdAt)}</td>
                                        <td>
                                            <button class="btn btn-ghost btn-sm" style="color:var(--color-error)" onclick="deleteAdminAnnouncement('${a.id}')">Delete</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">No announcements posted</p></div></td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function injectAdminResourceModal() {
        if(document.getElementById('adminResourceModal')) return;
        const html = `
            <div class="modal-overlay" id="adminResourceModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Add Global Resource</h2>
                        <button class="modal-close" onclick="closeModal('adminResourceModal')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="adminResourceForm" onsubmit="event.preventDefault(); submitAdminResource();">
                            <div class="form-group">
                                <label class="form-label">Title *</label>
                                <input type="text" id="arTitle" class="form-input" required>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Type *</label>
                                    <select id="arType" class="form-input" required>
                                        <option value="link">Link / URL</option>
                                        <option value="document">Document Link</option>
                                        <option value="credential">Credential Note</option>
                                        <option value="note">Internal Note</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Department *</label>
                                    <select id="arDept" class="form-input" required>
                                        <option value="General">General / All</option>
                                        <option value="Engineering">Engineering</option>
                                        <option value="Design">Design</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="HR">HR</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">URL / Link</label>
                                <input type="url" id="arUrl" class="form-input" placeholder="https://...">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Description</label>
                                <textarea id="arDesc" class="form-textarea" rows="3"></textarea>
                            </div>
                            <div class="form-actions" style="margin-top:24px;display:flex;justify-content:flex-end;gap:12px">
                                <button type="button" class="btn btn-secondary" onclick="closeModal('adminResourceModal')">Cancel</button>
                                <button type="submit" class="btn btn-primary" id="arSaveBtn">Save Resource</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        window.submitAdminResource = async () => {
            const btn = document.getElementById('arSaveBtn');
            btn.disabled = true;
            try {
                await db.collection('resources').add({
                    title: document.getElementById('arTitle').value,
                    type: document.getElementById('arType').value,
                    department: document.getElementById('arDept').value,
                    url: document.getElementById('arUrl').value,
                    description: document.getElementById('arDesc').value,
                    addedBy: AuthManager.currentUser.uid,
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                ToastManager.success('Resource Added', 'Global resource created');
                closeModal('adminResourceModal');
                document.getElementById('adminResourceForm').reset();
            } catch(e) {
                ToastManager.error('Error', e.message);
            }
            btn.disabled = false;
        };

        window.deleteAdminResource = async (id) => {
            if(!confirm('Delete this resource globally?')) return;
            try {
                await db.collection('resources').doc(id).delete();
                ToastManager.success('Deleted', 'Resource deleted');
            } catch(e) { ToastManager.error('Error', e.message); }
        };
    }

    function injectAdminAnnouncementModal() {
        if(document.getElementById('adminAnnounceModal')) return;
        const html = `
            <div class="modal-overlay" id="adminAnnounceModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Post Announcement</h2>
                        <button class="modal-close" onclick="closeModal('adminAnnounceModal')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="adminAnnounceForm" onsubmit="event.preventDefault(); submitAdminAnnouncement();">
                            <div class="form-group">
                                <label class="form-label">Title *</label>
                                <input type="text" id="aaTitle" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Type *</label>
                                <select id="aaType" class="form-input" required>
                                    <option value="general">General update</option>
                                    <option value="event">Upcoming event</option>
                                    <option value="critical">Critical priority</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Message *</label>
                                <textarea id="aaMessage" class="form-textarea" rows="4" required></textarea>
                            </div>
                            <div class="form-actions" style="margin-top:24px;display:flex;justify-content:flex-end;gap:12px">
                                <button type="button" class="btn btn-secondary" onclick="closeModal('adminAnnounceModal')">Cancel</button>
                                <button type="submit" class="btn btn-primary" id="aaSaveBtn">Publish</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        window.submitAdminAnnouncement = async () => {
            const btn = document.getElementById('aaSaveBtn');
            btn.disabled = true;
            try {
                await db.collection('announcements').add({
                    title: document.getElementById('aaTitle').value,
                    type: document.getElementById('aaType').value,
                    message: document.getElementById('aaMessage').value,
                    postedBy: AuthManager.currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                ToastManager.success('Published', 'Announcement posted globally');
                closeModal('adminAnnounceModal');
                document.getElementById('adminAnnounceForm').reset();
            } catch(e) {
                ToastManager.error('Error', e.message);
            }
            btn.disabled = false;
        };

        window.deleteAdminAnnouncement = async (id) => {
            if(!confirm('Remove this announcement globally?')) return;
            try {
                await db.collection('announcements').doc(id).delete();
                ToastManager.success('Removed', 'Announcement deleted');
            } catch(e) { ToastManager.error('Error', e.message); }
        };
    }

})();
