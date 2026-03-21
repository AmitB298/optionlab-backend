'use strict';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_NAME       = process.env.APP_NAME  || 'OptionLab';
const APP_URL        = process.env.APP_URL   || 'https://optionslab.in';

/**
 * Send an email via Resend HTTP API (port 443 — works on Railway)
 */
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY env var is not set');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `${APP_NAME} <onboarding@resend.dev>`,
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }

  return await res.json();
}

/**
 * Send magic link verification email
 */
async function sendMagicLink({ to, magicLink, expiresInMinutes = 15 }) {
  const subject = `Verify your ${APP_NAME} account`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;border:1px solid #222;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#ff6b00,#ff8c00);padding:32px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                OL <span style="color:#fff;">OptionLab</span>
              </div>
              <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">
                Trade with Institutional Intelligence
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 12px;">
                Verify your email address
              </h1>
              <p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 28px;">
                Click the button below to verify your email and complete your ${APP_NAME} registration.
                This link expires in <strong style="color:#ff6b00;">${expiresInMinutes} minutes</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${magicLink}"
                       style="display:inline-block;background:linear-gradient(135deg,#ff6b00,#ff8c00);
                              color:#fff;text-decoration:none;font-size:16px;font-weight:700;
                              padding:16px 40px;border-radius:8px;letter-spacing:0.3px;">
                      ✓ Verify my email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#666;font-size:13px;line-height:1.5;margin:0 0 8px;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin:0 0 28px;">
                <a href="${magicLink}" style="color:#ff6b00;font-size:12px;word-break:break-all;">
                  ${magicLink}
                </a>
              </p>

              <div style="border-top:1px solid #222;padding-top:24px;">
                <p style="color:#555;font-size:12px;margin:0;">
                  If you didn't create an ${APP_NAME} account, ignore this email.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d0d;padding:20px 32px;text-align:center;">
              <p style="color:#444;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} ${APP_NAME} · 
                <a href="${APP_URL}" style="color:#666;text-decoration:none;">${APP_URL}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({ to, subject, html });
}

module.exports = { sendEmail, sendMagicLink };
