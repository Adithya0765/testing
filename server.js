/* ============================================
   Qaulium AI - Backend Server
   Node.js + Express + SQLite + Nodemailer
   ============================================ */

require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let pgCreateClient;
try { pgCreateClient = require('@vercel/postgres').createClient; } catch (e) { pgCreateClient = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const POSTGRES_CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;
const HAS_POSTGRES = !!(pgCreateClient && POSTGRES_CONNECTION_STRING);

// Trust the first proxy (Vercel, etc.) so express-rate-limit reads X-Forwarded-For correctly
app.set('trust proxy', 1);

// --- Middleware ---
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname), {
    index: 'index.html',
    extensions: ['html']
}));

// Rate limiting to prevent abuse
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

// --- Database Setup ---
// Priority:
// 1) Vercel Postgres (production/serverless)
// 2) SQLite (local)
let db = null;
let postgresSchemaReady = null;

async function pgQuery(queryText, values = []) {
    const client = pgCreateClient({ connectionString: POSTGRES_CONNECTION_STRING });
    await client.connect();
    try {
        return await client.query(queryText, values);
    } finally {
        await client.end();
    }
}

async function ensurePostgresSchema() {
    if (!HAS_POSTGRES) return;
    if (!postgresSchemaReady) {
        postgresSchemaReady = (async () => {
            await pgQuery(`
                CREATE TABLE IF NOT EXISTS registrations (
                    id SERIAL PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    phone TEXT DEFAULT '',
                    company TEXT DEFAULT '',
                    role TEXT DEFAULT '',
                    use_case TEXT DEFAULT '',
                    registered_at TIMESTAMPTZ DEFAULT NOW(),
                    email_confirmed INTEGER DEFAULT 0
                )
            `);

            await pgQuery(`
                CREATE TABLE IF NOT EXISTS contact_messages (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    company TEXT DEFAULT '',
                    message TEXT NOT NULL,
                    sent_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
        })();
    }
    await postgresSchemaReady;
}

if (HAS_POSTGRES) {
    console.log('Using Postgres for persistent storage.');
} else if (Database && !IS_VERCEL) {
    try {
        db = new Database(path.join(__dirname, 'qualium.db'));
        db.pragma('journal_mode = WAL');
        db.exec(`
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT DEFAULT '',
                company TEXT DEFAULT '',
                role TEXT DEFAULT '',
                use_case TEXT DEFAULT '',
                registered_at TEXT DEFAULT (datetime('now')),
                email_confirmed INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                company TEXT DEFAULT '',
                message TEXT NOT NULL,
                sent_at TEXT DEFAULT (datetime('now'))
            );
        `);
    } catch (e) {
        console.warn('SQLite unavailable:', e.message);
        db = null;
    }
} else if (IS_VERCEL) {
    console.log('No persistent DB configured on Vercel. Add POSTGRES_URL to enable storage.');
}

// --- Email Configuration ---
// IMPORTANT: Replace these with your actual email credentials before deployment.
// For production, use environment variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
    auth: {
        user: process.env.SMTP_USER || 'admin@qauliumai.in',
        pass: process.env.SMTP_PASS || ''
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
};

const SMTP_FROM = process.env.SMTP_FROM || '"Qaulium AI" <admin@qauliumai.in>';

// Logo path for CID attachment in emails
const LOGO_PATH = path.join(__dirname, 'logo-white.png');

let transporter;
try {
    transporter = nodemailer.createTransport(SMTP_CONFIG);
} catch (err) {
    console.error('Email transporter setup failed:', err.message);
}

// --- Email Template ---
function buildConfirmationEmail(firstName) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Welcome to Qaulium AI</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<!-- Top Bar -->
<tr>
<td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td>
<img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
</td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">
Registration Confirmation
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">
Welcome, ${firstName}.
</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">
Your registration has been confirmed.
</p>

<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
Thank you for registering with Qaulium AI. Your account has been created and you are now on the early access list for our quantum development platform.
</p>

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
Here is what happens next:
</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
<tr>
<td style="padding:12px 0;border-bottom:1px solid #F3F4F6;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width:28px;vertical-align:top;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0A0A0A;">01</td>
<td style="padding-left:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Our team reviews your registration and use case.</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:12px 0;border-bottom:1px solid #F3F4F6;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width:28px;vertical-align:top;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0A0A0A;">02</td>
<td style="padding-left:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">You will receive access credentials for Qaulium-Studio IDE.</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:12px 0;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width:28px;vertical-align:top;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0A0A0A;">03</td>
<td style="padding-left:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Schedule an engineering briefing to discuss your quantum workloads.</td>
</tr>
</table>
</td>
</tr>
</table>

<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">
If you have questions, reply to this email or reach us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.
</p>

<!-- Social icons -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
<tr>
<td align="left" style="padding-top:8px;">
    <a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);">
    </a>
    <a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);">
    </a>
    <a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank">
        <img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;">
    </a>
</td>
</tr>
</table>

</td>
</tr>

<!-- Bottom Bar -->
<tr>
<td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">
&copy; 2026 Qaulium AI. All rights reserved.<br>
Amaravati, Andhra Pradesh, India
</td>
</tr>
</table>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildContactNotificationEmail(name, email, company, message) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<tr>
<td style="background-color:#0A0A0A;padding:24px 40px;border-radius:12px 12px 0 0;">
<span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Qaulium AI</span>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:40px;">
<h2 style="margin:0 0 20px;font-size:22px;color:#0A0A0A;font-weight:600;">New Contact Form Submission</h2>
<table width="100%" style="font-size:14px;color:#374151;line-height:1.7;">
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;width:100px;">Name</td><td style="padding:8px 0;">${name}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Email</td><td style="padding:8px 0;">${email}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Company</td><td style="padding:8px 0;">${company || '—'}</td></tr>
</table>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
<p style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${message}</p>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:16px 40px;">
<p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">
If you have questions, reply to this email or reach us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.
</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
<tr>
<td align="left" style="padding-top:8px;">
    <a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;">
    </a>
    <a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;">
    </a>
    <a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank">
        <img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;">
    </a>
</td>
</tr>
</table>

</td>
</tr>

<tr>
<td style="background-color:#0A0A0A;padding:20px 40px;border-radius:0 0 12px 12px;">
<p style="margin:0;font-size:12px;color:#888888;">&copy; 2026 Qaulium AI. All rights reserved.</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildContactConfirmationEmail(name) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<tr>
<td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td>
<img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
</td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">
Message Received
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">
Thank you, ${name}.
</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">
We have successfully received your message.
</p>

<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
Our team will review your inquiry and get back to you shortly. We typically respond within 24-48 hours.
</p>

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
In the meantime, feel free to explore our platform and learn more about what Qaulium AI can do for you.
</p>

<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">
If you have any urgent questions, reach us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.
</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
<tr>
<td align="left" style="padding-top:8px;">
    <a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);">
    </a>
    <a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank">
        <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);">
    </a>
    <a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank">
        <img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;">
    </a>
</td>
</tr>
</table>

</td>
</tr>

<tr>
<td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">
&copy; 2026 Qaulium AI. All rights reserved.<br>
Amaravati, Andhra Pradesh, India
</td>
</tr>
</table>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// --- Helper: sanitize user input for email ---
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- API Routes ---

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, company, role, useCase } = req.body;

        if (!firstName || !lastName || !email) {
            return res.status(400).json({ success: false, message: 'First name, last name, and email are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        // Insert into database (Postgres on Vercel, SQLite locally)
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            try {
                await pgQuery(
                    `
                    INSERT INTO registrations (first_name, last_name, email, phone, company, role, use_case)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `,
                    [
                        firstName.trim(),
                        lastName.trim(),
                        email.trim().toLowerCase(),
                        (phone || '').trim(),
                        (company || '').trim(),
                        (role || '').trim(),
                        (useCase || '').trim()
                    ]
                );
            } catch (dbErr) {
                if (dbErr.code === '23505') {
                    return res.status(409).json({ success: false, message: 'This email is already registered.' });
                }
                throw dbErr;
            }
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO registrations (first_name, last_name, email, phone, company, role, use_case)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            try {
                stmt.run(
                    firstName.trim(),
                    lastName.trim(),
                    email.trim().toLowerCase(),
                    (phone || '').trim(),
                    (company || '').trim(),
                    (role || '').trim(),
                    (useCase || '').trim()
                );
            } catch (dbErr) {
                if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ success: false, message: 'This email is already registered.' });
                }
                throw dbErr;
            }
        }

        // Send confirmation email immediately before returning success
        if (transporter) {
            const safeFirstName = escapeHtml(firstName.trim());
            try {
                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: email.trim().toLowerCase(),
                    subject: 'Welcome to Qaulium AI — Registration Confirmed',
                    html: buildConfirmationEmail(safeFirstName),
                    attachments: [{
                        filename: 'logo-white.png',
                        path: LOGO_PATH,
                        cid: 'qualium-logo'
                    }]
                });
            } catch (emailErr) {
                console.error('Failed to send confirmation email:', emailErr.message);
                return res.status(502).json({
                    success: false,
                    message: 'Registration saved, but confirmation email could not be sent right now. Please try again.'
                });
            }
        }

        res.json({ success: true, message: 'Registration successful.' });

    } catch (err) {
        console.error('Registration error:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// POST /api/contact
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, company, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        // Save to database (Postgres on Vercel, SQLite locally)
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery(
                `
                INSERT INTO contact_messages (name, email, company, message)
                VALUES ($1, $2, $3, $4)
                `,
                [
                    name.trim(),
                    email.trim().toLowerCase(),
                    (company || '').trim(),
                    message.trim()
                ]
            );
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO contact_messages (name, email, company, message)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(name.trim(), email.trim().toLowerCase(), (company || '').trim(), message.trim());
        }

        // Send both emails immediately before returning success
        if (transporter) {
            const safeName = escapeHtml(name.trim());
            const safeEmail = escapeHtml(email.trim());
            const safeCompany = escapeHtml((company || '').trim());
            const safeMessage = escapeHtml(message.trim());

            try {
                await Promise.all([
                    transporter.sendMail({
                        from: SMTP_FROM,
                        to: process.env.CONTACT_EMAIL || 'admin@qauliumai.in',
                        subject: `Contact Form: ${safeName} — Qaulium AI`,
                        html: buildContactNotificationEmail(safeName, safeEmail, safeCompany, safeMessage)
                    }),
                    transporter.sendMail({
                        from: SMTP_FROM,
                        to: email.trim().toLowerCase(),
                        subject: 'We received your message — Qaulium AI',
                        html: buildContactConfirmationEmail(safeName),
                        attachments: [{
                            filename: 'logo-white.png',
                            path: LOGO_PATH,
                            cid: 'qualium-logo'
                        }]
                    })
                ]);
            } catch (emailErr) {
                console.error('Failed to send contact emails:', emailErr.message);
                return res.status(502).json({
                    success: false,
                    message: 'Message saved, but email delivery failed right now. Please try again.'
                });
            }
        }

        res.json({ success: true, message: 'Message sent successfully.' });

    } catch (err) {
        console.error('Contact form error:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/stats — Admin endpoint for total request counts and recent submissions
app.get('/api/stats', async (req, res) => {
    if (!HAS_POSTGRES && !db) {
        return res.json({
            success: true,
            totals: { registrations: 0, contacts: 0, allRequests: 0 },
            recent: { registrations: [], contacts: [] },
            note: 'No persistent DB configured.'
        });
    }

    try {
        let registrationsCount = 0;
        let contactsCount = 0;
        let recentRegistrations = [];
        let recentContacts = [];

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();

            const regCountResult = await pgQuery('SELECT COUNT(*)::int AS count FROM registrations');
            const contactCountResult = await pgQuery('SELECT COUNT(*)::int AS count FROM contact_messages');
            registrationsCount = regCountResult.rows[0]?.count || 0;
            contactsCount = contactCountResult.rows[0]?.count || 0;

            const regResult = await pgQuery(`
                SELECT id, first_name, last_name, email, phone, company, role, use_case, registered_at
                FROM registrations
                ORDER BY registered_at DESC
                LIMIT 10
            `);
            const contactResult = await pgQuery(`
                SELECT id, name, email, company, message, sent_at
                FROM contact_messages
                ORDER BY sent_at DESC
                LIMIT 10
            `);
            recentRegistrations = regResult.rows;
            recentContacts = contactResult.rows;
        } else {
            registrationsCount = db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count;
            contactsCount = db.prepare('SELECT COUNT(*) AS count FROM contact_messages').get().count;

            recentRegistrations = db.prepare(
                'SELECT id, first_name, last_name, email, phone, company, role, use_case, registered_at FROM registrations ORDER BY registered_at DESC LIMIT 10'
            ).all();

            recentContacts = db.prepare(
                'SELECT id, name, email, company, message, sent_at FROM contact_messages ORDER BY sent_at DESC LIMIT 10'
            ).all();
        }

        return res.json({
            success: true,
            totals: {
                registrations: registrationsCount,
                contacts: contactsCount,
                allRequests: registrationsCount + contactsCount
            },
            recent: {
                registrations: recentRegistrations,
                contacts: recentContacts
            }
        });
    } catch (err) {
        console.error('Error fetching stats:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/registrations — Admin endpoint to view all registrations
app.get('/api/registrations', async (req, res) => {
    if (!HAS_POSTGRES && !db) return res.json({ success: true, count: 0, data: [], note: 'No persistent DB configured.' });
    try {
        let rows;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM registrations ORDER BY registered_at DESC');
            rows = result.rows;
        } else {
            rows = db.prepare('SELECT * FROM registrations ORDER BY registered_at DESC').all();
        }
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Error fetching registrations:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/contacts — Admin endpoint to view all contact messages
app.get('/api/contacts', async (req, res) => {
    if (!HAS_POSTGRES && !db) return res.json({ success: true, count: 0, data: [], note: 'No persistent DB configured.' });
    try {
        let rows;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM contact_messages ORDER BY sent_at DESC');
            rows = result.rows;
        } else {
            rows = db.prepare('SELECT * FROM contact_messages ORDER BY sent_at DESC').all();
        }
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Error fetching contacts:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Start Server (skip on Vercel) ---
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n  ✦ Qaulium AI server running at http://localhost:${PORT}\n`);
        console.log(`  Routes:`);
        console.log(`    GET  /                   → Landing page`);
        console.log(`    GET  /hardware           → Hardware page`);
        console.log(`    POST /api/register       → User registration`);
        console.log(`    POST /api/contact        → Contact form`);
        console.log(`    GET  /api/registrations  → View all registrations`);
        console.log(`    GET  /api/contacts       → View all contact messages\n`);
    });
}

module.exports = app;
