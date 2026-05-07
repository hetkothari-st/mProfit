import { Mail, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { gmailApi } from '@/api/gmail.api';
import { apiErrorMessage } from '@/api/client';

export function ConnectGmailCard() {
  async function startConnect() {
    try {
      const r = await gmailApi.authUrl();
      window.location.href = r.url;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to start Gmail connect'));
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="rounded-full bg-primary/10 p-3 shrink-0">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Auto-import financial documents from Gmail
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            We&apos;ll scan your inbox for contract notes, statements and other
            financial PDFs — no sender lists to configure. You approve each
            document before it&apos;s imported.
          </p>
          <Button className="mt-3" onClick={startConnect}>
            Connect Gmail
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
