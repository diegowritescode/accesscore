import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN;
const VUS = Number(__ENV.VUS || 30);
const DURATION = __ENV.DURATION || '20s';
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 20);

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

const checkLatency = new Trend('pdp_check_latency', true);
const batchLatency = new Trend('pdp_batch_check_latency', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    check: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'checkScenario',
      tags: { endpoint: 'check' },
    },
    batch_check: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'batchScenario',
      startTime: DURATION,
      tags: { endpoint: 'batch-check' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    pdp_check_latency: ['p(95)<100'],
    pdp_batch_check_latency: ['p(95)<300'],
  },
};

const checkBody = JSON.stringify({
  action: 'document.read',
  resource: { type: 'document', id: 'onboarding' },
});

const batchBody = JSON.stringify({
  checks: Array.from({ length: BATCH_SIZE }, () => ({
    action: 'document.read',
    resource: { type: 'document', id: 'onboarding' },
  })),
});

export function checkScenario() {
  const res = http.post(`${BASE}/authz/check`, checkBody, { headers });
  check(res, { 'check → 200 permit': (r) => r.status === 200 });
  checkLatency.add(res.timings.duration);
}

export function batchScenario() {
  const res = http.post(`${BASE}/authz/batch-check`, batchBody, { headers });
  check(res, { 'batch-check → 200': (r) => r.status === 200 });
  batchLatency.add(res.timings.duration);
}
