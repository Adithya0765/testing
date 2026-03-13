(function () {
  'use strict';

  const PAGE_SIZE = 10;

  const state = {
    apiBase: localStorage.getItem('qaulium_admin_api_base') || 'https://qauliumai.in',
    token: localStorage.getItem('qaulium_admin_token') || '',
    tables: {
      registrations: { rows: [], page: 1 },
      contacts: { rows: [], page: 1 },
      careers: { rows: [], page: 1 }
    }
  };

  const templates = {
    'registration-welcome': {
      subject: 'Welcome to Qaulium AI — Registration Confirmed',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to Qaulium AI</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Registration Confirmed</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Welcome.</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">Your registration has been confirmed.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">Thank you for registering with Qaulium AI. {{CONTENT}}</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">If you have questions, reply to this email or reach us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    },
    'interview-invitation': {
      subject: 'Interview Invitation - Qaulium AI',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Interview Invitation</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Interview Invitation</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Interview Invitation</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">We would like to invite you for an interview.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">{{CONTENT}}</p>
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">We look forward to speaking with you soon.</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Questions? Reach us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    },
    'career-confirmation': {
      subject: 'Application Received - Qaulium AI Careers',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Application Received</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Application Received</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Thank You</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">We have received your application.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">Our hiring team is reviewing your profile and will get back to you shortly with the next steps. {{CONTENT}}</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">For questions, contact us at <a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a> or visit <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a>.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    },
    'contact-response': {
      subject: 'Response from Qaulium AI',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Response from Qaulium AI</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Response</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Thank You for Reaching Out</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">We appreciate your inquiry.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">{{CONTENT}}</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Best regards,<br>Qaulium AI Team<br><a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a></p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    },
    'company-announcement': {
      subject: 'News from Qaulium AI',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>News from Qaulium AI</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
<td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:0.05em;text-transform:uppercase;">Announcement</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1.2;">Important Announcement</h1>
<p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6B7280;line-height:1.65;">We have exciting news to share.</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">{{CONTENT}}</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Learn more at <a href="https://qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">qauliumai.in</a></p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    },
    'blank': {
      subject: 'Message from Qaulium AI',
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Message from Qaulium AI</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:#0A0A0A;padding:28px 40px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><img src="cid:qualium-logo" alt="Qaulium AI" height="36" style="display:block;height:36px;width:auto;border:0;"></td>
</tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;padding:48px 40px;">
<p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">{{CONTENT}}</p>
<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">Best regards,<br>Qaulium AI Team<br><a href="mailto:admin@qauliumai.in" style="color:#2563EB;text-decoration:none;font-weight:500;">admin@qauliumai.in</a></p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td align="left" style="padding-top:8px;">
<a href="https://discord.gg/gUnhDhh2" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/discord.svg" width="20" height="20" alt="Discord" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://www.linkedin.com/company/qalium-ai" style="display:inline-block;margin-right:12px;text-decoration:none;" target="_blank"><img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg" width="20" height="20" alt="LinkedIn" style="vertical-align:middle;filter:invert(0);"></a>
<a href="https://qauliumai.in" style="display:inline-block;text-decoration:none;" target="_blank"><img src="https://img.icons8.com/material-rounded/48/000000/globe--v1.png" width="20" height="20" alt="Website" style="vertical-align:middle;"></a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#0A0A0A;padding:24px 40px;border-radius:0 0 12px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#888888;line-height:1.5;">&copy; 2026 Qaulium AI. All rights reserved.<br>Amaravati, Andhra Pradesh, India</td></tr></table>
</td></tr>
</table></td></tr>
</table>
</body></html>`
    }
  };

  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');
  const loginForm = document.getElementById('loginForm');
  const loginStatus = document.getElementById('loginStatus');
  const apiBaseInput = document.getElementById('apiBase');
  const adminEmailInput = document.getElementById('adminEmail');
  const adminPasswordInput = document.getElementById('adminPassword');

  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const refreshBtn = document.getElementById('refreshBtn');
  const themeToggleBtn = document.getElementById('themeToggle');

  const registrationsBody = document.getElementById('registrationsBody');
  const contactsBody = document.getElementById('contactsBody');
  const careersBody = document.getElementById('careersBody');

  const statRegistrations = document.getElementById('statRegistrations');
  const statContacts = document.getElementById('statContacts');
  const statCareers = document.getElementById('statCareers');
  const statAll = document.getElementById('statAll');

  const registrationsSearch = document.getElementById('registrationsSearch');
  const contactsSearch = document.getElementById('contactsSearch');
  const careersSearch = document.getElementById('careersSearch');
  const careersRoleFilter = document.getElementById('careersRoleFilter');

  const registrationsPrevBtn = document.getElementById('registrationsPrevBtn');
  const registrationsNextBtn = document.getElementById('registrationsNextBtn');
  const registrationsPageInfo = document.getElementById('registrationsPageInfo');
  const contactsPrevBtn = document.getElementById('contactsPrevBtn');
  const contactsNextBtn = document.getElementById('contactsNextBtn');
  const contactsPageInfo = document.getElementById('contactsPageInfo');
  const careersPrevBtn = document.getElementById('careersPrevBtn');
  const careersNextBtn = document.getElementById('careersNextBtn');
  const careersPageInfo = document.getElementById('careersPageInfo');

  const registrationsExportBtn = document.getElementById('registrationsExportBtn');
  const contactsExportBtn = document.getElementById('contactsExportBtn');
  const careersExportBtn = document.getElementById('careersExportBtn');

  const customEmailsWrap = document.getElementById('customEmailsWrap');
  const customEmails = document.getElementById('customEmails');
  const customEmailsHint = document.getElementById('customEmailsHint');
  const emailSubject = document.getElementById('emailSubject');
  const subjectHint = document.getElementById('subjectHint');
  const middleContent = document.getElementById('middleContent');
  const bodyHint = document.getElementById('bodyHint');
  const emailBody = document.getElementById('emailBody');
  const emailPreviewFrame = document.getElementById('emailPreviewFrame');
  const previewSubject = document.getElementById('previewSubject');
  const previewRecipients = document.getElementById('previewRecipients');
  const regenerateTemplate = document.getElementById('regenerateTemplate');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const composerForm = document.getElementById('composerForm');
  const composerStatus = document.getElementById('composerStatus');

  const recordModal = document.getElementById('recordModal');
  const recordModalTitle = document.getElementById('recordModalTitle');
  const recordForm = document.getElementById('recordForm');
  const recordFormFields = document.getElementById('recordFormFields');
  const recordModalClose = document.getElementById('recordModalClose');
  const recordCancelBtn = document.getElementById('recordCancelBtn');

  const confirmModal = document.getElementById('confirmModal');
  const confirmModalMessage = document.getElementById('confirmModalMessage');
  const confirmModalClose = document.getElementById('confirmModalClose');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');

  const subtitleByTab = {
    overview: 'Monitor submissions and send communication.',
    registrations: 'View all platform registrations collected from the landing site.',
    contacts: 'Review contact inquiries and follow up with responses.',
    careers: 'Track internship applications and applicant profiles.',
    forms: 'Create and manage forms, view responses.',
    composer: 'Compose and send professional bulk emails to selected audiences.'
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qaulium_admin_theme', theme);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = theme === 'dark' ? 'Light Theme' : 'Dark Theme';
    }
  }

  function setStatus(el, message, type) {
    el.textContent = message;
    el.className = 'status ' + (type || '');
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.token
    };
  }

  async function request(path, options) {
    const res = await fetch(state.apiBase + path, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  function csvEscape(value) {
    const text = String(value || '');
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach(function (row) {
      lines.push(row.map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderTemplateHtml(def, contentValue, subjectValue) {
    const contentHtml = (contentValue || 'Your message here.').replace(/\n/g, '<br>');
    const safeSubject = subjectValue || def.subject || 'Message from Qaulium AI';
    return def.body
      .replace('{{CONTENT}}', contentHtml)
      // Keep preview/email HTML title aligned with subject field.
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeSubject}</title>`);
  }

  function applyTemplate() {
    const templateValue = document.querySelector('input[name="template"]:checked')?.value || 'blank';
    const def = templates[templateValue] || templates.blank;
    const existingSubject = (emailSubject.value || '').trim();
    if (!existingSubject) {
      emailSubject.value = def.subject;
    }
    emailBody.value = renderTemplateHtml(def, middleContent.value, emailSubject.value.trim());
    updatePreview();
  }

  function updatePreview() {
    if (!emailPreviewFrame) return;
    // Replace cid:qualium-logo with actual URL for preview rendering
    const previewHtml = (emailBody.value || '<p style="font-family:Arial,sans-serif;padding:20px;color:#999;">Preview will appear here.</p>')
      .replace(/cid:qualium-logo/g, 'https://qauliumai.in/logo-white.png');
    emailPreviewFrame.srcdoc = previewHtml;
    
    // Update preview info
    if (previewSubject) previewSubject.textContent = emailSubject.value || '—';
    if (previewRecipients) {
      const audienceValue = document.querySelector('input[name="audience"]:checked')?.value || 'all';
      const audienceLabel = {
        'all': `All Members (${totals.allRequests || 0})`,
        'registrations': `Registrations (${totals.registrations || 0})`,
        'contacts': `Contacts (${totals.contacts || 0})`,
        'careers': `Careers (${totals.careers || 0})`,
        'custom': `Custom List`
      }[audienceValue] || 'All Members';
      previewRecipients.textContent = audienceLabel;
    }
  }

  let totals = { registrations: 0, contacts: 0, careers: 0, allRequests: 0 };

  function pageSlice(rows, page) {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return {
      page: safePage,
      totalPages: totalPages,
      rows: rows.slice(start, start + PAGE_SIZE)
    };
  }

  function renderNoRows(body, colCount) {
    body.innerHTML = '<tr><td colspan="' + colCount + '">No records found.</td></tr>';
  }

  function rowActions(type, id) {
    return '<div class="row-actions">' +
      '<button class="row-icon-btn" type="button" title="Edit" aria-label="Edit" data-action="edit" data-type="' + type + '" data-id="' + id + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79z"></path></svg>' +
      '</button>' +
      '<button class="row-icon-btn danger" type="button" title="Delete" aria-label="Delete" data-action="delete" data-type="' + type + '" data-id="' + id + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z"></path></svg>' +
      '</button>' +
      '</div>';
  }

  function getRegistrationSourceLabel(source) {
    var value = String(source || '').trim().toLowerCase();
    if (value === 'public_registration_portal') {
      return { text: 'Pre-Registration Link', className: 'source-badge source-pre' };
    }
    if (value === 'landing_modal') {
      return { text: 'Landing Page', className: 'source-badge source-landing' };
    }
    return { text: 'Unknown', className: 'source-badge source-unknown' };
  }

  function getFilteredRegistrations() {
    const q = (registrationsSearch && registrationsSearch.value || '').trim().toLowerCase();
    return state.tables.registrations.rows.filter(function (row) {
      if (!q) return true;
      const hay = [row.first_name, row.last_name, row.email, row.phone, row.company, row.role, row.use_case, row.source].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function getFilteredContacts() {
    const q = (contactsSearch && contactsSearch.value || '').trim().toLowerCase();
    return state.tables.contacts.rows.filter(function (row) {
      if (!q) return true;
      const hay = [row.name, row.email, row.company, row.message].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function getFilteredCareers() {
    const q = (careersSearch && careersSearch.value || '').trim().toLowerCase();
    const roleFilter = careersRoleFilter ? careersRoleFilter.value : 'all';
    return state.tables.careers.rows.filter(function (row) {
      const roleOk = roleFilter === 'all' || (row.role_applied || '') === roleFilter;
      if (!roleOk) return false;
      if (!q) return true;
      const hay = [row.first_name, row.last_name, row.email, row.role_applied, row.university, row.degree].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderRegistrationsTable() {
    const filtered = getFilteredRegistrations();
    const paged = pageSlice(filtered, state.tables.registrations.page);
    state.tables.registrations.page = paged.page;

    if (!paged.rows.length) {
      renderNoRows(registrationsBody, 8);
    } else {
      registrationsBody.innerHTML = paged.rows.map(function (row) {
        var sourceMeta = getRegistrationSourceLabel(row.source);
        return '<tr>' +
          '<td>' + escapeHtml((row.first_name || '') + ' ' + (row.last_name || '')) + '</td>' +
          '<td>' + escapeHtml(row.email || '-') + '</td>' +
          '<td>' + escapeHtml(row.phone || '-') + '</td>' +
          '<td>' + escapeHtml(row.company || '-') + '</td>' +
          '<td>' + escapeHtml(row.role || '-') + '</td>' +
          '<td><span class="' + sourceMeta.className + '">' + escapeHtml(sourceMeta.text) + '</span></td>' +
          '<td>' + escapeHtml(formatDate(row.registered_at)) + '</td>' +
          '<td>' + rowActions('registrations', row.id) + '</td>' +
        '</tr>';
      }).join('');
    }

    registrationsPageInfo.textContent = 'Page ' + paged.page + ' of ' + paged.totalPages + ' • ' + filtered.length + ' results';
    registrationsPrevBtn.disabled = paged.page <= 1;
    registrationsNextBtn.disabled = paged.page >= paged.totalPages;
  }

  function renderContactsTable() {
    const filtered = getFilteredContacts();
    const paged = pageSlice(filtered, state.tables.contacts.page);
    state.tables.contacts.page = paged.page;

    if (!paged.rows.length) {
      renderNoRows(contactsBody, 6);
    } else {
      contactsBody.innerHTML = paged.rows.map(function (row) {
        return '<tr>' +
          '<td>' + escapeHtml(row.name || '-') + '</td>' +
          '<td>' + escapeHtml(row.email || '-') + '</td>' +
          '<td>' + escapeHtml(row.company || '-') + '</td>' +
          '<td>' + escapeHtml(row.message || '-') + '</td>' +
          '<td>' + escapeHtml(formatDate(row.sent_at)) + '</td>' +
          '<td>' + rowActions('contacts', row.id) + '</td>' +
        '</tr>';
      }).join('');
    }

    contactsPageInfo.textContent = 'Page ' + paged.page + ' of ' + paged.totalPages + ' • ' + filtered.length + ' results';
    contactsPrevBtn.disabled = paged.page <= 1;
    contactsNextBtn.disabled = paged.page >= paged.totalPages;
  }

  function renderCareersTable() {
    const filtered = getFilteredCareers();
    const paged = pageSlice(filtered, state.tables.careers.page);
    state.tables.careers.page = paged.page;

    if (!paged.rows.length) {
      renderNoRows(careersBody, 8);
    } else {
      careersBody.innerHTML = paged.rows.map(function (row) {
        return '<tr>' +
          '<td>' + escapeHtml((row.first_name || '') + ' ' + (row.last_name || '')) + '</td>' +
          '<td>' + escapeHtml(row.email || '-') + '</td>' +
          '<td>' + escapeHtml(row.role_applied || '-') + '</td>' +
          '<td>' + escapeHtml(row.university || '-') + '</td>' +
          '<td>' + escapeHtml(row.degree || '-') + '</td>' +
          '<td>' + escapeHtml(row.graduation_year || '-') + '</td>' +
          '<td>' + escapeHtml(formatDate(row.applied_at)) + '</td>' +
          '<td>' + rowActions('careers', row.id) + '</td>' +
        '</tr>';
      }).join('');
    }

    careersPageInfo.textContent = 'Page ' + paged.page + ' of ' + paged.totalPages + ' • ' + filtered.length + ' results';
    careersPrevBtn.disabled = paged.page <= 1;
    careersNextBtn.disabled = paged.page >= paged.totalPages;
  }

  function renderTables() {
    renderRegistrationsTable();
    renderContactsTable();
    renderCareersTable();
  }

  function getRowsByType(type) {
    if (type === 'registrations') return state.tables.registrations.rows;
    if (type === 'contacts') return state.tables.contacts.rows;
    if (type === 'careers') return state.tables.careers.rows;
    return [];
  }

  function getEditablePayload(type, row) {
    if (type === 'registrations') {
      return {
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        email: row.email || '',
        phone: row.phone || '',
        company: row.company || '',
        role: row.role || '',
        use_case: row.use_case || ''
      };
    }
    if (type === 'contacts') {
      return {
        name: row.name || '',
        email: row.email || '',
        company: row.company || '',
        message: row.message || ''
      };
    }
    return {
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      phone: row.phone || '',
      role_applied: row.role_applied || '',
      location: row.location || '',
      university: row.university || '',
      degree: row.degree || '',
      graduation_year: row.graduation_year || 0,
      availability: row.availability || '',
      linkedin_url: row.linkedin_url || '',
      portfolio_url: row.portfolio_url || '',
      resume_url: row.resume_url || '',
      cover_letter: row.cover_letter || '',
      current_company: row.current_company || '',
      experience_years: row.experience_years || 0
    };
  }

  const fieldConfig = {
    registrations: [
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'company', label: 'Company' },
      { key: 'role', label: 'Role' },
      { key: 'use_case', label: 'Use Case', multiline: true }
    ],
    contacts: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'company', label: 'Company' },
      { key: 'message', label: 'Message', multiline: true }
    ],
    careers: [
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'role_applied', label: 'Role Applied' },
      { key: 'location', label: 'Location' },
      { key: 'university', label: 'University' },
      { key: 'degree', label: 'Degree' },
      { key: 'graduation_year', label: 'Graduation Year', numeric: true },
      { key: 'availability', label: 'Availability' },
      { key: 'linkedin_url', label: 'LinkedIn URL' },
      { key: 'portfolio_url', label: 'Portfolio URL' },
      { key: 'resume_url', label: 'Resume URL' },
      { key: 'current_company', label: 'Current Company' },
      { key: 'experience_years', label: 'Experience Years', numeric: true },
      { key: 'cover_letter', label: 'Cover Letter', multiline: true }
    ]
  };

  let activeEditContext = null;
  let activeConfirmAction = null;

  function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function openEditModal(type, row) {
    const payload = getEditablePayload(type, row);
    const fields = fieldConfig[type] || [];

    recordModalTitle.textContent = 'Edit ' + type.slice(0, -1).replace(/^./, function (c) { return c.toUpperCase(); });
    recordFormFields.innerHTML = fields.map(function (field) {
      const value = payload[field.key] == null ? '' : payload[field.key];
      const inputHtml = field.multiline
        ? '<textarea rows="4" name="' + field.key + '" spellcheck="true">' + escapeHtml(String(value)) + '</textarea>'
        : '<input type="' + (field.numeric ? 'number' : 'text') + '" name="' + field.key + '" value="' + escapeHtml(String(value)) + '">';

      return '<div class="modal-field">' +
        '<label>' + escapeHtml(field.label) + '</label>' +
        inputHtml +
      '</div>';
    }).join('');

    activeEditContext = { type: type, id: row.id };
    openModal(recordModal);
  }

  function openConfirmModal(message, actionFn) {
    confirmModalMessage.textContent = message;
    activeConfirmAction = actionFn;
    openModal(confirmModal);
  }

  async function editRecord(type, id) {
    const rows = getRowsByType(type);
    const row = rows.find(function (item) { return String(item.id) === String(id); });
    if (!row) {
      setStatus(composerStatus, 'Record not found.', 'err');
      return;
    }

    openEditModal(type, row);
  }

  async function deleteRecord(type, id) {
    openConfirmModal('Delete this record? This action cannot be undone.', async function () {
      try {
        await request('/api/admin/' + type + '/' + id, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadDashboard();
        setStatus(composerStatus, 'Record deleted successfully.', 'ok');
      } catch (err) {
        setStatus(composerStatus, err.message || 'Delete failed.', 'err');
      }
    });
  }

  async function loadDashboard() {
    const [stats, registrations, contacts, careers, formsData] = await Promise.all([
      request('/api/admin/stats', { headers: authHeaders() }),
      request('/api/admin/registrations', { headers: authHeaders() }),
      request('/api/admin/contacts', { headers: authHeaders() }),
      request('/api/admin/careers', { headers: authHeaders() }),
      request('/api/admin/forms', { headers: authHeaders() }).catch(function() { return { data: [] }; })
    ]);

    statRegistrations.textContent = stats.totals.registrations;
    statContacts.textContent = stats.totals.contacts;
    statCareers.textContent = stats.totals.careers;
    statAll.textContent = stats.totals.allRequests;
    const statFormsEl = document.getElementById('statForms');
    if (statFormsEl) statFormsEl.textContent = (formsData.data || []).length;

    // Update global totals for composer preview
    totals = {
      registrations: stats.totals.registrations || 0,
      contacts: stats.totals.contacts || 0,
      careers: stats.totals.careers || 0,
      allRequests: stats.totals.allRequests || 0
    };

    // Update audience count displays
    ['registrations', 'contacts', 'careers'].forEach(function (type) {
      const el = document.getElementById('audienceCount-' + type);
      if (el) el.textContent = totals[type];
    });
    const el = document.getElementById('audienceCount-all');
    if (el) el.textContent = totals.allRequests;

    state.tables.registrations.rows = registrations.data || [];
    state.tables.contacts.rows = contacts.data || [];
    state.tables.careers.rows = careers.data || [];
    state.tables.registrations.page = 1;
    state.tables.contacts.page = 1;
    state.tables.careers.page = 1;

    renderTables();
    renderFormsList(formsData.data || []);
  }

  function switchTab(tab) {
    document.querySelectorAll('.menu-item').forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.id !== 'panel-' + tab);
    });
    const displayName = tab === 'form-builder' ? 'Form Builder' : tab === 'form-responses' ? 'Form Responses' : tab.charAt(0).toUpperCase() + tab.slice(1);
    pageTitle.textContent = displayName;
    if (pageSubtitle) {
      pageSubtitle.textContent = subtitleByTab[tab] || subtitleByTab.overview;
    }
  }

  function showApp() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
  }

  function showLogin() {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function bootstrap() {
    apiBaseInput.value = state.apiBase;

    const savedTheme = localStorage.getItem('qaulium_admin_theme') || 'light';
    setTheme(savedTheme);
    // Restore saved draft if exists
    const savedDraft = localStorage.getItem('qaulium_admin_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        const tplRadio = document.querySelector(`input[name="template"][value="${draft.template}"]`);
        if (tplRadio) tplRadio.checked = true;
        const audRadio = document.querySelector(`input[name="audience"][value="${draft.audience}"]`);
        if (audRadio) { audRadio.checked = true; customEmailsWrap.classList.toggle('hidden', draft.audience !== 'custom'); }
        if (draft.subject) emailSubject.value = draft.subject;
        if (draft.body) middleContent.value = draft.body;
        if (draft.customEmails) customEmails.value = draft.customEmails;
      } catch (e) { /* ignore corrupt draft */ }
    }
    applyTemplate();

    if (!state.token) {
      showLogin();
      return;
    }

    try {
      await request('/api/admin/me', { headers: authHeaders() });
      showApp();
      await loadDashboard();
    } catch (e) {
      localStorage.removeItem('qaulium_admin_token');
      state.token = '';
      showLogin();
    }
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      state.apiBase = apiBaseInput.value.replace(/\/$/, '');
      localStorage.setItem('qaulium_admin_api_base', state.apiBase);

      const data = await request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmailInput.value.trim(),
          password: adminPasswordInput.value
        })
      });

      state.token = data.token;
      localStorage.setItem('qaulium_admin_token', data.token);
      setStatus(loginStatus, 'Login successful.', 'ok');
      showApp();
      await loadDashboard();
    } catch (err) {
      setStatus(loginStatus, err.message, 'err');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('qaulium_admin_token');
    state.token = '';
    showLogin();
  });

  document.querySelectorAll('.menu-item').forEach(function (item) {
    item.addEventListener('click', function () {
      switchTab(item.getAttribute('data-tab'));
    });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function () {
      if (!state.token) return;
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      try {
        await loadDashboard();
      } catch (err) {
        // no-op
      }
      refreshBtn.textContent = 'Refresh Data';
      refreshBtn.disabled = false;
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  registrationsSearch.addEventListener('input', function () {
    state.tables.registrations.page = 1;
    renderRegistrationsTable();
  });
  contactsSearch.addEventListener('input', function () {
    state.tables.contacts.page = 1;
    renderContactsTable();
  });
  careersSearch.addEventListener('input', function () {
    state.tables.careers.page = 1;
    renderCareersTable();
  });
  careersRoleFilter.addEventListener('change', function () {
    state.tables.careers.page = 1;
    renderCareersTable();
  });

  registrationsPrevBtn.addEventListener('click', function () {
    state.tables.registrations.page -= 1;
    renderRegistrationsTable();
  });
  registrationsNextBtn.addEventListener('click', function () {
    state.tables.registrations.page += 1;
    renderRegistrationsTable();
  });
  contactsPrevBtn.addEventListener('click', function () {
    state.tables.contacts.page -= 1;
    renderContactsTable();
  });
  contactsNextBtn.addEventListener('click', function () {
    state.tables.contacts.page += 1;
    renderContactsTable();
  });
  careersPrevBtn.addEventListener('click', function () {
    state.tables.careers.page -= 1;
    renderCareersTable();
  });
  careersNextBtn.addEventListener('click', function () {
    state.tables.careers.page += 1;
    renderCareersTable();
  });

  registrationsExportBtn.addEventListener('click', function () {
    const rows = getFilteredRegistrations();
    downloadCsv('registrations.csv',
      ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Role', 'Use Case', 'Source', 'Registered At'],
      rows.map(function (r) { return [r.first_name, r.last_name, r.email, r.phone, r.company, r.role, r.use_case, r.source || 'unknown', r.registered_at]; })
    );
  });

  contactsExportBtn.addEventListener('click', function () {
    const rows = getFilteredContacts();
    downloadCsv('contacts.csv',
      ['Name', 'Email', 'Company', 'Message', 'Sent At'],
      rows.map(function (r) { return [r.name, r.email, r.company, r.message, r.sent_at]; })
    );
  });

  careersExportBtn.addEventListener('click', function () {
    const rows = getFilteredCareers();
    downloadCsv('careers.csv',
      ['First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Location', 'University', 'Degree', 'Graduation Year', 'Availability', 'LinkedIn', 'Portfolio', 'Resume URL', 'Applied At'],
      rows.map(function (r) {
        return [r.first_name, r.last_name, r.email, r.phone, r.role_applied, r.location, r.university, r.degree, r.graduation_year, r.availability, r.linkedin_url, r.portfolio_url, r.resume_url, r.applied_at];
      })
    );
  });

  [registrationsBody, contactsBody, careersBody].forEach(function (tbody) {
    tbody.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action][data-type][data-id]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const type = btn.getAttribute('data-type');
      const id = btn.getAttribute('data-id');

      if (action === 'edit') {
        editRecord(type, id);
      } else if (action === 'delete') {
        deleteRecord(type, id);
      }
    });
  });

  recordForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!activeEditContext) return;

    const formData = new FormData(recordForm);
    const fields = fieldConfig[activeEditContext.type] || [];
    const payload = {};
    fields.forEach(function (field) {
      const raw = formData.get(field.key);
      payload[field.key] = field.numeric ? (parseInt(raw || '0', 10) || 0) : String(raw || '').trim();
    });

    try {
      await request('/api/admin/' + activeEditContext.type + '/' + activeEditContext.id, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      closeModal(recordModal);
      activeEditContext = null;
      await loadDashboard();
      setStatus(composerStatus, 'Record updated successfully.', 'ok');
    } catch (err) {
      setStatus(composerStatus, err.message || 'Update failed.', 'err');
    }
  });

  [recordModalClose, recordCancelBtn].forEach(function (el) {
    el.addEventListener('click', function () {
      closeModal(recordModal);
      activeEditContext = null;
    });
  });

  [confirmModalClose, confirmCancelBtn].forEach(function (el) {
    el.addEventListener('click', function () {
      closeModal(confirmModal);
      activeConfirmAction = null;
    });
  });

  confirmOkBtn.addEventListener('click', async function () {
    if (!activeConfirmAction) return;
    const action = activeConfirmAction;
    activeConfirmAction = null;
    closeModal(confirmModal);
    await action();
  });

  [recordModal, confirmModal].forEach(function (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!recordModal.classList.contains('hidden')) {
      closeModal(recordModal);
      activeEditContext = null;
    }
    if (!confirmModal.classList.contains('hidden')) {
      closeModal(confirmModal);
      activeConfirmAction = null;
    }
  });

  // Audience radio button listeners
  document.querySelectorAll('input[name="audience"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      customEmailsWrap.classList.toggle('hidden', this.value !== 'custom');
      updatePreview();
    });
  });

  // Custom emails input hint
  if (customEmails) {
    customEmails.addEventListener('input', function () {
      const count = this.value.split(',').filter(function (e) { return e.trim(); }).length;
      if (customEmailsHint) {
        customEmailsHint.textContent = count > 0 ? `${count} email${count !== 1 ? 's' : ''} will be sent` : '';
      }
    });
  }

  // Middle content and updates
  if (middleContent) {
    middleContent.addEventListener('input', function () {
      const templateValue = document.querySelector('input[name="template"]:checked')?.value || 'blank';
      const def = templates[templateValue] || templates.blank;
      emailBody.value = renderTemplateHtml(def, this.value, emailSubject.value.trim());
      updatePreview();
      
      // Update body hint
      const wordCount = this.value.trim().split(/\s+/).filter(function(w) { return w; }).length;
      if (bodyHint) {
        bodyHint.textContent = wordCount > 0 ? `${wordCount} word${wordCount !== 1 ? 's' : ''}` : '';
      }
    });
  }

  // Subject line hint — also rebuild body so preview iframe reflects subject
  if (emailSubject) {
    emailSubject.addEventListener('input', function () {
      if (subjectHint) {
        subjectHint.textContent = this.value.length > 0 ? `${this.value.length} character${this.value.length !== 1 ? 's' : ''}` : '';
      }
      const templateValue = document.querySelector('input[name="template"]:checked')?.value || 'blank';
      const def = templates[templateValue] || templates.blank;
      emailBody.value = renderTemplateHtml(def, middleContent.value, this.value.trim());
      updatePreview();
    });
  }
  
  // Template radio button listeners
  document.querySelectorAll('input[name="template"]').forEach(function (radio) {
    radio.addEventListener('change', applyTemplate);
  });
  
  if (regenerateTemplate) regenerateTemplate.addEventListener('click', applyTemplate);

  // HTML Source Code Editor
  const toggleHtmlEditor = document.getElementById('toggleHtmlEditor');
  const htmlEditorContainer = document.getElementById('htmlEditorContainer');
  const htmlSourceEditor = document.getElementById('htmlSourceEditor');
  const applyHtmlBtn = document.getElementById('applyHtmlBtn');
  const copyHtmlBtn = document.getElementById('copyHtmlBtn');
  const loadCurrentHtmlBtn = document.getElementById('loadCurrentHtmlBtn');

  if (toggleHtmlEditor) {
    toggleHtmlEditor.addEventListener('click', function () {
      const isHidden = htmlEditorContainer.classList.contains('hidden');
      htmlEditorContainer.classList.toggle('hidden');
      toggleHtmlEditor.textContent = isHidden ? 'Hide HTML Source' : 'Edit HTML Source';
      if (isHidden) {
        // Load current template HTML into editor
        htmlSourceEditor.value = emailBody.value || '';
      }
    });
  }

  if (applyHtmlBtn) {
    applyHtmlBtn.addEventListener('click', function () {
      emailBody.value = htmlSourceEditor.value;
      updatePreview();
      setStatus(composerStatus, 'HTML applied to preview', 'ok');
      setTimeout(function () { composerStatus.innerHTML = ''; }, 2000);
    });
  }

  if (copyHtmlBtn) {
    copyHtmlBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(htmlSourceEditor.value).then(function () {
        setStatus(composerStatus, 'HTML copied to clipboard', 'ok');
        setTimeout(function () { composerStatus.innerHTML = ''; }, 2000);
      });
    });
  }

  if (loadCurrentHtmlBtn) {
    loadCurrentHtmlBtn.addEventListener('click', function () {
      htmlSourceEditor.value = emailBody.value || '';
      setStatus(composerStatus, 'Current template HTML loaded into editor', 'ok');
      setTimeout(function () { composerStatus.innerHTML = ''; }, 2000);
    });
  }

  // Allow Tab key in HTML editor for indentation
  if (htmlSourceEditor) {
    htmlSourceEditor.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
      }
    });
  }

  // Save draft functionality
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', function () {
      const draft = {
        template: document.querySelector('input[name="template"]:checked')?.value || 'blank',
        audience: document.querySelector('input[name="audience"]:checked')?.value || 'all',
        subject: emailSubject.value,
        body: middleContent.value,
        customEmails: customEmails.value
      };
      localStorage.setItem('qaulium_admin_draft', JSON.stringify(draft));
      setStatus(composerStatus, 'Draft saved locally', 'ok');
      setTimeout(function () {
        composerStatus.innerHTML = '';
      }, 3000);
    });
  }

  composerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      const audienceValue = document.querySelector('input[name="audience"]:checked')?.value || 'all';
      const customList = customEmails.value
        .split(',')
        .map(function (v) { return v.trim(); })
        .filter(Boolean);

      const data = await request('/api/admin/email/send', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          audience: audienceValue,
          subject: emailSubject.value.trim(),
          body: emailBody.value,
          customEmails: customList
        })
      });

      setStatus(composerStatus, `✓ Email sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}.`, 'ok');
      // Clear draft on successful send
      localStorage.removeItem('qaulium_admin_draft');
    } catch (err) {
      setStatus(composerStatus, err.message, 'err');
    }
  });

  bootstrap();

  // ========================================================
  //   FORMS BUILDER + RESPONSES
  // ========================================================

  let formsListData = [];
  let formBuilderState = { id: null, slug: null, sections: [] };

  const formsList = document.getElementById('formsList');
  const createFormBtn = document.getElementById('createFormBtn');
  const formsSearch = document.getElementById('formsSearch');
  const fbTitle = document.getElementById('fbTitle');
  const fbDescription = document.getElementById('fbDescription');
  const fbSectionsContainer = document.getElementById('fbSections');
  const fbAddSectionBtn = document.getElementById('fbAddSection');
  const saveFormBtn = document.getElementById('saveFormBtn');
  const fbLinkWrap = document.getElementById('fbLinkWrap');
  const fbActive = document.getElementById('fbActive');
  const formBuilderStatus = document.getElementById('formBuilderStatus');
  const backToFormsBtn = document.getElementById('backToFormsBtn');
  const backToFormsBtn2 = document.getElementById('backToFormsBtn2');
  const exportResponsesBtn = document.getElementById('exportResponsesBtn');
  const responsesFormTitle = document.getElementById('responsesFormTitle');
  const responsesHead = document.getElementById('responsesHead');
  const responsesBody = document.getElementById('responsesBody');
  const responseCount = document.getElementById('responseCount');

  let currentResponseFormId = null;

  function renderFormsList(data) {
    formsListData = data || [];
    if (!formsList) return;
    const search = (formsSearch ? formsSearch.value : '').toLowerCase();
    const filtered = formsListData.filter(function(f) {
      return !search || f.title.toLowerCase().includes(search) || (f.description || '').toLowerCase().includes(search);
    });

    if (!filtered.length) {
      formsList.innerHTML = '<div class="forms-empty"><h3>No forms yet</h3><p>Create your first form to start collecting responses.</p></div>';
      return;
    }

    formsList.innerHTML = filtered.map(function(f) {
      const isActive = f.is_active;
      const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : '';
      return '<div class="form-card" data-id="' + f.id + '">' +
        '<h3>' + escapeHtml(f.title) + '</h3>' +
        '<div class="fc-desc">' + escapeHtml(f.description || 'No description') + '</div>' +
        '<div class="fc-meta">' +
          '<span class="fc-badge ' + (isActive ? 'active' : 'closed') + '">' + (isActive ? 'Active' : 'Closed') + '</span>' +
          '<span>' + (f.response_count || 0) + ' response' + ((f.response_count || 0) !== 1 ? 's' : '') + '</span>' +
          '<span>' + date + '</span>' +
        '</div>' +
        '<div class="fc-actions">' +
          '<button data-action="edit" data-id="' + f.id + '">Edit</button>' +
          '<button data-action="responses" data-id="' + f.id + '">Responses</button>' +
          '<button data-action="link" data-slug="' + escapeHtml(f.slug) + '">Copy Link</button>' +
          '<button data-action="delete" data-id="' + f.id + '" class="danger">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  if (formsSearch) formsSearch.addEventListener('input', function() { renderFormsList(formsListData); });

  if (formsList) formsList.addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const slug = btn.getAttribute('data-slug');

    if (action === 'edit') openFormBuilder(parseInt(id));
    else if (action === 'responses') openFormResponses(parseInt(id));
    else if (action === 'link') {
      const url = state.apiBase + '/forms/' + slug;
      navigator.clipboard.writeText(url).then(function() {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy Link'; }, 1500);
      });
    }
    else if (action === 'delete') deleteForm(parseInt(id));
  });

  if (createFormBtn) createFormBtn.addEventListener('click', function() {
    openFormBuilder(null);
  });

  if (backToFormsBtn) backToFormsBtn.addEventListener('click', function() {
    switchTab('forms');
    loadFormsOnly();
  });
  if (backToFormsBtn2) backToFormsBtn2.addEventListener('click', function() {
    switchTab('forms');
    loadFormsOnly();
  });

  async function loadFormsOnly() {
    try {
      const data = await request('/api/admin/forms', { headers: authHeaders() });
      renderFormsList(data.data || []);
      const statFormsEl = document.getElementById('statForms');
      if (statFormsEl) statFormsEl.textContent = (data.data || []).length;
    } catch (e) { /* ignore */ }
  }

  function generateFieldId() {
    return 'f_' + Math.random().toString(36).substr(2, 8);
  }

  function generateSectionId() {
    return 's_' + Math.random().toString(36).substr(2, 8);
  }

  function openFormBuilder(formId) {
    formBuilderState = { id: formId, slug: null, sections: [] };
    fbTitle.value = '';
    fbDescription.value = '';
    fbActive.checked = true;
    fbLinkWrap.innerHTML = '<span class="muted">Save form to generate link</span>';
    formBuilderStatus.textContent = '';

    if (formId) {
      // Load existing form
      request('/api/admin/forms/' + formId, { headers: authHeaders() })
        .then(function(data) {
          const form = data.form;
          formBuilderState.id = form.id;
          formBuilderState.slug = form.slug;
          fbTitle.value = form.title || '';
          fbDescription.value = form.description || '';
          fbActive.checked = !!form.is_active;
          formBuilderState.sections = form.sections || [];
          if (form.slug) {
            const publicUrl = state.apiBase + '/forms/' + form.slug;
            fbLinkWrap.innerHTML = '<a href="' + publicUrl + '" target="_blank">' + publicUrl + '</a><br>' +
              '<button class="fb-copy-link" onclick="navigator.clipboard.writeText(\'' + publicUrl + '\');this.textContent=\'Copied!\';setTimeout(()=>{this.textContent=\'Copy Link\'},1500)">Copy Link</button>';
          }
          renderFormBuilderSections();
        })
        .catch(function() {
          formBuilderStatus.textContent = 'Failed to load form.';
        });
    } else {
      // New form - add one empty section
      formBuilderState.sections = [{
        id: generateSectionId(),
        title: '',
        description: '',
        fields: []
      }];
      renderFormBuilderSections();
    }

    switchTab('form-builder');
  }

  function renderFormBuilderSections() {
    if (!fbSectionsContainer) return;
    fbSectionsContainer.innerHTML = '';

    formBuilderState.sections.forEach(function(section, si) {
      const secEl = document.createElement('div');
      secEl.className = 'fb-section-card';
      secEl.setAttribute('data-section-index', si);

      let html = '<div class="fb-section-header">' +
        '<input type="text" value="' + escapeHtml(section.title || '') + '" placeholder="Section title" class="fb-sec-title">' +
        '<button type="button" class="fb-section-remove" title="Remove section">&times;</button>' +
      '</div>' +
      '<input type="text" value="' + escapeHtml(section.description || '') + '" placeholder="Section description (optional)" class="fb-section-desc fb-sec-desc">' +
      '<div class="fb-fields">';

      (section.fields || []).forEach(function(field, fi) {
        html += renderFieldEditor(field, fi);
      });

      html += '</div>' +
        '<button type="button" class="btn btn-secondary fb-add-field" style="margin-top:10px;font-size:13px">+ Add field</button>';

      secEl.innerHTML = html;
      fbSectionsContainer.appendChild(secEl);
    });
  }

  function renderFieldEditor(field, fi) {
    const hasOptions = ['dropdown', 'multiple_choice', 'checkbox'].includes(field.type);
    let h = '<div class="fb-field-item" data-field-index="' + fi + '">' +
      '<div class="fb-field-row">' +
        '<input type="text" value="' + escapeHtml(field.label || '') + '" placeholder="Field label" class="fb-fld-label">' +
        '<select class="fb-fld-type">' +
          '<option value="text"' + (field.type === 'text' ? ' selected' : '') + '>Text</option>' +
          '<option value="paragraph"' + (field.type === 'paragraph' ? ' selected' : '') + '>Paragraph</option>' +
          '<option value="email"' + (field.type === 'email' ? ' selected' : '') + '>Email</option>' +
          '<option value="number"' + (field.type === 'number' ? ' selected' : '') + '>Number</option>' +
          '<option value="date"' + (field.type === 'date' ? ' selected' : '') + '>Date</option>' +
          '<option value="phone"' + (field.type === 'phone' ? ' selected' : '') + '>Phone</option>' +
          '<option value="url"' + (field.type === 'url' ? ' selected' : '') + '>URL</option>' +
          '<option value="dropdown"' + (field.type === 'dropdown' ? ' selected' : '') + '>Dropdown</option>' +
          '<option value="multiple_choice"' + (field.type === 'multiple_choice' ? ' selected' : '') + '>Multiple Choice</option>' +
          '<option value="checkbox"' + (field.type === 'checkbox' ? ' selected' : '') + '>Checkbox</option>' +
        '</select>' +
      '</div>' +
      '<div class="fb-field-controls">' +
        '<label><input type="checkbox" class="fb-fld-required"' + (field.required ? ' checked' : '') + '> Required</label>' +
        '<button type="button" class="fb-field-remove" title="Remove field">&times;</button>' +
      '</div>';

    if (hasOptions) {
      h += '<div class="fb-options-editor">';
      (field.options || []).forEach(function(opt, oi) {
        h += '<div class="fb-opt-row" data-opt-index="' + oi + '">' +
          '<input type="text" value="' + escapeHtml(opt) + '" placeholder="Option ' + (oi + 1) + '" class="fb-opt-value">' +
          '<button type="button" class="fb-opt-remove">&times;</button>' +
        '</div>';
      });
      h += '<button type="button" class="fb-add-opt">+ Add option</button></div>';
    }

    h += '</div>';
    return h;
  }

  function collectFormData() {
    const sections = [];
    document.querySelectorAll('#fbSections .fb-section-card').forEach(function(secEl) {
      const section = {
        id: formBuilderState.sections[parseInt(secEl.getAttribute('data-section-index'))]?.id || generateSectionId(),
        title: secEl.querySelector('.fb-sec-title').value.trim(),
        description: secEl.querySelector('.fb-sec-desc').value.trim(),
        fields: []
      };

      secEl.querySelectorAll('.fb-field-item').forEach(function(fldEl, fi) {
        const si = parseInt(secEl.getAttribute('data-section-index'));
        const existingField = (formBuilderState.sections[si]?.fields || [])[fi];
        const type = fldEl.querySelector('.fb-fld-type').value;
        const field = {
          id: existingField?.id || generateFieldId(),
          label: fldEl.querySelector('.fb-fld-label').value.trim() || ('Question ' + (fi + 1)),
          type: type,
          required: fldEl.querySelector('.fb-fld-required').checked,
          placeholder: '',
          options: []
        };

        if (['dropdown', 'multiple_choice', 'checkbox'].includes(type)) {
          fldEl.querySelectorAll('.fb-opt-value').forEach(function(optInput) {
            const v = optInput.value.trim();
            if (v) field.options.push(v);
          });
        }

        section.fields.push(field);
      });

      sections.push(section);
    });
    return sections;
  }

  // Event delegation for form builder
  if (fbSectionsContainer) fbSectionsContainer.addEventListener('click', function(e) {
    const target = e.target;

    // Remove section
    if (target.closest('.fb-section-remove')) {
      const secCard = target.closest('.fb-section-card');
      const si = parseInt(secCard.getAttribute('data-section-index'));
      formBuilderState.sections = collectFormData();
      formBuilderState.sections.splice(si, 1);
      renderFormBuilderSections();
      return;
    }

    // Remove field
    if (target.closest('.fb-field-remove')) {
      const secCard = target.closest('.fb-section-card');
      const fldItem = target.closest('.fb-field-item');
      const si = parseInt(secCard.getAttribute('data-section-index'));
      const fi = parseInt(fldItem.getAttribute('data-field-index'));
      formBuilderState.sections = collectFormData();
      formBuilderState.sections[si].fields.splice(fi, 1);
      renderFormBuilderSections();
      return;
    }

    // Add field (in-section button)
    if (target.closest('.fb-add-field')) {
      const secCard = target.closest('.fb-section-card');
      const si = parseInt(secCard.getAttribute('data-section-index'));
      formBuilderState.sections = collectFormData();
      formBuilderState.sections[si].fields.push({
        id: generateFieldId(),
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
        options: []
      });
      renderFormBuilderSections();
      return;
    }

    // Remove option
    if (target.closest('.fb-opt-remove')) {
      const secCard = target.closest('.fb-section-card');
      const fldItem = target.closest('.fb-field-item');
      const optRow = target.closest('.fb-opt-row');
      const si = parseInt(secCard.getAttribute('data-section-index'));
      const fi = parseInt(fldItem.getAttribute('data-field-index'));
      const oi = parseInt(optRow.getAttribute('data-opt-index'));
      formBuilderState.sections = collectFormData();
      formBuilderState.sections[si].fields[fi].options.splice(oi, 1);
      renderFormBuilderSections();
      return;
    }

    // Add option
    if (target.closest('.fb-add-opt')) {
      const secCard = target.closest('.fb-section-card');
      const fldItem = target.closest('.fb-field-item');
      const si = parseInt(secCard.getAttribute('data-section-index'));
      const fi = parseInt(fldItem.getAttribute('data-field-index'));
      formBuilderState.sections = collectFormData();
      formBuilderState.sections[si].fields[fi].options.push('');
      renderFormBuilderSections();
      return;
    }
  });

  // Change field type re-render (for showing/hiding options)
  if (fbSectionsContainer) fbSectionsContainer.addEventListener('change', function(e) {
    if (e.target.classList.contains('fb-fld-type')) {
      formBuilderState.sections = collectFormData();
      renderFormBuilderSections();
    }
  });

  // Add section
  if (fbAddSectionBtn) fbAddSectionBtn.addEventListener('click', function() {
    formBuilderState.sections = collectFormData();
    formBuilderState.sections.push({
      id: generateSectionId(),
      title: '',
      description: '',
      fields: []
    });
    renderFormBuilderSections();
  });

  // Sidebar "Add Field" buttons
  document.querySelectorAll('.fb-field-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const type = btn.getAttribute('data-type');
      formBuilderState.sections = collectFormData();
      if (!formBuilderState.sections.length) {
        formBuilderState.sections.push({ id: generateSectionId(), title: '', description: '', fields: [] });
      }
      const lastSection = formBuilderState.sections[formBuilderState.sections.length - 1];
      lastSection.fields.push({
        id: generateFieldId(),
        label: '',
        type: type,
        required: false,
        placeholder: '',
        options: type === 'dropdown' || type === 'multiple_choice' || type === 'checkbox' ? ['Option 1'] : []
      });
      renderFormBuilderSections();
    });
  });

  // Save form
  if (saveFormBtn) saveFormBtn.addEventListener('click', async function() {
    const title = fbTitle.value.trim();
    if (!title) {
      formBuilderStatus.textContent = 'Title is required.';
      return;
    }

    formBuilderState.sections = collectFormData();
    saveFormBtn.disabled = true;
    saveFormBtn.textContent = 'Saving...';
    formBuilderStatus.textContent = '';

    try {
      if (formBuilderState.id) {
        // Update
        await request('/api/admin/forms/' + formBuilderState.id, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            title: title,
            description: fbDescription.value.trim(),
            sections: formBuilderState.sections,
            is_active: fbActive.checked
          })
        });
        formBuilderStatus.textContent = 'Form saved.';
      } else {
        // Create
        const data = await request('/api/admin/forms', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            title: title,
            description: fbDescription.value.trim(),
            sections: formBuilderState.sections
          })
        });
        formBuilderState.id = data.form.id;
        formBuilderState.slug = data.form.slug;
        formBuilderStatus.textContent = 'Form created.';
      }

      // Update link
      if (formBuilderState.slug) {
        const publicUrl = state.apiBase + '/forms/' + formBuilderState.slug;
        fbLinkWrap.innerHTML = '<a href="' + publicUrl + '" target="_blank">' + publicUrl + '</a><br>' +
          '<button class="fb-copy-link" onclick="navigator.clipboard.writeText(\'' + publicUrl + '\');this.textContent=\'Copied!\';setTimeout(()=>{this.textContent=\'Copy Link\'},1500)">Copy Link</button>';
      }
    } catch (err) {
      formBuilderStatus.textContent = err.message || 'Save failed.';
    } finally {
      saveFormBtn.disabled = false;
      saveFormBtn.textContent = 'Save Form';
    }
  });

  // Delete form
  async function deleteForm(id) {
    openConfirmModal('Delete this form and all its responses?', async function() {
      try {
        await request('/api/admin/forms/' + id, {
          method: 'DELETE',
          headers: authHeaders()
        });
        loadFormsOnly();
      } catch (err) {
        alert(err.message || 'Delete failed.');
      }
    });
  }

  // Responses viewer
  async function openFormResponses(formId) {
    currentResponseFormId = formId;
    switchTab('form-responses');
    responsesFormTitle.textContent = 'Loading...';
    responsesHead.querySelector('tr').innerHTML = '';
    responsesBody.innerHTML = '';
    responseCount.textContent = '';

    try {
      const [formData, respData] = await Promise.all([
        request('/api/admin/forms/' + formId, { headers: authHeaders() }),
        request('/api/admin/forms/' + formId + '/responses', { headers: authHeaders() })
      ]);

      const form = formData.form;
      const responses = respData.data || [];
      responsesFormTitle.textContent = form.title;
      responseCount.textContent = responses.length + ' response' + (responses.length !== 1 ? 's' : '');

      // Build headers from sections
      const fieldsList = [];
      let fieldCounter = 0;
      (form.sections || []).forEach(function(s) {
        (s.fields || []).forEach(function(f) {
          fieldCounter++;
          var displayLabel = (f.label && f.label.trim() && !/^f_[a-z0-9]+$/i.test(f.label.trim())) ? f.label.trim() : ('Question ' + fieldCounter);
          fieldsList.push({ id: f.id, label: displayLabel });
        });
      });

      let headHtml = '<th>#</th><th>Submitted</th><th>Email</th>';
      fieldsList.forEach(function(f) {
        headHtml += '<th>' + escapeHtml(f.label) + '</th>';
      });
      headHtml += '<th>Actions</th>';
      responsesHead.querySelector('tr').innerHTML = headHtml;

      responsesBody.innerHTML = responses.map(function(r, i) {
        const data = r.data || {};
        let row = '<td>' + (i + 1) + '</td>';
        row += '<td>' + escapeHtml(r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '') + '</td>';
        row += '<td>' + escapeHtml(r.respondent_email || '') + '</td>';
        fieldsList.forEach(function(f) {
          const val = data[f.id];
          row += '<td>' + escapeHtml(Array.isArray(val) ? val.join(', ') : (val || '')) + '</td>';
        });
        row += '<td><button class="row-icon-btn danger" data-action="delete-response" data-rid="' + r.id + '" title="Delete response">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button></td>';
        return '<tr>' + row + '</tr>';
      }).join('');
    } catch (err) {
      responsesFormTitle.textContent = 'Error loading responses';
    }
  }

  // Delete response
  if (responsesBody) responsesBody.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action="delete-response"]');
    if (!btn) return;
    const rid = parseInt(btn.getAttribute('data-rid'));
    openConfirmModal('Delete this response?', async function() {
      try {
        await request('/api/admin/forms/' + currentResponseFormId + '/responses/' + rid, {
          method: 'DELETE',
          headers: authHeaders()
        });
        openFormResponses(currentResponseFormId);
      } catch (err) {
        alert(err.message || 'Delete failed.');
      }
    });
  });

  // Export CSV
  if (exportResponsesBtn) exportResponsesBtn.addEventListener('click', function() {
    if (!currentResponseFormId) return;
    const url = state.apiBase + '/api/admin/forms/' + currentResponseFormId + '/responses/export';
    const a = document.createElement('a');
    a.href = url;
    // Fetch with auth
    fetch(url, { headers: authHeaders() })
      .then(function(r) { return r.blob(); })
      .then(function(blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'responses.csv';
        link.click();
        URL.revokeObjectURL(link.href);
      });
  });

  // Confirm modal helper for forms (reusing existing confirm modal)
  function openConfirmModal(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msg = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('confirmModalClose');

    msg.textContent = message;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    function cleanup() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', cleanup);
      closeBtn.removeEventListener('click', cleanup);
    }

    function handleOk() {
      cleanup();
      onConfirm();
    }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', cleanup);
    closeBtn.addEventListener('click', cleanup);
  }

})();
