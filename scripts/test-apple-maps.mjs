#!/usr/bin/env node
/**
 * Apple Maps Server API — correct 2-step auth flow:
 *   1. Sign JWT (auth token) — no sub claim, just iss/iat/exp
 *   2. Exchange JWT for access token at /v1/token
 *   3. Use access token for search calls
 */
import { readFileSync } from 'fs';
import { createSign } from 'crypto';

const KEY_FILE = '/Users/ugandhar/AuthKey_7SY8X66BVZ_mapkey.p8';
const KEY_ID   = '7SY8X66BVZ';
const TEAM_ID  = 'X4VLLWF6Q3';
const LAT      = 33.2365;  // Prosper, TX
const LNG      = -96.8236;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function generateAuthToken(pem) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url({ alg: 'ES256', kid: KEY_ID });        // no typ
  const payload = b64url({ iss: TEAM_ID, iat: now, exp: now + 1800 }); // no sub
  const msg = `${header}.${payload}`;
  const sign = createSign('SHA256');
  sign.update(msg);
  sign.end();
  const sig = sign.sign({ key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  console.log('JWT payload:', JSON.parse(Buffer.from(payload, 'base64url').toString()));
  return `${msg}.${sig}`;
}

async function main() {
  const pem = readFileSync(KEY_FILE, 'utf8');

  // Step 1: create JWT (auth token)
  const authToken = generateAuthToken(pem);
  console.log('\nStep 1: JWT created\n');

  // Step 2: exchange for access token
  console.log('Step 2: exchanging JWT for access token at /v1/token ...');
  const tokenRes  = await fetch('https://maps-api.apple.com/v1/token', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const tokenBody = await tokenRes.text();
  console.log(`HTTP ${tokenRes.status}:`, tokenBody);

  if (!tokenRes.ok) {
    console.log('\n❌ Token exchange failed — auth token rejected');
    return;
  }

  const { accessToken } = JSON.parse(tokenBody);
  console.log('\n✅ Got access token\n');

  const RADIUS_M = 8047; // 5 miles in metres
  // searchRegion = north,east,south,west bounding box derived from radius
  const deg = RADIUS_M / 111000;
  const searchRegion = `${LAT + deg},${LNG + deg},${LAT - deg},${LNG - deg}`;

  const TEST_QUERIES = [
    'dog boarding', 'pet boarding', 'pet resort', 'dog daycare',
    'pet grooming', 'dog grooming', 'pet store', 'dog park',
  ];

  for (const q of TEST_QUERIES) {
    const url = new URL('https://maps-api.apple.com/v1/search');
    url.searchParams.set('q', q);
    url.searchParams.set('searchRegion', searchRegion);
    url.searchParams.set('resultTypeFilter', 'Poi');
    url.searchParams.set('lang', 'en-US');
    url.searchParams.set('limit', '5');

    const res  = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.text();
    if (!res.ok) { console.log(`❌ "${q}" HTTP ${res.status}: ${body}`); continue; }
    const results = JSON.parse(body).results ?? [];
    console.log(`\n"${q}" → ${results.length} results`);
    results.forEach(r => {
      const lat = r.location?.latitude ?? r.coordinate?.latitude;
      const lng = r.location?.longitude ?? r.coordinate?.longitude;
      console.log(`  • ${r.name}  [${r.poiCategory}]  ${lat?.toFixed(4)},${lng?.toFixed(4)}`);
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
