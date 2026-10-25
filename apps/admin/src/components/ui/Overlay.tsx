// Drawer (right-hand detail panel) and confirmation dialog.
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { TextArea } from "./Field";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-xl" }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <aside className={`relative flex h-full w-full ${width} flex-col bg-card shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-2">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-lg p-2 text-ink-2 hover:bg-muted hover:text-ink">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-line bg-muted/60 px-6 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className={`relative max-h-[90vh] w-full overflow-y-auto ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl bg-card shadow-2xl`}>
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <div className="mt-3 text-sm text-ink-2">{children}</div>
        </div>
        {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-muted px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation for actions that change money or someone's access.
 * With `reasonLabel`, a reason (at least 3 characters) is required before confirming.
 * `onConfirm` may throw; its message is shown and the dialog stays open.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, tone = "primary", reasonLabel, reasonPlaceholder, children, canConfirm = true }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown> | void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  reasonLabel?: string;
  reasonPlaceholder?: string;
  children?: ReactNode;
  canConfirm?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);

  const submit = async () => {
    if (reasonLabel && reason.trim().length < 3) {
      setError("Give a reason (at least 3 characters)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Go back
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} disabled={!canConfirm} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {body}
        {children}
        {reasonLabel && (
          <TextArea
            ref={ref}
            label={reasonLabel}
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            maxLength={500}
          />
        )}
        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
