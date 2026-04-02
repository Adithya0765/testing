function registerEmployeePortalRoutes(app, requireAdminAuth) {
    app.post('/api/send-otp', require('../api/send-otp.js'));
    app.post('/api/verify-otp', require('../api/verify-otp.js'));
    app.post('/api/setup-totp', require('../api/setup-totp.js'));
    app.post('/api/verify-totp', require('../api/verify-totp.js'));
    app.post('/api/invite', requireAdminAuth, require('../api/invite.js'));
}

module.exports = {
    registerEmployeePortalRoutes
};
