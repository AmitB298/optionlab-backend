'use strict';
const { releasePendingRewards } = require('../services/referral.service');

async function runReferralCron() {
  console.log('[referral-cron] Starting daily reward release...');
  const result = await releasePendingRewards();
  console.log('[referral-cron] Done:', result);
  return result;
}

function startReferralCron() {
  console.log('[referral-cron] Scheduled — runs daily at 2:00 AM');

  function scheduleNext() {
    const now  = new Date();
    const next = new Date();
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const msUntilNext = next - now;
    console.log(`[referral-cron] Next run in ${Math.round(msUntilNext / 60000)} minutes`);

    setTimeout(async () => {
      await runReferralCron();
      scheduleNext();
    }, msUntilNext);
  }

  scheduleNext();
}

module.exports = { startReferralCron, runReferralCron };
