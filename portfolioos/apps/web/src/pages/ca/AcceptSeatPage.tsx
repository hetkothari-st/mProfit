import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { caFirmSeatsApi } from '@/api/caFirmSeats.api';

/** A staff member accepts a seat in a CA's firm, signed in as the invited address. */
export function AcceptSeatPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ['seat-invite', token],
    queryFn: () => caFirmSeatsApi.peek(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => caFirmSeatsApi.accept(token),
    onSuccess: () => {
      toast.success('You have joined the firm');
      qc.invalidateQueries({ queryKey: ['ca'] });
      navigate('/ca');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-md py-16">
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl border bg-muted/20" />
      ) : error || !data ? (
        <p className="rounded-xl border p-6 text-[14px] text-muted-foreground">
          {apiErrorMessage(error, 'This invitation is no longer valid. Ask for a new one.')}
        </p>
      ) : (
        <div className="rounded-xl border p-6">
          <h1 className="font-display text-[22px] text-foreground">Join {data.firm}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            You'll work on the clients {data.firm} assigns you, within the limits each client has set. Every action is
            recorded under your name, and the client can see it. You need two-factor sign-in turned on to open a
            client's books.
          </p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">Invitation for {data.invitedEmail}.</p>
          <Button className="mt-4" onClick={() => accept.mutate()} disabled={accept.isPending}>
            Join the firm
          </Button>
        </div>
      )}
    </div>
  );
}
