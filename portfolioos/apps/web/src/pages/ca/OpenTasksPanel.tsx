import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/components/ca/accessModel';
import { caPracticeApi } from '@/api/caPractice.api';

const SHOWN = 8;

/** Today's date in IST as YYYY-MM-DD, to tell an overdue task from an upcoming one. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Open to-dos across every client, soonest first, so the day starts from one
 * list instead of opening each client. Hidden when there are none.
 */
export function OpenTasksPanel() {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ['ca', 'practice', 'open-tasks'],
    queryFn: () => caPracticeApi.openTasks(),
  });
  const done = useMutation({
    mutationFn: (t: { clientId: string; id: string }) => caPracticeApi.updateTask(t.clientId, t.id, { status: 'DONE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ca', 'practice'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (tasks.length === 0) return null;
  const today = istToday();

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[15px] font-medium text-foreground">
          Open tasks <span className="text-muted-foreground">{tasks.length}</span>
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Your to-dos across clients, soonest first. Only you see these.</p>
      </div>
      <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
        {tasks.slice(0, SHOWN).map((t) => {
          const late = t.dueDate !== null && t.dueDate < today;
          return (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`Mark "${t.title}" done`}
                checked={false}
                disabled={done.isPending}
                onChange={() => done.mutate({ clientId: t.clientId, id: t.id })}
                className="h-4 w-4"
              />
              <span className="flex-1 text-[13.5px] text-foreground">{t.title}</span>
              <Link to={`/ca/clients/${t.clientId}?tab=notes`} className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline">
                {t.clientName}
              </Link>
              {t.dueDate && (
                <span className={cn('numeric w-[92px] text-right text-[12px]', late ? 'text-negative' : 'text-muted-foreground')}>
                  {fmtDate(t.dueDate)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {tasks.length > SHOWN && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">and {tasks.length - SHOWN} more in each client's Notes &amp; tasks.</p>
      )}
    </section>
  );
}
