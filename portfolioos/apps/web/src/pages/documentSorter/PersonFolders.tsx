import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Download, Folder, FolderOpen, KeyRound, Merge, Pencil, UserRound } from 'lucide-react';
import { DOC_TYPE_LABEL, type SorterFileDTO, type SorterTreeDTO } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/api/client';
import { documentsApi } from '@/api/documents.api';
import { documentSorterApi } from '@/api/documentSorter.api';
import { DocumentViewerModal } from '@/components/documents/DocumentViewerModal';
import { PasswordPromptDialog } from '@/components/upload/PasswordPromptDialog';
import { FileRow } from './FileRow';
import { MoveDialog } from './MoveDialog';

type View = { kind: 'root' } | { kind: 'person'; id: string } | { kind: 'unassigned' };

interface Props {
  tree: SorterTreeDTO;
  onChanged: () => void;
}

const SELECT = 'h-9 rounded-md border bg-background px-2 text-sm focus-ring';
const fileCount = (p: SorterTreeDTO['people'][number]): number => p.types.reduce((n, t) => n + t.files.length, 0);

export function PersonFolders({ tree, onChanged }: Props) {
  const [view, setView] = useState<View>({ kind: 'root' });
  const [moving, setMoving] = useState<SorterFileDTO | null>(null);
  const [viewing, setViewing] = useState<SorterFileDTO | null>(null);
  const [passwordFor, setPasswordFor] = useState<SorterFileDTO | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // new name while editing
  const [mergeInto, setMergeInto] = useState('');

  const fail = (err: unknown, fallback: string) => toast.error(apiErrorMessage(err, fallback));
  const people = tree.people.map(({ id, displayName, autoCreated, linkedUserId }) => ({ id, displayName, autoCreated, linkedUserId }));

  const move = useMutation({
    mutationFn: (v: { id: string; personId: string; docType: SorterFileDTO['docType'] & string }) =>
      documentSorterApi.patchFile(v.id, { personId: v.personId, docType: v.docType }),
    onSuccess: () => { setMoving(null); onChanged(); toast.success('Moved and renamed'); },
    onError: (e) => fail(e, "Couldn't move the file"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => { onChanged(); toast.success('Deleted'); },
    onError: (e) => fail(e, "Couldn't delete the file"),
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => documentSorterApi.renamePerson(v.id, v.name),
    onSuccess: () => { setRenaming(null); onChanged(); },
    onError: (e) => fail(e, "Couldn't rename the folder"),
  });
  const merge = useMutation({
    mutationFn: (v: { from: string; into: string }) => documentSorterApi.merge(v.from, v.into),
    onSuccess: (_d, v) => { setView({ kind: 'person', id: v.into }); setMergeInto(''); onChanged(); toast.success('Folders merged'); },
    onError: (e) => fail(e, "Couldn't merge the folders"),
  });
  const password = useMutation({
    mutationFn: (v: { id: string; password: string }) => documentSorterApi.submitPassword(v.id, v.password),
    onSuccess: () => { setPasswordFor(null); setPasswordError(null); onChanged(); },
    onError: (e) => setPasswordError(apiErrorMessage(e, "Couldn't use that password")),
  });

  const download = (f: SorterFileDTO) =>
    documentsApi.openDownload(f.id, f.fileName).catch((e: unknown) => fail(e, "Couldn't download the file"));
  const zip = (filter: Parameters<typeof documentSorterApi.downloadZip>[0], name: string) =>
    documentSorterApi.downloadZip(filter, name).catch((e: unknown) => fail(e, "Couldn't download the folder"));

  const row = (f: SorterFileDTO, personName: string | null) => (
    <FileRow
      key={f.id}
      file={f}
      personName={personName}
      onView={() => setViewing(f)}
      onDownload={() => void download(f)}
      onMove={() => setMoving(f)}
      onDelete={() => remove.mutate(f.id)}
      extra={
        f.sortStatus === 'NEEDS_PASSWORD' ? (
          <Button type="button" size="sm" variant="outline" onClick={() => { setPasswordError(null); setPasswordFor(f); }}>
            <KeyRound className="mr-1 h-3.5 w-3.5" />Enter password
          </Button>
        ) : f.sortStatus === 'NEEDS_REVIEW' || f.sortStatus === 'FAILED' ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setMoving(f)}>Assign</Button>
        ) : undefined
      }
    />
  );

  const dialogs = (
    <>
      <MoveDialog
        file={moving}
        people={people}
        saving={move.isPending}
        onClose={() => setMoving(null)}
        onSave={(p) => moving && move.mutate({ id: moving.id, personId: p.personId, docType: p.docType })}
      />
      <DocumentViewerModal
        documentId={viewing?.id ?? null}
        fileName={viewing?.fileName ?? ''}
        kind={viewing?.mimeType.startsWith('image/') ? 'image' : 'pdf'}
        onClose={() => setViewing(null)}
      />
      <PasswordPromptDialog
        open={passwordFor !== null}
        fileName={passwordFor?.fileName ?? ''}
        hint="Try the PDF's password — often your PAN or date of birth."
        isPending={password.isPending}
        errorMessage={passwordError}
        allowSavePassword={false}
        onSubmit={(pw) => passwordFor && password.mutate({ id: passwordFor.id, password: pw })}
        onCancel={() => setPasswordFor(null)}
      />
    </>
  );

  if (view.kind === 'unassigned') {
    return (
      <div className="space-y-3">
        <BackBar title="Needs attention" onBack={() => setView({ kind: 'root' })} />
        {tree.unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">{tree.unassigned.map((f) => row(f, null))}</ul>
        )}
        {dialogs}
      </div>
    );
  }

  if (view.kind === 'person') {
    const person = tree.people.find((p) => p.id === view.id);
    if (!person) {
      return (
        <div className="space-y-3">
          <BackBar title="Folder not found" onBack={() => setView({ kind: 'root' })} />
        </div>
      );
    }
    const others = tree.people.filter((p) => p.id !== person.id);
    return (
      <div className="space-y-4">
        <BackBar title={person.displayName} onBack={() => setView({ kind: 'root' })}>
          <div className="flex flex-wrap items-center gap-2">
            {renaming === null ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(person.displayName)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />Rename
              </Button>
            ) : (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => { e.preventDefault(); rename.mutate({ id: person.id, name: renaming }); }}
              >
                <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} className="h-9 w-44" aria-label="Folder name" autoFocus />
                <Button type="submit" size="sm" disabled={rename.isPending}><Check className="h-4 w-4" /></Button>
              </form>
            )}
            {others.length > 0 && (
              <span className="flex items-center gap-1">
                <select className={SELECT} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Merge into">
                  <option value="">Merge into…</option>
                  {others.map((p) => (<option key={p.id} value={p.id}>{p.displayName}</option>))}
                </select>
                <Button type="button" size="sm" variant="outline" disabled={!mergeInto || merge.isPending} onClick={() => merge.mutate({ from: person.id, into: mergeInto })}>
                  <Merge className="mr-1 h-3.5 w-3.5" />Merge
                </Button>
              </span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => void zip({ personId: person.id }, `${person.displayName}-documents.zip`)}>
              <Download className="mr-1 h-3.5 w-3.5" />Download all
            </Button>
          </div>
        </BackBar>
        {person.autoCreated && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            This folder was created automatically from a name on your documents. Rename it, or merge it into another folder if it is the same person.
          </p>
        )}
        {person.types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          person.types.map((t) => (
            <section key={t.docType} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  {DOC_TYPE_LABEL[t.docType]} <span className="font-normal text-muted-foreground">({t.files.length})</span>
                </h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => void zip({ personId: person.id, docType: t.docType }, `${person.displayName}-${DOC_TYPE_LABEL[t.docType]}.zip`)}>
                  <Download className="mr-1 h-3.5 w-3.5" />Zip
                </Button>
              </div>
              <ul className="divide-y rounded-lg border bg-card">{t.files.map((f) => row(f, person.displayName))}</ul>
            </section>
          ))
        )}
        {dialogs}
      </div>
    );
  }

  const total = tree.people.reduce((n, p) => n + fileCount(p), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {tree.people.length} {tree.people.length === 1 ? 'person' : 'people'} · {total} {total === 1 ? 'file' : 'files'}
        </h2>
        {total > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => void zip({}, 'all-documents.zip')}>
            <Download className="mr-1 h-3.5 w-3.5" />Download everything
          </Button>
        )}
      </div>
      {tree.people.length === 0 && tree.unassigned.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Drop a few documents above and folders appear on their own.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tree.people.map((p) => (
            <button key={p.id} type="button" onClick={() => setView({ kind: 'person', id: p.id })} className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-ring">
              <Folder className="h-8 w-8 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.displayName}</span>
                <span className="block text-xs text-muted-foreground">
                  {fileCount(p)} {fileCount(p) === 1 ? 'file' : 'files'} · {p.types.length} {p.types.length === 1 ? 'type' : 'types'}
                  {p.autoCreated && ' · auto-created'}
                </span>
              </span>
            </button>
          ))}
          {tree.unassigned.length > 0 && (
            <button type="button" onClick={() => setView({ kind: 'unassigned' })} className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100 focus-ring dark:border-amber-800 dark:bg-amber-950/40">
              <UserRound className="h-8 w-8 shrink-0 text-amber-700" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Needs attention</span>
                <span className="block text-xs text-muted-foreground">{tree.unassigned.length} {tree.unassigned.length === 1 ? 'file' : 'files'} reading or waiting for you</span>
              </span>
            </button>
          )}
        </div>
      )}
      {dialogs}
    </div>
  );
}

function BackBar({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} aria-label="Back to all folders">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="truncate text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
