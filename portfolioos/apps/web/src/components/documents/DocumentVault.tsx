import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Upload,
  Download,
  Pencil,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Loader2,
  Edit3,
  FileOutput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { documentsApi } from '@/api/documents.api';
import { apiErrorMessage } from '@/api/client';
import { DocumentEditorModal } from './DocumentEditorModal';
import type { DocumentDTO, DocumentOwnerType } from '@portfolioos/shared';

interface Props {
  ownerType: DocumentOwnerType;
  ownerId: string;
  title?: string;
  defaultCategory?: string;
}

const EDITABLE_EXTENSIONS = new Set([
  'doc', 'docx', 'odt', 'rtf', 'txt',
  'xls', 'xlsx', 'ods', 'csv',
  'ppt', 'pptx', 'odp',
]);

const VIEWABLE_EXTENSIONS = new Set(['pdf', ...EDITABLE_EXTENSIONS]);

const PDF_CONVERTIBLE = new Set([
  'doc', 'docx', 'odt', 'rtf', 'txt',
  'xls', 'xlsx', 'ods',
  'ppt', 'pptx', 'odp',
]);

function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

function iconFor(name: string) {
  const ext = extOf(name);
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'tiff'].includes(ext))
    return FileImage;
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'pdf'].includes(ext)) return FileText;
  return FileIcon;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentVault({ ownerType, ownerId, title = 'Documents', defaultCategory }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<{ id: string; fileName: string } | null>(null);
  const [renaming, setRenaming] = useState<DocumentDTO | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const queryKey = ['documents', ownerType, ownerId] as const;

  const { data: documents, isLoading } = useQuery({
    queryKey,
    queryFn: () => documentsApi.list({ ownerType, ownerId }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) =>
      documentsApi.upload({ file, ownerType, ownerId, category: defaultCategory }),
    onSuccess: () => {
      toast.success('Document uploaded');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Upload failed')),
  });

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; fileName: string }) =>
      documentsApi.update(input.id, { fileName: input.fileName }),
    onSuccess: () => {
      toast.success('Renamed');
      queryClient.invalidateQueries({ queryKey });
      setRenaming(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Rename failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const [converting, setConverting] = useState<string | null>(null);
  const handleConvertToPdf = async (d: DocumentDTO) => {
    setConverting(d.id);
    try {
      await documentsApi.convertToPdf(d.id);
      toast.success('Converted to PDF — new file added');
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Conversion failed'));
    } finally {
      setConverting(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  const handleDownload = async (doc: DocumentDTO) => {
    try {
      await documentsApi.openDownload(doc.id, doc.fileName);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Download failed'));
    }
  };

  const handleDelete = (doc: DocumentDTO) => {
    if (!window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    deleteMutation.mutate(doc.id);
  };

  const startRename = (doc: DocumentDTO) => {
    setRenaming(doc);
    setRenameValue(doc.fileName);
  };

  const docs = documents ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{title}</CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.tiff"
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading documents…</div>
        ) : docs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No documents yet. Upload agreements, receipts, or scans to keep them in one place.
          </div>
        ) : (
          <div className="divide-y">
            {docs.map((d) => {
              const ext = extOf(d.fileName);
              const editable = EDITABLE_EXTENSIONS.has(ext);
              const viewable = VIEWABLE_EXTENSIONS.has(ext);
              const canConvert = PDF_CONVERTIBLE.has(ext);
              const isConverting = converting === d.id;
              const Icon = iconFor(d.fileName);
              const isRenaming = renaming?.id === d.id;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted/30"
                >
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!renameValue.trim()) return;
                          renameMutation.mutate({ id: d.id, fileName: renameValue.trim() });
                        }}
                        className="flex gap-2"
                      >
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          type="submit"
                          disabled={renameMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setRenaming(null)}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{d.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {humanSize(d.sizeBytes)} · {ext.toUpperCase()}
                          {d.category ? ` · ${d.category}` : ''}
                        </div>
                      </>
                    )}
                  </div>
                  {!isRenaming && (
                    <div className="flex items-center gap-1">
                      {viewable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing({ id: d.id, fileName: d.fileName })}
                          title={editable ? 'Open editor' : 'View in browser'}
                        >
                          <Edit3 className="h-4 w-4" />
                          {editable ? 'Edit' : 'View'}
                        </Button>
                      )}
                      {canConvert && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleConvertToPdf(d)}
                          disabled={isConverting}
                          title="Convert to PDF"
                        >
                          {isConverting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileOutput className="h-4 w-4" />
                          )}
                          PDF
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(d)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startRename(d)}
                        title="Rename file"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(d)}
                        disabled={deleteMutation.isPending}
                        className="text-negative hover:text-negative"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <DocumentEditorModal
        documentId={editing?.id ?? null}
        fileName={editing?.fileName ?? ''}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}
