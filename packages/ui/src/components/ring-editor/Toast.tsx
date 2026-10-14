import { useEffect } from "react";
import { X } from "lucide-react";
import { t } from "../../i18n";

export interface ToastData {
  key: number;
  message: string;
  tone?: "info" | "warn";
  actionLabel?: string;
  onAction?: () => void;
}

const DURATION_MS = 6000;

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  const key = toast?.key;
  useEffect(() => {
    if (key == null) return;
    const t = setTimeout(onDismiss, DURATION_MS);
    return () => clearTimeout(t);
  }, [key, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4"
    >
      {toast && (
        <div
          data-testid="toast"
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-orbit-border-light bg-[#1E1E24] py-2 pl-3.5 pr-2 text-[12px] text-orbit-text-dim shadow-xl shadow-black/50"
        >
          {toast.tone === "warn" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FBBF24]" />}
          <span className="min-w-0 truncate">{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                onDismiss();
              }}
              className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-(--accent) hover:bg-orbit-border"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            aria-label={t("editor.toast.close")}
            onClick={onDismiss}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8B8B95] hover:bg-orbit-border hover:text-orbit-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
