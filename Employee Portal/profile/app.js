/* Profile Page Logic */
(function() {
    requireAuth([], (user, userData) => {
        document.getElementById('portalLayout').style.display = '';
        const role = userData.role || 'frontend';
        document.getElementById('sidebar').innerHTML = buildSidebar(role, 'profile');
        document.getElementById('topbar').innerHTML = buildTopbar('Account', 'Profile');
        renderProfile(userData);
    });

    function renderProfile(user) {
        const content = document.getElementById('mainContent');
        const initials = AuthManager.getInitials(user.name);
        const roleColor = ROLE_COLORS[user.role] || '#2563EB';

        content.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar-large" style="background:${roleColor}">${escapeHtml(initials)}</div>
                <div class="profile-info">
                    <h2>${escapeHtml(user.name || 'User')}</h2>
                    <div class="profile-meta">
                        <span class="profile-meta-item">${Icons.mail} ${escapeHtml(user.email)}</span>
                        <span class="profile-meta-item"><span class="badge badge-primary">${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span></span>
                        <span class="profile-meta-item">${Icons.calendar} Joined ${formatDate(user.createdAt)}</span>
                    </div>
                </div>
            </div>

            <div class="profile-sections">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Personal Information</h3>
                    </div>
                    <form id="profileForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">First Name</label>
                                <input type="text" class="form-input" id="profFirstName" value="${escapeHtml(user.firstName || '')}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Last Name</label>
                                <input type="text" class="form-input" id="profLastName" value="${escapeHtml(user.lastName || '')}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" value="${escapeHtml(user.email)}" disabled style="opacity:0.6">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Phone</label>
                            <input type="tel" class="form-input" id="profPhone" value="${escapeHtml(user.phone || '')}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Department</label>
                                <input type="text" class="form-input" value="${escapeHtml(user.department || '')}" disabled style="opacity:0.6">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Role</label>
                                <input type="text" class="form-input" value="${escapeHtml(ROLE_LABELS[user.role] || user.role)}" disabled style="opacity:0.6">
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" id="saveProfileBtn">Save Changes</button>
                    </form>
                </div>

                <div>
                    <div class="card" style="margin-bottom:20px">
                        <div class="card-header">
                            <h3 class="card-title">Security</h3>
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--color-border-light)">
                            <div>
                                <div style="font-weight:600;font-size:14px">Two-Factor Authentication</div>
                                <div style="font-size:13px;color:var(--color-text-tertiary)">${user.totpEnabled ? 'Enabled via authenticator app' : 'Not configured'}</div>
                            </div>
                            <span class="badge ${user.totpEnabled ? 'badge-success' : 'badge-warning'}">${user.totpEnabled ? 'Active' : 'Inactive'}</span>
                        </div>
                        <div style="padding-top:16px">
                            <button class="btn btn-secondary btn-sm" id="changePwBtn">Change Password</button>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Account Details</h3>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:12px">
                            <div style="display:flex;justify-content:space-between;font-size:14px">
                                <span style="color:var(--color-text-secondary)">Account Status</span>
                                <span class="badge badge-success">${escapeHtml(user.status || 'active')}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;font-size:14px">
                                <span style="color:var(--color-text-secondary)">Member Since</span>
                                <span style="font-weight:500">${formatDate(user.createdAt)}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;font-size:14px">
                                <span style="color:var(--color-text-secondary)">Last Updated</span>
                                <span style="font-weight:500">${formatDate(user.updatedAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Save profile
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveProfileBtn');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const firstName = document.getElementById('profFirstName').value.trim();
                const lastName = document.getElementById('profLastName').value.trim();
                const phone = document.getElementById('profPhone').value.trim();

                await db.collection('users').doc(user.id).update({
                    firstName, lastName, phone,
                    name: `${firstName} ${lastName}`.trim(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                ToastManager.success('Profile Updated', 'Your profile has been saved');
            } catch(e) {
                ToastManager.error('Error', e.message);
            }

            btn.disabled = false;
            btn.textContent = 'Save Changes';
        });

        // Change password
        document.getElementById('changePwBtn').addEventListener('click', async () => {
            try {
                await auth.sendPasswordResetEmail(user.email);
                ToastManager.success('Email Sent', 'Password reset email sent to ' + user.email);
            } catch(e) {
                ToastManager.error('Error', e.message);
            }
        });
    }
})();
