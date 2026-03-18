/* Settings Page Logic */
(function() {
    requireAuth([], (user, userData) => {
        document.getElementById('portalLayout').style.display = '';
        const role = userData.role || 'frontend';
        document.getElementById('sidebar').innerHTML = buildSidebar(role, 'settings');
        document.getElementById('topbar').innerHTML = buildTopbar('Account', 'Settings');
        renderSettings(userData);
    });

    function renderSettings(user) {
        const content = document.getElementById('mainContent');
        const isDark = ThemeManager.current === 'dark';

        content.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Settings</h1>
                <p class="page-subtitle">Manage your preferences and account settings</p>
            </div>

            <div style="display:flex;flex-direction:column;gap:20px;max-width:700px">
                <!-- Appearance -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Appearance</h3>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
                        <div>
                            <div style="font-weight:600;font-size:14px;color:var(--color-primary)">Theme</div>
                            <div style="font-size:13px;color:var(--color-text-tertiary)">Choose between light and dark mode</div>
                        </div>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-sm ${!isDark ? 'btn-primary' : 'btn-secondary'}" onclick="ThemeManager.setTheme('light');location.reload()">
                                ${Icons.sun} Light
                            </button>
                            <button class="btn btn-sm ${isDark ? 'btn-primary' : 'btn-secondary'}" onclick="ThemeManager.setTheme('dark');location.reload()">
                                ${Icons.moon} Dark
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Notifications -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Notifications</h3>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:16px">
                        <label class="form-checkbox">
                            <input type="checkbox" id="notifTasks" checked>
                            <div>
                                <span class="form-checkbox-label" style="font-weight:600;color:var(--color-primary)">Task Updates</span>
                                <div style="font-size:12px;color:var(--color-text-tertiary)">Notifications when tasks are assigned, updated, or completed</div>
                            </div>
                        </label>
                        <label class="form-checkbox">
                            <input type="checkbox" id="notifEmail" checked>
                            <div>
                                <span class="form-checkbox-label" style="font-weight:600;color:var(--color-primary)">Email Notifications</span>
                                <div style="font-size:12px;color:var(--color-text-tertiary)">Receive email alerts for important updates</div>
                            </div>
                        </label>
                        <label class="form-checkbox">
                            <input type="checkbox" id="notifSystem">
                            <div>
                                <span class="form-checkbox-label" style="font-weight:600;color:var(--color-primary)">System Announcements</span>
                                <div style="font-size:12px;color:var(--color-text-tertiary)">Updates about portal features and maintenance</div>
                            </div>
                        </label>
                    </div>
                    <div style="margin-top:16px">
                        <button class="btn btn-primary btn-sm" id="saveNotifBtn">Save Preferences</button>
                    </div>
                </div>

                <!-- Danger Zone -->
                <div class="card" style="border-color:var(--color-error-border)">
                    <div class="card-header">
                        <h3 class="card-title" style="color:var(--color-error)">Danger Zone</h3>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
                        <div>
                            <div style="font-weight:600;font-size:14px;color:var(--color-primary)">Sign Out</div>
                            <div style="font-size:13px;color:var(--color-text-tertiary)">Sign out of your account on this device</div>
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="AuthManager.logout()">Sign Out</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('saveNotifBtn').addEventListener('click', async () => {
            try {
                await db.collection('users').doc(user.id).update({
                    notifPrefs: {
                        tasks: document.getElementById('notifTasks').checked,
                        email: document.getElementById('notifEmail').checked,
                        system: document.getElementById('notifSystem').checked
                    },
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                ToastManager.success('Saved', 'Notification preferences updated');
            } catch(e) {
                ToastManager.error('Error', e.message);
            }
        });
    }
})();
