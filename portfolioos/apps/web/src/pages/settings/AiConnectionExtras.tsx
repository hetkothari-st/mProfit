import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AI_CONNECTOR_AREAS, formatDateIST, type AiConnectionWire, type AiConnectorArea } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { connectApi } from '@/api/connect.api';
import { SharingToggles } from '@/pages/connect/SharingToggles';

function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Edit what an existing connection may read. Takes effect on the chatbot's next call. */
export function EditSharingDialog({ conn, open, onOpenChange }: { conn: AiConnectionWire; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ['connect', 'people'], queryFn: connectApi.people, enabled: open });
  const [areas, setAreas] = useState<Set<AiConnectorArea>>(() => new Set(conn.areas));
  const [members, setMembers] = useState<Set<string>>(() => new Set(conn.memberUserIds));
  const save = useMutation({
    mutationFn: () => connectApi.update(conn.id, AI_CONNECTOR_AREAS.filter((a) => areas.has(a)), [...members]),
    onSuccess: async () => {
      toast.success('Sharing updated');
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ['connect', 'connections'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save. Try again.')),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit what {conn.clientName} can read</DialogTitle>
        </DialogHeader>
        <SharingToggles
          clientName={conn.clientName} areas={areas} onToggleArea={(a) => setAreas((s) => toggled(s, a))}
          members={people.data ?? []} memberIds={members} onToggleMember={(id) => setMembers((s) => toggled(s, id))}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The chatbot's last 20 lookups: tool, whose data, rows, when. Never the data itself. */
export function RecentActivity({ connId }: { connId: string }) {
  const [open, setOpen] = useState(false);
  const activity = useQuery({ queryKey: ['connect', 'activity', connId], queryFn: () => connectApi.activity(connId), enabled: open });
  return (
    <div className="text-xs">
      <button type="button" className="text-primary underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Recent activity
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {activity.isError && <p className="text-destructive">{apiErrorMessage(activity.error, 'Could not load activity.')}</p>}
          {activity.data?.length === 0 && <p className="text-muted-foreground">No lookups yet.</p>}
          {activity.data?.map((a, i) => (
            <p key={`${a.at}-${i}`} className="break-words text-muted-foreground">
              <span className="font-mono text-foreground">{a.tool}</span>
              {' - '}{a.people > 1 ? `${a.people} people` : 'one person'}{' - '}{a.rows} rows{a.ok ? '' : ' - failed'}{' - '}{formatDateIST(a.at)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
