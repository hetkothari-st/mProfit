import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
}

const ACCEPT = '.pdf,.csv,.tsv,.xlsx,.xls';

export function ImportDropzone({ onUpload, uploading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload],
  );

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        {uploading ? (
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        ) : (
          <UploadCloud className={`h-10 w-10 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
        )}
        <div className="text-sm font-medium">
          {uploading ? 'Uploading…' : 'Drag & drop a file here, or click to browse'}
        </div>
        <div className="text-xs text-muted-foreground">
          PDF · XLSX · XLS · CSV · TSV · Max 50 MB
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-2"
        >
          Choose file
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
