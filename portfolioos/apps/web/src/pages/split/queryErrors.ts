import axios from 'axios';

/** True for an axios 404/403 — the resource is gone or not ours. */
export function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 403);
}
