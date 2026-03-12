/* ============================================
   Qaulium AI - Backend Server
   Node.js + Express + SQLite + Nodemailer
   ============================================ */

require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let PgClient;
try { ({ Client: PgClient } = require('pg')); } catch (e) { PgClient = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const POSTGRES_CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;
const HAS_POSTGRES = !!(PgClient && POSTGRES_CONNECTION_STRING);
const ADMIN_APP_ORIGIN = process.env.ADMIN_APP_ORIGIN || 'https://admin.qauliumai.in';
const ADMIN_LOGIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL || 'admin@qauliumai.in';
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || '';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || '';

// Trust the first proxy (Vercel, etc.) so express-rate-limit reads X-Forwarded-For correctly
app.set('trust proxy', 1);

// --- Middleware ---
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname), {
    index: 'index.html',
    extensions: ['html']
}));

// Explicit careers route for environments where extension fallback is skipped
app.get('/careers', (req, res) => {
    res.sendFile(path.join(__dirname, 'careers.html'));
});

app.get('/careers.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'careers.html'));
});

app.get('/careers/apply', (req, res) => {
    res.sendFile(path.join(__dirname, 'careers-apply.html'));
});

app.get('/careers-apply.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'careers-apply.html'));
});

// CORS for separate admin subdomain app
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/admin')) return next();

    const origin = req.headers.origin;
    const allowedOrigins = [
        ADMIN_APP_ORIGIN,
        'https://admin.qauliumai.in',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ];

    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    return next();
});

// Rate limiting to prevent abuse
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString();
}

function signAdminToken(payload) {
    const payloadStr = JSON.stringify(payload);
    const encoded = base64UrlEncode(payloadStr);
    const sig = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

function verifyAdminToken(token) {
    if (!token || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
    if (signature !== expected) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(encoded));
        if (!payload || !payload.exp || Date.now() > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function requireAdminAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = verifyAdminToken(token);
    if (!payload) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.admin = payload;
    return next();
}

// --- Database Setup ---
// Priority:
// 1) Vercel Postgres (production/serverless)
// 2) SQLite (local)
let db = null;
let postgresSchemaReady = null;

async function pgQuery(queryText, values = []) {
    const shouldUseSsl = /sslmode=require/i.test(POSTGRES_CONNECTION_STRING || '');
    const client = new PgClient({
        connectionString: POSTGRES_CONNECTION_STRING,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
    });
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

            await pgQuery(`
                CREATE TABLE IF NOT EXISTS career_applications (
                    id SERIAL PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    role_applied TEXT NOT NULL,
                    experience_years INTEGER DEFAULT 0,
                    location TEXT NOT NULL,
                    current_company TEXT DEFAULT '',
                    university TEXT DEFAULT '',
                    degree TEXT DEFAULT '',
                    graduation_year INTEGER DEFAULT 0,
                    availability TEXT DEFAULT '',
                    linkedin_url TEXT DEFAULT '',
                    portfolio_url TEXT DEFAULT '',
                    resume_url TEXT NOT NULL,
                    cover_letter TEXT NOT NULL,
                    applied_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS university TEXT DEFAULT ''`);
            await pgQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS degree TEXT DEFAULT ''`);
            await pgQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS graduation_year INTEGER DEFAULT 0`);
            await pgQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT ''`);
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

            CREATE TABLE IF NOT EXISTS career_applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                role_applied TEXT NOT NULL,
                experience_years INTEGER DEFAULT 0,
                location TEXT NOT NULL,
                current_company TEXT DEFAULT '',
                university TEXT DEFAULT '',
                degree TEXT DEFAULT '',
                graduation_year INTEGER DEFAULT 0,
                availability TEXT DEFAULT '',
                linkedin_url TEXT DEFAULT '',
                portfolio_url TEXT DEFAULT '',
                resume_url TEXT NOT NULL,
                cover_letter TEXT NOT NULL,
                applied_at TEXT DEFAULT (datetime('now'))
            );
        `);

        try { db.prepare('ALTER TABLE career_applications ADD COLUMN university TEXT DEFAULT ""').run(); } catch (e) {}
        try { db.prepare('ALTER TABLE career_applications ADD COLUMN degree TEXT DEFAULT ""').run(); } catch (e) {}
        try { db.prepare('ALTER TABLE career_applications ADD COLUMN graduation_year INTEGER DEFAULT 0').run(); } catch (e) {}
        try { db.prepare('ALTER TABLE career_applications ADD COLUMN availability TEXT DEFAULT ""').run(); } catch (e) {}
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
<td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td>
<img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
</td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">
New Contact Message
</td>
</tr>
</table>
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

function buildCareerApplicationConfirmationEmail(firstName, roleApplied) {
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
<td align="right" style="font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Application Received</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Thank you, ${firstName}.</h1>
<p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.65;">We have received your application for the <strong>${roleApplied}</strong> role at Qaulium AI.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Our hiring team is reviewing your profile and will get back to you with the next steps shortly.</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">If shortlisted, we will reach out to schedule an initial conversation with our team.</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">For questions, contact us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a>.</p>
</td>
</tr>

<tr>
<td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td>
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

function buildCareerApplicationNotificationEmail(data) {
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
New Application
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="background-color:#ffffff;padding:40px;">
<h2 style="margin:0 0 20px;font-size:22px;color:#0A0A0A;font-weight:600;">New Career Application</h2>
<table width="100%" style="font-size:14px;color:#374151;line-height:1.7;">
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;width:160px;">Name</td><td style="padding:8px 0;">${data.firstName} ${data.lastName}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Email</td><td style="padding:8px 0;">${data.email}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Phone</td><td style="padding:8px 0;">${data.phone}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Role Applied</td><td style="padding:8px 0;">${data.roleApplied}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Location</td><td style="padding:8px 0;">${data.location}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">University / College</td><td style="padding:8px 0;">${data.university || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Degree / Program</td><td style="padding:8px 0;">${data.degree || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Graduation Year</td><td style="padding:8px 0;">${data.graduationYear || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Availability</td><td style="padding:8px 0;">${data.availability || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">LinkedIn</td><td style="padding:8px 0;">${data.linkedinUrl || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Portfolio</td><td style="padding:8px 0;">${data.portfolioUrl || '-'}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#0A0A0A;">Resume URL</td><td style="padding:8px 0;">${data.resumeUrl}</td></tr>
</table>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
<p style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${data.coverLetter}</p>
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
                        html: buildContactNotificationEmail(safeName, safeEmail, safeCompany, safeMessage),
                        attachments: [{
                            filename: 'logo-white.png',
                            path: LOGO_PATH,
                            cid: 'qualium-logo'
                        }]
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

// POST /api/careers/apply
app.post('/api/careers/apply', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            roleApplied,
            location,
            university,
            degree,
            graduationYear,
            availability,
            linkedinUrl,
            portfolioUrl,
            resumeUrl,
            coverLetter
        } = req.body;

        if (!firstName || !lastName || !email || !phone || !roleApplied || !location || !university || !degree || !graduationYear || !availability || !resumeUrl || !coverLetter) {
            return res.status(400).json({ success: false, message: 'Please provide all required application details.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        const safeGraduationYear = parseInt(graduationYear, 10);
        if (Number.isNaN(safeGraduationYear) || safeGraduationYear < 2024 || safeGraduationYear > 2035) {
            return res.status(400).json({ success: false, message: 'Graduation year must be between 2024 and 2035.' });
        }

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery(
                `
                INSERT INTO career_applications (
                    first_name, last_name, email, phone, role_applied, experience_years, location,
                    current_company, university, degree, graduation_year, availability,
                    linkedin_url, portfolio_url, resume_url, cover_letter
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                `,
                [
                    firstName.trim(),
                    lastName.trim(),
                    email.trim().toLowerCase(),
                    phone.trim(),
                    roleApplied.trim(),
                    0,
                    location.trim(),
                    '',
                    university.trim(),
                    degree.trim(),
                    safeGraduationYear,
                    availability.trim(),
                    (linkedinUrl || '').trim(),
                    (portfolioUrl || '').trim(),
                    resumeUrl.trim(),
                    coverLetter.trim()
                ]
            );
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO career_applications (
                    first_name, last_name, email, phone, role_applied, experience_years, location,
                    current_company, university, degree, graduation_year, availability,
                    linkedin_url, portfolio_url, resume_url, cover_letter
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                firstName.trim(),
                lastName.trim(),
                email.trim().toLowerCase(),
                phone.trim(),
                roleApplied.trim(),
                0,
                location.trim(),
                '',
                university.trim(),
                degree.trim(),
                safeGraduationYear,
                availability.trim(),
                (linkedinUrl || '').trim(),
                (portfolioUrl || '').trim(),
                resumeUrl.trim(),
                coverLetter.trim()
            );
        }

        if (transporter) {
            const safeData = {
                firstName: escapeHtml(firstName.trim()),
                lastName: escapeHtml(lastName.trim()),
                email: escapeHtml(email.trim().toLowerCase()),
                phone: escapeHtml(phone.trim()),
                roleApplied: escapeHtml(roleApplied.trim()),
                location: escapeHtml(location.trim()),
                university: escapeHtml(university.trim()),
                degree: escapeHtml(degree.trim()),
                graduationYear: safeGraduationYear,
                availability: escapeHtml(availability.trim()),
                linkedinUrl: escapeHtml((linkedinUrl || '').trim()),
                portfolioUrl: escapeHtml((portfolioUrl || '').trim()),
                resumeUrl: escapeHtml(resumeUrl.trim()),
                coverLetter: escapeHtml(coverLetter.trim())
            };

            try {
                await Promise.all([
                    transporter.sendMail({
                        from: SMTP_FROM,
                        to: process.env.CONTACT_EMAIL || 'admin@qauliumai.in',
                        subject: `Career Application: ${safeData.firstName} ${safeData.lastName} — ${safeData.roleApplied}`,
                        html: buildCareerApplicationNotificationEmail(safeData),
                        attachments: [{
                            filename: 'logo-white.png',
                            path: LOGO_PATH,
                            cid: 'qualium-logo'
                        }]
                    }),
                    transporter.sendMail({
                        from: SMTP_FROM,
                        to: email.trim().toLowerCase(),
                        subject: `Application Received — ${safeData.roleApplied} | Qaulium AI`,
                        html: buildCareerApplicationConfirmationEmail(safeData.firstName, safeData.roleApplied),
                        attachments: [{
                            filename: 'logo-white.png',
                            path: LOGO_PATH,
                            cid: 'qualium-logo'
                        }]
                    })
                ]);
            } catch (emailErr) {
                console.error('Failed to send career application emails:', emailErr.message);
                return res.status(502).json({
                    success: false,
                    message: 'Application saved, but confirmation email could not be sent right now. Please try again.'
                });
            }
        }

        return res.json({ success: true, message: 'Application submitted successfully.' });
    } catch (err) {
        console.error('Career application error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

async function fetchRegistrations() {
    if (HAS_POSTGRES) {
        await ensurePostgresSchema();
        const result = await pgQuery('SELECT * FROM registrations ORDER BY registered_at DESC');
        return result.rows;
    }
    if (db) return db.prepare('SELECT * FROM registrations ORDER BY registered_at DESC').all();
    return [];
}

async function fetchContacts() {
    if (HAS_POSTGRES) {
        await ensurePostgresSchema();
        const result = await pgQuery('SELECT * FROM contact_messages ORDER BY sent_at DESC');
        return result.rows;
    }
    if (db) return db.prepare('SELECT * FROM contact_messages ORDER BY sent_at DESC').all();
    return [];
}

async function fetchCareers() {
    if (HAS_POSTGRES) {
        await ensurePostgresSchema();
        const result = await pgQuery('SELECT * FROM career_applications ORDER BY applied_at DESC');
        return result.rows;
    }
    if (db) return db.prepare('SELECT * FROM career_applications ORDER BY applied_at DESC').all();
    return [];
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function getAudienceEmails(audience, customEmails) {
    const registrations = await fetchRegistrations();
    const contacts = await fetchContacts();
    const careers = await fetchCareers();

    const regEmails = registrations.map((item) => (item.email || '').trim().toLowerCase()).filter(Boolean);
    const contactEmails = contacts.map((item) => (item.email || '').trim().toLowerCase()).filter(Boolean);
    const careerEmails = careers.map((item) => (item.email || '').trim().toLowerCase()).filter(Boolean);

    let emails = [];
    if (audience === 'registrations') emails = regEmails;
    else if (audience === 'contacts') emails = contactEmails;
    else if (audience === 'careers') emails = careerEmails;
    else if (audience === 'custom') emails = (customEmails || []).map((v) => (v || '').trim().toLowerCase()).filter(Boolean);
    else emails = regEmails.concat(contactEmails, careerEmails);

    return [...new Set(emails)];
}

// --- Admin Auth + Admin APIs (for separate admin subdomain) ---
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!ADMIN_TOKEN_SECRET) {
        return res.status(500).json({ success: false, message: 'Admin auth is not configured.' });
    }

    if (!ADMIN_LOGIN_PASSWORD) {
        return res.status(500).json({ success: false, message: 'Admin login password not configured.' });
    }

    if ((email || '').trim().toLowerCase() !== ADMIN_LOGIN_EMAIL.toLowerCase() || (password || '') !== ADMIN_LOGIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = signAdminToken({
        email: ADMIN_LOGIN_EMAIL,
        role: 'admin',
        exp: Date.now() + (12 * 60 * 60 * 1000)
    });

    return res.json({ success: true, token, admin: { email: ADMIN_LOGIN_EMAIL, role: 'admin' } });
});

app.get('/api/admin/me', requireAdminAuth, (req, res) => {
    return res.json({ success: true, admin: req.admin });
});

app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
    try {
        const registrations = await fetchRegistrations();
        const contacts = await fetchContacts();
        const careers = await fetchCareers();

        return res.json({
            success: true,
            totals: {
                registrations: registrations.length,
                contacts: contacts.length,
                careers: careers.length,
                allRequests: registrations.length + contacts.length + careers.length
            },
            recent: {
                registrations: registrations.slice(0, 10),
                contacts: contacts.slice(0, 10),
                careers: careers.slice(0, 10)
            }
        });
    } catch (err) {
        console.error('Admin stats error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.get('/api/admin/registrations', requireAdminAuth, async (req, res) => {
    try {
        const rows = await fetchRegistrations();
        return res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Admin registrations error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.get('/api/admin/contacts', requireAdminAuth, async (req, res) => {
    try {
        const rows = await fetchContacts();
        return res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Admin contacts error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.get('/api/admin/careers', requireAdminAuth, async (req, res) => {
    try {
        const rows = await fetchCareers();
        return res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Admin careers error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/email/send', requireAdminAuth, async (req, res) => {
    try {
        const { audience, subject, body, customEmails } = req.body || {};
        if (!transporter) {
            return res.status(500).json({ success: false, message: 'Email service not configured.' });
        }
        if (!subject || !body) {
            return res.status(400).json({ success: false, message: 'Subject and body are required.' });
        }

        const recipients = await getAudienceEmails(audience || 'all', Array.isArray(customEmails) ? customEmails : []);
        if (!recipients.length) {
            return res.status(400).json({ success: false, message: 'No recipients found for selected audience.' });
        }

        const chunks = chunkArray(recipients, 50);
        for (const chunk of chunks) {
            await transporter.sendMail({
                from: SMTP_FROM,
                to: process.env.CONTACT_EMAIL || 'admin@qauliumai.in',
                bcc: chunk,
                subject: String(subject).trim(),
                html: String(body),
                attachments: [{
                    filename: 'logo-white.png',
                    path: LOGO_PATH,
                    cid: 'qualium-logo'
                }]
            });
        }

        return res.json({ success: true, message: 'Email sent successfully.', sent: recipients.length });
    } catch (err) {
        console.error('Admin bulk email error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/stats — Admin endpoint for total request counts and recent submissions
app.get('/api/stats', requireAdminAuth, async (req, res) => {
    if (!HAS_POSTGRES && !db) {
        return res.json({
            success: true,
            totals: { registrations: 0, contacts: 0, careers: 0, allRequests: 0 },
            recent: { registrations: [], contacts: [], careers: [] },
            note: 'No persistent DB configured.'
        });
    }

    try {
        let registrationsCount = 0;
        let contactsCount = 0;
        let careersCount = 0;
        let recentRegistrations = [];
        let recentContacts = [];
        let recentCareers = [];

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();

            const regCountResult = await pgQuery('SELECT COUNT(*)::int AS count FROM registrations');
            const contactCountResult = await pgQuery('SELECT COUNT(*)::int AS count FROM contact_messages');
            const careersCountResult = await pgQuery('SELECT COUNT(*)::int AS count FROM career_applications');
            registrationsCount = regCountResult.rows[0]?.count || 0;
            contactsCount = contactCountResult.rows[0]?.count || 0;
            careersCount = careersCountResult.rows[0]?.count || 0;

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
            const careersResult = await pgQuery(`
                SELECT id, first_name, last_name, email, phone, role_applied, location, university, degree, graduation_year, availability, linkedin_url, portfolio_url, resume_url, applied_at
                FROM career_applications
                ORDER BY applied_at DESC
                LIMIT 10
            `);
            recentRegistrations = regResult.rows;
            recentContacts = contactResult.rows;
            recentCareers = careersResult.rows;
        } else {
            registrationsCount = db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count;
            contactsCount = db.prepare('SELECT COUNT(*) AS count FROM contact_messages').get().count;
            careersCount = db.prepare('SELECT COUNT(*) AS count FROM career_applications').get().count;

            recentRegistrations = db.prepare(
                'SELECT id, first_name, last_name, email, phone, company, role, use_case, registered_at FROM registrations ORDER BY registered_at DESC LIMIT 10'
            ).all();

            recentContacts = db.prepare(
                'SELECT id, name, email, company, message, sent_at FROM contact_messages ORDER BY sent_at DESC LIMIT 10'
            ).all();

            recentCareers = db.prepare(
                'SELECT id, first_name, last_name, email, phone, role_applied, location, university, degree, graduation_year, availability, linkedin_url, portfolio_url, resume_url, applied_at FROM career_applications ORDER BY applied_at DESC LIMIT 10'
            ).all();
        }

        return res.json({
            success: true,
            totals: {
                registrations: registrationsCount,
                contacts: contactsCount,
                careers: careersCount,
                allRequests: registrationsCount + contactsCount + careersCount
            },
            recent: {
                registrations: recentRegistrations,
                contacts: recentContacts,
                careers: recentCareers
            }
        });
    } catch (err) {
        console.error('Error fetching stats:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/registrations — Admin endpoint to view all registrations
app.get('/api/registrations', requireAdminAuth, async (req, res) => {
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
app.get('/api/contacts', requireAdminAuth, async (req, res) => {
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

// GET /api/careers — Admin endpoint to view all career applications
app.get('/api/careers', requireAdminAuth, async (req, res) => {
    if (!HAS_POSTGRES && !db) return res.json({ success: true, count: 0, data: [], note: 'No persistent DB configured.' });
    try {
        let rows;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM career_applications ORDER BY applied_at DESC');
            rows = result.rows;
        } else {
            rows = db.prepare('SELECT * FROM career_applications ORDER BY applied_at DESC').all();
        }
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        console.error('Error fetching career applications:', err.message);
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
        console.log(`    POST /api/careers/apply  → Career application`);
        console.log(`    POST /api/admin/login    → Admin login`);
        console.log(`    GET  /api/admin/me       → Admin session validation`);
        console.log(`    GET  /api/admin/stats    → Admin stats`);
        console.log(`    GET  /api/admin/registrations → Admin registrations`);
        console.log(`    GET  /api/admin/contacts → Admin contacts`);
        console.log(`    GET  /api/admin/careers  → Admin careers`);
        console.log(`    POST /api/admin/email/send → Admin bulk email\n`);
    });
}

module.exports = app;
