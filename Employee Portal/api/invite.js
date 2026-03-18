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

        // Build onboarding URL
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : req.headers.origin || 'http://localhost:3000';

        const onboardingUrl = `${baseUrl}/onboarding/?id=${inviteId}&token=${token}`;

        console.log(`[INVITE] Sending invite to ${email}`);
        console.log(`[INVITE] Onboarding URL: ${onboardingUrl}`);

        if (process.env.RESEND_API_KEY) {
            const { Resend } = require('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            
            await resend.emails.send({
                from: 'Qualium AI App <onboarding@resend.dev>', // Use resend.dev for testing unless domain is verified
                to: email,
                subject: 'You\'re Invited to Qualium AI!',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                        <h2 style="color: #111;">Welcome to Qualium AI!</h2>
                        <p style="color: #444; font-size: 16px;">Hi ${firstName},</p>
                        <p style="color: #444; font-size: 16px;">You've been invited by the organization admin to join the <strong>${department || 'team'}</strong> department as a <strong>${role}</strong>.</p>
                        <div style="margin: 30px 0;">
                            <a href="${onboardingUrl}" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accept Invitation & Setup Account</a>
                        </div>
                        <p style="color:#666;font-size:13px;margin-top:20px;border-top:1px solid #eaeaea;padding-top:20px;">
                            If you did not expect this invitation, you can safely ignore this email.
                        </p>
                    </div>
                `
            });
            console.log(`[INVITE] Email sent via Resend to ${email}`);
        } else {
            console.warn('[INVITE WARNING] RESEND_API_KEY not found in environment. Email was not actually dispatched.');
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
