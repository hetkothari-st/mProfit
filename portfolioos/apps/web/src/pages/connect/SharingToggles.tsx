import { AI_CONNECTOR_AREAS, AI_CONNECTOR_AREA_INFO, type AiConnectorArea, type AiConnectorMemberWire } from '@everypaisa/shared';

/** Area and family-member checkboxes, shared by the approval page and Edit sharing. */
export function SharingToggles({ clientName, areas, onToggleArea, members, memberIds, onToggleMember }: {
  clientName: string;
  areas: ReadonlySet<AiConnectorArea>;
  onToggleArea: (a: AiConnectorArea) => void;
  members: AiConnectorMemberWire[];
  memberIds: ReadonlySet<string>;
  onToggleMember: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">Choose what {clientName} can read</legend>
        {AI_CONNECTOR_AREAS.map((a) => (
          <label key={a} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={areas.has(a)} onChange={() => onToggleArea(a)} aria-label={AI_CONNECTOR_AREA_INFO[a].label} />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{AI_CONNECTOR_AREA_INFO[a].label}</span>
              <span className="block text-xs text-muted-foreground">{AI_CONNECTOR_AREA_INFO[a].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {members.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Whose data</legend>
          <p className="text-xs text-muted-foreground">Your own data is always included. Family members are only shared if you tick them.</p>
          {members.map((m) => (
            <label key={m.userId} className={`flex items-start gap-3 rounded-md border border-border p-3 text-sm ${m.shareable ? '' : 'opacity-60'}`}>
              <input
                type="checkbox" className="mt-1" disabled={!m.shareable} checked={memberIds.has(m.userId)}
                onChange={() => onToggleMember(m.userId)} aria-label={`${m.name} (${m.relation})`}
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{m.name} <span className="font-normal text-muted-foreground">- {m.relation}</span></span>
                {m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
