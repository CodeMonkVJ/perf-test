import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL;
const path = __ENV.TARGET_PATH || '/';
const method = (__ENV.REQ_METHOD || 'GET').toUpperCase();
const requestBody = __ENV.REQ_BODY || '';
const requestContentType = __ENV.REQ_CONTENT_TYPE || 'application/json';
const cookieHeader =
  __ENV.COOKIE_HEADER ||
  (__ENV.SESSION_COOKIE ? `sessiondata=${__ENV.SESSION_COOKIE}` : '');

if (!baseUrl) {
  throw new Error('BASE_URL is required, e.g. https://your-vps-domain.com');
}

function parseRampStages(raw) {
  if (!raw) {
    return [
      { target: Number(__ENV.STAGE1_RPS || 50), duration: __ENV.STAGE1_DUR || '2m' },
      { target: Number(__ENV.STAGE2_RPS || 100), duration: __ENV.STAGE2_DUR || '2m' },
      { target: Number(__ENV.STAGE3_RPS || 200), duration: __ENV.STAGE3_DUR || '2m' },
      { target: Number(__ENV.STAGE4_RPS || 400), duration: __ENV.STAGE4_DUR || '2m' }
    ];
  }

  return raw.split(',').map((item) => {
    const trimmed = item.trim();
    const parts = trimmed.split(':');

    if (parts.length !== 2) {
      throw new Error(`Invalid RAMP_STAGES entry: ${trimmed}. Use target:duration, e.g. 100:2m`);
    }

    const target = Number(parts[0].trim());
    const duration = parts[1].trim();

    if (!Number.isFinite(target) || target < 0) {
      throw new Error(`Invalid RAMP_STAGES target: ${parts[0]}`);
    }

    if (!duration) {
      throw new Error(`Invalid RAMP_STAGES duration: ${trimmed}`);
    }

    return { target, duration };
  });
}

function parseExtraHeaders(raw) {
  if (!raw || raw.trim() === '') {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('EXTRA_HEADERS_JSON must be valid JSON');
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('EXTRA_HEADERS_JSON must be a JSON object');
  }

  return parsed;
}

const stages = parseRampStages(__ENV.RAMP_STAGES);
const extraHeaders = parseExtraHeaders(__ENV.EXTRA_HEADERS_JSON);

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
      stages
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    dropped_iterations: ['count==0']
  }
};

export default function () {
  const headers = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...extraHeaders
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (!headers['Content-Type'] && !headers['content-type'] && !['GET', 'HEAD'].includes(method)) {
    headers['Content-Type'] = requestContentType;
  }

  const payload = ['GET', 'HEAD'].includes(method) ? null : requestBody;

  const res = http.request(method, `${baseUrl}${path}`, payload, {
    timeout: __ENV.REQ_TIMEOUT || '5s',
    headers
  });

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300
  });
}
