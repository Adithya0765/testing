/* ============================================
   Qaulium AI - Main JavaScript
   ============================================ */

(function () {
    'use strict';

    // --- Theme toggle ---
    var themeToggle = document.getElementById('themeToggle');
    var savedTheme = localStorage.getItem('qaulium-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('qaulium-theme', theme);
    }

    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme('light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!localStorage.getItem('qaulium-theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });

    // --- Header scroll state ---
    var header = document.getElementById('siteHeader');
    var lastScroll = 0;

    function updateHeader() {
        var scrollY = window.scrollY;
        if (!header) return;
        if (scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    }

    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();

    // --- Mobile navigation ---
    var navToggle = document.getElementById('navToggle');
    var mobileNav = document.getElementById('mobileNav');

    if (navToggle && mobileNav) {
        navToggle.addEventListener('click', function () {
            navToggle.classList.toggle('active');
            mobileNav.classList.toggle('open');
            document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
        });

        mobileNav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                navToggle.classList.remove('active');
                mobileNav.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    // --- Desktop products dropdown ---
    var productDropdown = document.getElementById('productDropdown');
    var productMenuToggle = document.getElementById('productMenuToggle');

    if (productDropdown && productMenuToggle) {
        productMenuToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var isOpen = productDropdown.classList.toggle('open');
            productMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        productDropdown.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                productDropdown.classList.remove('open');
                productMenuToggle.setAttribute('aria-expanded', 'false');
            });
        });

        document.addEventListener('click', function (e) {
            if (!productDropdown.contains(e.target)) {
                productDropdown.classList.remove('open');
                productMenuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // --- Quantum Circuit: random build animation ---
    (function () {
        var container = document.getElementById('qcCircuit');
        if (!container) return;

        var QUBITS = 3;
        var COLS = 6;
        var ROW_H = 64; // matches CSS .qc-cell height
        var GATE_DELAY = 200; // ms between gate pops
        var HOLD_TIME = 5000; // ms to hold completed circuit
        var FADE_TIME = 400;

        var singleGates = ['H', 'X', 'Y', 'Z', 'S', 'T', 'Rz'];
        var meterSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18 A8 8 0 0 1 20 18"/><line x1="12" y1="18" x2="17" y2="7"/></svg>';

        function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
        function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

        // Generate a random circuit layout
        function generateCircuit() {
            // grid[row][col] = { type, label } or null
            var grid = [];
            for (var r = 0; r < QUBITS; r++) {
                grid[r] = [];
                for (var c = 0; c < COLS; c++) grid[r][c] = null;
            }

            var cnots = []; // { ctrl: row, tgt: row, col }
            // Place 1-2 CNOTs
            var numCnot = randInt(1, 2);
            for (var i = 0; i < numCnot; i++) {
                var col = randInt(0, COLS - 2);
                var ctrlRow = randInt(0, QUBITS - 2);
                var tgtRow = ctrlRow + 1;
                // Check column is free
                if (!grid[ctrlRow][col] && !grid[tgtRow][col]) {
                    grid[ctrlRow][col] = { type: 'ctrl' };
                    grid[tgtRow][col] = { type: 'tgt' };
                    cnots.push({ ctrl: ctrlRow, tgt: tgtRow, col: col });
                }
            }

            // Fill remaining empty cells with single gates or nothing
            for (var r2 = 0; r2 < QUBITS; r2++) {
                for (var c2 = 0; c2 < COLS; c2++) {
                    if (!grid[r2][c2]) {
                        if (Math.random() < 0.45) {
                            grid[r2][c2] = { type: 'gate', label: pick(singleGates) };
                        }
                    }
                }
            }

            // Optionally add a measurement to last column of a random qubit
            if (Math.random() < 0.5) {
                var mRow = randInt(0, QUBITS - 1);
                grid[mRow][COLS - 1] = { type: 'meter' };
            }

            return { grid: grid, cnots: cnots };
        }

        function buildDOM(circuit) {
            container.innerHTML = '';
            var gridEl = document.createElement('div');
            gridEl.className = 'qc-grid';
            gridEl.style.setProperty('--qc-cols', COLS);

            var elements = []; // { el, col } for sequential animation

            for (var r = 0; r < QUBITS; r++) {
                // Label cell
                var lbl = document.createElement('div');
                lbl.className = 'qc-cell qc-label-cell';
                lbl.textContent = 'q\u2080\u2081\u2082'[0] + '\u2080\u2081\u2082'[r];
                gridEl.appendChild(lbl);
                elements.push({ el: lbl, col: -1 });

                // Gate cells
                for (var c = 0; c < COLS; c++) {
                    var cell = document.createElement('div');
                    cell.className = 'qc-cell';

                    var entry = circuit.grid[r][c];
                    if (entry) {
                        var gateEl;
                        if (entry.type === 'gate') {
                            gateEl = document.createElement('div');
                            gateEl.className = 'qc-gate';
                            gateEl.textContent = entry.label;
                        } else if (entry.type === 'ctrl') {
                            gateEl = document.createElement('div');
                            gateEl.className = 'qc-ctrl';
                        } else if (entry.type === 'tgt') {
                            gateEl = document.createElement('div');
                            gateEl.className = 'qc-tgt';
                            gateEl.textContent = '\u2295';
                        } else if (entry.type === 'meter') {
                            gateEl = document.createElement('div');
                            gateEl.className = 'qc-meter';
                            gateEl.innerHTML = meterSvg;
                        }
                        cell.appendChild(gateEl);
                        elements.push({ el: gateEl, col: c });
                    }

                    gridEl.appendChild(cell);
                }
            }

            container.appendChild(gridEl);

            // Sort elements by column for sequential animation
            elements.sort(function (a, b) { return a.col - b.col; });

            // Create CNOT vertical lines (positioned after layout)
            var vlines = [];
            circuit.cnots.forEach(function (cn) {
                var vl = document.createElement('div');
                vl.className = 'qc-vline';
                container.appendChild(vl);
                vlines.push({ el: vl, cnot: cn });
            });

            return { elements: elements, vlines: vlines, gridEl: gridEl };
        }

        function positionVLines(vlines) {
            var cRect = container.getBoundingClientRect();
            vlines.forEach(function (v) {
                var cn = v.cnot;
                var gridEl = container.querySelector('.qc-grid');
                if (!gridEl) return;
                // Find ctrl and tgt cells
                var ctrlIdx = cn.ctrl * (COLS + 1) + 1 + cn.col; // +1 for label col
                var tgtIdx = cn.tgt * (COLS + 1) + 1 + cn.col;
                var cells = gridEl.children;
                if (!cells[ctrlIdx] || !cells[tgtIdx]) return;
                var cr = cells[ctrlIdx].getBoundingClientRect();
                var tr = cells[tgtIdx].getBoundingClientRect();
                v.el.style.left = (cr.left + cr.width / 2 - cRect.left - 1) + 'px';
                v.el.style.top = (cr.top + cr.height / 2 - cRect.top) + 'px';
                v.el.style.height = (tr.top + tr.height / 2 - cr.top - cr.height / 2) + 'px';
            });
        }

        function animateIn(dom, callback) {
            var delay = 0;
            var colGroups = {};

            dom.elements.forEach(function (item) {
                var key = item.col;
                if (!colGroups[key]) colGroups[key] = [];
                colGroups[key].push(item.el);
            });

            var cols = Object.keys(colGroups).sort(function (a, b) { return a - b; });
            cols.forEach(function (colKey) {
                colGroups[colKey].forEach(function (el) {
                    setTimeout(function () { el.classList.add('qc-pop'); }, delay);
                });
                delay += GATE_DELAY;
            });

            // Position and animate vlines after the last gate column
            setTimeout(function () {
                positionVLines(dom.vlines);
                dom.vlines.forEach(function (v) { v.el.classList.add('qc-pop'); });
            }, delay);

            setTimeout(callback, delay + HOLD_TIME);
        }

        function fadeOutAll(dom, callback) {
            var allEls = container.querySelectorAll('.qc-gate, .qc-ctrl, .qc-tgt, .qc-meter, .qc-vline, .qc-label-cell');
            allEls.forEach(function (el) {
                el.style.animation = 'qcFadeOut ' + FADE_TIME + 'ms ease forwards';
            });
            setTimeout(callback, FADE_TIME + 100);
        }

        function cycle() {
            var circuit = generateCircuit();
            var dom = buildDOM(circuit);
            // Small delay to let DOM settle before animation
            requestAnimationFrame(function () {
                animateIn(dom, function () {
                    fadeOutAll(dom, function () {
                        cycle(); // rebuild with a new random circuit
                    });
                });
            });
        }

        cycle();
        window.addEventListener('resize', function () {
            var vlines = container.querySelectorAll('.qc-vline');
            if (vlines.length) {
                // Recalculate on resize
                var gridEl = container.querySelector('.qc-grid');
                if (!gridEl) return;
                var cRect = container.getBoundingClientRect();
                // Simple re-position already handled by next cycle
            }
        });
    })();

    // --- Scroll-reveal ---
    var revealTargets = [
        '.hero-content',
        '.hero-visual',
        '.arch-block',
        '.benchmark-table-wrap',
        '.benchmark-note',
        '.dev-card',
        '.code-example',
        '.research-card',
        '.layer-surface',
        '.capability-card',
        '.contact-info',
        '.contact-form-wrap',
        '.section-heading',
        '.section-intro',
        '.section-label',
        '.cta-banner',
        '.usecase-card',
        '.careers-value-card',
        '.role-card',
        '.careers-apply-wrap'
    ];

    var elements = document.querySelectorAll(revealTargets.join(','));
    elements.forEach(function (el) {
        el.classList.add('reveal');
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -60px 0px'
    });

    elements.forEach(function (el) {
        observer.observe(el);
    });

    // --- Smooth scroll for nav links ---
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;
            var target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                var headerHeight = header ? header.offsetHeight : 72;
                var targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- Active nav link tracking ---
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');

    function updateActiveNav() {
        var scrollPos = window.scrollY + 120;
        sections.forEach(function (section) {
            var top = section.offsetTop;
            var height = section.offsetHeight;
            var id = section.getAttribute('id');
            if (scrollPos >= top && scrollPos < top + height) {
                navLinks.forEach(function (link) {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + id) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // --- Registration Modal ---
    var registerModal = document.getElementById('registerModal');
    var modalClose = document.getElementById('modalClose');
    var registerForm = document.getElementById('registerForm');
    var formStatus = document.getElementById('formStatus');
    var portalRegisterBtn = document.getElementById('portalRegisterBtn');

    var itiRegPhone = null;
    var itiCareerPhone = null;

    function initIntlPhoneInput(inputId) {
        var input = document.getElementById(inputId);
        if (!input || typeof window.intlTelInput !== 'function') return null;
        return window.intlTelInput(input, {
            initialCountry: 'auto',
            strictMode: true,
            nationalMode: false,
            autoPlaceholder: 'polite',
            separateDialCode: true,
            loadUtilsOnInit: true,
            geoIpLookup: function (callback) {
                fetch('https://ipapi.co/json/')
                    .then(function (res) { return res.json(); })
                    .then(function (data) { callback((data && data.country_code) ? data.country_code : 'us'); })
                    .catch(function () { callback('us'); });
            }
        });
    }

    itiRegPhone = initIntlPhoneInput('regPhone');
    itiCareerPhone = initIntlPhoneInput('careerPhone');

    function openModal() {
        if (!registerModal) return;
        registerModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!registerModal) return;
        registerModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    if (modalClose && registerModal) {
        modalClose.addEventListener('click', closeModal);

        registerModal.addEventListener('click', function (e) {
            if (e.target === registerModal) closeModal();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && registerModal.classList.contains('open')) {
                closeModal();
            }
        });
    }

    // Wire up registration buttons (nav CTA + hero buttons that lead to registration)
    var tryStudioBtn = document.querySelector('a[href="#developer"].btn-secondary');
    if (tryStudioBtn && registerModal) {
        tryStudioBtn.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    }

    var navCtaBtn = document.querySelector('.nav-cta');
    if (navCtaBtn && registerModal) {
        navCtaBtn.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    }

    // Also wire up the CTA banner button
    var ctaBannerBtn = document.querySelector('.cta-banner .btn');
    if (ctaBannerBtn && registerModal) {
        ctaBannerBtn.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    }

    // Wire up Pre-Register Now button in CTA section
    var ctaRegisterBtn = document.getElementById('ctaRegisterBtn');
    if (ctaRegisterBtn && registerModal) {
        ctaRegisterBtn.addEventListener('click', function () {
            openModal();
        });
    }

    if (portalRegisterBtn && registerModal) {
        portalRegisterBtn.addEventListener('click', function () {
            openModal();
        });
    }

    // --- Registration form submission ---
    if (registerForm) {
        registerForm.addEventListener('submit', function (e) {
            e.preventDefault();

            var firstName = document.getElementById('regFirstName').value.trim();
            var lastName = document.getElementById('regLastName').value.trim();
            var email = document.getElementById('regEmail').value.trim();
            var phone = document.getElementById('regPhone').value.trim();
            var company = document.getElementById('regCompany').value.trim();
            var role = document.getElementById('regRole').value.trim();
            var useCase = document.getElementById('regUseCase').value;
            var registrationSource = (registerForm.getAttribute('data-registration-source') || '').trim();

            if (!registrationSource) {
                registrationSource = window.location.pathname.indexOf('registration') !== -1
                    ? 'public_registration_portal'
                    : 'landing_modal';
            }

            // Basic validation
            if (!firstName || !lastName || !email || !company || !role || !useCase) {
                showStatus('Please fill in all required fields.', 'error');
                return;
            }

            var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(email)) {
                showStatus('Please enter a valid email address.', 'error');
                return;
            }

            if (itiRegPhone) {
                if (!itiRegPhone.isValidNumber()) {
                    showStatus('Please enter a valid international phone number.', 'error');
                    return;
                }
                phone = itiRegPhone.getNumber();
            }

            var btn = document.getElementById('registerBtn');
            btn.textContent = 'Registering...';
            btn.disabled = true;

            var payload = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                phone: phone,
                company: company,
                role: role,
                useCase: useCase,
                source: registrationSource
            };

            fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    showStatus('Registration successful! A confirmation email has been sent to ' + email + '.', 'success');
                    registerForm.reset();

                    var redirectTo = (registerForm.getAttribute('data-redirect-on-success') || '').trim();
                    var redirectDelay = parseInt(registerForm.getAttribute('data-redirect-delay-ms') || '2200', 10);

                    // Always redirect to landing page after success when submitting from registration portal.
                    if (!redirectTo && window.location.pathname.indexOf('registration') !== -1) {
                        redirectTo = '/';
                    }

                    if (redirectTo) {
                        setTimeout(function () {
                            window.location.replace(redirectTo);
                        }, isNaN(redirectDelay) ? 2200 : redirectDelay);
                    }

                    setTimeout(function () {
                        closeModal();
                        if (formStatus) {
                            formStatus.style.display = 'none';
                            formStatus.className = 'form-status';
                        }
                    }, 4000);
                } else {
                    showStatus(data.message || 'Registration failed. Please try again.', 'error');
                }
                btn.textContent = 'Register';
                btn.disabled = false;
            })
            .catch(function () {
                showStatus('Unable to connect to server. Please try again later.', 'error');
                btn.textContent = 'Register';
                btn.disabled = false;
            });
        });
    }

    function showStatus(message, type) {
        if (!formStatus) return;
        formStatus.textContent = message;
        formStatus.className = 'form-status ' + type;
    }

    // --- Careers form ---
    var careerForm = document.getElementById('careerForm');
    var careerFormStatus = document.getElementById('careerFormStatus');
    var careerApplyBtn = document.getElementById('careerApplyBtn');
    var careerRoleField = document.getElementById('careerRole');

    function showCareerStatus(message, type) {
        if (!careerFormStatus) return;
        careerFormStatus.textContent = message;
        careerFormStatus.className = 'form-status ' + type;
    }

    if (careerRoleField) {
        var roleParam = new URLSearchParams(window.location.search).get('role');
        if (roleParam) {
            careerRoleField.value = roleParam;
        }
    }

    if (careerForm) {
        careerForm.addEventListener('submit', function (e) {
            e.preventDefault();

            var payload = {
                firstName: document.getElementById('careerFirstName').value.trim(),
                lastName: document.getElementById('careerLastName').value.trim(),
                email: document.getElementById('careerEmail').value.trim(),
                phone: document.getElementById('careerPhone').value.trim(),
                roleApplied: document.getElementById('careerRole').value,
                location: document.getElementById('careerLocation').value.trim(),
                university: document.getElementById('careerUniversity').value.trim(),
                degree: document.getElementById('careerDegree').value.trim(),
                graduationYear: document.getElementById('careerGraduationYear').value.trim(),
                availability: document.getElementById('careerAvailability').value.trim(),
                linkedinUrl: document.getElementById('careerLinkedIn').value.trim(),
                portfolioUrl: document.getElementById('careerPortfolio').value.trim(),
                resumeUrl: document.getElementById('careerResume').value.trim(),
                coverLetter: document.getElementById('careerCoverLetter').value.trim()
            };

            if (!payload.firstName || !payload.lastName || !payload.email || !payload.phone || !payload.roleApplied || !payload.location || !payload.university || !payload.degree || !payload.graduationYear || !payload.availability || !payload.resumeUrl || !payload.coverLetter) {
                showCareerStatus('Please fill all required fields before submitting.', 'error');
                return;
            }

            var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(payload.email)) {
                showCareerStatus('Please enter a valid email address.', 'error');
                return;
            }

            if (itiCareerPhone) {
                if (!itiCareerPhone.isValidNumber()) {
                    showCareerStatus('Please enter a valid international phone number.', 'error');
                    return;
                }
                payload.phone = itiCareerPhone.getNumber();
            }

            if (careerApplyBtn) {
                careerApplyBtn.textContent = 'Submitting...';
                careerApplyBtn.disabled = true;
            }

            fetch('/api/careers/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    showCareerStatus('Application submitted successfully. A confirmation email has been sent to ' + payload.email + '.', 'success');
                    careerForm.reset();
                } else {
                    showCareerStatus(data.message || 'Unable to submit application right now. Please try again.', 'error');
                }
                if (careerApplyBtn) {
                    careerApplyBtn.textContent = 'Submit Application';
                    careerApplyBtn.disabled = false;
                }
            })
            .catch(function () {
                showCareerStatus('Unable to connect to server. Please try again later.', 'error');
                if (careerApplyBtn) {
                    careerApplyBtn.textContent = 'Submit Application';
                    careerApplyBtn.disabled = false;
                }
            });
        });
    }

    // --- Contact form ---
    var form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var name = document.getElementById('name').value.trim();
            var email = document.getElementById('email').value.trim();
            var message = document.getElementById('message').value.trim();
            var company = document.getElementById('company').value.trim();

            if (!name || !email || !message || !company) {
                var btn2 = form.querySelector('button[type="submit"]');
                btn2.textContent = 'Send Message';
                btn2.disabled = false;
                var statusEl = form.querySelector('.contact-form-status') || (function() {
                    var s = document.createElement('div');
                    s.className = 'form-status error contact-form-status';
                    form.appendChild(s);
                    return s;
                }());
                statusEl.className = 'form-status error contact-form-status';
                statusEl.textContent = 'Please fill in all required fields.';
                return;
            }

            var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(email)) {
                var btn3 = form.querySelector('button[type="submit"]');
                var statusEl2 = form.querySelector('.contact-form-status') || (function() {
                    var s = document.createElement('div');
                    s.className = 'form-status error contact-form-status';
                    form.appendChild(s);
                    return s;
                }());
                statusEl2.className = 'form-status error contact-form-status';
                statusEl2.textContent = 'Please enter a valid email address.';
                return;
            }

            var btn = form.querySelector('button[type="submit"]');
            btn.textContent = 'Sending...';
            btn.disabled = true;

            // Clear any validation status
            var existingStatus = form.querySelector('.contact-form-status');
            if (existingStatus) existingStatus.textContent = '';

            fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, email: email, company: company, message: message })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    btn.textContent = 'Message Sent';
                    form.reset();
                } else {
                    btn.textContent = 'Send Message';
                    btn.disabled = false;
                    alert(data.message || 'Failed to send message. Please try again.');
                    return;
                }
                setTimeout(function () {
                    btn.textContent = 'Send Message';
                    btn.disabled = false;
                }, 3000);
            })
            .catch(function () {
                btn.textContent = 'Send Message';
                btn.disabled = false;
            });
        });
    }

})();
