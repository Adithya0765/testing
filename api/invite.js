const nodemailer = require('nodemailer');

// Vercel Serverless API: Send Invitation Email
// POST /api/invite
// Sends an invitation email to a new employee with onboarding link

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { inviteId, token, email, firstName, lastName, role, department } = req.body;

        if (!inviteId || !token || !email) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Use Firebase deployment URL as the main application frontend
        const baseUrl = process.env.FRONTEND_URL || 'https://workspace.qauliumai.in';

        const onboardingUrl = `${baseUrl}/onboarding/?id=${inviteId}&token=${token}`;

        console.log(`[INVITE] Sending invite to ${email}`);
        console.log(`[INVITE] Onboarding URL: ${onboardingUrl}`);

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
Team Invitation
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">
Welcome, ${firstName}.
</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">
You've been invited to join Qaulium AI.
</p>

<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">

<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
You have been invited by the organization admin to join the <strong>${department || 'team'}</strong> department as a <strong>${role}</strong>.
</p>

<div style="margin:30px 0;">
    <a href="${onboardingUrl}" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accept Invitation & Setup Account</a>
</div>

<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">
If you did not expect this invitation, you can safely ignore this email.
</p>

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
                subject: 'You\'re Invited to Qualium AI!',
                html: htmlTemplate
            });
            console.log(`[INVITE] Email sent via SMTP to ${email}`);
        } else {
            console.warn('[INVITE WARNING] SMTP transporter missing. Email was not actually dispatched.');
        }

        return res.status(200).json({
            success: true,
            message: 'Invitation sent',
            onboardingUrl
        });
    } catch (error) {
        console.error('Invite error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send invitation' });
    }
};
