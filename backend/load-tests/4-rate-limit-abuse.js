// Scenario 4 — abuse: one client IP floods the API (and brute-forces login)
// while legitimate users keep working. Expectation: the attacker gets fast
// 429s, the process stays up, and legitimate latency is unaffected.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, clientIp, headers, login, loadUserEmail } from './lib.js';
import { compactSummary } from './summary.js';

const ATTACKER_IP = '10.66.66.66';
const limited = new Counter('attacker_429');
const served = new Counter('attacker_served');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    flood: {
      executor: 'constant-vus',
      vus: 50,
      duration: '45s',
      exec: 'flood',
    },
    bruteforce: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '45s',
      preAllocatedVUs: 10,
      exec: 'bruteforce',
    },
    legit: {
      executor: 'constant-vus',
      vus: 20,
      duration: '45s',
      exec: 'legit',
    },
  },
  thresholds: {
    'http_req_duration{name:flood}': ['p(95)<1000'],
    'http_req_duration{name:bruteforce}': ['p(95)<1000'],
    'http_req_duration{name:legit}': ['p(95)<300'],
    // Legit traffic must stay healthy while the attack is going on.
    'http_req_failed{scenario:legit}': ['rate<0.01'],
    'http_req_duration{scenario:legit}': ['p(95)<300'],
  },
};

export function setup() {
  const tokens = [];
  for (let n = 1; n <= 20; n++) tokens.push(login(loadUserEmail(n), clientIp(30_000 + n)));
  return { attackerToken: tokens[0], tokens };
}

export function flood({ attackerToken }) {
  const res = http.get(`${BASE_URL}/transactions?limit=20`, {
    headers: headers(attackerToken, ATTACKER_IP),
    tags: { name: 'flood' },
    responseCallback: http.expectedStatuses(200, 429),
  });
  if (res.status === 429) limited.add(1);
  else served.add(1);
}

export function bruteforce() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'loadtest-1@fintrack.dev', password: `guess-${Math.random()}` }),
    {
      headers: headers(null, ATTACKER_IP),
      tags: { name: 'bruteforce' },
      responseCallback: http.expectedStatuses(401, 429),
    },
  );
  check(res, { 'bruteforce blocked or rejected': (r) => r.status === 429 || r.status === 401 });
}

export function legit({ tokens }) {
  const res = http.get(`${BASE_URL}/transactions?limit=20`, {
    headers: headers(tokens[(__VU - 1) % tokens.length], clientIp(__VU)),
    tags: { name: 'legit' },
  });
  check(res, { 'legit 200': (r) => r.status === 200 });
  sleep(0.5); // a real user, ~2 req/s, well under the 300/min per-IP limit
}

export const handleSummary = compactSummary(__ENV.LABEL || '4-rate-limit-abuse');
