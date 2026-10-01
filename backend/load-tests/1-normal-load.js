// Scenario 1 — normal load: 50 VUs ramping up gradually over ~2 minutes.
// Each VU starts a session (login) and then lists, creates and checks its
// dashboard with realistic think time.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, clientIp, headers, login, loadUserEmail } from './lib.js';
import { compactSummary } from './summary.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    normal: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /transactions}': ['p(95)<300'],
    'http_req_duration{name:POST /transactions}': ['p(95)<300'],
    'http_req_duration{name:GET /reports/summary}': ['p(95)<400'],
    // bcrypt cost 12 is slow on purpose (brute-force resistance)
    'http_req_duration{name:POST /auth/login}': ['p(95)<1000'],
  },
};

const session = {};

export default function () {
  const ip = clientIp(__VU);
  if (!session.token) {
    session.token = login(loadUserEmail(__VU), ip);
    const categories = http.get(`${BASE_URL}/categories?type=EXPENSE&limit=50`, {
      headers: headers(session.token, ip),
      tags: { name: 'GET /categories' },
    });
    session.categoryIds = categories.json('data').map((c) => c.id);
  }
  const h = { headers: headers(session.token, ip) };

  const list = http.get(`${BASE_URL}/transactions?limit=20&sortBy=date&order=desc`, {
    ...h,
    tags: { name: 'GET /transactions' },
  });
  check(list, { 'list 200': (r) => r.status === 200 });
  sleep(1);

  const created = http.post(
    `${BASE_URL}/transactions`,
    JSON.stringify({
      description: `k6 VU ${__VU} iter ${__ITER}`,
      // integer cents first: 0.1 + 0.2 style float noise would (rightly) get a 400
      amount: (100 + Math.floor(Math.random() * 20000)) / 100,
      type: 'EXPENSE',
      date: '2026-09-15',
      categoryId: session.categoryIds[__ITER % session.categoryIds.length],
    }),
    { ...h, tags: { name: 'POST /transactions' } },
  );
  check(created, { 'create 201': (r) => r.status === 201 });
  sleep(1);

  const summary = http.get(`${BASE_URL}/reports/summary?year=2026&month=9`, {
    ...h,
    tags: { name: 'GET /reports/summary' },
  });
  check(summary, { 'summary 200': (r) => r.status === 200 });
  sleep(1);
}

export const handleSummary = compactSummary(__ENV.LABEL || '1-normal-load');
