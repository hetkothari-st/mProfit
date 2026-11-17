/**
 * UploadPage — first step of the health check flow.
 *
 * User uploads their policy documents (wording + schedule + endorsements).
 * We encourage uploading the full policy wording for best extraction quality.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { createHealthCheck, uploadHealthCheckDocuments } from '@/api/policyCheckApi';

interface Props {
  policyId: string;
}

const ACCEPTED_TYPES = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];
const MAX_SIZE_MB = 50;
const MAX_FILES = 10;

export function UploadPage({ policyId }: Props) {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      // 1. Create the check
      const { checkId } = await createHealthCheck(policyId);
      // 2. Upload documents
      await uploadHealthCheckDocuments(checkId, files, setUploadProgress);
      return checkId;
    },
    onSuccess: (checkId) => {
      navigate(`/insurance/health-check/${checkId}/progress`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Upload failed');
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const valid = selected.filter((f) => {
      const ext = '.' + f.name.split('.').pop()!.toLowerCase();
      return ACCEPTED_TYPES.includes(ext) && f.size <= MAX_SIZE_MB * 1024 * 1024;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    // Reset input so the same file can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Policy Health Check</h1>
        <p className="text-muted-foreground mt-1">
          Upload your policy documents to get a detailed analysis of your coverage, restrictions, and
          recommendations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What to upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Policy wording</strong> — the full terms and
            conditions document (most important for accurate analysis).
          </p>
          <p>
            <strong className="text-foreground">Policy schedule</strong> — the summary page with
            your sum insured, premium, and member details.
          </p>
          <p>
            <strong className="text-foreground">Endorsements</strong> — any changes or additions
            to the base policy.
          </p>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-muted rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files);
          const valid = dropped.filter((f) => {
            const ext = '.' + f.name.split('.').pop()!.toLowerCase();
            return ACCEPTED_TYPES.includes(ext) && f.size <= MAX_SIZE_MB * 1024 * 1024;
          });
          setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
        }}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, PNG, JPEG, TIFF — up to {MAX_SIZE_MB}MB per file, {MAX_FILES} files max
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium truncate max-w-xs">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>
              <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {uploadMutation.isPending && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Uploading…</p>
          <Progress value={uploadProgress} />
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={() => uploadMutation.mutate()}
          disabled={files.length === 0 || uploadMutation.isPending}
          className="flex-1"
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Start Analysis'}
        </Button>
      </div>
    </div>
  );
}
