import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pin, PinOff, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { fmtDate } from './accessModel';
import { caPracticeApi, type ClientTask } from '@/api/caPractice.api';

/**
 * The CA's own notes and to-dos for one client. Practice-private: the client
 * never sees these, which the tab says up front so nothing is written on the
 * assumption that they will.
 */
export function ClientNotesTasksTab({ clientId }: { clientId: string }) {
  return (
    <div className="space-y-8">
      <p className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12.5px] text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Only you can see these. They are your practice's notes, not part of the client's books.
      </p>
      <TasksSection clientId={clientId} />
      <NotesSection clientId={clientId} />
    </div>
  );
}

const onError = (e: Error) => toast.error(e.message);

function TasksSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const key = ['ca', 'practice', clientId, 'tasks'];
  const { data: tasks = [] } = useQuery({ queryKey: key, queryFn: () => caPracticeApi.tasks(clientId) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['ca', 'practice', 'open-tasks'] });
  };

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const add = useMutation({
    mutationFn: () => caPracticeApi.addTask(clientId, { title: title.trim(), dueDate: due || null }),
    onSuccess: () => {
      setTitle('');
      setDue('');
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (t: ClientTask) => caPracticeApi.updateTask(clientId, t.id, { status: t.status === 'OPEN' ? 'DONE' : 'OPEN' }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => caPracticeApi.deleteTask(clientId, id), onSuccess: refresh, onError });

  return (
    <section>
      <h3 className="mb-2 text-[15px] font-medium text-foreground">Tasks</h3>
      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <Input
          aria-label="New task"
          placeholder="e.g. Collect Form 16"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-[220px] flex-1"
        />
        <DateInput
          aria-label="Task due date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-[160px]"
        />
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          Add task
        </Button>
      </form>
      {tasks.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.status === 'DONE'}
                onChange={() => toggle.mutate(t)}
                className="h-4 w-4"
              />
              <span className={cn('flex-1 text-[13.5px]', t.status === 'DONE' && 'text-muted-foreground line-through')}>
                {t.title}
              </span>
              {t.dueDate && <span className="numeric text-[12px] text-muted-foreground">{fmtDate(t.dueDate)}</span>}
              <button
                type="button"
                aria-label={`Delete task ${t.title}`}
                onClick={() => remove.mutate(t.id)}
                className="focus-ring rounded p-1 text-muted-foreground hover:text-negative"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const key = ['ca', 'practice', clientId, 'notes'];
  const { data: notes = [] } = useQuery({ queryKey: key, queryFn: () => caPracticeApi.notes(clientId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () => caPracticeApi.addNote(clientId, body.trim()),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError,
  });
  const pin = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => caPracticeApi.updateNote(clientId, v.id, { pinned: v.pinned }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => caPracticeApi.deleteNote(clientId, id), onSuccess: refresh, onError });

  return (
    <section>
      <h3 className="mb-2 text-[15px] font-medium text-foreground">Notes</h3>
      <div className="mb-3 space-y-2">
        <Textarea
          aria-label="New note"
          placeholder="Anything worth remembering about this client"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
          Add note
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={cn('rounded-xl border px-3 py-2', n.pinned ? 'border-warning/50 bg-warning/5' : 'border-border/60')}>
              <p className="whitespace-pre-wrap text-[13.5px] text-foreground">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span>{fmtDate(n.createdAt)}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                    onClick={() => pin.mutate({ id: n.id, pinned: !n.pinned })}
                    className="focus-ring rounded p-1 hover:text-foreground"
                  >
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => remove.mutate(n.id)}
                    className="focus-ring rounded p-1 hover:text-negative"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
