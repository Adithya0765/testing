# Qualium AI - Employee Management Portal

Production-ready employee management portal with Firebase backend, server-side TOTP 2FA, role-based dashboards, and Vercel deployment.

## Quick Start

1. **Firebase Setup**: Replace placeholders in `firebase-config.js` with your Firebase project credentials
2. **Deploy to Vercel**: Push to Git → Connect to Vercel → Deploy
3. **Create Admin**: Create the first admin user directly in Firebase Auth + Firestore
4. **Invite Team**: Use the admin panel to send employee invitations

## Project Structure

```
Employee Portal/
├── index.html              # Entry redirect
├── firebase-config.js      # Firebase configuration
├── vercel.json             # Vercel routing & deployment
├── styles.css              # Shared design system
├── app.js                  # Shared utilities, auth, sidebar
├── shared-dashboard.js     # Shared employee dashboard logic
├── assets/                 # Logo and images
│
├── login/                  # Login page + TOTP
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── onboarding/             # 9-step employee onboarding wizard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── admin/                  # Admin panel
│   ├── index.html          # Dashboard, users, tasks, invites, notifications
│   ├── styles.css
│   └── app.js
│
├── frontend/               # Frontend Developer dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── backend/                # Backend Developer dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── uiux/                   # UI/UX Designer dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── research/               # Research Analyst dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── marketing/              # Marketing Specialist dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── pr/                     # PR Manager dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── design/                 # Design Lead dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── hardware/               # Hardware Engineer dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── profile/                # Profile page
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── settings/               # Settings page
│   ├── index.html
│   └── app.js
│
└── api/                    # Vercel serverless API routes
    ├── setup-totp.js       # Generate TOTP secret + QR code data
    ├── verify-totp.js      # Server-side TOTP verification (RFC 6238)
    ├── send-otp.js         # Send email OTP for onboarding
    ├── verify-otp.js       # Verify email OTP
    └── invite.js           # Send invitation email
```

## Roles

| Role | Folder | Color |
|------|--------|-------|
| Admin | `admin/` | #EF4444 |
| Frontend | `frontend/` | #3B82F6 |
| Backend | `backend/` | #10B981 |
| UI/UX | `uiux/` | #8B5CF6 |
| Research | `research/` | #F59E0B |
| Marketing | `marketing/` | #EC4899 |
| PR | `pr/` | #06B6D4 |
| Design | `design/` | #F97316 |
| Hardware | `hardware/` | #6366F1 |

## Features

- **Multi-step Onboarding**: Invitation → Email OTP → Detail Review → Password → TOTP Setup → Terms → Account Created
- **Server-side TOTP**: RFC 6238 compliant, pure Node.js crypto, ±1 time window tolerance
- **Role-based Access**: Each role has its own dashboard with auth guards
- **Task Management**: Create, assign, track progress, submit for review, approve/return
- **Real-time Updates**: Firestore onSnapshot listeners for live data
- **Dark Mode**: Full theme support with CSS custom properties
- **Responsive**: Mobile-first design with collapsible sidebar

## Firebase Collections

- `users` — employee profiles, roles, TOTP secrets
- `tasks` — task assignments with status, progress, notes, screenshots
- `invitations` — pending/accepted invitations with tokens
- `notifications` — in-app notifications per user

## Environment Variables (Vercel)

For email functionality, add these to Vercel:
- `RESEND_API_KEY` — for sending invitation and OTP emails
- `FIREBASE_ADMIN_*` — for server-side user operations

## Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

The `vercel.json` handles routing for both API routes and static files.
