// Vercel Serverless API: Verify OTP
// POST /api/verify-otp
// Verifies the 6-digit email OTP during onboarding using stateless validation

const crypto = require('crypto');

const OTP_SECRET = process.env.OTP_SECRET || 'qualium-ai-secure-otp-fallback';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { email, code, otpHash } = req.body;

        if (!email || !code || !otpHash) {
            return res.status(400).json({ success: false, message: 'Email, code, and hash token are required' });
        }

        const [hash, expiresAt] = otpHash.split('.');
        if (!hash || !expiresAt) {
            return res.status(400).json({ success: false, message: 'Invalid hash token format' });
        }

        if (Date.now() > parseInt(expiresAt, 10)) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        const payload = `${email}:${code}:${expiresAt}`;
        const expectedHash = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');

        if (hash === expectedHash) {
            return res.status(200).json({
                success: true,
                message: 'OTP verified successfully'
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Invalid verification code'
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
};
