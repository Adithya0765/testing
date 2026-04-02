// Vercel Serverless API: Setup TOTP
// POST /api/setup-totp
// Generates a new TOTP secret and returns QR code data

const crypto = require('crypto');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Generate a random 20-byte secret
        const secretBytes = crypto.randomBytes(20);
        const secret = base32Encode(secretBytes);

        // Build otpauth URL for QR code
        const issuer = 'QualiumAI';
        const label = encodeURIComponent(`${issuer}:${email}`);
        const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

        return res.status(200).json({
            success: true,
            secret,
            otpauthUrl
        });
    } catch (error) {
        console.error('TOTP setup error:', error);
        return res.status(500).json({ success: false, message: 'Failed to generate TOTP secret' });
    }
};

// RFC 4648 Base32 encoding
function base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            result += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
}
