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
const http = require('http');

let WebSocketServer = null;
try { ({ WebSocketServer } = require('ws')); } catch (e) { WebSocketServer = null; }

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let PgClient;
try { ({ Client: PgClient } = require('pg')); } catch (e) { PgClient = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const IS_PRODUCTION_RUNTIME = IS_VERCEL || process.env.NODE_ENV === 'production';
const POSTGRES_CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;
const HAS_POSTGRES = !!(PgClient && POSTGRES_CONNECTION_STRING);
const ADMIN_APP_ORIGIN = process.env.ADMIN_APP_ORIGIN || 'https://admin.qauliumai.in';
const ADMIN_LOGIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL || 'admin@qauliumai.in';
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || '';
const ADMIN_LOGIN_ROLE = process.env.ADMIN_LOGIN_ROLE || 'admin';
const ADMIN_DEV_OTP_BYPASS = !IS_PRODUCTION_RUNTIME && process.env.ADMIN_DEV_OTP_BYPASS === '1';
const ADMIN_DEV_AUTH_BYPASS = !IS_PRODUCTION_RUNTIME && process.env.ADMIN_DEV_AUTH_BYPASS === '1';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || '';
const ADMIN_OTP_TTL_MS = parseInt(process.env.ADMIN_OTP_TTL_MS || '300000', 10); // 5 min
const ADMIN_OTP_EMAIL = (process.env.ADMIN_OTP_EMAIL || ADMIN_LOGIN_EMAIL).trim().toLowerCase();
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || 'qaulium-default-org';

const pendingAdminOtps = new Map();
const adminWsClients = new Set();
const ADMIN_RUNTIME_SAMPLE_LIMIT = 200;
const ADMIN_DASHBOARD_CACHE_TTL_MS = 5000;
const adminRuntimeMetrics = {
    startedAt: Date.now(),
    requestCount: 0,
    errorCount: 0,
    samples: [],
    lastUpdatedAt: null
};
let adminDashboardCache = {
    expiresAt: 0,
    payload: null
};
const ADMIN_ROLE_PERMISSIONS = {
    super_admin: ['*'],
    admin: [
        'users.manage',
        'roles.manage',
        'api_keys.manage',
        'security.manage',
        'notifications.manage',
        'organization.manage',
        'projects.manage',
        'tasks.manage',
        'settings.manage',
        'audit.view'
    ],
    org_admin: [
        'users.manage',
        'notifications.manage',
        'organization.manage',
        'projects.manage',
        'tasks.manage',
        'audit.view'
    ],
    analyst: ['analytics.view', 'audit.view'],
    support_agent: ['users.manage', 'notifications.manage'],
    auditor: ['audit.view']
};

function normalizeAdminRole(role) {
    return String(role || 'admin').trim().toLowerCase().replace(/\s+/g, '_');
}

function getAdminPermissions(role) {
    const key = normalizeAdminRole(role);
    return ADMIN_ROLE_PERMISSIONS[key] || ADMIN_ROLE_PERMISSIONS.admin;
}

function hasAdminPermission(admin, permission) {
    const perms = getAdminPermissions(admin && admin.role);
    return perms.includes('*') || perms.includes(permission);
}

function buildAdminEvent(eventType, payload) {
    return JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: String(eventType || 'admin.event'),
        timestamp: new Date().toISOString(),
        payload: payload || {}
    });
}

function buildUsageEventId(scope) {
    return `${String(scope || 'event')}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function estimateCreditCost(options) {
    const cfg = options || {};
    const units = Math.max(1, Number(cfg.units || 1));
    const baseCredits = Math.max(0, Number(cfg.baseCredits || 0));
    const unitRate = Math.max(0, Number(cfg.unitRate || 0));
    const regionMultiplier = Math.max(0, Number(cfg.regionMultiplier || 1));
    const priorityMultiplier = Math.max(0, Number(cfg.priorityMultiplier || 1));
    const planDiscount = Math.max(0, Number(cfg.planDiscount || 1));
    const estimatedCredits = Number(((baseCredits + (units * unitRate)) * regionMultiplier * priorityMultiplier * planDiscount).toFixed(4));

    return {
        estimatedCredits,
        breakdown: {
            units,
            baseCredits,
            unitRate,
            regionMultiplier,
            priorityMultiplier,
            planDiscount
        }
    };
}

async function applyDirectCreditCharge(_payload) {
    return { success: true };
}

async function recordUsageLog(_payload) {
    return { success: true };
}

function broadcastAdminEvent(eventType, payload) {
    if (!adminWsClients.size) return;
    const message = buildAdminEvent(eventType, payload);
    for (const client of adminWsClients) {
        if (!client || client.readyState !== 1) continue;
        try {
            client.send(message);
        } catch (e) {
            // no-op
        }
    }
}

function attachAdminWebSocketServer(server) {
    if (!WebSocketServer || !server) return;

    const wsServer = new WebSocketServer({ server, path: '/ws/admin' });
    wsServer.on('connection', function (socket, req) {
        try {
            const url = new URL(req.url, 'http://localhost');
            const token = url.searchParams.get('token') || '';
            const payload = verifyAdminToken(token);
            if (!payload || payload.otpVerified !== true) {
                socket.close(1008, 'Unauthorized');
                return;
            }
        } catch (e) {
            socket.close(1008, 'Unauthorized');
            return;
        }

        adminWsClients.add(socket);
        socket.send(buildAdminEvent('ws.connected', { ok: true }));

        socket.on('close', function () {
            adminWsClients.delete(socket);
        });
    });
}

function invalidateAdminDashboardCache() {
    adminDashboardCache.expiresAt = 0;
    adminDashboardCache.payload = null;
}

function recordApiRuntimeMetric(reqPath, statusCode, durationMs) {
    if (!String(reqPath || '').startsWith('/api/')) return;
    adminRuntimeMetrics.requestCount += 1;
    if (Number(statusCode) >= 400) {
        adminRuntimeMetrics.errorCount += 1;
    }
    adminRuntimeMetrics.samples.push(Math.max(0, Number(durationMs) || 0));
    if (adminRuntimeMetrics.samples.length > ADMIN_RUNTIME_SAMPLE_LIMIT) {
        adminRuntimeMetrics.samples.shift();
    }
    adminRuntimeMetrics.lastUpdatedAt = new Date().toISOString();
}

function getPercentile(values, percentile) {
    if (!Array.isArray(values) || !values.length) return 0;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const position = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
    return sorted[position] || 0;
}

function getRuntimeMonitoringSnapshot() {
    return {
        apiP95LatencyMs: Math.round(getPercentile(adminRuntimeMetrics.samples, 95)),
        apiErrorRatePercent: adminRuntimeMetrics.requestCount
            ? Number(((adminRuntimeMetrics.errorCount / adminRuntimeMetrics.requestCount) * 100).toFixed(2))
            : 0,
        uptimeSeconds: Math.max(0, Math.round(process.uptime())),
        requestCount: adminRuntimeMetrics.requestCount,
        sampleCount: adminRuntimeMetrics.samples.length,
        lastUpdatedAt: adminRuntimeMetrics.lastUpdatedAt,
        startedAt: new Date(adminRuntimeMetrics.startedAt).toISOString()
    };
}

// Trust the first proxy (Vercel, etc.) so express-rate-limit reads X-Forwarded-For correctly
app.set('trust proxy', 1);
app.disable('x-powered-by');

// --- Middleware ---
app.use((req, res, next) => {
    const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (isSecure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
    }

    return next();
});

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        recordApiRuntimeMetric(req.path, res.statusCode, Date.now() - startedAt);
    });
    next();
});
app.use(express.static(path.join(__dirname), {
    index: 'index.html',
    extensions: ['html']
}));

app.get('/api/health', (req, res) => {
    return res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        runtime: {
            vercel: IS_VERCEL,
            production: IS_PRODUCTION_RUNTIME,
            hasPostgres: HAS_POSTGRES
        }
    });
});

// Serve logo from base64 data (fixes Vercel deployment where file serving may fail)
const LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAwcAAAEJCAYAAADBzVsWAAAQAElEQVR4AeydB5xkVZX/qyf2RDAQFUXMIkZUzJgVBXPGLIZ1Wde0q6uuq6uu66pr4G/EhBlzBBNrQsSACQMiIAgoohJmpif2zP/7PVOvqO6u8F51VXdV9+nPO3XTueee+7vp3PtCL6nlXyKQCCQCiUAikAgkAolAIpAIgkJsDQMgrEVi4SGQNUoFEoFEIBFIBBKBRCARSAQSgUQgEVgIqEhtEoFEIBFIBBKBRCARSAQSgUQgEUgEEoFEIBFIBBKBRSARSAQSgUQgEUgEEoFEIBFYqAjk5mChNmzWMhFIBBKBRCARSAQSgUQgEUgEEoFEIBFIBBKBRCARSAQSgUXQ2llnRSARSAQSgRFFoGqTCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgZGF4P+ZVSIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgRGFYP+5VyIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgRGF4P+5VyIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgRGF4P+5VyIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgRGF4P+5VyIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIjcHi6DNU/tEIBFIBBKBRCARSAQSgRGF4P+5VyIILAo5OajlaSKQCCQCiUAikAgkAolAIpAIJAKJQCKQCCQCiUAikAgkAotAIgRzczCsQxW3wHGvM9Fvy3WvM9F/RqXmRCAR+L+Lbn7laCiBQg1fkCo0wheFXH+DcFZwuhMIl3FYOuKVLWJEw+aKmRboEV3Sdf6bpzC61lYXSKr3tObjq9t8VN+VWJfkJsqGEQeHl69xhvvWCquRHwKvVxUcIWI8L6xW4PbvXphJvdwkwRPJWKhN1RYqm3VhOZF2rOxPXWHnY7TxVP/7WMvqfZRhpS+tIZH+VlKfWl8Wb3JKPEeNbLJ6yrpZQdmUHtpqcGHKT1Y5gHJ34ppZ6hW0pxjmTb4vHE5hHJHJS8CWH6zS3fKKRAGVvV2HnP5lm26bxIcvJvQWPbgm8Kgp+h5+Jz+/o9qZmlMKYOJk7sD+qMaUhctMVHYGO0UO8u0SJfkQs9OaLJq+Tqf+VK4I5kzgdY8Wq++fYfm5Th05Oo6qFLn+T42vJ5vkpWqMqKj4S/eOEMvCqx/EJqUDwX6fCqMvkZhWz/TKVshqKY6AzJLj2yHwGmQXHQiePXSKJ+3rMPGhLMu8LZ2FNlKjVGcxdGcVltQ3VhqHcXFxMEfBltHl/qURQU7v3a9e7EkqKGLNfkM+u6r3dGG7Ml6v1X5Jvxt4vgp+g8V0Pv1MIeVXOVhiJqNeLuIh06AMXR8AZDjzh8WzJxqvrtYFJN2p8yBYq50kYhNQ2ZJMVTYyJtQtyTDRpvHlhjBU1wc1KR8Lp5ySs+n6ZSrOGJ3KD0u1oPpXDC6qqVVbhZ10jyBqQvZv4aKsQsDLKkPLqHU7KQj9w4lAolAIhBXdQxfQJOV8vhdiFXF8Cq3SPWnDxYaMulZL6V/m3TKt14H8GD/pPKbVPgJKAeVy7cDvwqFZlxFJ6M6YDG6Wug9T5mK8cYyRcqc2lq/H/1RLqMpS2jm2agsCMJa50X6s8qZkgT6hQJzlqKJbkAcMLgU9q/LpoMvH3bTgJnRh5c9bGlVl9PnJWsVXXOhVPqx0Hzwqm8oKrCuGVm+8oT3ebq20VXKDfNLLlW9nTR63H5BNZQ1TJaOVbZKxfWxqoQx8sQiCEDLnAg8+OU7S4ViMGFNfkCVaAf4plRZ3zt2pnzp9Jqqd0r3V3xf2L8BZQqJx0c5C8vdnW3r9Z2aNtLeVsEgtGNxPPBWPNZxcXFxMDLxKMVvdIvZv5uCc0bQmvXBqvFnC4f3LwV5OFQMfPiXy/0rPzEGSH/KFPaKC5KYLcY5k6TnAO7nVkzVIU0ByPRjKxMFGqb/a5Oep8cFdqyWP1Nb0+qZJ4+YYxvUOqXhCx9tPWZ7U8ib3cOHB1pY5tZHBCM2k7BVLBYOKNWNXCOkkrXRsI9Sx100qVx8FVqybQ5a4fNWZ5qWM1dGcWPKoT0yrNI84WPj8d7F7K3S/zFQvbvZ3NnD7hXxQJJ2oxXf8j30MkplLVMjCKDJQ8rNyZjzQakEG+vOGsGPJ+RVMuE8a84Oa5bhFvFLEsSK5xLJbzGNn3Nex9xLPGv7Z2BSIT7RyoT8K6lDC7D7H3ExdQa/xJakY2hEjbNaE6a2YiDa7lRQ9WQGUCrQl7KDzYVQRDnjxXXZ8VY4a4bhbqQ3oAqEGLYEy888d3aYVJLQjvl6yUkscP4bH/MfNWPqBqwN8hG3EScEBdFAqMN/dMNfB4BPrUXXbnPD7/kzGmKnXOX6I0qTHrxRE3Hkzf5NG8sHlq1BQFoxgcaGBaJkELvY+nYXvPKjLzZlmBBqDpMDCXO/MKnEEqLLq7oBSGj1nj/bLVFnyJ1UVUVn5q4e/kOI1d0vmv1fOE37LKHKf9X0J9hMXDqeVKkVfr5r1nDQUUpj/CPcnUXc5dVqCHlDPqVaF6mWJ6fj3+g3q/ZbDNkuhZWJMtVGNgJfqqAiJOfQaQ7wlKvEQ7J5u09zFuPqKVlzWFLu0sFPJ6UGxGJ5nqJVl5bcnPPVU1MQIqSXqbj4eHy1fpMhGEGl7QumCQwRWVJ5L0l4MxI4d9sDHMt3aPQMbVfpbx26YhwQVIlV+gWj5gqmLHFUx5h7GYIwTBLr5eKj7sMiAXVJDDmcK5nGpMj/7AY/WpKOBdNu/cMrb3r4dQUCqV7B3FjqNLgkXKvHp8pnzHWB8NQKW0KMXqcEz5mLGMd1p1h+2RDGxV7YcNbFfZLZQeLYe3efdfGLLfQi9HkHEhNvLU4zB9PVKk1K+S0dCU3c6drmLeTPVjAE0sRgjdmKhxcDSrmNjXPJc4Dj4BhxvK8H+lqLbkE3w7xJ6nKe77Vhs=';

// Serve logo from base64 data (fixes Vercel deployment where file serving may fail)
app.get('/logo-white.png', (req, res) => {
    const buffer = Buffer.from(LOGO_BASE64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
});

// Serve favicon (prevent 404 errors)
app.get('/favicon.ico', (req, res) => {
    const FAVICON_BASE64 = 'AAABAAEAEBAQAAEABACsAwAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAA/4QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAQAAAEAAAAAAAAAAAAA';
    try {
        const buffer = Buffer.from(FAVICON_BASE64, 'base64');
        res.setHeader('Content-Type', 'image/x-icon');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(buffer);
    } catch (err) {
        res.status(204).send();
    }
});

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

app.get('/registration', (req, res) => {
    res.sendFile(path.join(__dirname, 'registration.html'));
});

app.get('/registration.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'registration.html'));
});

app.get('/pre-register', (req, res) => {
    res.sendFile(path.join(__dirname, 'registration.html'));
});

app.get('/pre-registration', (req, res) => {
    res.sendFile(path.join(__dirname, 'registration.html'));
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
        'http://127.0.0.1:5500',
        'http://localhost:5501',
        'http://127.0.0.1:5501'
    ];

    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

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
    if (!payload || payload.otpVerified !== true) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.admin = payload;
    return next();
}

function requireAdminPermission(permission) {
    return function (req, res, next) {
        if (!hasAdminPermission(req.admin, permission)) {
            return res.status(403).json({ success: false, message: 'Forbidden: missing permission ' + permission });
        }
        return next();
    };
}

function requireAdminAnyPermission(permissions) {
    const list = Array.isArray(permissions) ? permissions : [];
    return function (req, res, next) {
        const allowed = list.some(function (permission) {
            return hasAdminPermission(req.admin, permission);
        });
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Forbidden: insufficient role permissions.' });
        }
        return next();
    };
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

function isIgnorablePgSchemaError(err) {
    const code = (err && err.code) || '';
    const msg = (err && err.message) || '';

    // In serverless concurrency, CREATE ... IF NOT EXISTS can still race.
    if (code === '42P07' || code === '42710') return true;
    if (code === '23505' && msg.includes('pg_class_relname_nsp_index')) return true;
    return false;
}

async function pgSchemaQuery(queryText, values = []) {
    try {
        return await pgQuery(queryText, values);
    } catch (err) {
        if (isIgnorablePgSchemaError(err)) {
            return null;
        }
        throw err;
    }
}

async function ensurePostgresSchema() {
    if (!HAS_POSTGRES) return;
    if (!postgresSchemaReady) {
        postgresSchemaReady = (async () => {
            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS registrations (
                    id SERIAL PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT DEFAULT '',
                    company TEXT DEFAULT '',
                    role TEXT DEFAULT '',
                    use_case TEXT DEFAULT '',
                    source TEXT DEFAULT 'unknown',
                    registered_at TIMESTAMPTZ DEFAULT NOW(),
                    email_confirmed INTEGER DEFAULT 0
                )
            `);

            await pgSchemaQuery(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown'`);
            await pgSchemaQuery(`UPDATE registrations SET source = 'unknown' WHERE source IS NULL OR source = ''`);

            // Backward-compatible migration: older deployments enforced unique email
            // which prevented multiple submissions from the same user.
            await pgSchemaQuery(`DROP INDEX IF EXISTS idx_registrations_email`);
            await pgSchemaQuery(`ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_email_key`);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS contact_messages (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    company TEXT DEFAULT '',
                    message TEXT NOT NULL,
                    sent_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
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

            await pgSchemaQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS university TEXT DEFAULT ''`);
            await pgSchemaQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS degree TEXT DEFAULT ''`);
            await pgSchemaQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS graduation_year INTEGER DEFAULT 0`);
            await pgSchemaQuery(`ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT ''`);

            await pgSchemaQuery(`DROP INDEX IF EXISTS idx_contact_messages_email`);
            await pgSchemaQuery(`DROP INDEX IF EXISTS idx_career_applications_email`);
            await pgSchemaQuery(`CREATE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email)`);
            await pgSchemaQuery(`CREATE INDEX IF NOT EXISTS idx_career_applications_email ON career_applications(email)`);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS forms (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    slug TEXT NOT NULL UNIQUE,
                    schema_json TEXT NOT NULL DEFAULT '[]',
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS form_responses (
                    id SERIAL PRIMARY KEY,
                    form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
                    response_json TEXT NOT NULL DEFAULT '{}',
                    respondent_email TEXT DEFAULT '',
                    submitted_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_departments (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    lead TEXT DEFAULT '',
                    parent TEXT DEFAULT '-',
                    region TEXT DEFAULT 'IN',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_employees (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    department TEXT DEFAULT 'Unassigned',
                    manager TEXT DEFAULT '-',
                    country TEXT DEFAULT 'IN',
                    phone TEXT DEFAULT '',
                    role TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_projects (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner TEXT DEFAULT '-',
                    status TEXT DEFAULT 'On Track',
                    deadline TIMESTAMPTZ,
                    progress INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_tasks (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    project TEXT DEFAULT 'General',
                    assignee TEXT DEFAULT 'Unassigned',
                    priority TEXT DEFAULT 'Medium',
                    status TEXT DEFAULT 'todo',
                    due_date TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_notifications (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMPTZ DEFAULT NOW(),
                    title TEXT NOT NULL,
                    channel TEXT DEFAULT 'email',
                    status TEXT DEFAULT 'queued',
                    audience TEXT DEFAULT 'all',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_incidents (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMPTZ DEFAULT NOW(),
                    summary TEXT NOT NULL,
                    severity TEXT DEFAULT 'low',
                    status TEXT DEFAULT 'open',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_runtime_settings (
                    id INTEGER PRIMARY KEY,
                    locale TEXT DEFAULT 'en',
                    country TEXT DEFAULT 'all',
                    realtime_enabled INTEGER DEFAULT 1,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                CREATE TABLE IF NOT EXISTS admin_enterprise_state (
                    id INTEGER PRIMARY KEY,
                    state_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await pgSchemaQuery(`
                INSERT INTO admin_runtime_settings (id, locale, country, realtime_enabled)
                VALUES (1, 'en', 'all', 1)
                ON CONFLICT (id) DO NOTHING
            `);

            await pgSchemaQuery(`
                INSERT INTO admin_enterprise_state (id, state_json)
                VALUES (1, '{}')
                ON CONFLICT (id) DO NOTHING
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
                email TEXT NOT NULL,
                phone TEXT DEFAULT '',
                company TEXT DEFAULT '',
                role TEXT DEFAULT '',
                use_case TEXT DEFAULT '',
                source TEXT DEFAULT 'unknown',
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

        try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email)').run(); } catch (e) {}
        try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_career_applications_email ON career_applications(email)').run(); } catch (e) {}

        db.exec(`
            CREATE TABLE IF NOT EXISTS forms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                slug TEXT NOT NULL UNIQUE,
                schema_json TEXT NOT NULL DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS form_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
                response_json TEXT NOT NULL DEFAULT '{}',
                respondent_email TEXT DEFAULT '',
                submitted_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                lead TEXT DEFAULT '',
                parent TEXT DEFAULT '-',
                region TEXT DEFAULT 'IN',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                department TEXT DEFAULT 'Unassigned',
                manager TEXT DEFAULT '-',
                country TEXT DEFAULT 'IN',
                phone TEXT DEFAULT '',
                role TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                owner TEXT DEFAULT '-',
                status TEXT DEFAULT 'On Track',
                deadline TEXT DEFAULT '',
                progress INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                project TEXT DEFAULT 'General',
                assignee TEXT DEFAULT 'Unassigned',
                priority TEXT DEFAULT 'Medium',
                status TEXT DEFAULT 'todo',
                due_date TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time TEXT DEFAULT (datetime('now')),
                title TEXT NOT NULL,
                channel TEXT DEFAULT 'email',
                status TEXT DEFAULT 'queued',
                audience TEXT DEFAULT 'all',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time TEXT DEFAULT (datetime('now')),
                summary TEXT NOT NULL,
                severity TEXT DEFAULT 'low',
                status TEXT DEFAULT 'open',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_runtime_settings (
                id INTEGER PRIMARY KEY,
                locale TEXT DEFAULT 'en',
                country TEXT DEFAULT 'all',
                realtime_enabled INTEGER DEFAULT 1,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS admin_enterprise_state (
                id INTEGER PRIMARY KEY,
                state_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
        `);

        try { db.prepare("INSERT OR IGNORE INTO admin_runtime_settings (id, locale, country, realtime_enabled) VALUES (1, 'en', 'all', 1)").run(); } catch (e) {}
        try { db.prepare("INSERT OR IGNORE INTO admin_enterprise_state (id, state_json) VALUES (1, '{}')").run(); } catch (e) {}

        // Backward-compatible migration for SQLite databases created with
        // registrations.email UNIQUE.
        try {
            const registrationTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='registrations'").get();
            const registrationSql = ((registrationTableInfo && registrationTableInfo.sql) || '').toUpperCase();
            if (registrationSql.includes('EMAIL TEXT NOT NULL UNIQUE')) {
                db.exec(`
                    BEGIN TRANSACTION;

                    ALTER TABLE registrations RENAME TO registrations_old;

                    CREATE TABLE registrations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        first_name TEXT NOT NULL,
                        last_name TEXT NOT NULL,
                        email TEXT NOT NULL,
                        phone TEXT DEFAULT '',
                        company TEXT DEFAULT '',
                        role TEXT DEFAULT '',
                        use_case TEXT DEFAULT '',
                        source TEXT DEFAULT 'unknown',
                        registered_at TEXT DEFAULT (datetime('now')),
                        email_confirmed INTEGER DEFAULT 0
                    );

                    INSERT INTO registrations (
                        id, first_name, last_name, email, phone, company, role, use_case, source, registered_at, email_confirmed
                    )
                    SELECT
                        id, first_name, last_name, email, phone, company, role, use_case, 'unknown', registered_at, email_confirmed
                    FROM registrations_old;

                    DROP TABLE registrations_old;

                    COMMIT;
                `);
            }
        } catch (migrationErr) {
            console.warn('SQLite registrations migration skipped:', migrationErr.message);
        }

        try { db.prepare('ALTER TABLE registrations ADD COLUMN source TEXT DEFAULT "unknown"').run(); } catch (e) {}
        try { db.prepare("UPDATE registrations SET source = 'unknown' WHERE source IS NULL OR source = ''").run(); } catch (e) {}
    } catch (e) {
        console.warn('SQLite unavailable:', e.message);
        db = null;
    }
} else if (IS_VERCEL) {
    console.log('No persistent DB configured on Vercel. Add POSTGRES_URL to enable storage.');
}

// --- Initialize Password Reset Table ---
if (db) {
    // This will be properly initialized when the module is loaded
    // passwordResetModule.initializePwdResetTable(db) is called during module initialization
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

// --- Initialize Password Reset Module ---
const passwordResetModule = require('../api/password-reset.js');
passwordResetModule.initializePasswordReset(db, HAS_POSTGRES, pgQuery, transporter, SMTP_FROM);

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
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
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
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
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
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
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
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
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
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
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

function normalizeRegistrationSource(source) {
    const value = String(source || '').trim().toLowerCase();
    if (!value) return 'unknown';

    const allowed = new Set([
        'landing_modal',
        'qstudio_landing',
        'public_registration_portal',
        'unknown'
    ]);

    return allowed.has(value) ? value : 'unknown';
}

function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function buildAdminOtpEmail(otpCode) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Admin Login OTP</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
</td></tr>
<tr><td style="background-color:#ffffff;padding:40px;">
<h2 style="margin:0 0 12px;font-size:24px;color:#0A0A0A;">Admin Login Verification</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">Use the one-time password below to complete your admin login:</p>
<div style="margin:0 0 20px;padding:14px 18px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:0.16em;color:#111827;text-align:center;">${otpCode}</div>
<p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">This code expires in 5 minutes. If you did not request this login, ignore this message.</p>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:18px 40px;border-radius:0 0 12px 12px;color:#9CA3AF;font-size:12px;">&copy; 2026 Qaulium AI</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function buildCareerStatusEmail(firstName, roleApplied, statusType) {
    const safeName = escapeHtml(firstName || 'Candidate');
    const safeRole = escapeHtml(roleApplied || 'Intern Role');

    if (statusType === 'accepted') {
        return {
            subject: `Application Update — ${safeRole} | Qaulium AI`,
            html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#0A0A0A;padding:24px 32px;"><img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="32"></td></tr><tr><td style="padding:32px;"><h2 style="margin:0 0 12px;color:#111;">Congratulations, ${safeName}.</h2><p style="margin:0 0 14px;color:#374151;line-height:1.7;">We are pleased to inform you that your application for the <strong>${safeRole}</strong> role has been accepted.</p><p style="margin:0;color:#374151;line-height:1.7;">Our team will share onboarding details and next steps shortly.</p></td></tr></table></td></tr></table></body></html>`
        };
    }

    return {
        subject: `Interview Schedule — ${safeRole} | Qaulium AI`,
        html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#0A0A0A;padding:24px 32px;"><img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="32"></td></tr><tr><td style="padding:32px;"><h2 style="margin:0 0 12px;color:#111;">Interview Invitation, ${safeName}.</h2><p style="margin:0 0 14px;color:#374151;line-height:1.7;">You have been shortlisted for the <strong>${safeRole}</strong> role.</p><p style="margin:0;color:#374151;line-height:1.7;">Our team will contact you shortly with interview timing and details.</p></td></tr></table></td></tr></table></body></html>`
    };
}

// --- API Routes ---

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, company, role, useCase, source } = req.body;
        const normalizedSource = normalizeRegistrationSource(source);
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!firstName || !firstName.trim() || !lastName || !lastName.trim() || !normalizedEmail) {
            return res.status(400).json({ success: false, message: 'First name, last name, and email are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        // Enforce unique registration email at API level.
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const existsResult = await pgQuery('SELECT 1 FROM registrations WHERE email = $1 LIMIT 1', [normalizedEmail]);
            if ((existsResult.rows || []).length) {
                return res.status(409).json({ success: false, message: 'This email is already registered.' });
            }
        } else if (db) {
            const exists = db.prepare('SELECT 1 FROM registrations WHERE email = ? LIMIT 1').get(normalizedEmail);
            if (exists) {
                return res.status(409).json({ success: false, message: 'This email is already registered.' });
            }
        }

        // Insert into database (Postgres on Vercel, SQLite locally)
        if (HAS_POSTGRES) {
            await pgQuery(
                `
                INSERT INTO registrations (first_name, last_name, email, phone, company, role, use_case, source)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `,
                [
                    firstName.trim(),
                    lastName.trim(),
                    normalizedEmail,
                    (phone || '').trim(),
                    (company || '').trim(),
                    (role || '').trim(),
                    (useCase || '').trim(),
                    normalizedSource
                ]
            );
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO registrations (first_name, last_name, email, phone, company, role, use_case, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                firstName.trim(),
                lastName.trim(),
                normalizedEmail,
                (phone || '').trim(),
                (company || '').trim(),
                (role || '').trim(),
                (useCase || '').trim(),
                normalizedSource
            );
        }

        // Send confirmation email immediately before returning success
        if (transporter) {
            const safeFirstName = escapeHtml(firstName.trim());
            try {
                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: normalizedEmail,
                    subject: 'Welcome to Qaulium AI — Registration Confirmed',
                    html: buildConfirmationEmail(safeFirstName)
                });
            } catch (emailErr) {
                console.error('Failed to send confirmation email:', emailErr.message);
                return res.status(502).json({
                    success: false,
                    message: 'Registration saved, but confirmation email could not be sent right now. Please try again.'
                });
            }
        }

        invalidateAdminDashboardCache();
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
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!name || !name.trim() || !normalizedEmail || !message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        // Enforce unique contact email at API level.
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const existsResult = await pgQuery('SELECT 1 FROM contact_messages WHERE email = $1 LIMIT 1', [normalizedEmail]);
            if ((existsResult.rows || []).length) {
                return res.status(409).json({ success: false, message: 'This email has already submitted a contact request.' });
            }
        } else if (db) {
            const exists = db.prepare('SELECT 1 FROM contact_messages WHERE email = ? LIMIT 1').get(normalizedEmail);
            if (exists) {
                return res.status(409).json({ success: false, message: 'This email has already submitted a contact request.' });
            }
        }

        // Save to database (Postgres on Vercel, SQLite locally)
        if (HAS_POSTGRES) {
            try {
                await pgQuery(
                    `
                    INSERT INTO contact_messages (name, email, company, message)
                    VALUES ($1, $2, $3, $4)
                    `,
                    [
                        name.trim(),
                        normalizedEmail,
                        (company || '').trim(),
                        message.trim()
                    ]
                );
            } catch (dbErr) {
                if (dbErr.code === '23505') {
                    return res.status(409).json({ success: false, message: 'This email is already registered. Please use a different email.' });
                }
                throw dbErr;
            }
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO contact_messages (name, email, company, message)
                VALUES (?, ?, ?, ?)
            `);
            try {
                stmt.run(name.trim(), normalizedEmail, (company || '').trim(), message.trim());
            } catch (dbErr) {
                if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ success: false, message: 'This email is already registered. Please use a different email.' });
                }
                throw dbErr;
            }
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
                        to: normalizedEmail,
                        subject: 'We received your message — Qaulium AI',
                        html: buildContactConfirmationEmail(safeName)
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

        invalidateAdminDashboardCache();
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

        if (!firstName || !firstName.trim() || !lastName || !lastName.trim() || !email || !email.trim() || !phone || !phone.trim() || !roleApplied || !roleApplied.trim() || !location || !location.trim() || !university || !university.trim() || !degree || !degree.trim() || !graduationYear || !availability || !availability.trim() || !resumeUrl || !resumeUrl.trim() || !coverLetter || !coverLetter.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide all required application details.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }

        const safeGraduationYear = parseInt(graduationYear, 10);
        if (Number.isNaN(safeGraduationYear) || safeGraduationYear < 2024 || safeGraduationYear > 2035) {
            return res.status(400).json({ success: false, message: 'Graduation year must be between 2024 and 2035.' });
        }

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            try {
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
            } catch (dbErr) {
                if (dbErr.code === '23505') {
                    return res.status(409).json({ success: false, message: 'This email is already registered. Please use a different email.' });
                }
                throw dbErr;
            }
        } else if (db) {
            const stmt = db.prepare(`
                INSERT INTO career_applications (
                    first_name, last_name, email, phone, role_applied, experience_years, location,
                    current_company, university, degree, graduation_year, availability,
                    linkedin_url, portfolio_url, resume_url, cover_letter
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            try {
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
            } catch (dbErr) {
                if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ success: false, message: 'This email is already registered. Please use a different email.' });
                }
                throw dbErr;
            }
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
                        html: buildCareerApplicationNotificationEmail(safeData)
                    }),
                    transporter.sendMail({
                        from: SMTP_FROM,
                        to: email.trim().toLowerCase(),
                        subject: `Application Received — ${safeData.roleApplied} | Qaulium AI`,
                        html: buildCareerApplicationConfirmationEmail(safeData.firstName, safeData.roleApplied)
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

        invalidateAdminDashboardCache();
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

async function fetchAdminFormsList() {
    if (HAS_POSTGRES) {
        await ensurePostgresSchema();
        const result = await pgQuery(`
            SELECT
                f.id,
                f.title,
                f.description,
                f.slug,
                f.is_active,
                f.created_at,
                f.updated_at,
                COALESCE(COUNT(fr.id), 0)::int AS response_count
            FROM forms f
            LEFT JOIN form_responses fr ON fr.form_id = f.id
            GROUP BY f.id
            ORDER BY f.created_at DESC
        `);
        return result.rows;
    }

    if (db) {
        return db.prepare(`
            SELECT
                f.id,
                f.title,
                f.description,
                f.slug,
                f.is_active,
                f.created_at,
                f.updated_at,
                COUNT(fr.id) AS response_count
            FROM forms f
            LEFT JOIN form_responses fr ON fr.form_id = f.id
            GROUP BY f.id
            ORDER BY f.created_at DESC
        `).all();
    }

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
app.post('/api/admin/login', async (req, res) => {
    const { email, password, requestId, otp } = req.body || {};

    if (ADMIN_DEV_AUTH_BYPASS) {
        if (!ADMIN_TOKEN_SECRET) {
            return res.status(500).json({ success: false, message: 'Admin auth is not configured.' });
        }
        const token = signAdminToken({
            email: ADMIN_LOGIN_EMAIL,
            role: ADMIN_LOGIN_ROLE,
            otpVerified: true,
            exp: Date.now() + (12 * 60 * 60 * 1000)
        });
        return res.json({
            success: true,
            token,
            admin: { email: ADMIN_LOGIN_EMAIL, role: ADMIN_LOGIN_ROLE },
            message: 'Dev auth bypass enabled.'
        });
    }

    if (!ADMIN_TOKEN_SECRET) {
        return res.status(503).json({ success: false, message: 'Admin auth is not configured.' });
    }

    if (!ADMIN_LOGIN_PASSWORD) {
        return res.status(503).json({ success: false, message: 'Admin login password not configured.' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();

    if (normalizedEmail !== ADMIN_LOGIN_EMAIL.toLowerCase() || (password || '') !== ADMIN_LOGIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Step 1: password accepted -> send OTP
    if (!requestId || !otp) {
        const generatedOtp = generateOtpCode();
        const loginRequestId = crypto.randomUUID();
        const otpHash = crypto.createHash('sha256').update(generatedOtp).digest('hex');

        pendingAdminOtps.set(loginRequestId, {
            email: normalizedEmail,
            otpHash: otpHash,
            expiresAt: Date.now() + ADMIN_OTP_TTL_MS,
            attempts: 0
        });

        if (ADMIN_DEV_OTP_BYPASS) {
            pendingAdminOtps.set(loginRequestId, {
                email: normalizedEmail,
                otpHash: crypto.createHash('sha256').update('000000').digest('hex'),
                expiresAt: Date.now() + ADMIN_OTP_TTL_MS,
                attempts: 0
            });
            return res.json({
                success: true,
                requiresOtp: true,
                requestId: loginRequestId,
                message: 'Dev OTP bypass enabled. Use OTP 000000.'
            });
        }

        if (!transporter) {
            pendingAdminOtps.delete(loginRequestId);
            return res.status(503).json({ success: false, message: 'Email service not configured for OTP.' });
        }

        try {
            await transporter.sendMail({
                from: SMTP_FROM,
                to: ADMIN_OTP_EMAIL,
                subject: 'Qaulium Admin Login OTP',
                html: buildAdminOtpEmail(generatedOtp),
                text: `Your Qaulium admin OTP is: ${generatedOtp}. It expires in 5 minutes.`
            });
        } catch (e) {
            pendingAdminOtps.delete(loginRequestId);
            console.error('Admin OTP email error:', e.message);
            return res.status(502).json({ success: false, message: 'Unable to send OTP email. Please try again.' });
        }

        return res.json({
            success: true,
            requiresOtp: true,
            requestId: loginRequestId,
            message: 'OTP sent to admin email.'
        });
    }

    // Step 2: verify OTP
    const otpRecord = pendingAdminOtps.get(String(requestId));
    if (!otpRecord || otpRecord.email !== normalizedEmail) {
        return res.status(401).json({ success: false, message: 'Invalid or expired OTP session.' });
    }

    if (Date.now() > otpRecord.expiresAt) {
        pendingAdminOtps.delete(String(requestId));
        return res.status(401).json({ success: false, message: 'OTP expired. Please login again.' });
    }

    otpRecord.attempts += 1;
    if (otpRecord.attempts > 5) {
        pendingAdminOtps.delete(String(requestId));
        return res.status(429).json({ success: false, message: 'Too many OTP attempts. Please login again.' });
    }

    const otpHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (otpHash !== otpRecord.otpHash) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    pendingAdminOtps.delete(String(requestId));

    const token = signAdminToken({
        email: ADMIN_LOGIN_EMAIL,
        role: ADMIN_LOGIN_ROLE,
        otpVerified: true,
        exp: Date.now() + (12 * 60 * 60 * 1000)
    });

    return res.json({ success: true, token, admin: { email: ADMIN_LOGIN_EMAIL, role: ADMIN_LOGIN_ROLE } });
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

function parseAdminId(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Invalid record id.' });
        return null;
    }
    return id;
}

function parseEnterpriseStateJson(value) {
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

async function fetchAdminEnterpriseData() {
    const defaults = {
        users: [],
        roles: [],
        apiKeys: [],
        security: {
            mfaRequired: true,
            ssoRequired: false,
            sessionLock: true,
            piiMasking: true,
            ipAllowlist: false,
            immutableAudit: true
        },
        billingPlans: [],
        auditLogs: [],
        analyticsHistory: [],
        departments: [],
        employees: [],
        projects: [],
        tasks: [],
        notifications: [],
        incidents: [],
        settings: { locale: 'en', country: 'all', realtimeEnabled: true }
    };

    if (HAS_POSTGRES) {
        await ensurePostgresSchema();
        const [departments, employees, projects, tasks, notifications, incidents, settingsRows, enterpriseStateRows] = await Promise.all([
            pgQuery('SELECT id, name, lead, parent, region, created_at FROM admin_departments ORDER BY created_at DESC'),
            pgQuery('SELECT id, name, email, department, manager, country, phone, role, created_at FROM admin_employees ORDER BY created_at DESC'),
            pgQuery('SELECT id, name, owner, status, deadline, progress, created_at, updated_at FROM admin_projects ORDER BY created_at DESC'),
            pgQuery('SELECT id, title, project, assignee, priority, status, due_date, created_at, updated_at FROM admin_tasks ORDER BY created_at DESC'),
            pgQuery('SELECT id, time, title, channel, status, audience, created_at FROM admin_notifications ORDER BY created_at DESC LIMIT 200'),
            pgQuery('SELECT id, time, summary, severity, status, created_at FROM admin_incidents ORDER BY created_at DESC LIMIT 200'),
            pgQuery('SELECT locale, country, realtime_enabled FROM admin_runtime_settings WHERE id = 1 LIMIT 1'),
            pgQuery('SELECT state_json FROM admin_enterprise_state WHERE id = 1 LIMIT 1')
        ]);

        const settings = settingsRows.rows[0] || {};
        const persistedState = parseEnterpriseStateJson((enterpriseStateRows.rows[0] || {}).state_json);
        return {
            users: Array.isArray(persistedState.users) ? persistedState.users : defaults.users,
            roles: Array.isArray(persistedState.roles) ? persistedState.roles : defaults.roles,
            apiKeys: Array.isArray(persistedState.apiKeys) ? persistedState.apiKeys : defaults.apiKeys,
            security: Object.assign({}, defaults.security, persistedState.security || {}),
            billingPlans: Array.isArray(persistedState.billingPlans) ? persistedState.billingPlans : defaults.billingPlans,
            auditLogs: Array.isArray(persistedState.auditLogs) ? persistedState.auditLogs.slice(0, 300) : defaults.auditLogs,
            analyticsHistory: Array.isArray(persistedState.analyticsHistory) ? persistedState.analyticsHistory.slice(-20) : defaults.analyticsHistory,
            departments: departments.rows || [],
            employees: employees.rows || [],
            projects: projects.rows || [],
            tasks: (tasks.rows || []).map(function (t) {
                return Object.assign({}, t, { dueDate: t.due_date || null });
            }),
            notifications: notifications.rows || [],
            incidents: incidents.rows || [],
            settings: {
                locale: settings.locale || 'en',
                country: settings.country || 'all',
                realtimeEnabled: settings.realtime_enabled !== 0
            }
        };
    }

    if (!db) return defaults;

    const settingsRow = db.prepare('SELECT locale, country, realtime_enabled FROM admin_runtime_settings WHERE id = 1 LIMIT 1').get() || {};
    const enterpriseStateRow = db.prepare('SELECT state_json FROM admin_enterprise_state WHERE id = 1 LIMIT 1').get() || {};
    const persistedState = parseEnterpriseStateJson(enterpriseStateRow.state_json);
    return {
        users: Array.isArray(persistedState.users) ? persistedState.users : defaults.users,
        roles: Array.isArray(persistedState.roles) ? persistedState.roles : defaults.roles,
        apiKeys: Array.isArray(persistedState.apiKeys) ? persistedState.apiKeys : defaults.apiKeys,
        security: Object.assign({}, defaults.security, persistedState.security || {}),
        billingPlans: Array.isArray(persistedState.billingPlans) ? persistedState.billingPlans : defaults.billingPlans,
        auditLogs: Array.isArray(persistedState.auditLogs) ? persistedState.auditLogs.slice(0, 300) : defaults.auditLogs,
        analyticsHistory: Array.isArray(persistedState.analyticsHistory) ? persistedState.analyticsHistory.slice(-20) : defaults.analyticsHistory,
        departments: db.prepare('SELECT id, name, lead, parent, region, created_at FROM admin_departments ORDER BY created_at DESC').all(),
        employees: db.prepare('SELECT id, name, email, department, manager, country, phone, role, created_at FROM admin_employees ORDER BY created_at DESC').all(),
        projects: db.prepare('SELECT id, name, owner, status, deadline, progress, created_at, updated_at FROM admin_projects ORDER BY created_at DESC').all(),
        tasks: db.prepare('SELECT id, title, project, assignee, priority, status, due_date, created_at, updated_at FROM admin_tasks ORDER BY created_at DESC').all().map(function (t) {
            return Object.assign({}, t, { dueDate: t.due_date || null });
        }),
        notifications: db.prepare('SELECT id, time, title, channel, status, audience, created_at FROM admin_notifications ORDER BY created_at DESC LIMIT 200').all(),
        incidents: db.prepare('SELECT id, time, summary, severity, status, created_at FROM admin_incidents ORDER BY created_at DESC LIMIT 200').all(),
        settings: {
            locale: settingsRow.locale || 'en',
            country: settingsRow.country || 'all',
            realtimeEnabled: Number(settingsRow.realtime_enabled || 1) === 1
        }
    };
}

function getLatestIsoTimestamp(values) {
    const timestamps = values
        .map(function (value) { return new Date(value || '').getTime(); })
        .filter(function (value) { return !Number.isNaN(value) && value > 0; });

    if (!timestamps.length) return '';
    return new Date(Math.max.apply(null, timestamps)).toISOString();
}

async function buildAdminDashboardPayload() {
    const [registrations, contacts, careers, forms, enterprise] = await Promise.all([
        fetchRegistrations(),
        fetchContacts(),
        fetchCareers(),
        fetchAdminFormsList(),
        fetchAdminEnterpriseData()
    ]);

    const totals = {
        registrations: registrations.length,
        contacts: contacts.length,
        careers: careers.length,
        forms: forms.length,
        allRequests: registrations.length + contacts.length + careers.length
    };

    const leadSourceMap = registrations.reduce(function (acc, row) {
        const key = String(row.source || 'unknown').trim() || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const notifications = Array.isArray(enterprise.notifications) ? enterprise.notifications : [];
    const incidents = Array.isArray(enterprise.incidents) ? enterprise.incidents : [];
    const tasks = Array.isArray(enterprise.tasks) ? enterprise.tasks : [];
    const monitoring = Object.assign({}, getRuntimeMonitoringSnapshot(), {
        queueDepth: notifications.filter(function (item) {
            return String(item.status || '').toLowerCase() === 'queued';
        }).length,
        openIncidents: incidents.filter(function (item) {
            return !['resolved', 'closed'].includes(String(item.status || '').toLowerCase());
        }).length
    });

    return {
        generatedAt: new Date().toISOString(),
        totals: totals,
        tables: {
            registrations: registrations,
            contacts: contacts,
            careers: careers
        },
        forms: forms,
        enterprise: enterprise,
        monitoring: monitoring,
        summary: {
            leadSources: Object.keys(leadSourceMap).map(function (key) {
                return { source: key, count: leadSourceMap[key] };
            }).sort(function (a, b) { return b.count - a.count; }),
            latestActivityAt: getLatestIsoTimestamp(
                registrations.map(function (item) { return item.registered_at; })
                    .concat(contacts.map(function (item) { return item.sent_at; }))
                    .concat(careers.map(function (item) { return item.applied_at; }))
                    .concat(forms.map(function (item) { return item.updated_at || item.created_at; }))
                    .concat(tasks.map(function (item) { return item.updated_at || item.created_at; }))
                    .concat(notifications.map(function (item) { return item.time || item.created_at; }))
                    .concat(incidents.map(function (item) { return item.time || item.created_at; }))
            ),
            activeEmployees: Array.isArray(enterprise.employees) ? enterprise.employees.length : 0,
            openTasks: tasks.filter(function (item) { return String(item.status || '').toLowerCase() !== 'done'; }).length,
            queuedNotifications: monitoring.queueDepth,
            openIncidents: monitoring.openIncidents,
            formsCount: forms.length
        }
    };
}

async function getAdminDashboardPayload(forceRefresh) {
    if (!forceRefresh && adminDashboardCache.payload && adminDashboardCache.expiresAt > Date.now()) {
        return adminDashboardCache.payload;
    }

    const payload = await buildAdminDashboardPayload();
    adminDashboardCache.payload = payload;
    adminDashboardCache.expiresAt = Date.now() + ADMIN_DASHBOARD_CACHE_TTL_MS;
    return payload;
}

app.get('/api/admin/enterprise/bootstrap', requireAdminAuth, requireAdminAnyPermission([
    'organization.manage',
    'projects.manage',
    'tasks.manage',
    'notifications.manage',
    'users.manage',
    'audit.view',
    'analytics.view'
]), async (req, res) => {
    try {
        const data = await fetchAdminEnterpriseData();
        return res.json({ success: true, data: data });
    } catch (err) {
        console.error('Admin enterprise bootstrap error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
    try {
        const forceRefresh = String((req.query || {}).refresh || '').toLowerCase() === 'true';
        const payload = await getAdminDashboardPayload(forceRefresh);
        return res.json({ success: true, data: payload });
    } catch (err) {
        console.error('Admin dashboard error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.put('/api/admin/enterprise/state', requireAdminAuth, requireAdminAnyPermission([
    'organization.manage',
    'projects.manage',
    'tasks.manage',
    'notifications.manage',
    'users.manage',
    'audit.view',
    'analytics.view'
]), async (req, res) => {
    try {
        const incoming = ((req.body || {}).state && typeof (req.body || {}).state === 'object') ? (req.body || {}).state : {};
        const payload = {
            users: Array.isArray(incoming.users) ? incoming.users : [],
            roles: Array.isArray(incoming.roles) ? incoming.roles : [],
            apiKeys: Array.isArray(incoming.apiKeys) ? incoming.apiKeys : [],
            security: (incoming.security && typeof incoming.security === 'object') ? incoming.security : {},
            billingPlans: Array.isArray(incoming.billingPlans) ? incoming.billingPlans : [],
            auditLogs: Array.isArray(incoming.auditLogs) ? incoming.auditLogs.slice(0, 300) : [],
            analyticsHistory: Array.isArray(incoming.analyticsHistory) ? incoming.analyticsHistory.slice(-20) : []
        };

        const stateJson = JSON.stringify(payload);

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery(
                'INSERT INTO admin_enterprise_state (id, state_json, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = NOW()',
                [stateJson]
            );
        } else if (db) {
            db.prepare("INSERT INTO admin_enterprise_state (id, state_json, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = datetime('now')").run(stateJson);
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('enterprise.state.updated', { updated: true });
        return res.json({ success: true });
    } catch (err) {
        console.error('Update enterprise state error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/org/departments', requireAdminAuth, requireAdminPermission('organization.manage'), async (req, res) => {
    try {
        const name = String((req.body || {}).name || '').trim();
        const lead = String((req.body || {}).lead || '').trim() || 'Unassigned';
        const parent = String((req.body || {}).parent || '-').trim() || '-';
        const region = String((req.body || {}).region || 'IN').trim() || 'IN';
        if (!name) return res.status(400).json({ success: false, message: 'Department name is required.' });

        let id = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('INSERT INTO admin_departments (name, lead, parent, region) VALUES ($1, $2, $3, $4) RETURNING id', [name, lead, parent, region]);
            id = result.rows[0] && result.rows[0].id;
        } else if (db) {
            const result = db.prepare('INSERT INTO admin_departments (name, lead, parent, region) VALUES (?, ?, ?, ?)').run(name, lead, parent, region);
            id = result.lastInsertRowid;
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('organization.department.created', { id: id, name: name });
        return res.json({ success: true, id: id });
    } catch (err) {
        console.error('Create department error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.delete('/api/admin/org/departments/:id', requireAdminAuth, requireAdminPermission('organization.manage'), async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        let deleted = false;

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM admin_departments WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM admin_departments WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }

        if (!deleted) return res.status(404).json({ success: false, message: 'Department not found.' });
        invalidateAdminDashboardCache();
        broadcastAdminEvent('organization.department.deleted', { id: id });
        return res.json({ success: true });
    } catch (err) {
        console.error('Delete department error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/projects', requireAdminAuth, requireAdminPermission('projects.manage'), async (req, res) => {
    try {
        const name = String((req.body || {}).name || '').trim();
        const owner = String((req.body || {}).owner || 'Platform Owner').trim();
        const status = String((req.body || {}).status || 'On Track').trim();
        const progress = parseInt((req.body || {}).progress || 0, 10) || 0;
        const deadline = (req.body || {}).deadline ? new Date((req.body || {}).deadline).toISOString() : null;
        if (!name) return res.status(400).json({ success: false, message: 'Project name is required.' });

        let id = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('INSERT INTO admin_projects (name, owner, status, deadline, progress) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name, owner, status, deadline, progress]);
            id = result.rows[0] && result.rows[0].id;
        } else if (db) {
            const result = db.prepare('INSERT INTO admin_projects (name, owner, status, deadline, progress) VALUES (?, ?, ?, ?, ?)').run(name, owner, status, deadline || '', progress);
            id = result.lastInsertRowid;
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('project.created', { id: id, name: name });
        return res.json({ success: true, id: id });
    } catch (err) {
        console.error('Create project error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/tasks', requireAdminAuth, requireAdminPermission('tasks.manage'), async (req, res) => {
    try {
        const title = String((req.body || {}).title || '').trim();
        const project = String((req.body || {}).project || 'General').trim();
        const assignee = String((req.body || {}).assignee || 'Unassigned').trim();
        const priority = String((req.body || {}).priority || 'Medium').trim();
        const status = String((req.body || {}).status || 'todo').trim();
        const dueDate = (req.body || {}).dueDate ? new Date((req.body || {}).dueDate).toISOString() : null;
        if (!title) return res.status(400).json({ success: false, message: 'Task title is required.' });

        let id = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('INSERT INTO admin_tasks (title, project, assignee, priority, status, due_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [title, project, assignee, priority, status, dueDate]);
            id = result.rows[0] && result.rows[0].id;
        } else if (db) {
            const result = db.prepare('INSERT INTO admin_tasks (title, project, assignee, priority, status, due_date) VALUES (?, ?, ?, ?, ?, ?)').run(title, project, assignee, priority, status, dueDate || '');
            id = result.lastInsertRowid;
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('task.created', { id: id, title: title, project: project });
        return res.json({ success: true, id: id });
    } catch (err) {
        console.error('Create task error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/tasks/:id/advance', requireAdminAuth, requireAdminPermission('tasks.manage'), async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        const flow = ['todo', 'in_progress', 'review', 'done'];
        let current = '';

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const found = await pgQuery('SELECT id, status FROM admin_tasks WHERE id = $1 LIMIT 1', [id]);
            if (!found.rows.length) return res.status(404).json({ success: false, message: 'Task not found.' });
            current = String(found.rows[0].status || 'todo');
            const next = flow[Math.min(Math.max(flow.indexOf(current), 0) + 1, flow.length - 1)];
            await pgQuery('UPDATE admin_tasks SET status = $1, updated_at = NOW() WHERE id = $2', [next, id]);
            invalidateAdminDashboardCache();
            broadcastAdminEvent('task.status.changed', { id: id, from: current, to: next });
            return res.json({ success: true, status: next });
        }

        if (!db) return res.status(500).json({ success: false, message: 'No database configured.' });
        const task = db.prepare('SELECT id, status FROM admin_tasks WHERE id = ? LIMIT 1').get(id);
        if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
        current = String(task.status || 'todo');
        const next = flow[Math.min(Math.max(flow.indexOf(current), 0) + 1, flow.length - 1)];
        db.prepare("UPDATE admin_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, id);
        invalidateAdminDashboardCache();
        broadcastAdminEvent('task.status.changed', { id: id, from: current, to: next });
        return res.json({ success: true, status: next });
    } catch (err) {
        console.error('Advance task error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/notifications', requireAdminAuth, requireAdminPermission('notifications.manage'), async (req, res) => {
    try {
        const title = String((req.body || {}).title || '').trim();
        const channel = String((req.body || {}).channel || 'email').trim();
        const status = String((req.body || {}).status || 'queued').trim();
        const audience = String((req.body || {}).audience || 'all').trim();
        if (!title) return res.status(400).json({ success: false, message: 'Notification title is required.' });

        let id = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('INSERT INTO admin_notifications (title, channel, status, audience) VALUES ($1, $2, $3, $4) RETURNING id', [title, channel, status, audience]);
            id = result.rows[0] && result.rows[0].id;
        } else if (db) {
            const result = db.prepare('INSERT INTO admin_notifications (title, channel, status, audience) VALUES (?, ?, ?, ?)').run(title, channel, status, audience);
            id = result.lastInsertRowid;
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('notification.created', { id: id, title: title, channel: channel });
        return res.json({ success: true, id: id });
    } catch (err) {
        console.error('Create notification error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.delete('/api/admin/notifications/:id', requireAdminAuth, requireAdminPermission('notifications.manage'), async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        let deleted = false;

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM admin_notifications WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM admin_notifications WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }

        if (!deleted) return res.status(404).json({ success: false, message: 'Notification not found.' });
        invalidateAdminDashboardCache();
        broadcastAdminEvent('notification.deleted', { id: id });
        return res.json({ success: true });
    } catch (err) {
        console.error('Delete notification error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/meeting-links', requireAdminAuth, requireAdminPermission('notifications.manage'), async (req, res) => {
    try {
        const title = String((req.body || {}).title || 'Team Sync').trim();
        const audience = String((req.body || {}).audience || 'all').trim();
        const meetingTime = (req.body || {}).meetingTime ? new Date((req.body || {}).meetingTime).toISOString() : new Date(Date.now() + 3600 * 1000).toISOString();
        const meetingId = Math.random().toString(36).slice(2, 9);
        const link = 'https://meet.qauliumai.in/' + meetingId;

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery('INSERT INTO admin_notifications (time, title, channel, status, audience) VALUES ($1, $2, $3, $4, $5)', [new Date().toISOString(), title, 'meeting', 'scheduled', audience]);
        } else if (db) {
            db.prepare('INSERT INTO admin_notifications (time, title, channel, status, audience) VALUES (?, ?, ?, ?, ?)').run(new Date().toISOString(), title, 'meeting', 'scheduled', audience);
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('meeting.link.generated', { title: title, audience: audience, link: link });
        return res.json({ success: true, link: link, meetingTime: meetingTime });
    } catch (err) {
        console.error('Generate meeting link error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.patch('/api/admin/settings', requireAdminAuth, requireAdminPermission('settings.manage'), async (req, res) => {
    try {
        const locale = (req.body || {}).locale;
        const country = (req.body || {}).country;
        const realtimeEnabled = (req.body || {}).realtimeEnabled;

        const nextLocale = String(locale || 'en').trim() || 'en';
        const nextCountry = String(country || 'all').trim() || 'all';
        const nextRealtime = realtimeEnabled === false ? 0 : 1;

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery(
                'UPDATE admin_runtime_settings SET locale = $1, country = $2, realtime_enabled = $3, updated_at = NOW() WHERE id = 1',
                [nextLocale, nextCountry, nextRealtime]
            );
        } else if (db) {
            db.prepare("UPDATE admin_runtime_settings SET locale = ?, country = ?, realtime_enabled = ?, updated_at = datetime('now') WHERE id = 1").run(nextLocale, nextCountry, nextRealtime);
        }

        invalidateAdminDashboardCache();
        broadcastAdminEvent('settings.updated', { locale: nextLocale, country: nextCountry, realtimeEnabled: nextRealtime === 1 });
        return res.json({ success: true });
    } catch (err) {
        console.error('Update admin settings error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.put('/api/admin/registrations/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        const payload = req.body || {};
        const firstName = String(payload.first_name || '').trim();
        const lastName = String(payload.last_name || '').trim();
        const email = String(payload.email || '').trim().toLowerCase();
        const phone = String(payload.phone || '').trim();
        const company = String(payload.company || '').trim();
        const role = String(payload.role || '').trim();
        const useCase = String(payload.use_case || '').trim();

        if (!firstName || !lastName || !email) {
            return res.status(400).json({ success: false, message: 'first_name, last_name and email are required.' });
        }

        let updated = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery(
                `UPDATE registrations
                 SET first_name = $1, last_name = $2, email = $3, phone = $4, company = $5, role = $6, use_case = $7
                 WHERE id = $8`,
                [firstName, lastName, email, phone, company, role, useCase, id]
            );
            updated = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare(
                `UPDATE registrations
                 SET first_name = ?, last_name = ?, email = ?, phone = ?, company = ?, role = ?, use_case = ?
                 WHERE id = ?`
            ).run(firstName, lastName, email, phone, company, role, useCase, id);
            updated = (result.changes || 0) > 0;
        }

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Registration not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Registration updated.' });
    } catch (err) {
        console.error('Admin registrations update error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.delete('/api/admin/registrations/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        let deleted = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM registrations WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Registration not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Registration deleted.' });
    } catch (err) {
        console.error('Admin registrations delete error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.put('/api/admin/contacts/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        const payload = req.body || {};
        const name = String(payload.name || '').trim();
        const email = String(payload.email || '').trim().toLowerCase();
        const company = String(payload.company || '').trim();
        const message = String(payload.message || '').trim();

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'name, email and message are required.' });
        }

        let updated = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery(
                `UPDATE contact_messages
                 SET name = $1, email = $2, company = $3, message = $4
                 WHERE id = $5`,
                [name, email, company, message, id]
            );
            updated = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare(
                `UPDATE contact_messages
                 SET name = ?, email = ?, company = ?, message = ?
                 WHERE id = ?`
            ).run(name, email, company, message, id);
            updated = (result.changes || 0) > 0;
        }

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Contact message not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Contact message updated.' });
    } catch (err) {
        console.error('Admin contacts update error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.delete('/api/admin/contacts/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        let deleted = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM contact_messages WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Contact message not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Contact message deleted.' });
    } catch (err) {
        console.error('Admin contacts delete error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.put('/api/admin/careers/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        const payload = req.body || {};
        const firstName = String(payload.first_name || '').trim();
        const lastName = String(payload.last_name || '').trim();
        const email = String(payload.email || '').trim().toLowerCase();
        const phone = String(payload.phone || '').trim();
        const roleApplied = String(payload.role_applied || '').trim();
        const location = String(payload.location || '').trim();
        const university = String(payload.university || '').trim();
        const degree = String(payload.degree || '').trim();
        const graduationYear = parseInt(payload.graduation_year || 0, 10) || 0;
        const availability = String(payload.availability || '').trim();
        const linkedinUrl = String(payload.linkedin_url || '').trim();
        const portfolioUrl = String(payload.portfolio_url || '').trim();
        const resumeUrl = String(payload.resume_url || '').trim();
        const coverLetter = String(payload.cover_letter || '').trim();
        const currentCompany = String(payload.current_company || '').trim();
        const experienceYears = parseInt(payload.experience_years || 0, 10) || 0;

        if (!firstName || !lastName || !email || !roleApplied) {
            return res.status(400).json({ success: false, message: 'first_name, last_name, email and role_applied are required.' });
        }

        let updated = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery(
                `UPDATE career_applications
                 SET first_name = $1, last_name = $2, email = $3, phone = $4, role_applied = $5,
                     location = $6, university = $7, degree = $8, graduation_year = $9, availability = $10,
                     linkedin_url = $11, portfolio_url = $12, resume_url = $13, cover_letter = $14,
                     current_company = $15, experience_years = $16
                 WHERE id = $17`,
                [
                    firstName, lastName, email, phone, roleApplied,
                    location, university, degree, graduationYear, availability,
                    linkedinUrl, portfolioUrl, resumeUrl, coverLetter,
                    currentCompany, experienceYears, id
                ]
            );
            updated = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare(
                `UPDATE career_applications
                 SET first_name = ?, last_name = ?, email = ?, phone = ?, role_applied = ?,
                     location = ?, university = ?, degree = ?, graduation_year = ?, availability = ?,
                     linkedin_url = ?, portfolio_url = ?, resume_url = ?, cover_letter = ?,
                     current_company = ?, experience_years = ?
                 WHERE id = ?`
            ).run(
                firstName, lastName, email, phone, roleApplied,
                location, university, degree, graduationYear, availability,
                linkedinUrl, portfolioUrl, resumeUrl, coverLetter,
                currentCompany, experienceYears, id
            );
            updated = (result.changes || 0) > 0;
        }

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Career application not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Career application updated.' });
    } catch (err) {
        console.error('Admin careers update error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.delete('/api/admin/careers/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        let deleted = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM career_applications WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM career_applications WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Career application not found.' });
        }
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Career application deleted.' });
    } catch (err) {
        console.error('Admin careers delete error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/api/admin/careers/:id/action', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        const action = String((req.body || {}).action || '').trim().toLowerCase();
        if (!['interview', 'accepted'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action.' });
        }

        let row = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM career_applications WHERE id = $1 LIMIT 1', [id]);
            row = result.rows[0] || null;
        } else if (db) {
            row = db.prepare('SELECT * FROM career_applications WHERE id = ? LIMIT 1').get(id) || null;
        }

        if (!row) {
            return res.status(404).json({ success: false, message: 'Career application not found.' });
        }

        if (!transporter) {
            return res.status(500).json({ success: false, message: 'Email service not configured.' });
        }

        const template = buildCareerStatusEmail(row.first_name, row.role_applied, action);
        await transporter.sendMail({
            from: SMTP_FROM,
            to: String(row.email || '').trim().toLowerCase(),
            subject: template.subject,
            html: template.html
        });

        invalidateAdminDashboardCache();
        return res.json({ success: true, message: `${action} email sent.` });
    } catch (err) {
        console.error('Admin career action error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// =============  FORMS  ================

function generateSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) + '-' + Date.now().toString(36);
}

// --- Admin: Create Form ---
app.post('/api/admin/forms', requireAdminAuth, async (req, res) => {
    try {
        const { title, description, sections } = req.body || {};
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Form title is required.' });
        }
        const slug = generateSlug(title.trim());
        const schemaJson = JSON.stringify(Array.isArray(sections) ? sections : []);

        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery(
                `INSERT INTO forms (title, description, slug, schema_json) VALUES ($1, $2, $3, $4) RETURNING id`,
                [title.trim(), (description || '').trim(), slug, schemaJson]
            );
            invalidateAdminDashboardCache();
            return res.json({ success: true, form: { id: result.rows[0].id, slug } });
        } else if (db) {
            const result = db.prepare(
                `INSERT INTO forms (title, description, slug, schema_json) VALUES (?, ?, ?, ?)`
            ).run(title.trim(), (description || '').trim(), slug, schemaJson);
            invalidateAdminDashboardCache();
            return res.json({ success: true, form: { id: result.lastInsertRowid, slug } });
        }
        return res.status(500).json({ success: false, message: 'No database configured.' });
    } catch (err) {
        console.error('Create form error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: List Forms ---
app.get('/api/admin/forms', requireAdminAuth, async (req, res) => {
    try {
        const rows = await fetchAdminFormsList();
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('List forms error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Get Single Form ---
app.get('/api/admin/forms/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        let row = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM forms WHERE id = $1', [id]);
            row = result.rows[0] || null;
        } else if (db) {
            row = db.prepare('SELECT * FROM forms WHERE id = ?').get(id) || null;
        }
        if (!row) return res.status(404).json({ success: false, message: 'Form not found.' });
        row.sections = JSON.parse(row.schema_json || '[]');
        return res.json({ success: true, form: row });
    } catch (err) {
        console.error('Get form error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Update Form ---
app.put('/api/admin/forms/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        const { title, description, sections, is_active } = req.body || {};
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Form title is required.' });
        }
        const schemaJson = JSON.stringify(Array.isArray(sections) ? sections : []);
        const active = is_active === undefined ? 1 : (is_active ? 1 : 0);

        let updated = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery(
                `UPDATE forms SET title = $1, description = $2, schema_json = $3, is_active = $4, updated_at = NOW() WHERE id = $5`,
                [title.trim(), (description || '').trim(), schemaJson, active, id]
            );
            updated = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare(
                `UPDATE forms SET title = ?, description = ?, schema_json = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
            ).run(title.trim(), (description || '').trim(), schemaJson, active, id);
            updated = (result.changes || 0) > 0;
        }
        if (!updated) return res.status(404).json({ success: false, message: 'Form not found.' });
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Form updated.' });
    } catch (err) {
        console.error('Update form error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Delete Form ---
app.delete('/api/admin/forms/:id', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        let deleted = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            await pgQuery('DELETE FROM form_responses WHERE form_id = $1', [id]);
            const result = await pgQuery('DELETE FROM forms WHERE id = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            db.prepare('DELETE FROM form_responses WHERE form_id = ?').run(id);
            const result = db.prepare('DELETE FROM forms WHERE id = ?').run(id);
            deleted = (result.changes || 0) > 0;
        }
        if (!deleted) return res.status(404).json({ success: false, message: 'Form not found.' });
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Form deleted.' });
    } catch (err) {
        console.error('Delete form error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Get Form Responses ---
app.get('/api/admin/forms/:id/responses', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;
        let rows = [];
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT * FROM form_responses WHERE form_id = $1 ORDER BY submitted_at DESC', [id]);
            rows = result.rows;
        } else if (db) {
            rows = db.prepare('SELECT * FROM form_responses WHERE form_id = ? ORDER BY submitted_at DESC').all(id);
        }
        rows.forEach(r => { r.data = JSON.parse(r.response_json || '{}'); });
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Get form responses error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Export Form Responses as CSV ---
app.get('/api/admin/forms/:id/responses/export', requireAdminAuth, async (req, res) => {
    try {
        const id = parseAdminId(req, res);
        if (!id) return;

        // get form schema for column headers
        let form = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const fr = await pgQuery('SELECT * FROM forms WHERE id = $1', [id]);
            form = fr.rows[0] || null;
        } else if (db) {
            form = db.prepare('SELECT * FROM forms WHERE id = ?').get(id) || null;
        }
        if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

        const sections = JSON.parse(form.schema_json || '[]');
        const fieldsList = [];
        let fieldCounter = 0;
        for (const s of sections) {
            for (const f of (s.fields || [])) {
                fieldCounter++;
                var lbl = (f.label && f.label.trim() && !/^f_[a-z0-9]+$/i.test(f.label.trim())) ? f.label.trim() : ('Question ' + fieldCounter);
                fieldsList.push({ id: f.id, label: lbl });
            }
        }

        let rows = [];
        if (HAS_POSTGRES) {
            const rr = await pgQuery('SELECT * FROM form_responses WHERE form_id = $1 ORDER BY submitted_at ASC', [id]);
            rows = rr.rows;
        } else if (db) {
            rows = db.prepare('SELECT * FROM form_responses WHERE form_id = ? ORDER BY submitted_at ASC').all(id);
        }

        // build CSV
        const csvEscape = (v) => {
            const s = String(v == null ? '' : v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        const headers = ['#', 'Submitted At', 'Email', ...fieldsList.map(f => f.label)];
        const csvLines = [headers.map(csvEscape).join(',')];
        rows.forEach((r, i) => {
            const data = JSON.parse(r.response_json || '{}');
            const line = [
                i + 1,
                r.submitted_at || '',
                r.respondent_email || '',
                ...fieldsList.map(f => {
                    const v = data[f.id];
                    return Array.isArray(v) ? v.join('; ') : (v || '');
                })
            ];
            csvLines.push(line.map(csvEscape).join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.csv"`);
        return res.send(csvContent);
    } catch (err) {
        console.error('Export form responses error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Admin: Delete single response ---
app.delete('/api/admin/forms/:id/responses/:rid', requireAdminAuth, async (req, res) => {
    try {
        const formId = parseAdminId(req, res);
        if (!formId) return;
        const rid = parseInt(req.params.rid, 10);
        if (!Number.isInteger(rid) || rid <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid response id.' });
        }
        let deleted = false;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('DELETE FROM form_responses WHERE id = $1 AND form_id = $2', [rid, formId]);
            deleted = (result.rowCount || 0) > 0;
        } else if (db) {
            const result = db.prepare('DELETE FROM form_responses WHERE id = ? AND form_id = ?').run(rid, formId);
            deleted = (result.changes || 0) > 0;
        }
        if (!deleted) return res.status(404).json({ success: false, message: 'Response not found.' });
        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Response deleted.' });
    } catch (err) {
        console.error('Delete form response error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Public: Get form by slug (no auth) ---
app.get('/api/forms/:slug', async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        if (!slug) return res.status(400).json({ success: false, message: 'Slug is required.' });

        let row = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT id, title, description, slug, schema_json, is_active FROM forms WHERE slug = $1', [slug]);
            row = result.rows[0] || null;
        } else if (db) {
            row = db.prepare('SELECT id, title, description, slug, schema_json, is_active FROM forms WHERE slug = ?').get(slug) || null;
        }
        if (!row) return res.status(404).json({ success: false, message: 'Form not found.' });
        if (!row.is_active) return res.status(403).json({ success: false, message: 'This form is no longer accepting responses.' });
        row.sections = JSON.parse(row.schema_json || '[]');
        delete row.schema_json;
        return res.json({ success: true, form: row });
    } catch (err) {
        console.error('Public form fetch error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Public: Submit form response (no auth) ---
app.post('/api/forms/:slug/submit', async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        if (!slug) return res.status(400).json({ success: false, message: 'Slug is required.' });

        let form = null;
        if (HAS_POSTGRES) {
            await ensurePostgresSchema();
            const result = await pgQuery('SELECT id, schema_json, is_active FROM forms WHERE slug = $1', [slug]);
            form = result.rows[0] || null;
        } else if (db) {
            form = db.prepare('SELECT id, schema_json, is_active FROM forms WHERE slug = ?').get(slug) || null;
        }
        if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });
        if (!form.is_active) return res.status(403).json({ success: false, message: 'This form is no longer accepting responses.' });

        const sections = JSON.parse(form.schema_json || '[]');
        const { responses, email } = req.body || {};
        const data = responses || {};

        // validate required fields
        for (const section of sections) {
            for (const field of (section.fields || [])) {
                if (field.required) {
                    const val = data[field.id];
                    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
                        return res.status(400).json({ success: false, message: `"${field.label}" is required.` });
                    }
                }
            }
        }

        const responseJson = JSON.stringify(data);
        const respondentEmail = String(email || '').trim().toLowerCase();
        const usageEventId = buildUsageEventId('form_submit');

        const formCreditCost = estimateCreditCost({
            units: 1,
            baseCredits: 0.03,
            unitRate: 0.01,
            regionMultiplier: 1,
            priorityMultiplier: 1,
            planDiscount: 1
        });

        try {
            await applyDirectCreditCharge({
                organizationId: DEFAULT_ORG_ID,
                amount: formCreditCost.estimatedCredits,
                reasonCode: 'form_submission',
                sourceService: 'forms_api',
                resourceType: 'forms.submit',
                usageEventId: usageEventId,
                idempotencyKey: usageEventId,
                metadata: { slug: slug }
            });
        } catch (creditErr) {
            return res.status(402).json({ success: false, message: creditErr.message || 'Insufficient credits to submit this form.' });
        }

        if (HAS_POSTGRES) {
            await pgQuery(
                `INSERT INTO form_responses (form_id, response_json, respondent_email) VALUES ($1, $2, $3)`,
                [form.id, responseJson, respondentEmail]
            );
        } else if (db) {
            db.prepare(
                `INSERT INTO form_responses (form_id, response_json, respondent_email) VALUES (?, ?, ?)`
            ).run(form.id, responseJson, respondentEmail);
        }

        await recordUsageLog({
            usageEventId: usageEventId,
            organizationId: DEFAULT_ORG_ID,
            service: 'forms',
            operation: 'submit',
            resourceType: 'forms.submit',
            unitType: 'request',
            quantity: 1,
            unitPrice: formCreditCost.breakdown.unitRate,
            multiplier: 1,
            estimatedCredits: formCreditCost.estimatedCredits,
            actualCredits: formCreditCost.estimatedCredits,
            status: 'completed',
            metadata: { slug: slug, formId: form.id }
        });

        invalidateAdminDashboardCache();
        return res.json({ success: true, message: 'Response submitted successfully.' });
    } catch (err) {
        console.error('Form submit error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// --- Serve public form page ---
app.get('/forms/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'forms.html'));
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

        const htmlBody = String(body || '').replace(/cid:qualium-logo/g, 'https://qauliumai.in/logo-white.png');

        const usageEventId = buildUsageEventId('bulk_email');
        const emailCreditCost = estimateCreditCost({
            units: recipients.length,
            baseCredits: 0.2,
            unitRate: 0.02,
            regionMultiplier: 1,
            priorityMultiplier: 1,
            planDiscount: 1
        });

        await applyDirectCreditCharge({
            organizationId: DEFAULT_ORG_ID,
            amount: emailCreditCost.estimatedCredits,
            reasonCode: 'bulk_email_send',
            sourceService: 'admin_email',
            resourceType: 'notifications.bulk_email',
            usageEventId: usageEventId,
            idempotencyKey: usageEventId,
            metadata: { audience: audience || 'all', recipients: recipients.length }
        });

        const chunks = chunkArray(recipients, 50);
        for (const chunk of chunks) {
            await transporter.sendMail({
                from: SMTP_FROM,
                to: process.env.CONTACT_EMAIL || 'admin@qauliumai.in',
                bcc: chunk,
                subject: String(subject).trim(),
                html: htmlBody
            });
        }

        await recordUsageLog({
            usageEventId: usageEventId,
            organizationId: DEFAULT_ORG_ID,
            service: 'notifications',
            operation: 'bulk_email',
            resourceType: 'notifications.bulk_email',
            unitType: 'recipient',
            quantity: recipients.length,
            unitPrice: emailCreditCost.breakdown.unitRate,
            multiplier: 1,
            estimatedCredits: emailCreditCost.estimatedCredits,
            actualCredits: emailCreditCost.estimatedCredits,
            status: 'completed',
            metadata: { audience: audience || 'all' }
        });

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

// POST /api/careers — Admin endpoint to view all career applications
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

// --- Employee Portal API Routes ---
app.post('/api/send-otp', require('../api/send-otp.js'));
app.post('/api/verify-otp', require('../api/verify-otp.js'));
app.post('/api/setup-totp', require('../api/setup-totp.js'));
app.post('/api/verify-totp', require('../api/verify-totp.js'));
app.post('/api/invite', require('../api/invite.js'));

// --- Password Reset Routes ---
app.post('/api/password-reset/request', passwordResetModule.handlePasswordResetRequest);
app.post('/api/password-reset/verify-token', passwordResetModule.handleVerifyToken);
app.post('/api/password-reset/reset', passwordResetModule.handlePasswordReset);
app.get('/password-reset', (req, res) => {
    res.sendFile(path.join(__dirname, 'password-reset.html'));
});

// --- Start Server (skip on Vercel) ---
if (!process.env.VERCEL) {
    const httpServer = http.createServer(app);
    attachAdminWebSocketServer(httpServer);

    httpServer.listen(PORT, () => {
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
        console.log(`    *    /api/admin/forms/*  → Admin forms CRUD`);
        console.log(`    GET  /api/forms/:slug    → Public form data`);
        console.log(`    POST /api/forms/:slug/submit → Public form submit`);
        console.log(`    GET  /forms/:slug        → Public form page`);
        console.log(`    POST /api/admin/email/send → Admin bulk email`);
        console.log(`    GET  /api/admin/enterprise/bootstrap → Enterprise payload`);
        console.log(`    POST /api/send-otp      → Employee Portal OTP send`);
        console.log(`    POST /api/verify-otp    → Employee Portal OTP verify`);
        console.log(`    WS   /ws/admin           → Admin realtime events\n`);
    });
}

module.exports = app;
