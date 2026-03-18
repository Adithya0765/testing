// Vercel Serverless API: Verify OTP
// POST /api/verify-otp
// Verifies the 6-digit email OTP during onboarding

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { inviteId, code } = req.body;

        if (!inviteId || !code) {
            return res.status(400).json({ success: false, message: 'Invite ID and code are required' });
        }

        // In production: check against persistent store (Firestore, Redis, etc.)
        // For serverless, the in-memory store may not persist across invocations
        // A more robust approach: store OTP hash in Firestore during send-otp

        // For now, accept any valid 6-digit code in development
        // TODO: Implement persistent OTP verification
        if (code.length === 6 && /^\d{6}$/.test(code)) {
            return res.status(200).json({
                success: true,
                message: 'OTP verified successfully'
            });
        }

        return res.status(200).json({
            success: false,
            message: 'Invalid verification code'
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
};
