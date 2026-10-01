// Scenario 2 — spike: jump to many concurrent VUs on the most-read endpoint
// (transaction listing) and see where latency degrades.
//   k6 run -e PEAK=300 2-spike.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, LOAD_USERS, clientIp, headers, login, loadUserEmail } from './lib.js';
import { compactSummary } from './summary.js';

const PEAK = Number(__ENV.PEAK || 300);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 }, // warm-up baseline
        { duration: '5s', target: PEAK }, // spike
        { duration: '30s', target: PEAK }, // sustain
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /transactions}': ['p(95)<1000'],
  },
};

// Log in once per load user before the test; VUs share those sessions.
export function setup() {
  const tokens = [];
  for (let n = 1; n <= LOAD_USERS; n++) {
    tokens.push(login(loadUserEmail(n), clientIp(10_000 + n)));
  }
  return { tokens };
}

export default function ({ tokens }) {
  const token = tokens[(__VU - 1) % tokens.length];
  const page = 1 + (__ITER % 5);
  const res = http.get(`${BASE_URL}/transactions?limit=20&page=${page}`, {
    headers: headers(token, clientIp(__VU)),
    tags: { name: 'GET /transactions' },
  });
  check(res, { 'list 200': (r) => r.status === 200 });
  // ~2 req/s per client: a busy human, still under the 300/min per-IP limit.
  sleep(0.5);
}

export const handleSummary = compactSummary(__ENV.LABEL || '2-spike');
