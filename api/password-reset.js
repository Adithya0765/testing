/* ============================================
   Password Reset (Change Password) Functionality
   ============================================ */

const crypto = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);

// Module-level variables that will be set by server.js
let db = null;
let HAS_POSTGRES = false;
let pgQuery = null;
let transporter = null;
let SMTP_FROM = null;
let ensureSchema = null;

// Function to initialize the password reset module with server dependencies
function initializePasswordReset(serverDb, serverHasPostgres, serverPgQuery, serverTransporter, serverSmtpFrom, serverEnsureSchema) {
    db = serverDb;
    HAS_POSTGRES = serverHasPostgres;
    pgQuery = serverPgQuery;
    transporter = serverTransporter;
    SMTP_FROM = serverSmtpFrom;
    ensureSchema = typeof serverEnsureSchema === 'function' ? serverEnsureSchema : null;
}

// Database table for password reset tokens
const initializePwdResetTable = (serverDb) => {
    if (!serverDb) return;
    try {
        serverDb.exec(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
        `);
    } catch (e) {
        console.warn('Password reset table initialization skipped:', e.message);
    }
};

// Initialize on startup
if (typeof db !== 'undefined' && db) {
    initializePwdResetTable(db);
}

/* ============================================
   PASSWORD RESET EMAIL TEMPLATE
   ============================================ */

function buildPasswordResetEmail(firstName, resetLink) {
    const safeName = escapeHtml(firstName || 'User');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Password Reset</title>
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
Password Reset
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">
Reset Your Password
</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">
Hello ${safeName}, we received a request to reset your password.
</p>

<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
Click the button below to reset your password. This link will expire in 1 hour.
</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
<tr>
<td align="center">
<a href="${resetLink}" style="display:inline-block;padding:12px 32px;background-color:#2563EB;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
Reset Password
</a>
</td>
</tr>
</table>

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#6B7280;line-height:1.7;">
Or copy and paste this link in your browser:
</p>

<p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:12px;color:#374151;word-break:break-all;background-color:#F3F4F6;padding:12px 16px;border-radius:6px;line-height:1.6;">
${resetLink}
</p>

<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 20px;">

<p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6B7280;line-height:1.6;">
<strong>Security Note:</strong> If you did not request this password reset, please ignore this email. Your password will not change unless you click the link above.
</p>

<p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6B7280;line-height:1.6;">
If you have any issues with the reset link, please contact our support team at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;">admin@qauliumai.in</a>.
</p>

</td>
</tr>

<!-- Footer -->
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

// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Helper function to generate secure token
function generatePasswordResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function ensurePostgresReady() {
    if (HAS_POSTGRES && ensureSchema) {
        await ensureSchema();
    }
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(String(password), salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

// Helper to get expiry time (1 hour from now)
function getPasswordResetExpiry() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/* ============================================

/* ============================================
   ============================================ */

// POST /api/password-reset/request
// Request password reset email
const handlePasswordResetRequest = async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required.'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address.'
            });
        }

        // Generate reset token
        const token = generatePasswordResetToken();
        const expiresAt = getPasswordResetExpiry();

        // Save token to database
        if (HAS_POSTGRES) {
            await ensurePostgresReady();
            // Delete any existing tokens for this email
            await pgQuery('DELETE FROM password_reset_tokens WHERE email = $1', [normalizedEmail]);
            // Insert new token
            await pgQuery(
                `INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
                [normalizedEmail, token, expiresAt]
            );
        } else if (db) {
            // Delete existing tokens
            db.prepare('DELETE FROM password_reset_tokens WHERE email = ?').run(normalizedEmail);
            // Insert new token
            db.prepare(`
                INSERT INTO password_reset_tokens (email, token, expires_at)
                VALUES (?, ?, ?)
            `).run(normalizedEmail, token, expiresAt);
        } else {
            return res.status(503).json({
                success: false,
                message: 'Database not available. Please try again later.'
            });
        }

        // Build password reset link
        const baseUrl = process.env.PASSWORD_RESET_BASE_URL || 'https://workspace.qauliumai.in';
        const resetLink = `${baseUrl}/password-reset?token=${token}`;

        // Get user's first name from database if available, otherwise use email
        let firstName = 'User';
        try {
            if (HAS_POSTGRES) {
                const result = await pgQuery(
                    `SELECT first_name FROM users WHERE email = $1 LIMIT 1`,
                    [normalizedEmail]
                );
                if ((result.rows || []).length > 0) {
                    firstName = result.rows[0].first_name || 'User';
                }
            } else if (db) {
                const result = db.prepare(
                    `SELECT first_name FROM users WHERE email = ? LIMIT 1`
                ).get(normalizedEmail);
                if (result) {
                    firstName = result.first_name || 'User';
                }
            }
        } catch (nameErr) {
            console.warn('Could not fetch user first name:', nameErr.message);
        }

        // Send password reset email
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: normalizedEmail,
                    subject: 'Reset Your Qaulium AI Password',
                    html: buildPasswordResetEmail(firstName, resetLink)
                });

                return res.json({
                    success: true,
                    message: `Password reset email sent to ${normalizedEmail}. Please check your email for further instructions.`
                });
            } catch (emailErr) {
                console.error('Failed to send password reset email:', emailErr.message);
                
                // Delete the token since we couldn't send the email
                if (HAS_POSTGRES) {
                    await pgQuery('DELETE FROM password_reset_tokens WHERE email = $1', [normalizedEmail]);
                } else if (db) {
                    db.prepare('DELETE FROM password_reset_tokens WHERE email = ?').run(normalizedEmail);
                }

                return res.status(502).json({
                    success: false,
                    message: 'Could not send password reset email. Please try again later.'
                });
            }
        } else {
            return res.status(503).json({
                success: false,
                message: 'Email service not available. Please try again later.'
            });
        }

    } catch (err) {
        console.error('Password reset request error:', err.message);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
};

// POST /api/password-reset/verify-token
// Verify that reset token is valid
const handleVerifyToken = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required.'
            });
        }

        // Check token in database
        if (HAS_POSTGRES) {
            await ensurePostgresReady();
            const result = await pgQuery(
                `SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
                [token]
            );
            
            if (!((result.rows || []).length > 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired password reset token.'
                });
            }

            return res.json({
                success: true,
                email: result.rows[0].email
            });
        } else if (db) {
            const result = db.prepare(`
                SELECT email FROM password_reset_tokens 
                WHERE token = ? AND expires_at > datetime('now')
                LIMIT 1
            `).get(token);

            if (!result) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired password reset token.'
                });
            }

            return res.json({
                success: true,
                email: result.email
            });
        } else {
            return res.status(503).json({
                success: false,
                message: 'Database not available.'
            });
        }

    } catch (err) {
        console.error('Token verification error:', err.message);
        res.status(500).json({
            success: false,
            message: 'An error occurred during token verification.'
        });
    }
};

// POST /api/password-reset/reset
// Reset password using valid token
const handlePasswordReset = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required.'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long.'
            });
        }

        // Verify token
        let email = null;
        if (HAS_POSTGRES) {
            await ensurePostgresReady();
            const result = await pgQuery(
                `SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
                [token]
            );
            
            if (!((result.rows || []).length > 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired password reset token.'
                });
            }
            email = result.rows[0].email;
        } else if (db) {
            const result = db.prepare(`
                SELECT email FROM password_reset_tokens 
                WHERE token = ? AND expires_at > datetime('now')
                LIMIT 1
            `).get(token);

            if (!result) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired password reset token.'
                });
            }
            email = result.email;
        } else {
            return res.status(503).json({
                success: false,
                message: 'Database not available.'
            });
        }

        const passwordHash = await hashPassword(newPassword);

        // Update password hash in database
        // Note: This assumes your users table has a password field.
        // If using external auth (e.g. Firebase Auth), update password there instead.
        if (HAS_POSTGRES) {
            await pgQuery(
                `UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2`,
                [passwordHash, email]
            );
            
            // Delete the used token
            await pgQuery('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
        } else if (db) {
            db.prepare(`
                UPDATE users SET password = ?, updated_at = datetime('now') WHERE email = ?
            `).run(passwordHash, email);
            
            // Delete the used token
            db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(token);
        }

        // Send confirmation email
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: email,
                    subject: 'Password Reset Successful — Qaulium AI',
                    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<img src="https://qauliumai.in/logo-white.png" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;">
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;">Password Reset Successful</h1>
<p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.65;">Your password has been successfully reset.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">You can now log in with your new password.</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">If you did not make this change, please contact our support team immediately at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;">admin@qauliumai.in</a>.</p>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;font-size:12px;color:#888888;">&copy; 2026 Qaulium AI</td></tr>
</table>
</td></tr></table>
</body>
</html>`
                });
            } catch (emailErr) {
                console.error('Failed to send password reset confirmation email:', emailErr.message);
                // Don't fail the response, password was already reset
            }
        }

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.'
        });

    } catch (err) {
        console.error('Password reset error:', err.message);
        res.status(500).json({
            success: false,
            message: 'An error occurred while resetting your password.'
        });
    }
};

// Export for use in server.js
module.exports = {
    initializePasswordReset,
    initializePwdResetTable,
    buildPasswordResetEmail,
    generatePasswordResetToken,
    handlePasswordResetRequest,
    handleVerifyToken,
    handlePasswordReset
};
