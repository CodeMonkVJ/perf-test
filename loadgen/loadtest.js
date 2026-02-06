import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL;
const path = __ENV.TARGET_PATH || '/';
const cookieHeader =
  __ENV.COOKIE_HEADER ||
  (__ENV.SESSION_COOKIE ? `sessiondata=${__ENV.SESSION_COOKIE}` : '');

if (!baseUrl) {
  throw new Error('BASE_URL is required, e.g. https://your-vps-domain.com');
}

// Count only 2xx as expected responses; all other status codes are failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

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
  const headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const res = http.get(`${baseUrl}${path}`, {
    timeout: __ENV.REQ_TIMEOUT || '5s',
    headers
  });

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300
  });
}
