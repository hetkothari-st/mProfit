import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { gmailApi } from '@/api/gmail.api';
import { apiErrorMessage } from '@/api/client';

export function GmailCallbackPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const ranRef = useRef(false);
  const [msg, setMsg] = useState('Connecting Gmail…');

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const err = params.get('error');
    const code = params.get('code');
    if (err) {
      toast.error(`Google rejected: ${err}`);
      nav('/mailboxes', { replace: true });
      return;
    }
    if (!code) {
      toast.error('No authorization code from Google');
      nav('/mailboxes', { replace: true });
      return;
    }
    (async () => {
      try {
        const r = await gmailApi.callback(code);
        toast.success(`Connected ${r.email}`);
        setMsg(`Connected ${r.email} — redirecting…`);
      } catch (e) {
        toast.error(apiErrorMessage(e));
      } finally {
        setTimeout(() => nav('/mailboxes', { replace: true }), 500);
      }
    })();
  }, [params, nav]);

  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {msg}
      </div>
    </div>
  );
}
