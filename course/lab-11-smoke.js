import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 3,
  duration: '8s',
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<250'],
    checks: ['rate==1']
  }
};

export default function () {
  const response = http.get('http://host.docker.internal:4318/api/health');
  check(response, { 'ok health JSON': (result) => result.status === 200 && result.json('ok') === true });
}
