// Opens a driver document through a 5-minute signed link. Every view is audit-logged by the API.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { Modal } from "./ui/Overlay";
import { Button } from "./ui/Button";

export function DocumentViewer({ docId, title, onClose }: { docId: string | null; title: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["doc-url", docId],
    queryFn: () => api<{ url: string; mimeType: string; expiresInSeconds: number }>(`/admin/documents/${docId}/url`),
    enabled: !!docId,
    staleTime: 60_000,
    gcTime: 0,
  });

  return (
    <Modal
      open={!!docId}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          {q.data && (
            <a href={q.data.url} target="_blank" rel="noreferrer noopener">
              <Button icon={<ExternalLink className="size-4" />}>Open in new tab</Button>
            </a>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex min-h-80 items-center justify-center rounded-xl bg-slate-100">
        {q.isLoading && <Loader2 className="size-6 animate-spin text-slate-400" />}
        {q.isError && <p className="text-sm text-red-700">{errorMessage(q.error)}</p>}
        {q.data &&
          (q.data.mimeType === "application/pdf" ? (
            <iframe src={q.data.url} title={title} className="h-[60vh] w-full rounded-xl" />
          ) : (
            <img src={q.data.url} alt={title} className="max-h-[60vh] max-w-full rounded-lg object-contain" />
          ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">This link expires in 5 minutes. Your view has been recorded in the audit log.</p>
    </Modal>
  );
}
