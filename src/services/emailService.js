'use strict';
/**
 * src/services/emailService.js
 *
 * Nodemailer wrapper using Gmail SMTP.
 *
 * Uses env var: GMAIL_PASS (already set in Railway — matches existing setup)
 * Also reads:   GMAIL_USER, APP_NAME, APP_URL
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    throw new Error('GMAIL_USER and GMAIL_PASS environment variables are required');
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,   // App Password already in Railway env
    },
  });

  return _transporter;
}

const APP_NAME = process.env.APP_NAME || 'OptionLab';
const APP_URL  = process.env.APP_URL  || 'https://optionslab.in';

/**
 * sendMagicLinkEmail({ to, magicLink, expiresMinutes })
 */
async function sendMagicLinkEmail({ to, magicLink, expiresMinutes = 15 }) {
  const transporter = getTransporter();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your email — ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#06080d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<span style="display:none;font-size:1px;color:#06080d;max-height:0;overflow:hidden;">
  Click to verify your ${APP_NAME} email and complete registration
</span>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#06080d;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:28px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td style="background:linear-gradient(135deg,#f97316,#c2410c);border-radius:11px;
                    width:42px;height:42px;text-align:center;vertical-align:middle;">
                  <span style="font-family:'Helvetica Neue',sans-serif;font-weight:900;font-size:16px;color:#fff;line-height:42px;">OL</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-family:'Helvetica Neue',sans-serif;font-weight:800;font-size:20px;color:#e8eef8;letter-spacing:-.01em;">
                    Option<span style="color:#f97316;">Lab</span>
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:linear-gradient(155deg,#090d15 0%,#0d1320 100%);
              border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:40px 36px;">

            <!-- Icon -->
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;width:72px;height:72px;border-radius:50%;
                  background:rgba(249,115,22,0.1);border:2px solid rgba(249,115,22,0.3);
                  line-height:72px;text-align:center;font-size:30px;">
                ✉️
              </div>
            </div>

            <!-- Title -->
            <h1 style="font-family:'Helvetica Neue',sans-serif;font-weight:800;font-size:26px;
                color:#ffffff;text-align:center;margin:0 0 10px;letter-spacing:-.03em;">
              Verify your email
            </h1>
            <p style="font-size:15px;color:#586880;text-align:center;margin:0 0 32px;line-height:1.6;">
              Click the button below to verify <strong style="color:#e8eef8;">${to}</strong><br>
              and continue your ${APP_NAME} registration.
            </p>

            <!-- CTA Button -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${magicLink}"
                style="display:inline-block;padding:15px 36px;
                  background:linear-gradient(135deg,#f97316,#c2410c);
                  color:#ffffff;text-decoration:none;border-radius:12px;
                  font-family:'Helvetica Neue',sans-serif;font-weight:800;font-size:16px;
                  letter-spacing:.02em;
                  box-shadow:0 4px 20px rgba(249,115,22,0.4);">
                Verify my email →
              </a>
            </div>

            <!-- Expiry notice -->
            <p style="font-size:13px;color:#4e6278;text-align:center;margin:0 0 28px;">
              This link expires in <strong style="color:#7b8fa8;">${expiresMinutes} minutes</strong>.
            </p>

            <!-- Divider -->
            <div style="height:1px;background:rgba(255,255,255,0.06);margin:0 0 24px;"></div>

            <!-- Fallback link -->
            <p style="font-size:12px;color:#3d5068;text-align:center;margin:0 0 8px;">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="font-size:11px;color:#2a3d52;text-align:center;margin:0;word-break:break-all;">
              ${magicLink}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:24px;text-align:center;">
            <p style="font-size:12px;color:#2a3d52;margin:0 0 6px;">
              If you didn't request this, you can safely ignore this email.
            </p>
            <p style="font-size:12px;color:#2a3d52;margin:0;">
              <a href="${APP_URL}" style="color:#f97316;text-decoration:none;">${APP_NAME}</a>
              &nbsp;·&nbsp; India's NSE Options Analytics Platform
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = `
Verify your email — ${APP_NAME}

Click this link to verify ${to} and complete your registration:
${magicLink}

This link expires in ${expiresMinutes} minutes.

If you didn't request this, ignore this email.

— ${APP_NAME} Team
`;

  const info = await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Verify your email — ${APP_NAME}`,
    text,
    html,
  });

  console.log(`[Email] Sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendMagicLinkEmail };
