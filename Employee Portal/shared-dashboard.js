/* ============================================
   Employee Dashboard - Shared Logic
   Used by all role dashboards (frontend, backend, etc.)
   ============================================ */

function initEmployeeDashboard(roleName, roleLabel) {
    let myTasks = [];
    let myNotifs = [];
    let allAnnouncements = [];
    let unsubTasks = null;
    let unsubNotifs = null;
    let unsubAnnouncements = null;

    requireAuth([roleName], (user, userData) => {
        document.getElementById('portalLayout').style.display = '';
        document.getElementById('sidebar').innerHTML = buildSidebar(roleName, 'dashboard');
        document.getElementById('topbar').innerHTML = buildTopbar(roleLabel, 'Dashboard');

        handleHash();
        window.addEventListener('hashchange', handleHash);
        setupListeners(user.uid);
    });

    function handleHash() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        renderView(hash);
    }

    function setupListeners(uid) {
        // My tasks
        unsubTasks = db.collection('tasks')
            .where('assignedTo', '==', uid)
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                myTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderView(window.location.hash.replace('#', '') || 'dashboard');
            });

        // My notifications
        unsubNotifs = db.collection('notifications')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(30)
            .onSnapshot(snap => {
                myNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const unread = myNotifs.filter(n => !n.read).length;
                const dot = document.getElementById('topbarNotifDot');
                if (dot) dot.style.display = unread > 0 ? '' : 'none';
            });

        // Global Announcements
        unsubAnnouncements = db.collection('announcements')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .onSnapshot(snap => {
                allAnnouncements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if ((window.location.hash.replace('#', '') || 'dashboard') === 'dashboard') {
                    renderView('dashboard');
                }
            });
    }

    function renderView(view) {
        const content = document.getElementById('mainContent');
        const topbar = document.getElementById('topbar');

        if (view === 'tasks') {
            topbar.innerHTML = buildTopbar(roleLabel, 'My Tasks');
            renderTasksView(content);
        } else if (view === 'team') {
            topbar.innerHTML = buildTopbar(roleLabel, 'Team Directory');
            renderTeamView(content);
        } else if (view === 'resources') {
            topbar.innerHTML = buildTopbar(roleLabel, 'Department Resources');
            renderResourcesView(content);
        } else {
            view = 'dashboard';
            topbar.innerHTML = buildTopbar(roleLabel, 'Dashboard');
            renderDashboardView(content);
        }

        // Update sidebar active
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href') || '';
            const targetHash = href.split('#')[1];
            
            if (view === 'tasks' && targetHash === 'tasks') link.classList.add('active');
            else if (view === 'team' && targetHash === 'team') link.classList.add('active');
            else if (view === 'resources' && targetHash === 'resources') link.classList.add('active');
            else if (view === 'dashboard' && !href.includes('#')) link.classList.add('active');
        });
    }

    function renderDashboardView(container) {
        const user = AuthManager.userData;
        const assigned = myTasks.filter(t => t.status === 'assigned').length;
        const inProgress = myTasks.filter(t => t.status === 'in-progress').length;
        const submitted = myTasks.filter(t => t.status === 'submitted').length;
        const completed = myTasks.filter(t => t.status === 'completed').length;

        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">Welcome back, ${escapeHtml(user?.firstName || user?.name?.split(' ')[0] || 'Team Member')}!</h1>
                        <p class="page-subtitle">${escapeHtml(roleLabel)} · ${escapeHtml(user?.department || 'General')}</p>
                    </div>
                    <div class="tag" style="font-size:13px;padding:6px 16px;background:${ROLE_COLORS[roleName] || 'var(--color-accent)'};color:#fff;border:none;font-weight:600">
                        ${escapeHtml(roleLabel)}
                    </div>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">${Icons.clipboard}</div>
                    <div class="stat-content">
                        <div class="stat-value">${assigned}</div>
                        <div class="stat-label">Assigned</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon warning">${Icons.edit}</div>
                    <div class="stat-content">
                        <div class="stat-value">${inProgress}</div>
                        <div class="stat-label">In Progress</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon info">${Icons.upload}</div>
                    <div class="stat-content">
                        <div class="stat-value">${submitted}</div>
                        <div class="stat-label">Submitted</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon success">${Icons.check}</div>
                    <div class="stat-content">
                        <div class="stat-value">${completed}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                </div>
            </div>

            ${allAnnouncements.length > 0 ? `
            <div class="card" style="margin-bottom:20px; border-left: 4px solid var(--color-accent)">
                <div class="card-header" style="margin-bottom:12px; border-bottom: none; padding-bottom:0">
                    <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
                        <span style="color:var(--color-accent);width:18px;height:18px">${Icons.megaphone || ''}</span> 
                        Global Noticeboard
                    </h3>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px; padding:0 20px 20px">
                    ${allAnnouncements.slice(0, 3).map(a => `
                        <div style="padding:12px;background:var(--color-bg-secondary);border-radius:8px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                <strong style="font-size:14px;color:var(--color-text-primary)">${escapeHtml(a.title)} <span class="badge ${a.type==='critical'?'badge-error':(a.type==='event'?'badge-success':'badge-primary')}" style="margin-left:6px;font-size:10px">${escapeHtml(a.type.toUpperCase())}</span></strong>
                                <span style="font-size:12px;color:var(--color-text-tertiary)">${timeAgo(a.createdAt)}</span>
                            </div>
                            <p style="font-size:13px;color:var(--color-text-secondary);white-space:pre-wrap;margin:0">${escapeHtml(a.message)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Active Tasks</h3>
                        <a href="#tasks" class="btn btn-sm btn-ghost">View All →</a>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:12px">
                        ${myTasks.filter(t => t.status !== 'completed').slice(0, 5).map(t => renderTaskItem(t)).join('')
                          || '<div class="empty-state"><p class="empty-state-text">No active tasks</p></div>'}
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Notifications</h3>
                    </div>
                    <div class="activity-list">
                        ${myNotifs.slice(0, 6).map(n => `
                            <div class="activity-item">
                                <div class="activity-dot" style="background:${n.read ? 'var(--color-border)' : 'var(--color-accent)'}"></div>
                                <div class="activity-content">
                                    <div class="activity-text"><strong>${escapeHtml(n.title)}</strong></div>
                                    <div class="activity-time">${timeAgo(n.createdAt)}</div>
                                </div>
                            </div>
                        `).join('') || '<div class="empty-state"><p class="empty-state-text">No notifications</p></div>'}
                    </div>
                </div>
            </div>
        `;
    }

    function renderTasksView(container) {
        container.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1 class="page-title">My Tasks</h1>
                        <p class="page-subtitle">${myTasks.length} total tasks</p>
                    </div>
                </div>
            </div>

            <div class="tabs" id="myTaskTabs">
                <button class="tab-btn active" data-tab="all">All (${myTasks.length})</button>
                <button class="tab-btn" data-tab="assigned">Assigned (${myTasks.filter(t=>t.status==='assigned').length})</button>
                <button class="tab-btn" data-tab="in-progress">In Progress (${myTasks.filter(t=>t.status==='in-progress').length})</button>
                <button class="tab-btn" data-tab="submitted">Submitted (${myTasks.filter(t=>t.status==='submitted').length})</button>
                <button class="tab-btn" data-tab="completed">Completed (${myTasks.filter(t=>t.status==='completed').length})</button>
            </div>

            <div id="myTasksGrid" style="display:flex;flex-direction:column;gap:16px">
                ${myTasks.map(t => renderTaskDetail(t)).join('')
                  || '<div class="empty-state"><p class="empty-state-text">No tasks yet</p></div>'}
            </div>
        `;

        document.querySelectorAll('#myTaskTabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#myTaskTabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                const filtered = tab === 'all' ? myTasks : myTasks.filter(t => t.status === tab);
                document.getElementById('myTasksGrid').innerHTML = filtered.map(t => renderTaskDetail(t)).join('')
                    || '<div class="empty-state"><p class="empty-state-text">No tasks in this category</p></div>';
            });
        });
    }

    function renderTaskItem(task) {
        const statusBadge = {
            'assigned': 'badge-primary', 'in-progress': 'badge-warning',
            'submitted': 'badge-info', 'completed': 'badge-success'
        };
        return `
            <div class="task-card" onclick="window.location.hash='tasks'">
                <div class="task-card-header">
                    <div class="task-card-title">${escapeHtml(task.title)}</div>
                    <span class="badge ${statusBadge[task.status] || 'badge-neutral'}">${escapeHtml(TASK_STATUS_LABELS[task.status] || task.status)}</span>
                </div>
                ${task.progress > 0 ? `
                    <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${task.progress}%"></div></div>
                ` : ''}
                <div class="task-card-meta">
                    <span class="task-meta-item"><span class="task-priority ${task.priority}"></span> ${escapeHtml(task.priority)}</span>
                    ${task.deadline ? `<span class="task-meta-item">${Icons.calendar} ${formatDate(task.deadline)}</span>` : ''}
                </div>
            </div>
        `;
    }

    function renderTaskDetail(task) {
        const statusBadge = {
            'assigned': 'badge-primary', 'in-progress': 'badge-warning',
            'submitted': 'badge-info', 'completed': 'badge-success'
        };

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(task.title)}</div>
                        <div class="card-subtitle">${escapeHtml(task.description || 'No description')}</div>
                    </div>
                    <span class="badge ${statusBadge[task.status] || 'badge-neutral'}">${escapeHtml(TASK_STATUS_LABELS[task.status] || task.status)}</span>
                </div>

                ${task.progress > 0 || task.status === 'in-progress' ? `
                    <div style="margin-bottom:16px">
                        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px">
                            <span>Progress</span><span>${task.progress || 0}%</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill" style="width:${task.progress || 0}%"></div></div>
                    </div>
                ` : ''}

                <div class="task-card-meta" style="margin-bottom:16px">
                    <span class="task-meta-item"><span class="task-priority ${task.priority}"></span> ${escapeHtml(task.priority)}</span>
                    <span class="task-meta-item">${Icons.calendar} ${task.deadline ? formatDate(task.deadline) : 'No deadline'}</span>
                    <span class="task-meta-item">Department: ${escapeHtml(task.department || 'General')}</span>
                </div>

                ${task.notes && task.notes.length ? `
                    <div style="margin-bottom:12px">
                        <div style="font-size:12px;font-weight:600;color:var(--color-text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Notes</div>
                        ${task.notes.map(n => `<div class="task-note" style="margin-bottom:6px">${escapeHtml(n)}</div>`).join('')}
                    </div>
                ` : ''}

                ${task.status !== 'completed' && task.status !== 'submitted' ? `
                    <div style="border-top:1px solid var(--color-border);padding-top:16px;margin-top:8px">
                        <div class="form-group" style="margin-bottom:12px">
                            <label class="form-label">Add Note / Progress Update</label>
                            <textarea class="form-textarea" id="taskNote-${task.id}" rows="2" placeholder="Describe what you've completed..."></textarea>
                        </div>
                        <div class="form-row" style="margin-bottom:12px">
                            <div class="form-group">
                                <label class="form-label">Progress (%)</label>
                                <input type="number" class="form-input" id="taskProgress-${task.id}" min="0" max="100" value="${task.progress || 0}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Screenshot</label>
                                <input type="file" class="form-input" id="taskScreenshot-${task.id}" accept="image/*" style="padding:8px">
                            </div>
                        </div>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-secondary" onclick="updateTask('${task.id}')">Save Progress</button>
                            <button class="btn btn-primary" onclick="submitTask('${task.id}')">Submit for Review</button>
                            ${task.status === 'assigned' ? `<button class="btn btn-ghost" onclick="startTask('${task.id}')">Start Working</button>` : ''}
                        </div>
                    </div>
                ` : ''}

                ${task.status === 'completed' ? `
                    <div style="text-align:center;padding:16px;background:var(--color-success-bg);border-radius:var(--radius-md);color:var(--color-success);font-weight:600">
                        ✓ Task completed${task.completedAt ? ' on ' + formatDate(task.completedAt) : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ==================== Task Actions ====================
    window.startTask = async function(taskId) {
        try {
            await db.collection('tasks').doc(taskId).update({
                status: 'in-progress',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            ToastManager.info('Task Started', 'You\'ve started working on this task');
        } catch(e) { ToastManager.error('Error', e.message); }
    };

    window.updateTask = async function(taskId) {
        const note = document.getElementById(`taskNote-${taskId}`)?.value.trim();
        const progress = parseInt(document.getElementById(`taskProgress-${taskId}`)?.value || '0');

        const updates = {
            progress: Math.min(100, Math.max(0, progress)),
            status: 'in-progress',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (note) {
            updates.notes = firebase.firestore.FieldValue.arrayUnion(note);
        }

        try {
            await db.collection('tasks').doc(taskId).update(updates);
            ToastManager.success('Progress Saved', 'Your progress has been saved');
        } catch(e) { ToastManager.error('Error', e.message); }
    };

    window.submitTask = async function(taskId) {
        const note = document.getElementById(`taskNote-${taskId}`)?.value.trim();
        const progress = parseInt(document.getElementById(`taskProgress-${taskId}`)?.value || '0');

        const updates = {
            status: 'submitted',
            progress: Math.min(100, Math.max(0, progress)),
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (note) {
            updates.notes = firebase.firestore.FieldValue.arrayUnion(note);
        }

        try {
            await db.collection('tasks').doc(taskId).update(updates);

            // Notify admin
            await db.collection('notifications').add({
                userId: 'admin',
                title: 'Task Submitted for Review',
                message: `${AuthManager.userData?.name || 'An employee'} submitted a task for verification`,
                type: 'task',
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            ToastManager.success('Task Submitted', 'Your task has been submitted for admin review');
        } catch(e) { ToastManager.error('Error', e.message); }
    };

    // ==================== Team View ====================
    async function renderTeamView(container) {
        container.innerHTML = `<div style="padding:40px;text-align:center"><div class="spinner"></div><div style="margin-top:16px;color:var(--color-text-secondary)">Loading team directory...</div></div>`;
        
        try {
            const userDept = AuthManager.userData?.department || 'General';
            const querySnapshot = await db.collection('users').where('status', '==', 'active').get();
            const users = [];
            querySnapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            
            const depts = {};
            users.forEach(u => {
                const d = u.department || 'General';
                if (!depts[d]) depts[d] = [];
                depts[d].push(u);
            });
            
            let html = `
                <div class="page-header">
                    <h1 class="page-title">Team Directory</h1>
                    <p class="page-subtitle">Find and connect with people across Qualium AI.</p>
                </div>
                <div style="display:flex;gap:12px;margin-bottom:24px;overflow-x:auto" class="tabs" id="teamTabs">
                    <button class="tab-btn active" data-dept="all">All Departments</button>
                    ${Object.keys(depts).sort().map(d => `<button class="tab-btn" data-dept="${d}">${escapeHtml(d)}</button>`).join('')}
                </div>
                <div id="teamGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:20px;">
                </div>
            `;
            container.innerHTML = html;
            
            const renderGrid = (deptFilter) => {
                const grid = document.getElementById('teamGrid');
                if (!grid) return;
                const filtered = deptFilter === 'all' ? users : users.filter(u => (u.department||'General') === deptFilter);
                
                if (filtered.length === 0) {
                    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No members found.</p></div>';
                    return;
                }
                
                grid.innerHTML = filtered.map(u => {
                    const initials = AuthManager.getInitials(u.name);
                    const color = ROLE_COLORS[u.role] || 'var(--color-accent)';
                    return `
                        <div class="card" style="display:flex;flex-direction:column;align-items:center;padding:24px;text-align:center;position:relative">
                            ${u.department === userDept ? '<div style="position:absolute;top:12px;right:12px;background:var(--color-success-bg);color:var(--color-success);font-size:11px;padding:2px 8px;border-radius:100px;font-weight:600">My Team</div>' : ''}
                            <div class="sidebar-avatar" style="width:64px;height:64px;font-size:24px;background:${color};margin-bottom:16px">${escapeHtml(initials)}</div>
                            <h3 style="font-size:16px;font-weight:600;margin-bottom:4px;color:var(--color-text-primary)">${escapeHtml(u.name)}</h3>
                            <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px">${escapeHtml(ROLE_LABELS[u.role] || u.role)} • ${escapeHtml(u.department || 'General')}</div>
                            <div style="display:flex;gap:8px;width:100%">
                                ${u.email ? `<a href="mailto:${u.email}" class="btn btn-secondary" style="flex:1;padding:8px"><span style="width:16px;height:16px">${Icons.mail}</span> Email</a>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            };
            
            renderGrid('all');
            
            document.querySelectorAll('#teamTabs .tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('#teamTabs .tab-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    renderGrid(e.target.dataset.dept);
                });
            });
            
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>Failed to load team.</p></div>`;
            console.error(e);
        }
    }

    // ==================== Resources View ====================
    async function renderResourcesView(container) {
        const userDept = AuthManager.userData?.department || 'General';
        container.innerHTML = `<div style="padding:40px;text-align:center"><div class="spinner"></div><div style="margin-top:16px;color:var(--color-text-secondary)">Loading resources...</div></div>`;
        
        try {
            const querySnapshot = await db.collection('resources').where('department', '==', userDept).get();
            const resources = [];
            querySnapshot.forEach(doc => {
                resources.push({ id: doc.id, ...doc.data() });
            });
            
            let html = `
                <div class="page-header">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <h1 class="page-title">${escapeHtml(userDept)} Resources</h1>
                            <p class="page-subtitle">Department-specific tools, links, and documents.</p>
                        </div>
                        <button class="btn btn-primary" onclick="openResourceModal()">
                            <span style="width:16px;height:16px;margin-right:6px">${Icons.plus}</span> Add Resource
                        </button>
                    </div>
                </div>
                
                <div class="tabs" id="resourceTabs" style="margin-bottom:24px">
                    <button class="tab-btn active" data-type="all">All Resources</button>
                    <button class="tab-btn" data-type="link">Links</button>
                    <button class="tab-btn" data-type="document">Documents</button>
                    <button class="tab-btn" data-type="credential">Credentials</button>
                    <button class="tab-btn" data-type="note">Notes</button>
                </div>
                
                <div id="resourcesGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:20px;">
                </div>
            `;
            container.innerHTML = html;
            
            const renderGrid = (typeFilter) => {
                const grid = document.getElementById('resourcesGrid');
                if (!grid) return;
                const filtered = typeFilter === 'all' ? resources : resources.filter(r => r.type === typeFilter);
                
                if (filtered.length === 0) {
                    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No resources found for this category.</p></div>';
                    return;
                }
                
                grid.innerHTML = filtered.map(r => {
                    let icon = Icons.fileText;
                    if (r.type === 'link') icon = Icons.link || Icons.image;
                    if (r.type === 'credential') icon = Icons.shield;
                    if (r.type === 'note') icon = Icons.clipboard;
                    
                    return `
                        <div class="card" style="display:flex;flex-direction:column">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                                <div style="display:flex;align-items:center;gap:12px">
                                    <div style="padding:10px;background:var(--color-bg-secondary);border-radius:8px;color:var(--color-text-secondary)">
                                        <span style="width:20px;height:20px;display:block">${icon}</span>
                                    </div>
                                    <div>
                                        <h3 style="font-size:15px;font-weight:600;color:var(--color-text-primary);margin-bottom:2px">${escapeHtml(r.title)}</h3>
                                        <div style="font-size:12px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(r.type)}</div>
                                    </div>
                                </div>
                                ${r.status === 'outdated' ? '<span class="badge badge-warning">Needs Update</span>' : ''}
                            </div>
                            <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:20px;flex:1">${escapeHtml(r.description || 'No description provided.')}</p>
                            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--color-border);padding-top:16px">
                                ${r.url ? `<a href="${r.url}" target="_blank" class="btn btn-sm btn-secondary">Open Link</a>` : '<span></span>'}
                                ${r.addedBy === AuthManager.currentUser?.uid ? `
                                    <button class="btn btn-sm btn-ghost" onclick="deleteResource('${r.id}')" style="color:var(--color-error)">Delete</button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            };
            
            renderGrid('all');
            
            document.querySelectorAll('#resourceTabs .tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('#resourceTabs .tab-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    renderGrid(e.target.dataset.type);
                });
            });
            
            injectResourceModal();
            
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>Failed to load resources.</p></div>`;
            console.error(e);
        }
    }

    function injectResourceModal() {
        if (document.getElementById('resourceModal')) return;
        
        const modalHTML = `
            <div class="modal-overlay" id="resourceModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Add Department Resource</h2>
                        <button class="modal-close" onclick="closeModal('resourceModal')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="resourceForm" onsubmit="event.preventDefault(); submitResource();">
                            <div class="form-group">
                                <label class="form-label">Title *</label>
                                <input type="text" id="resTitle" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Type *</label>
                                <select id="resType" class="form-input" required>
                                    <option value="link">Link / URL</option>
                                    <option value="document">Document Link</option>
                                    <option value="credential">Credential Note</option>
                                    <option value="note">Internal Note</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">URL / Link</label>
                                <input type="url" id="resUrl" class="form-input" placeholder="https://...">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Description</label>
                                <textarea id="resDesc" class="form-textarea" rows="3"></textarea>
                            </div>
                            <div class="form-actions" style="margin-top:24px;display:flex;justify-content:flex-end;gap:12px">
                                <button type="button" class="btn btn-secondary" onclick="closeModal('resourceModal')">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Resource</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        window.openResourceModal = () => openModal('resourceModal');
        
        window.submitResource = async () => {
            try {
                const data = {
                    title: document.getElementById('resTitle').value,
                    type: document.getElementById('resType').value,
                    url: document.getElementById('resUrl').value,
                    description: document.getElementById('resDesc').value,
                    department: AuthManager.userData?.department || 'General',
                    addedBy: AuthManager.currentUser.uid,
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('resources').add(data);
                ToastManager.success('Success', 'Resource added successfully');
                closeModal('resourceModal');
                document.getElementById('resourceForm').reset();
                window.location.hash = 'resources'; 
                renderView('resources');
            } catch (e) {
                ToastManager.error('Error', e.message);
            }
        };
        
        window.deleteResource = async (id) => {
            if (!confirm('Are you sure you want to delete this resource?')) return;
            try {
                await db.collection('resources').doc(id).delete();
                ToastManager.success('Deleted', 'Resource has been deleted');
                renderView('resources');
            } catch(e) {
                ToastManager.error('Error', e.message);
            }
        };
    }
}
