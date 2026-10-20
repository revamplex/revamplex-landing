import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/project-notification.js';

const originalFetch = globalThis.fetch;
const originalWebhook = process.env.ZAPIER_NOTIFICATION_WEBHOOK;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const owner = '11111111-1111-4111-8111-111111111111';
const contractor = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
let scenario, reads, submissions, checks = 0;
const response = () => ({ code: 0, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
async function call(body = {}, options = {}) {
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test-user-session' }, body: { notification_type: 'project_chat_message', project_room_id: roomId, ...body }, ...options }, res);
  return res;
}
async function test(name, run) {
  scenario = {}; reads = []; submissions = [];
  process.env.ZAPIER_NOTIFICATION_WEBHOOK = 'https://hooks.zapier.com/hooks/catch/example/test-only/';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-only-key';
  await run(); checks++; console.log('PASS ' + name);
}

// All requests are mocked. These tests never send a real message or email.
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.hostname === 'hooks.zapier.com') {
    submissions.push(Object.fromEntries(options.body));
    assert.equal(options.redirect, 'error');
    if (scenario.timeout) { const error = new Error('private network details'); error.name = 'TimeoutError'; throw error; }
    return json({}, scenario.upstreamStatus || 200);
  }
  reads.push(url);
  if (url.pathname.startsWith('/auth/v1/admin/users/')) {
    const id = url.pathname.split('/').at(-1);
    assert.equal(options.headers.Authorization, 'Bearer test-server-only-key');
    assert.equal(options.headers.apikey, 'test-server-only-key');
    assert.equal(options.redirect, 'error');
    return json({ id: scenario.wrongPartner ? owner : id, email: scenario.noContact ? '' : id === contractor ? 'contractor@example.com' : 'owner@example.com', email_confirmed_at: scenario.unverified ? null : '2026-01-01T00:00:00Z' });
  }
  assert.equal(options.headers.Authorization, 'Bearer test-user-session');
  assert.equal(options.headers.apikey, globalThis.REVAMP_CONFIG.key);
  assert.equal(options.headers['Accept-Profile'], 'public');
  if (url.pathname === '/auth/v1/user') return json({ id: scenario.user || owner, email: scenario.user === contractor ? 'contractor@example.com' : 'owner@example.com' }, scenario.authStatus || 200);
  if (url.pathname === '/rest/v1/project_rooms') return json([{ id: roomId, job_id: 42, homeowner_id: owner, contractor_id: contractor }]);
  if (url.pathname === '/rest/v1/jobs') return json([{ id: 42, user_id: scenario.jobOwner || owner, title: 'Kitchen remodel', customer_email: 'owner@example.com' }]);
  if (url.pathname === '/rest/v1/profiles') {
    const id = url.searchParams.get('id').slice(3);
    return json(scenario.noContact ? [] : [{ id, email: id === contractor ? 'contractor@example.com' : 'owner@example.com', full_name: id === contractor ? 'Project Contractor' : 'Project Owner' }]);
  }
  if (url.pathname === '/rest/v1/contractors') return json([]);
  throw new Error('Unexpected network request');
};

try {
  await test('Notifications reject unsupported methods and missing sessions before network access', async () => {
    assert.equal((await call({}, { method: 'GET' })).code, 405);
    assert.equal((await call({}, { headers: {} })).code, 401);
    assert.equal(reads.length + submissions.length, 0);
  });
  await test('Notifications reject invalid rooms, event types, and malformed JSON', async () => {
    assert.equal((await call({ project_room_id: 'id&other=room' })).code, 400);
    assert.equal((await call({ notification_type: 'test_notification' })).code, 400);
    assert.equal((await call({}, { body: '{' })).code, 400);
    assert.equal(reads.length + submissions.length, 0);
  });
  await test('Sessions are verified with Supabase Auth', async () => {
    scenario.authStatus = 401;
    assert.equal((await call()).code, 401);
    assert.equal(reads.length, 1); assert.equal(submissions.length, 0);
  });
  await test('A signed-in nonparticipant cannot notify a room', async () => {
    scenario.user = '44444444-4444-4444-8444-444444444444';
    assert.equal((await call()).code, 403); assert.equal(submissions.length, 0);
  });
  await test('Room and job ownership mismatches are rejected', async () => {
    assert.equal((await call({ job_id: 99 })).code, 403);
    scenario.jobOwner = contractor;
    assert.equal((await call()).code, 403); assert.equal(submissions.length, 0);
  });
  await test('Recipient comes from Auth; sender and links come from verified project data', async () => {
    const res = await call({ recipient_email: 'unrelated@example.com', sender_role: 'contractor', extra: { recipient_email: 'unrelated@example.com', subject: 'Fake subject', project_room_url: 'https://example.com', chat_sender_role: 'contractor', chat_message: 'Can we meet Tuesday?' } });
    assert.equal(res.code, 200); assert.deepEqual(res.body, { ok: true });
    const sent = submissions[0];
    assert.equal(sent.recipient_email, 'contractor@example.com'); assert.equal(sent.sender_role, 'homeowner');
    assert.equal(sent.chat_sender_role, 'homeowner'); assert.equal(sent.chat_message, 'Can we meet Tuesday?');
    assert.match(sent.subject, /Kitchen remodel/);
    assert.equal(new URL(sent.project_room_url).origin, 'https://revamplex.com');
    assert.equal(new URL(sent.project_room_url).searchParams.get('mode'), 'contractor');
    assert.ok(!JSON.stringify(sent).includes('unrelated@example.com'));
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });
  await test('Contractor notifications target the homeowner and preserve invitation fields', async () => {
    scenario.user = contractor;
    const res = await call({ notification_type: 'homeowner_project_room_invite' });
    assert.equal(res.code, 200); assert.equal(submissions[0].recipient_email, 'owner@example.com');
    assert.equal(submissions[0].invite_type, 'homeowner_project_room_invite');
    assert.equal(new URL(submissions[0].project_room_url).searchParams.get('mode'), 'homeowner');
    assert.equal((await call({ notification_type: 'contractor_project_room_invite' })).code, 400);
    assert.equal(submissions.length, 1);
  });
  await test('Missing saved partner contact information cannot report success', async () => {
    scenario.noContact = true;
    assert.equal((await call()).code, 422); assert.equal(submissions.length, 0);
  });
  await test('Partner identity mismatches and unverified account email cannot receive notifications', async () => {
    scenario.wrongPartner = true;
    assert.equal((await call()).code, 422);
    scenario.wrongPartner = false; scenario.unverified = true;
    assert.equal((await call()).code, 422); assert.equal(submissions.length, 0);
  });
  await test('Missing server Auth credential cannot fall back to editable public contact data', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await call()).code, 503); assert.equal(submissions.length, 0);
    assert.ok(!reads.some(url => url.pathname.startsWith('/rest/v1/profiles') || url.pathname.startsWith('/rest/v1/contractors')));
  });
  await test('Missing or unsafe server webhook configuration cannot send requests', async () => {
    delete process.env.ZAPIER_NOTIFICATION_WEBHOOK;
    assert.equal((await call()).code, 503);
    process.env.ZAPIER_NOTIFICATION_WEBHOOK = 'https://example.com/hooks/catch/example/test/';
    assert.equal((await call()).code, 503); assert.equal(submissions.length, 0);
  });
  await test('Upstream rejection and timeouts cannot appear as submitted notifications', async () => {
    scenario.upstreamStatus = 500;
    assert.equal((await call()).code, 502);
    scenario.timeout = true;
    const res = await call(); assert.equal(res.code, 504); assert.ok(!JSON.stringify(res.body).includes('private network details'));
  });
  await test('Browser source contains no direct notification webhook or false no-cors submission', async () => {
    const page = fs.readFileSync('project-room.html', 'utf8');
    assert.ok(!page.includes('hooks.zapier.com'));
    const start = page.indexOf('async function sendRevampZapierNotification');
    const notification = page.slice(start, page.indexOf('function getWorkspaceRole()', start));
    assert.ok(!notification.includes('no-cors')); assert.match(notification, /!response\.ok/);
  });
} finally {
  globalThis.fetch = originalFetch;
  if (originalWebhook === undefined) delete process.env.ZAPIER_NOTIFICATION_WEBHOOK;
  else process.env.ZAPIER_NOTIFICATION_WEBHOOK = originalWebhook;
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
}
console.log(checks + ' notification checks passed; no real notifications sent.');
