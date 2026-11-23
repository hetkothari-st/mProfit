/**
 * Which half of the service this process runs.
 *
 * `all`    (default) one process serves HTTP and runs every background job — the
 *          original single-service layout, unchanged.
 * `web`    serves HTTP only. Safe to run as many replicas as needed: it starts no
 *          cron, no queue workers and no boot-time sync, so replicas never
 *          duplicate scheduled work.
 * `worker` runs the background jobs only (cron, queue workers, startup sync) and
 *          answers /health and /ready on PORT for the platform healthcheck. It
 *          serves none of the API. Run exactly ONE replica: the timer jobs are
 *          not leader-elected.
 */
export type ProcessRole = 'all' | 'web' | 'worker';

export function resolveProcessRole(role: ProcessRole): { runsHttp: boolean; runsJobs: boolean } {
  return { runsHttp: role !== 'worker', runsJobs: role !== 'web' };
}
