const path = require('path');

function sendPage(baseDir, page) {
    return function (_req, res) {
        res.sendFile(path.join(baseDir, page));
    };
}

function registerStaticPageRoutes(app, baseDir) {
    app.get('/careers', sendPage(baseDir, 'careers.html'));
    app.get('/careers.html', sendPage(baseDir, 'careers.html'));

    app.get('/careers/apply', sendPage(baseDir, 'careers-apply.html'));
    app.get('/careers-apply.html', sendPage(baseDir, 'careers-apply.html'));

    app.get('/registration', sendPage(baseDir, 'registration.html'));
    app.get('/registration.html', sendPage(baseDir, 'registration.html'));
    app.get('/pre-register', sendPage(baseDir, 'registration.html'));
    app.get('/pre-registration', sendPage(baseDir, 'registration.html'));

    app.get('/password-reset', sendPage(baseDir, 'password-reset.html'));

    app.get('/forms', sendPage(baseDir, 'forms.html'));
    app.get('/forms.html', sendPage(baseDir, 'forms.html'));
    app.get('/forms/:slug', sendPage(baseDir, 'forms.html'));
}

module.exports = {
    registerStaticPageRoutes
};
