'use strict';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_NAME       = process.env.APP_NAME  || 'OptionsLab';
const APP_URL        = process.env.APP_URL   || 'https://www.optionslab.in';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY env var is not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `${APP_NAME} <noreply@optionslab.in>`,
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

async function sendMagicLink({ to, magicLink, expiresInMinutes = 15 }) {
  const subject = `Verify your ${APP_NAME} account`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your OptionsLab account</title>
</head>
<body style="margin:0;padding:0;background:#050709;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;">Your OptionsLab verification link is ready. Click to activate your account and access institutional-grade NSE analytics.</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050709;min-height:100vh;">
<tr><td align="center" style="padding:48px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <tr><td style="padding:0;line-height:0;">
    <div style="height:2px;background:linear-gradient(90deg,transparent 0%,#f97316 30%,#fb923c 60%,transparent 100%);"></div>
  </td></tr>

  <tr><td style="background:#08090f;border-left:1px solid #1a1d27;border-right:1px solid #1a1d27;padding:40px 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:linear-gradient(135deg,#f97316,#c2410c);border-radius:10px;width:40px;height:40px;text-align:center;vertical-align:middle;">
                <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:900;font-size:14px;color:#fff;letter-spacing:-0.5px;">OL</span>
              </td>
              <td style="padding-left:12px;vertical-align:middle;">
                <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:800;font-size:20px;color:#f0f5ff;letter-spacing:-0.5px;">Options<span style="color:#f97316;">Lab</span></span>
              </td>
            </tr>
          </table>
        </td>
        <td align="right" style="vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#0f1a0f;border:1px solid #1a3a1a;border-radius:20px;padding:5px 12px;">
                <table cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="width:6px;height:6px;background:#10b981;border-radius:50%;vertical-align:middle;"></td>
                  <td style="padding-left:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#10b981;letter-spacing:0.08em;text-transform:uppercase;vertical-align:middle;">NSE LIVE</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#1a1d27;margin:28px 0;"></div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#374151;letter-spacing:0.05em;">
          <span style="color:#4b5563;">NIFTY</span><span style="color:#10b981;font-weight:700;margin-left:6px;">22,513</span><span style="color:#10b981;font-size:10px;margin-left:3px;">+0.63%</span>
          &nbsp;&nbsp;<span style="color:#4b5563;">BANKNIFTY</span><span style="color:#10b981;font-weight:700;margin-left:6px;">48,240</span><span style="color:#10b981;font-size:10px;margin-left:3px;">+0.65%</span>
          &nbsp;&nbsp;<span style="color:#4b5563;">VIX</span><span style="color:#ef4444;font-weight:700;margin-left:6px;">14.23</span><span style="color:#ef4444;font-size:10px;margin-left:3px;">-2.87%</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="background:linear-gradient(180deg,#08090f 0%,#0a0c14 100%);border-left:1px solid #1a1d27;border-right:1px solid #1a1d27;padding:0 48px 48px;">
    <div style="padding-top:48px;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#f97316;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:16px;">◈ &nbsp;Account Verification</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:36px;font-weight:900;color:#f0f5ff;line-height:1.05;letter-spacing:-1.5px;">
        One click to<br><span style="color:#f97316;">institutional</span><br>intelligence.
      </div>
    </div>
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#6b7fa0;line-height:1.7;margin:20px 0 36px;">
      Your OptionsLab account is ready. Verify your email to unlock real-time Greeks, FII flow analysis, Smart Money signals, and live Angel One integration.
    </div>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
      <tr>
        <td style="padding-right:8px;"><div style="background:#0d1117;border:1px solid #1e2433;border-radius:6px;padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:11px;color:#7b8fa8;white-space:nowrap;">⚡ Live Signals</div></td>
        <td style="padding-right:8px;"><div style="background:#0d1117;border:1px solid #1e2433;border-radius:6px;padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:11px;color:#7b8fa8;white-space:nowrap;">δ Full Greeks</div></td>
        <td style="padding-right:8px;"><div style="background:#0d1117;border:1px solid #1e2433;border-radius:6px;padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:11px;color:#7b8fa8;white-space:nowrap;">🎯 Smart Money</div></td>
        <td><div style="background:#0d1117;border:1px solid #1e2433;border-radius:6px;padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:11px;color:#7b8fa8;white-space:nowrap;">🔗 Angel One</div></td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
      <tr>
        <td align="center">
          <a href="${magicLink}" style="display:block;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#fff;text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.02em;padding:18px 48px;border-radius:12px;text-align:center;">
            ✓ &nbsp;Verify my email &amp; activate account
          </a>
        </td>
      </tr>
    </table>
    <div style="margin-top:20px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:12px;color:#374151;letter-spacing:0.05em;">
      Link expires in <span style="color:#f97316;font-weight:700;">${expiresInMinutes} minutes</span> &nbsp;·&nbsp; Single use only
    </div>
  </td></tr>

  <tr><td style="background:#060810;border-left:1px solid #1a1d27;border-right:1px solid #1a1d27;border-top:1px solid #1a1d27;padding:28px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="48%" style="vertical-align:top;padding-right:16px;">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;color:#374151;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px;">What's included</div>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding-bottom:10px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#10b981;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">▸</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">Real-time OI &amp; Greeks — every 2s</td>
            </tr></table></td></tr>
            <tr><td style="padding-bottom:10px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#10b981;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">▸</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">FII/DII flow &amp; institutional footprint</td>
            </tr></table></td></tr>
            <tr><td><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#10b981;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">▸</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">Angel One SmartAPI live feed</td>
            </tr></table></td></tr>
          </table>
        </td>
        <td width="4%" style="border-left:1px solid #1a1d27;"></td>
        <td width="48%" style="vertical-align:top;padding-left:16px;">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;color:#374151;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px;">Security</div>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding-bottom:10px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#f97316;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">◈</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">Single-use encrypted token</td>
            </tr></table></td></tr>
            <tr><td style="padding-bottom:10px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#f97316;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">◈</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">Expires in ${expiresInMinutes} min automatically</td>
            </tr></table></td></tr>
            <tr><td><table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#f97316;font-size:12px;vertical-align:top;padding-right:8px;padding-top:1px;">◈</td>
              <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7fa0;line-height:1.4;">Your data is never shared publicly</td>
            </tr></table></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="background:#050709;border-left:1px solid #1a1d27;border-right:1px solid #1a1d27;border-top:1px solid #111420;padding:20px 48px;">
    <div style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#2d3748;margin-bottom:6px;">If button doesn't work, paste this in your browser:</div>
    <div style="font-family:'Courier New',Courier,monospace;font-size:11px;word-break:break-all;">
      <a href="${magicLink}" style="color:#374151;text-decoration:none;">${magicLink}</a>
    </div>
  </td></tr>

  <tr><td style="background:#050709;border:1px solid #1a1d27;border-top:1px solid #111420;padding:24px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#1f2937;line-height:1.6;">
          <span style="color:#374151;font-weight:700;">OptionsLab</span> — Trade with Institutional Intelligence<br>
          © ${new Date().getFullYear()} OptionsLab &nbsp;·&nbsp;
          <a href="${APP_URL}" style="color:#374151;text-decoration:none;">${APP_URL}</a>
          &nbsp;·&nbsp; If you didn't request this, ignore this email.
        </td>
        <td align="right" style="vertical-align:top;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#1f2937;letter-spacing:0.08em;">NSE · OPTIONS · ANALYTICS</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:0;line-height:0;">
    <div style="height:2px;background:linear-gradient(90deg,transparent 0%,#1a1d27 50%,transparent 100%);"></div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return sendEmail({ to, subject, html });
}

module.exports = { sendEmail, sendMagicLink };
