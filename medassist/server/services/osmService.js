const fetch = require('node-fetch');
const { sortByDistance } = require('./locationService');

const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

// OSM API policy requires identifying the app; some mirrors reject requests without it
const USER_AGENT = 'MedAssist/1.0 (health informatics demo; https://medassist.ai)';

// Per-mirror timeout — all three race in parallel, so worst-case is one timeout, not three
const MIRROR_TIMEOUT_MS = 14000;

// Circuit breaker: after all mirrors fail, skip Overpass for this many ms
const CIRCUIT_RESET_MS = 10 * 60 * 1000; // 10 minutes
let circuitOpenUntil = 0;

// In-memory cache: long TTL so a single successful call serves many subsequent requests
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(lat, lng, radiusMeters) {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusMeters}`;
}

function buildQuery(lat, lng, radiusMeters) {
  return `
[out:json][timeout:12];
(
  node["amenity"~"^(doctors|clinic|hospital|pharmacy|dentist|physiotherapist|optometrist|laboratory|blood_bank)$"](around:${radiusMeters},${lat},${lng});
  node["healthcare"~"^(doctor|clinic|hospital|pharmacy|dentist|physiotherapist|optometrist|laboratory|blood_bank|centre|yes)$"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"^(clinic|hospital|pharmacy)$"](around:${radiusMeters},${lat},${lng});
  way["healthcare"~"^(clinic|hospital|centre)$"](around:${radiusMeters},${lat},${lng});
);
out center body;
`;
}

/**
 * Fetch one Overpass mirror. Resolves with parsed JSON or rejects on any failure.
 * Aborted immediately if clientSignal fires.
 */
async function fetchMirror(url, body, clientSignal) {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), MIRROR_TIMEOUT_MS);

  const onClientAbort = () => timeoutCtrl.abort();
  clientSignal?.addEventListener('abort', onClientAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body,
      signal: timeoutCtrl.signal,
    });

    clearTimeout(timer);
    clientSignal?.removeEventListener('abort', onClientAbort);

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} from ${url}`);
      console.warn(`[osmService] mirror failed (${url}): ${res.status}`);
      throw err;
    }

    const json = await res.json();
    console.log(`[osmService] mirror succeeded: ${url}`);
    return json;
  } catch (err) {
    clearTimeout(timer);
    clientSignal?.removeEventListener('abort', onClientAbort);

    if (clientSignal?.aborted) throw new Error('Client disconnected');

    const label = err.name === 'AbortError' ? 'timed out' : err.message;
    if (err.name === 'AbortError') console.warn(`[osmService] mirror failed (${url}): timed out`);
    throw err;
  }
}

/**
 * Race all mirrors in parallel — whichever answers first wins.
 * Promise.any rejects only when every mirror fails (AggregateError).
 */
async function fetchFromOverpass(query, clientSignal) {
  if (clientSignal?.aborted) throw new Error('Client disconnected');

  // Circuit breaker: if mirrors were all down recently, fail fast
  if (Date.now() < circuitOpenUntil) {
    const secsLeft = Math.ceil((circuitOpenUntil - Date.now()) / 1000);
    throw new Error(`Overpass circuit open — retrying in ${secsLeft}s`);
  }

  const body = `data=${encodeURIComponent(query)}`;
  const attempts = OVERPASS_MIRRORS.map(url => fetchMirror(url, body, clientSignal));

  try {
    const json = await Promise.any(attempts);
    // At least one mirror worked — reset circuit
    circuitOpenUntil = 0;
    return json;
  } catch (aggErr) {
    if (clientSignal?.aborted) throw new Error('Client disconnected');
    // All mirrors failed — open circuit for 2 minutes
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
    console.warn(`[osmService] all mirrors failed — circuit open for ${CIRCUIT_RESET_MS / 1000}s`);
    throw new Error('All Overpass mirrors failed');
  }
}

/**
 * Return nearby healthcare providers from OpenStreetMap via Overpass API.
 * Results are cached 5 min per lat/lng/radius bucket.
 */
async function getNearbyDoctors(lat, lng, radiusMeters = 10000, clientSignal = null) {
  const key = cacheKey(lat, lng, radiusMeters);

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[osmService] cache hit for ${key}`);
    return cached.data;
  }

  const query  = buildQuery(lat, lng, radiusMeters);
  const json   = await fetchFromOverpass(query, clientSignal);
  const elements = json.elements || [];

  const doctors = elements
    .map(el => {
      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || null;
      if (!name) return null;

      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon  ?? el.center?.lon;
      if (!elLat || !elLng) return null;

      const specialty =
        tags['healthcare:speciality'] ||
        tags['speciality']            ||
        tags['specialty']             ||
        mapTagsToSpecialty(tags);

      const addressParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);

      return {
        id:             `osm-${el.type}-${el.id}`,
        name,
        specialization: specialty,
        hospital_name:  name,
        address:        addressParts.length ? addressParts.join(' ') : null,
        city:           tags['addr:city']  || tags['addr:town'] || null,
        state:          tags['addr:state'] || null,
        latitude:       elLat,
        longitude:      elLng,
        phone:          tags.phone || tags['contact:phone'] || null,
        website:        tags.website || tags['contact:website'] || null,
        available:      true,
        source:         'openstreetmap',
      };
    })
    .filter(Boolean);

  // Deduplicate by name + rounded position
  const seen   = new Set();
  const unique = doctors.filter(d => {
    const k = `${d.name}|${d.latitude.toFixed(3)}|${d.longitude.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const sorted = sortByDistance(unique, lat, lng);

  cache.set(key, { data: sorted, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0];
    cache.delete(oldest);
  }

  return sorted;
}

function mapTagsToSpecialty(tags) {
  const amenity    = tags.amenity    || '';
  const healthcare = tags.healthcare || '';

  if (amenity === 'hospital'        || healthcare === 'hospital')        return 'Hospital';
  if (amenity === 'clinic'          || healthcare === 'clinic')          return 'Clinic';
  if (amenity === 'pharmacy'        || healthcare === 'pharmacy')        return 'Pharmacy';
  if (amenity === 'dentist'         || healthcare === 'dentist')         return 'Dental';
  if (amenity === 'doctors'         || healthcare === 'doctor')          return 'General Physician';
  if (amenity === 'physiotherapist' || healthcare === 'physiotherapist') return 'Physiotherapy';
  if (amenity === 'optometrist'     || healthcare === 'optometrist')     return 'Ophthalmology';
  if (amenity === 'laboratory'      || healthcare === 'laboratory')      return 'Lab & Diagnostics';
  if (healthcare === 'blood_bank')                                       return 'Blood Bank';
  if (healthcare === 'centre')                                           return 'Health Centre';
  return 'Healthcare Provider';
}

module.exports = { getNearbyDoctors };
