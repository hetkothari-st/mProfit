import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, ExternalLink, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { casApi, type CasProvider } from '@/api/cas.api';
import { apiErrorMessage } from '@/api/client';

export function CasPage() {
  const [provider, setProvider] = useState<CasProvider['id']>('CAMS');
  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: providers } = useQuery({
    queryKey: ['cas-providers'],
    queryFn: () => casApi.providers(),
  });

  const buildMut = useMutation({
    mutationFn: () =>
      casApi.buildRequest({
        provider,
        pan: pan || undefined,
        email: email || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        statementType: 'DETAILED',
      }),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Consolidated Account Statement"
        description="Request CAS PDFs from CAMS, KFintech, NSDL or CDSL via email"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileDown className="h-4 w-4" /> Request CAS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Provider</Label>
                <Select
                  className="mt-1"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as CasProvider['id'])}
                >
                  {providers?.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.coverage}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>PAN (optional)</Label>
                <Input
                  className="uppercase"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>
              <div>
                <Label>Email (optional)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>From date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <Label>To date</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <Button onClick={() => buildMut.mutate()} disabled={buildMut.isPending}>
              {buildMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate Request
            </Button>

            {buildMut.data && (
              <div className="mt-3 border rounded-md p-3 space-y-2 text-sm">
                <a
                  className="inline-flex items-center gap-1 text-accent underline"
                  href={buildMut.data.portalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open provider portal <ExternalLink className="h-3 w-3" />
                </a>
                <div>
                  <div className="font-medium">Instructions</div>
                  <ul className="list-disc pl-5 text-xs">
                    {buildMut.data.instructions.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium">Next steps</div>
                  <ul className="list-disc pl-5 text-xs">
                    {buildMut.data.nextSteps.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            {providers?.providers
              .filter((p) => p.id === provider)
              .map((p) => (
                <div key={p.id} className="space-y-1">
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-muted-foreground">{p.coverage}</div>
                  <div>
                    <span className="font-medium">PDF password:</span> {p.passwordHint}
                  </div>
                  <div>
                    <span className="font-medium">Email from:</span> {p.emailFromPattern}
                  </div>
                  <div>
                    <span className="font-medium">Subject:</span> {p.subjectPattern}
                  </div>
                  <p className="text-muted-foreground pt-1">{p.notes}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
