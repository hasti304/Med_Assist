const pool = require('../db/pool');
const { sendFollowUpReminder } = require('./emailService');

async function processReminders() {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.patient_id, r.report_id, r.message,
              u.email, u.full_name
         FROM reminders r
         JOIN users u ON u.id = r.patient_id
        WHERE r.send_at <= NOW() AND r.sent = false
        LIMIT 50`
    );

    if (!rows.length) return;

    console.log(`[reminderService] Processing ${rows.length} reminder(s)`);

    for (const reminder of rows) {
      try {
        await sendFollowUpReminder(reminder.email, reminder.full_name || 'Patient', reminder.message);
        await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
        console.log(`[reminderService] Sent reminder ${reminder.id} to ${reminder.email}`);
      } catch (err) {
        console.error(`[reminderService] Failed to send reminder ${reminder.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[reminderService] processReminders error:', err.message);
  }
}

function startReminderLoop() {
  // Check immediately on startup, then every hour
  processReminders();
  setInterval(processReminders, 60 * 60 * 1000);
  console.log('[reminderService] Reminder loop started (1h interval)');
}

module.exports = { processReminders, startReminderLoop };
