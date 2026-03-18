/* ============================================
   Login Page Logic
   ============================================ */

(function() {
    ThemeManager.init();

    // Check if already logged in
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists) {
                    const role = doc.data().role || 'frontend';
                    window.location.href = `../${role}/`;
                    return;
                }
            } catch(e) {}
        }
        // Show login page
        document.getElementById('loadingOverlay').classList.add('hide');
        setTimeout(() => document.getElementById('loadingOverlay')?.remove(), 300);
        document.getElementById('authPage').style.display = '';
    });

    // Password toggle
    const toggleBtn = document.getElementById('togglePassword');
    const pwInput = document.getElementById('loginPassword');
    if (toggleBtn && pwInput) {
        const eyeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const eyeOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        toggleBtn.innerHTML = eyeIcon;
        toggleBtn.addEventListener('click', () => {
            const isPassword = pwInput.type === 'password';
            pwInput.type = isPassword ? 'text' : 'password';
            toggleBtn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
        });
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginError = document.getElementById('loginError');

    let pendingUser = null;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            showError(loginError, 'Please enter both email and password');
            return;
        }

        setLoading(loginBtn, loginBtnText, loginSpinner, true);
        hideError(loginError);

        try {
            const cred = await auth.signInWithEmailAndPassword(email, password);
            pendingUser = cred.user;

            // Check if TOTP is enabled
            const userDoc = await db.collection('users').doc(cred.user.uid).get();
            if (userDoc.exists && userDoc.data().totpEnabled) {
                // Show TOTP verification
                document.getElementById('loginView').style.display = 'none';
                document.getElementById('totpView').style.display = '';
                document.querySelector('.otp-input')?.focus();
                setLoading(loginBtn, loginBtnText, loginSpinner, false);
            } else {
                // No TOTP, redirect directly
                const role = userDoc.exists ? (userDoc.data().role || 'frontend') : 'frontend';
                window.location.href = `../${role}/`;
            }
        } catch (err) {
            setLoading(loginBtn, loginBtnText, loginSpinner, false);
            let msg = 'Invalid email or password';
            if (err.code === 'auth/user-not-found') msg = 'No account found with this email';
            if (err.code === 'auth/wrong-password') msg = 'Incorrect password';
            if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try again later';
            if (err.code === 'auth/invalid-credential') msg = 'Invalid credentials. Please check and try again';
            showError(loginError, msg);
        }
    });

    // TOTP verification
    const verifyTotpBtn = document.getElementById('verifyTotpBtn');
    const totpBtnText = document.getElementById('totpBtnText');
    const totpSpinner = document.getElementById('totpSpinner');
    const totpError = document.getElementById('totpError');

    verifyTotpBtn.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('#totpInputGroup .otp-input');
        const code = Array.from(inputs).map(i => i.value).join('');

        if (code.length !== 6) {
            showError(totpError, 'Please enter the full 6-digit code');
            return;
        }

        setLoading(verifyTotpBtn, totpBtnText, totpSpinner, true);
        hideError(totpError);

        try {
            const token = await pendingUser.getIdToken();
            const res = await fetch('../api/verify-totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ code, uid: pendingUser.uid })
            });

            const data = await res.json();

            if (data.success) {
                const userDoc = await db.collection('users').doc(pendingUser.uid).get();
                const role = userDoc.exists ? (userDoc.data().role || 'frontend') : 'frontend';
                window.location.href = `../${role}/`;
            } else {
                setLoading(verifyTotpBtn, totpBtnText, totpSpinner, false);
                showError(totpError, data.message || 'Invalid code. Please try again.');
                clearOtpInputs();
            }
        } catch (err) {
            setLoading(verifyTotpBtn, totpBtnText, totpSpinner, false);
            showError(totpError, 'Verification failed. Please try again.');
            clearOtpInputs();
        }
    });

    // Back to login
    document.getElementById('backToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('totpView').style.display = 'none';
        document.getElementById('loginView').style.display = '';
        clearOtpInputs();
        if (pendingUser) {
            auth.signOut();
            pendingUser = null;
        }
    });

    // OTP input behavior
    setupOtpInputs('totpInputGroup');

    function setupOtpInputs(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const inputs = container.querySelectorAll('.otp-input');

        inputs.forEach((input, i) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/\D/g, '');
                e.target.value = val.slice(0, 1);
                if (val && i < inputs.length - 1) {
                    inputs[i + 1].focus();
                }
                // Auto-submit when 6 digits entered
                const code = Array.from(inputs).map(inp => inp.value).join('');
                if (code.length === 6) {
                    verifyTotpBtn.click();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && i > 0) {
                    inputs[i - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                pasted.split('').forEach((char, idx) => {
                    if (inputs[idx]) inputs[idx].value = char;
                });
                if (pasted.length === 6) {
                    inputs[5].focus();
                    verifyTotpBtn.click();
                } else if (pasted.length > 0) {
                    inputs[Math.min(pasted.length, 5)].focus();
                }
            });
        });
    }

    function clearOtpInputs() {
        document.querySelectorAll('#totpInputGroup .otp-input').forEach(i => i.value = '');
        document.querySelector('#totpInputGroup .otp-input')?.focus();
    }

    function setLoading(btn, textEl, spinnerEl, loading) {
        btn.disabled = loading;
        textEl.style.display = loading ? 'none' : '';
        spinnerEl.style.display = loading ? 'inline-block' : 'none';
    }

    function showError(el, msg) {
        el.textContent = msg;
        el.style.display = '';
    }

    function hideError(el) {
        el.style.display = 'none';
    }
})();
