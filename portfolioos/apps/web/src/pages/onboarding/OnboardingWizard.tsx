import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase, Mail, Users, FileUp, LayoutDashboard, ChevronRight, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { portfoliosApi } from '@/api/portfolios.api';
import { cn } from '@/lib/cn';

const STEPS = [
  { id: 'portfolio', icon: Briefcase, title: 'Create your portfolio', subtitle: 'A portfolio groups your investments together.' },
  { id: 'gmail', icon: Mail, title: 'Connect Gmail', subtitle: 'Automatically import transactions from email alerts.' },
  { id: 'senders', icon: Users, title: 'Pick senders', subtitle: 'Choose which email senders to monitor.' },
  { id: 'import', icon: FileUp, title: 'Import a CAS', subtitle: 'Upload a CAMS or KFintech statement for mutual funds.' },
  { id: 'done', icon: LayoutDashboard, title: 'All set!', subtitle: 'Head to your dashboard to see your portfolio.' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [currentStep, setCurrentStep] = useState<StepId>('portfolio');
  const [portfolioName, setPortfolioName] = useState('My Portfolio');
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const createPortfolioMut = useMutation({
    mutationFn: () => portfoliosApi.create({ name: portfolioName, type: 'INVESTMENT' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] });
      advance('portfolio');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = (stepId: StepId) => {
    setCompleted((prev) => new Set([...prev, stepId]));
    const idx = STEPS.findIndex((s) => s.id === stepId);
    const next = STEPS[idx + 1];
    if (next) setCurrentStep(next.id);
  };

  const skip = () => {
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    const next = STEPS[idx + 1];
    if (next) setCurrentStep(next.id);
  };

  const handleDone = () => {
    onComplete();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center text-primary-foreground font-bold text-lg">P</div>
          <span className="text-xl font-semibold tracking-tight text-primary">PortfolioOS</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((step, i) => {
            const isDone = completed.has(step.id);
            const isCurrent = step.id === currentStep;
            const StepIcon = step.icon;
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 transition-all',
                  isDone ? 'bg-primary text-primary-foreground' :
                  isCurrent ? 'bg-primary/15 text-primary ring-2 ring-primary/40' :
                  'bg-muted text-muted-foreground',
                )}>
                  {isDone ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-0.5 mx-2 transition-all', isDone ? 'bg-primary' : 'bg-muted')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step card */}
        <div className="rounded-xl border bg-card shadow-sm p-8">
          {currentStep === 'portfolio' && (
            <div>
              <Briefcase className="h-10 w-10 text-primary mb-4" />
              <h2 className="text-2xl font-semibold mb-1">{STEPS[0].title}</h2>
              <p className="text-muted-foreground mb-6">{STEPS[0].subtitle}</p>
              <div className="mb-6">
                <Label>Portfolio name</Label>
                <Input
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="e.g. My Portfolio"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => createPortfolioMut.mutate()}
                disabled={!portfolioName.trim() || createPortfolioMut.isPending}
                className="w-full"
              >
                {createPortfolioMut.isPending ? 'Creating…' : 'Create portfolio'}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {currentStep === 'gmail' && (
            <div>
              <Mail className="h-10 w-10 text-primary mb-4" />
              <h2 className="text-2xl font-semibold mb-1">{STEPS[1].title}</h2>
              <p className="text-muted-foreground mb-6">{STEPS[1].subtitle}</p>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 mb-6">
                PortfolioOS connects to Gmail with read-only access to import transaction alerts from your bank, broker, and insurer emails.
                Your emails are never stored — only the extracted transaction data is saved.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => { navigate('/mailboxes'); onComplete(); }} className="flex-1">
                  Connect Gmail
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={skip}>Skip for now</Button>
              </div>
            </div>
          )}

          {currentStep === 'senders' && (
            <div>
              <Users className="h-10 w-10 text-primary mb-4" />
              <h2 className="text-2xl font-semibold mb-1">{STEPS[2].title}</h2>
              <p className="text-muted-foreground mb-6">{STEPS[2].subtitle}</p>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 mb-6">
                After connecting Gmail, PortfolioOS will scan your inbox to discover financial email senders — HDFC alerts, Zerodha trade confirmations, LIC premium notices, and more.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => { navigate('/ingestion/senders'); onComplete(); }} className="flex-1">
                  Set up senders
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={skip}>Skip for now</Button>
              </div>
            </div>
          )}

          {currentStep === 'import' && (
            <div>
              <FileUp className="h-10 w-10 text-primary mb-4" />
              <h2 className="text-2xl font-semibold mb-1">{STEPS[3].title}</h2>
              <p className="text-muted-foreground mb-6">{STEPS[3].subtitle}</p>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 mb-6">
                Download a Consolidated Account Statement (CAS) from CAMS or KFintech and upload it here to instantly import all your mutual fund holdings.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => { navigate('/cas'); onComplete(); }} className="flex-1">
                  Upload CAS
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={skip}>Skip for now</Button>
              </div>
            </div>
          )}

          {currentStep === 'done' && (
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary/15 grid place-items-center mx-auto mb-4">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">You're all set!</h2>
              <p className="text-muted-foreground mb-8">
                Your portfolio is ready. Add transactions manually, import more statements, or wait for Gmail to start pulling in your transaction emails.
              </p>
              <Button onClick={handleDone} className="w-full" size="lg">
                Go to dashboard
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {currentStep !== 'done' && currentStep !== 'portfolio' && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            Step {stepIndex + 1} of {STEPS.length} ·{' '}
            <button type="button" onClick={handleDone} className="hover:underline">
              Skip setup and go to dashboard
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
