// POST /api/send-otp
// Sends a 6-digit OTP to the employee's email for onboarding verification

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const OTP_SECRET = process.env.OTP_SECRET || 'qualium-ai-secure-otp-fallback';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { inviteId, email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Generate stateless OTP hash for backend verification
        const expiresAt = Date.now() + 10 * 60 * 1000;
        const payload = `${email}:${otp}:${expiresAt}`;
        const hmac = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
        const otpHash = `${hmac}.${expiresAt}`;

        // For now, log it (visible in Vercel function logs)
        console.log(`[OTP] Code for ${email}: ${otp}`);

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

        let transporter;
        try {
            transporter = nodemailer.createTransport(SMTP_CONFIG);
        } catch (err) {
            console.error('Email transporter setup failed:', err.message);
        }

        if (transporter) {
            const htmlTemplate = `<!DOCTYPE html>
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
Verification Code
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h2 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#0A0A0A;">Your Verification Code</h2>
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#4B5563;line-height:1.6;">Use the one-time password below to continue your setup:</p>

<div style="margin:0 0 20px;padding:14px 18px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:0.16em;color:#111827;text-align:center;">${otp}</div>

<p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6B7280;line-height:1.6;">This code expires in 10 minutes. If you did not request this code, ignore this message.</p>
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

            await transporter.sendMail({
                from: SMTP_FROM,
                to: email,
                subject: 'Your Qualium AI Verification Code',
                html: htmlTemplate
            });
            console.log(`[OTP] Email sent via SMTP to ${email}`);
        } else {
            console.warn('[OTP WARNING] SMTP transporter missing. Email was not actually dispatched.');
        }

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            otpHash: otpHash
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};
