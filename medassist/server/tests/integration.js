/**
 * MedAssist AI — Integration Test Suite
 * Day 13: End-to-End Integration Testing
 *
 * Run: node tests/integration.js
 * Prerequisites: server must be running on port 5000
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = 'http://localhost:5000/api';
const TIMEOUT = 30000; // 30s — agents can be slow

// ── Test state (tokens + IDs shared across tests) ────────────────────────────
let patientToken = null;
let doctorToken  = null;
let sessionId    = null;
let reportId     = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors = [];

function log(msg) { process.stdout.write(msg + '\n'); }
function ok(name)  { passed++; log(`  ✅ ${name}`); }
function fail(name, reason) {
  failed++;
  errors.push({ name, reason });
  log(`  ❌ ${name}\n     → ${reason}`);
}

async function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request({
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timed out')));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ── Test groups ───────────────────────────────────────────────────────────────
async function testServerHealth() {
  log('\n── Server Health ──────────────────────────────────────────');
  try {
    const r = await request('GET', '/auth/login', null, null);
    // 404 or 405 = server is up, just wrong method
    assert(r.status !== 0, 'Server not reachable');
    ok('Server is running on port 5000');
  } catch (e) {
    fail('Server is running on port 5000', e.message + ' — start server first');
  }
}

async function testAuth() {
  log('\n── Authentication ─────────────────────────────────────────');
  const suffix = Date.now();

  // Register patient
  try {
    const r = await request('POST', '/auth/register', {
      fullName: `Test Patient ${suffix}`,
      email: `patient${suffix}@test.com`,
      password: 'test1234',
      role: 'patient',
    });
    assert(r.status === 201 || r.status === 200, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.token, 'No token in register response');
    patientToken = r.body.token;
    ok('Patient registration');
  } catch (e) { fail('Patient registration', e.message); }

  // Register doctor
  try {
    const r = await request('POST', '/auth/register', {
      fullName: `Test Doctor ${suffix}`,
      email: `doctor${suffix}@test.com`,
      password: 'test1234',
      role: 'doctor',
    });
    assert(r.status === 201 || r.status === 200, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.token, 'No token in register response');
    doctorToken = r.body.token;
    ok('Doctor registration');
  } catch (e) { fail('Doctor registration', e.message); }

  // Login with wrong password
  try {
    const r = await request('POST', '/auth/login', {
      email: `patient${suffix}@test.com`,
      password: 'wrongpass',
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    ok('Login rejects wrong password (401)');
  } catch (e) { fail('Login rejects wrong password', e.message); }

  // Login with correct password
  try {
    const r = await request('POST', '/auth/login', {
      email: `patient${suffix}@test.com`,
      password: 'test1234',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.token, 'No token in login response');
    ok('Patient login returns JWT');
  } catch (e) { fail('Patient login returns JWT', e.message); }

  // Protected route without token
  try {
    const r = await request('GET', '/patient/profile', null, null);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    ok('Protected route rejects missing token (401)');
  } catch (e) { fail('Protected route rejects missing token', e.message); }

  // Role enforcement — patient trying doctor route
  try {
    const r = await request('GET', '/doctor-assist/profile', null, patientToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
    ok('Role enforcement — patient blocked from doctor route (403)');
  } catch (e) { fail('Role enforcement — patient blocked from doctor route', e.message); }
}

async function testPatientProfile() {
  log('\n── Patient Profile ────────────────────────────────────────');
  if (!patientToken) { fail('Patient profile suite', 'No patient token — auth tests failed'); return; }

  // GET profile (new user — should return null or 404)
  try {
    const r = await request('GET', '/patient/profile', null, patientToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    ok('GET /patient/profile returns 200');
  } catch (e) { fail('GET /patient/profile', e.message); }

  // PUT profile
  try {
    const r = await request('PUT', '/patient/profile', {
      age: 35, gender: 'male',
      weightKg: 75, heightCm: 178,
      bloodGroup: 'O+',
      existingConditions: ['Diabetes', 'Hypertension'],
      allergies: ['Penicillin'],
      currentMedications: ['Metformin'],
      smokingStatus: 'never', alcoholUse: 'occasional',
    }, patientToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    ok('PUT /patient/profile saves successfully');
  } catch (e) { fail('PUT /patient/profile', e.message); }

  // GET profile again — verify saved values
  try {
    const r = await request('GET', '/patient/profile', null, patientToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.profile?.age === 35, `Expected age 35, got ${r.body.profile?.age}`);
    assert(r.body.profile?.gender === 'male', 'Gender not saved');
    ok('GET /patient/profile returns saved values');
  } catch (e) { fail('GET /patient/profile returns saved values', e.message); }
}

async function testDiagnosticAgent() {
  log('\n── Diagnostic Agent ───────────────────────────────────────');
  if (!patientToken) { fail('Diagnostic agent suite', 'No patient token'); return; }

  log('  ⏳ Running Diagnostic Agent (may take 20-40s)...');
  try {
    const r = await request('POST', '/disease/predict', {
      symptoms: [
        { name: 'Fatigue', severity: 7, duration: '14', onset: 'gradual' },
        { name: 'Increased Thirst', severity: 8, duration: '21', onset: 'gradual' },
        { name: 'Frequent Urination', severity: 7, duration: '21', onset: 'gradual' },
        { name: 'Blurred Vision', severity: 5, duration: '7', onset: 'gradual' },
        { name: 'Weight Loss', severity: 4, duration: '30', onset: 'gradual' },
      ],
    }, patientToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.diseases), `diseases not an array: ${JSON.stringify(r.body)}`);
    assert(r.body.diseases.length > 0, 'No diseases returned');
    assert(r.body.sessionId, 'No sessionId in response');

    sessionId = r.body.sessionId;
    const d = r.body.diseases[0];

    assert(d.disease, 'First disease missing name');
    assert(d.icd_code, 'First disease missing icd_code');
    assert(typeof d.probability === 'number', 'probability not a number');

    ok(`Diagnostic Agent returned ${r.body.diseases.length} diseases (top: ${d.disease} — ${d.icd_code})`);
    ok(`Agent completed in ${r.body.turns} reasoning turn(s)`);
  } catch (e) { fail('Diagnostic Agent /disease/predict', e.message); }
}

async function testBloodTests() {
  log('\n── Blood Test Recommendations ─────────────────────────────');
  if (!patientToken || !sessionId) { fail('Blood tests suite', 'No sessionId — diagnostic test failed'); return; }

  try {
    const r = await request('POST', '/disease/tests', {
      sessionId,
      disease: { disease: 'Type 2 Diabetes Mellitus', icd_code: 'E11', probability: 85 },
    }, patientToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.tests), 'tests not an array');
    assert(r.body.tests.length > 0, 'No tests returned');

    const t = r.body.tests[0];
    assert(t.test_name, 'Test missing test_name');
    assert(t.urgency, 'Test missing urgency');
    ok(`Blood tests: ${r.body.tests.length} tests returned`);

    const urgencies = [...new Set(r.body.tests.map(t => t.urgency))];
    ok(`Urgency levels present: ${urgencies.join(', ')}`);
  } catch (e) { fail('Blood test recommendations /disease/tests', e.message); }
}

async function testPatientSessions() {
  log('\n── Patient Sessions ───────────────────────────────────────');
  if (!patientToken) { fail('Patient sessions suite', 'No patient token'); return; }

  try {
    const r = await request('GET', '/patient/sessions', null, patientToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body.sessions), 'sessions not an array');
    assert(r.body.sessions.length > 0, 'No sessions found — diagnostic agent may not have saved to DB');
    ok(`Patient sessions: ${r.body.sessions.length} session(s) in DB`);
  } catch (e) { fail('GET /patient/sessions', e.message); }
}

async function testDoctorProfile() {
  log('\n── Doctor Profile ─────────────────────────────────────────');
  if (!doctorToken) { fail('Doctor profile suite', 'No doctor token'); return; }

  try {
    const r = await request('PUT', '/doctor-assist/profile', {
      specialization: 'General Physician',
      hospital_name: 'Test Medical Center',
      city: 'Phoenix', state: 'AZ', phone: '(602) 555-0100',
    }, doctorToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    ok('PUT /doctor-assist/profile saves successfully');
  } catch (e) { fail('PUT /doctor-assist/profile', e.message); }

  try {
    const r = await request('GET', '/doctor-assist/profile', null, doctorToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    ok('GET /doctor-assist/profile returns 200');
  } catch (e) { fail('GET /doctor-assist/profile', e.message); }
}

async function testDoctorAssistAgent() {
  log('\n── Doctor Assist Agent ────────────────────────────────────');
  if (!doctorToken) { fail('Doctor assist suite', 'No doctor token'); return; }

  log('  ⏳ Running Doctor Assist Agent (may take 20-40s)...');
  try {
    const r = await request('POST', '/doctor-assist/suggest-tests', {
      patientCase: {
        age: 52, gender: 'male', weight: 88, height: 175,
        chiefComplaint: 'Chest pain and shortness of breath for 3 days',
        symptoms: 'Chest pain, shortness of breath, fatigue, leg swelling',
        duration: '3 days',
        knownConditions: 'Hypertension on lisinopril, smoker for 20 years',
      },
      existingTests: ['CBC (Complete Blood Count)', 'BMP (Basic Metabolic Panel)'],
    }, doctorToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.sessionId, 'No sessionId in response');

    if (r.body.allCovered) {
      ok('Doctor Assist Agent: all tests covered (allCovered=true)');
    } else {
      assert(Array.isArray(r.body.suggestions), 'suggestions not an array');
      ok(`Doctor Assist Agent: ${r.body.suggestions.length} missing test(s) found`);
      if (r.body.suggestions.length > 0) {
        const s = r.body.suggestions[0];
        assert(s.test_name, 'Suggestion missing test_name');
        assert(s.urgency, 'Suggestion missing urgency');
        ok(`Sample suggestion: ${s.test_name} (${s.urgency})`);
      }
    }
    ok(`Agent completed in ${r.body.turns} reasoning turn(s)`);
  } catch (e) { fail('Doctor Assist Agent /suggest-tests', e.message); }
}

async function testDoctorSessions() {
  log('\n── Doctor Sessions ────────────────────────────────────────');
  if (!doctorToken) { fail('Doctor sessions suite', 'No doctor token'); return; }

  try {
    const r = await request('GET', '/doctor-assist/sessions', null, doctorToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body.sessions), 'sessions not an array');
    assert(r.body.sessions.length > 0, 'No sessions found — doctor assist agent may not have saved to DB');
    ok(`Doctor sessions: ${r.body.sessions.length} session(s) in DB`);
  } catch (e) { fail('GET /doctor-assist/sessions', e.message); }
}

async function testAgentLogs() {
  log('\n── Agent Logs ─────────────────────────────────────────────');
  if (!sessionId) { fail('Agent logs suite', 'No sessionId'); return; }

  try {
    const r = await request('GET', `/agent/logs/${sessionId}`, null, null);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body.logs), 'logs not an array');
    assert(r.body.logs.length > 0, 'No agent logs found for diagnostic session');
    const log0 = r.body.logs[0];
    assert(log0.agent_name, 'Log missing agent_name');
    ok(`Agent logs: ${r.body.logs.length} log entry(ies) for session`);
    ok(`Agent name: ${log0.agent_name}, turns: ${log0.total_turns}`);
  } catch (e) { fail('GET /agent/logs/:sessionId', e.message); }
}

async function testNearbyDoctors() {
  log('\n── Nearby Doctors API ─────────────────────────────────────');

  // Missing lat/lng
  try {
    const r = await request('GET', '/doctors/nearby', null, null);
    assert(r.status === 400, `Expected 400 for missing lat/lng, got ${r.status}`);
    ok('GET /doctors/nearby returns 400 when lat/lng missing');
  } catch (e) { fail('GET /doctors/nearby missing params', e.message); }

  // With coords (Phoenix, AZ)
  try {
    const r = await request('GET', '/doctors/nearby?lat=33.45&lng=-112.07&radius=5000&source=db', null, null);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.doctors), 'doctors not an array');
    ok(`GET /doctors/nearby: ${r.body.doctors.length} doctor(s) returned (source: ${r.body.source})`);
  } catch (e) { fail('GET /doctors/nearby with coords', e.message); }
}

async function testEdgeCases() {
  log('\n── Edge Cases & Validation ────────────────────────────────');

  // Register with missing fields
  try {
    const r = await request('POST', '/auth/register', { email: 'bad@test.com' });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    ok('Register with missing fields returns 400');
  } catch (e) { fail('Register missing fields validation', e.message); }

  // Predict without symptoms
  if (patientToken) {
    try {
      const r = await request('POST', '/disease/predict', { symptoms: [] }, patientToken);
      assert(r.status === 400, `Expected 400 for empty symptoms, got ${r.status}`);
      ok('Predict with empty symptoms returns 400');
    } catch (e) { fail('Predict empty symptoms validation', e.message); }
  }

  // Analyze non-existent report
  if (patientToken) {
    try {
      const r = await request('POST', '/blood-report/analyze', { reportId: '00000000-0000-0000-0000-000000000000' }, patientToken);
      assert(r.status === 404, `Expected 404, got ${r.status}`);
      ok('Analyze non-existent reportId returns 404');
    } catch (e) { fail('Analyze non-existent report', e.message); }
  }

  // Doctor assist without required fields
  if (doctorToken) {
    try {
      const r = await request('POST', '/doctor-assist/suggest-tests', {
        patientCase: { age: 30 }, // missing chiefComplaint & symptoms
      }, doctorToken);
      assert(r.status === 400, `Expected 400, got ${r.status}`);
      ok('Doctor assist missing required fields returns 400');
    } catch (e) { fail('Doctor assist missing fields validation', e.message); }
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function main() {
  log('');
  log('╔══════════════════════════════════════════════════════════╗');
  log('║     MedAssist AI — Integration Test Suite (Day 13)      ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log(`  Base URL : ${BASE}`);
  log(`  Timeout  : ${TIMEOUT / 1000}s per request`);
  log(`  Started  : ${new Date().toLocaleTimeString()}`);

  try {
    await testServerHealth();
    await testAuth();
    await testPatientProfile();
    await testDiagnosticAgent();
    await testBloodTests();
    await testPatientSessions();
    await testDoctorProfile();
    await testDoctorAssistAgent();
    await testDoctorSessions();
    await testAgentLogs();
    await testNearbyDoctors();
    await testEdgeCases();
  } catch (unexpectedErr) {
    log(`\n  💥 Unexpected runner error: ${unexpectedErr.message}`);
  }

  // Summary
  const total = passed + failed;
  log('\n══════════════════════════════════════════════════════════');
  log(`  Results: ${passed}/${total} passed`);
  if (failed > 0) {
    log(`\n  Failed tests:`);
    errors.forEach(e => log(`    ❌ ${e.name}\n       ${e.reason}`));
  }
  log(`\n  Finished: ${new Date().toLocaleTimeString()}`);
  log('══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
