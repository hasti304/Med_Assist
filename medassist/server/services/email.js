const { sendEmail } = require('./emailService');

const BRAND = '#0d9488';

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:${BRAND};padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">MedAssist AI</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Appointment Notification</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${title}</h2>
          ${body}
          <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">MedAssist AI</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function formatDateTime(iso) {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function row(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;font-size:13px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:600;">${value || '—'}</td>
  </tr>`;
}

async function sendAppointmentEmail({ to, subject, title, body }) {
  return sendEmail({ to, subject, html: wrapHtml(title, body) });
}

async function sendAppointmentRequestEmail({
  doctorEmail, doctorName, patientName, requestedAt, reason,
  listedDoctorName, listedSpecialization,
}) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const intro = listedDoctorName
    ? `<strong>${patientName}</strong> booked an appointment via <strong>Find a Doctor</strong> with <strong>${listedDoctorName}</strong>${listedSpecialization ? ` (${listedSpecialization})` : ''}. Please review and approve or decline in your dashboard.`
    : `<strong>${patientName}</strong> requested an appointment with you.`;
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      ${intro}
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${listedDoctorName ? row('Booked with', listedDoctorName) : ''}
      ${listedSpecialization ? row('Specialty', listedSpecialization) : ''}
      ${row('Requested time', formatDateTime(requestedAt))}
      ${reason ? row('Reason', reason) : ''}
      ${row('Status', '<span style="color:#d97706;font-weight:700;">Pending your review</span>')}
    </table>
    <p style="margin:20px 0 0;">
      <a href="${clientUrl}/doctor/dashboard" style="display:inline-block;padding:12px 24px;background:${BRAND};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review in Doctor Dashboard</a>
    </p>`;

  return sendAppointmentEmail({
    to: doctorEmail,
    subject: `New appointment request — ${patientName}`,
    title: 'New Appointment Request',
    body,
  });
}

async function sendApprovalEmail({ patientEmail, patientName, doctorName, scheduledAt }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your appointment has been <strong style="color:#16a34a;">approved</strong> by Dr. ${doctorName}.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${row('Date &amp; Time', formatDateTime(scheduledAt))}
      ${row('Status', '<span style="color:#16a34a;font-weight:700;">Confirmed</span>')}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Please arrive 10 minutes early. Contact your doctor if you need to make changes.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Confirmed — Dr. ${doctorName}`,
    title: 'Your Appointment is Confirmed',
    body,
  });
}

async function sendDeclineEmail({ patientEmail, patientName, doctorName, doctorNotes }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Dr. ${doctorName} was unable to accept your appointment request.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${doctorNotes ? row('Reason', doctorNotes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Please try booking with another doctor or at a different time.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Request Declined — Dr. ${doctorName}`,
    title: 'Appointment Not Available',
    body,
  });
}

async function sendRescheduleEmail({ patientEmail, patientName, doctorName, newScheduledAt, doctorNotes }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Dr. ${doctorName} has <strong style="color:#d97706;">rescheduled</strong> your appointment.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${row('New Date &amp; Time', formatDateTime(newScheduledAt))}
      ${doctorNotes ? row('Doctor\'s Note', doctorNotes) : ''}
    </table>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Rescheduled — Dr. ${doctorName}`,
    title: 'Appointment Time Updated',
    body,
  });
}

async function sendCancellationEmail({
  patientEmail, patientName, doctorName, scheduledAt, doctorNotes, cancelledBy,
}) {
  const byDoctor = cancelledBy === 'doctor';
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your appointment with Dr. ${doctorName} has been <strong style="color:#dc2626;">cancelled</strong>
      ${byDoctor ? 'by the doctor' : 'as requested'}.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${scheduledAt ? row('Was Scheduled', formatDateTime(scheduledAt)) : ''}
      ${doctorNotes ? row('Reason', doctorNotes) : ''}
    </table>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Cancelled — Dr. ${doctorName}`,
    title: 'Appointment Cancelled',
    body,
  });
}

module.exports = {
  sendAppointmentRequestEmail,
  sendApprovalEmail,
  sendDeclineEmail,
  sendRescheduleEmail,
  sendCancellationEmail,
};
