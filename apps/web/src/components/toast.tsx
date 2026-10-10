"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warn";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />,
};

const TONES: Record<ToastTone, string> = {
  success: "border-ok/40 bg-ok-soft text-ok",
  error: "border-danger/40 bg-danger-soft text-danger",
  info: "border-info/40 bg-info-soft text-info",
  warn: "border-warn/40 bg-warn-soft text-warn",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`animate-fade-in pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${TONES[item.tone]}`}
          >
            {ICONS[item.tone]}
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
