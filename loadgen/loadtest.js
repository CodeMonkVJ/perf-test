import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL;
const path = __ENV.TARGET_PATH || '/';

if (!baseUrl) {
  throw new Error('BASE_URL is required, e.g. https://your-vps-domain.com');
}

export const options = {
  discardResponseBodies: true,
  scenarios: {
    proxy_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: Number(__ENV.START_RPS || 10),
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 2000),
      stages: [
        { target: Number(__ENV.STAGE1_RPS || 50), duration: __ENV.STAGE1_DUR || '2m' },
        { target: Number(__ENV.STAGE2_RPS || 100), duration: __ENV.STAGE2_DUR || '2m' },
        { target: Number(__ENV.STAGE3_RPS || 200), duration: __ENV.STAGE3_DUR || '2m' },
        { target: Number(__ENV.STAGE4_RPS || 400), duration: __ENV.STAGE4_DUR || '2m' }
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500']
  }
};

export default function () {
  const res = http.get(`${baseUrl}${path}`, {
    timeout: __ENV.REQ_TIMEOUT || '5s',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });

  check(res, {
    'status is < 500': (r) => r.status < 500
  });
}
