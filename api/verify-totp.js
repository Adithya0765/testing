// Vercel Serverless API: Verify TOTP
// POST /api/verify-totp
// Verifies a TOTP code against a secret (server-side)

const crypto = require('crypto');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { code, secret, uid } = req.body;

        if (!code || code.length !== 6) {
            return res.status(400).json({ success: false, message: 'A 6-digit code is required' });
        }

        // If secret provided directly (onboarding), verify against it
        // If uid provided (login), we would fetch secret from Firestore via Firebase Admin SDK
        let totpSecret = secret;

        if (!totpSecret && uid) {
            // In production: use Firebase Admin SDK to fetch user's stored secret
            // For now, return an error if no secret is provided
            return res.status(400).json({ success: false, message: 'Secret or UID required' });
        }

        if (!totpSecret) {
            return res.status(400).json({ success: false, message: 'TOTP secret not found' });
        }

        // Decode base32 secret
        const secretBytes = base32Decode(totpSecret);

        // Check current and adjacent time windows (±1 step for clock skew)
        const now = Math.floor(Date.now() / 1000);
        const timeSteps = [
            Math.floor(now / 30) - 1,
            Math.floor(now / 30),
            Math.floor(now / 30) + 1
        ];

        let valid = false;
        for (const counter of timeSteps) {
            const expected = generateTOTP(secretBytes, counter);
            if (expected === code) {
                valid = true;
                break;
            }
        }

        if (valid) {
            return res.status(200).json({ success: true, message: 'TOTP verified successfully' });
        } else {
            return res.status(200).json({ success: false, message: 'Invalid code. Please try again.' });
        }
    } catch (error) {
        console.error('TOTP verify error:', error);
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

// Generate TOTP code for a given time step
function generateTOTP(secretBytes, counter) {
    // Convert counter to 8-byte big-endian buffer
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
    hmac.update(counterBuf);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0F;
    const code = (
        ((hash[offset] & 0x7F) << 24) |
        ((hash[offset + 1] & 0xFF) << 16) |
        ((hash[offset + 2] & 0xFF) << 8) |
        (hash[offset + 3] & 0xFF)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

// RFC 4648 Base32 decoding
function base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const result = [];
    let bits = 0;
    let value = 0;

    for (let i = 0; i < encoded.length; i++) {
        const idx = alphabet.indexOf(encoded[i].toUpperCase());
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            result.push((value >>> (bits - 8)) & 0xFF);
            bits -= 8;
        }
    }

    return new Uint8Array(result);
}
