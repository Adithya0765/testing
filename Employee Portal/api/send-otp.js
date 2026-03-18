// Vercel Serverless API: Send OTP via Email
// POST /api/send-otp
// Sends a 6-digit OTP to the employee's email for onboarding verification

const crypto = require('crypto');

// In-memory OTP store (for Vercel serverless functions)
// In production: use Redis, Firestore, or another persistent store
const otpStore = new Map();

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

        // Store with 10-minute expiry
        otpStore.set(inviteId || email, {
            code: otp,
            email,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        // In production: send email via SendGrid, Resend, Nodemailer, etc.
        // For now, log it (visible in Vercel function logs)
        console.log(`[OTP] Code for ${email}: ${otp}`);

        // TODO: Integrate with your email service
        // Example with Resend:
        // const { Resend } = require('resend');
        // const resend = new Resend(process.env.RESEND_API_KEY);
        // await resend.emails.send({
        //     from: 'portal@qualiumai.in',
        //     to: email,
        //     subject: 'Your Qualium AI Verification Code',
        //     html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
        // });

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully'
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

// Export store for verify-otp to access (within same deployment)
module.exports.otpStore = otpStore;
