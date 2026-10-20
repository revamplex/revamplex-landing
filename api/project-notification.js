import '../assets/service-config.js';

const events = {
  contractor_project_room_invite: ['Project Room invitation', 'You have been invited to a Project Room.'],
  homeowner_project_room_invite: ['Project Room invitation', 'You have been invited to a Project Room.'],
  project_room_accepted: ['Project Room accepted', 'Your project partner accepted the Project Room.'],
  project_chat_message: ['New project message', 'You have a new message in your Project Room.'],
  calendar_appointment_created: ['Project appointment', 'Your project partner added an appointment.'],
  project_signature_saved: ['Project signature saved', 'Your project partner saved a signature.'],
  project_fully_signed: ['Project signatures updated', 'Check the signatures in your Project Room.'],
  project_marked_complete: ['Project completion update', 'Your project partner marked the project complete.'],
  project_fully_completed: ['Project completion updated', 'Check the completion status in your Project Room.'],
  project_review_submitted: ['New project review', 'Your project partner submitted a review.']
};
const text = (value, length = 200) => typeof value === 'string' || typeof value === 'number'
  ? String(value).trim().slice(0, length) : '';
const email = value => {
  const candidate = text(value, 254);
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(candidate) ? candidate : '';
};
const identifier = value => /^[a-zA-Z0-9_-]{1,100}$/.test(String(value ?? ''));
class NotificationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers?.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to send a project notification.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || Array.isArray(body) || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 16000) {
      throw new NotificationError(400, 'Invalid project notification.');
    }
    const type = body.notification_type;
    if (!Object.hasOwn(events, type) || !identifier(body.project_room_id)) {
      throw new NotificationError(400, 'Choose a shared Project Room and a supported notification.');
    }
    const { url, key } = globalThis.REVAMP_CONFIG;
    const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Accept-Profile': 'public' };
    const signal = AbortSignal.timeout(15000);
    const auth = await fetch(`${url}/auth/v1/user`, { headers, signal, redirect: 'error' });
    if (!auth.ok) throw new NotificationError(auth.status >= 500 ? 503 : 401, 'Please sign in again before sending a notification.');
    const user = await auth.json();
    if (!identifier(user.id)) throw new NotificationError(401, 'Please sign in again before sending a notification.');

    // The user's verified JWT is used for every read, so database RLS still applies.
    async function row(table, column, value, optional = false) {
      if (!identifier(value)) return null;
      const query = new URLSearchParams({ select: '*', [column]: `eq.${value}`, limit: '1' });
      const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers, signal, redirect: 'error' });
      if (!response.ok) {
        // Older contractor schemas may not have every identity column.
        if (optional && [400, 403, 404].includes(response.status)) return null;
        throw new NotificationError(502, 'Project details could not be checked. Please try again.');
      }
      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] || null : null;
    }
    const room = await row('project_rooms', 'id', body.project_room_id);
    if (!room || ![room.homeowner_id, room.contractor_id].includes(user.id)) {
      throw new NotificationError(403, 'Only participants can send notifications for this Project Room.');
    }
    if (body.job_id != null && String(body.job_id) !== String(room.job_id)) {
      throw new NotificationError(403, 'The project does not match this Project Room.');
    }
    const job = await row('jobs', 'id', room.job_id);
    if (!job || (job.user_id || job.homeowner_id || job.customer_id) !== room.homeowner_id) {
      throw new NotificationError(403, 'The Project Room owner could not be verified.');
    }
    if (!room.contractor_id || room.contractor_id === room.homeowner_id) {
      throw new NotificationError(422, 'Connect a project partner before sending a notification.');
    }
    const senderRole = user.id === room.homeowner_id ? 'homeowner' : 'contractor';
    const recipientRole = senderRole === 'homeowner' ? 'contractor' : 'homeowner';
    if (type.endsWith('_project_room_invite') && type !== `${recipientRole}_project_room_invite`) {
      throw new NotificationError(400, 'This invitation does not match your project role.');
    }
    const homeowner = await row('profiles', 'id', room.homeowner_id, true) || {};
    const contractorProfile = await row('profiles', 'id', room.contractor_id, true) || {};
    let contractor = {};
    if (!email(contractorProfile.email)) {
      for (const column of ['user_id', 'profile_id', 'auth_id', 'id']) {
        const found = await row('contractors', column, room.contractor_id, true);
        if (found && email(found.email)) { contractor = found; break; }
      }
    }
    const homeownerEmail = email(homeowner.email) || email(job.customer_email) || email(job.homeowner_email) || email(job.email);
    const contractorEmail = email(contractorProfile.email) || email(contractor.email);
    const homeownerName = text(homeowner.full_name || homeowner.name || job.customer_name || job.homeowner_name) || 'Homeowner';
    const contractorName = text(contractorProfile.company_name || contractorProfile.business_name || contractorProfile.company || contractorProfile.full_name || contractorProfile.name || contractor.company || contractor.name) || 'Contractor';
    const recipientEmail = recipientRole === 'contractor' ? contractorEmail : homeownerEmail;
    const recipientName = recipientRole === 'contractor' ? contractorName : homeownerName;
    if (!recipientEmail) throw new NotificationError(422, 'Your project partner needs a saved contact email before notifications can be sent.');

    // No recipient, sender identity, subject, or destination URL is accepted from the browser.
    const link = new URL('https://revamplex.com/project-room.html');
    link.search = new URLSearchParams({ mode: recipientRole, job: String(room.job_id), contractor: room.contractor_id, room: String(room.id) });
    const jobTitle = text(job.title) || 'ReVampLEX project';
    const payload = {
      app: 'RevampLEX', source: 'project-room.html', sent_at: new Date().toISOString(),
      notification_type: type, event_type: type,
      subject: `${events[type][0]}: ${jobTitle}`.replace(/[\r\n]/g, ' '), message: events[type][1],
      sender_role: senderRole, sender_user_id: user.id, sender_email: email(user.email),
      job_id: room.job_id, project_room_id: room.id, contractor_id: room.contractor_id, homeowner_id: room.homeowner_id,
      job_title: jobTitle, trade: text(job.trade), city: text(job.city), budget: text(job.budget),
      homeowner_email: homeownerEmail, homeowner_name: homeownerName, contractor_email: contractorEmail, contractor_name: contractorName,
      recipient_email: recipientEmail, recipient_name: recipientName, other_party_email: recipientEmail, other_party_name: recipientName,
      project_room_url: link.href
    };
    const extra = body.extra && typeof body.extra === 'object' && !Array.isArray(body.extra) ? body.extra : {};
    if (type.endsWith('_project_room_invite')) payload.invite_type = type;
    if (type === 'project_chat_message') {
      payload.chat_sender_role = senderRole;
      payload.chat_sender_name = senderRole === 'homeowner' ? homeownerName : contractorName;
      payload.chat_message = text(extra.chat_message, 1800);
    }
    if (type === 'calendar_appointment_created') {
      for (const field of ['appointment_date', 'appointment_time', 'appointment_type', 'appointment_note']) payload[field] = text(extra[field], field === 'appointment_note' ? 1200 : 100);
    }
    if (type === 'project_signature_saved') {
      payload.signed_role = senderRole;
      payload.signed_name = senderRole === 'homeowner' ? homeownerName : contractorName;
      payload.signed_at = text(extra.signed_at, 50);
    }
    if (type === 'project_marked_complete') payload.completed_role = senderRole;
    if (type === 'project_review_submitted') {
      const rating = Number(extra.rating);
      payload.rating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : '';
      payload.review_comment = text(extra.review_comment, 1200);
    }
    let webhook;
    try { webhook = new URL(process.env.ZAPIER_NOTIFICATION_WEBHOOK || ''); } catch { /* Handled below. */ }
    if (!webhook || webhook.protocol !== 'https:' || webhook.hostname !== 'hooks.zapier.com' || !/^\/hooks\/catch\/[^/]+\/[^/]+\/?$/.test(webhook.pathname) || webhook.username || webhook.password || webhook.search || webhook.hash || webhook.port) {
      throw new NotificationError(503, 'Project notifications are temporarily unavailable. Your project changes remain saved.');
    }
    const result = await fetch(webhook, {
      method: 'POST', body: new URLSearchParams(Object.entries(payload).map(([name, value]) => [name, String(value ?? '')])),
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!result.ok) throw new NotificationError(502, 'The notification could not be submitted. Please try again.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid project notification.' });
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return res.status(error.status || (timedOut ? 504 : 502)).json({ error: error instanceof NotificationError ? error.message : 'The notification could not be submitted. Please try again.' });
  }
}
