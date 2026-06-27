"use client";

import { X, AlertTriangle, Loader2 } from "lucide-react";
import { ReactNode } from "react";

// ─── Bottom Sheet Modal ───────────────────────────────────
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full bg-bg-card border-t border-border rounded-t-2xl animate-slide-up safe-bottom max-h-[90dvh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Hapus",
  isLoading = false,
  variant = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isLoading?: boolean;
  variant?: "danger" | "warning";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-bg-card border border-border rounded-2xl p-5 w-full max-w-sm animate-scale-in">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${variant === "danger" ? "bg-danger-bg" : "bg-warning-bg"}`}>
          <AlertTriangle className={`w-6 h-6 ${variant === "danger" ? "text-danger-text" : "text-warning-text"}`} />
        </div>
        <h3 className="text-base font-bold text-text-primary text-center mb-2">
          {title}
        </h3>
        <p className="text-sm text-text-muted text-center mb-5 leading-relaxed">
          {message}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost">
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`${variant === "danger" ? "btn-danger" : "btn-primary"} flex items-center justify-center gap-2`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-bg-elevated border border-border flex items-center justify-center mb-4 text-text-muted">
        {icon}
      </div>
      <p className="text-text-secondary font-semibold mb-1">{title}</p>
      {description && (
        <p className="text-text-muted text-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 rounded" style={{ width: `${55 + (i % 3) * 15}%` }} />
            <div className="skeleton h-3 rounded w-24" />
          </div>
          <div className="skeleton h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────
export function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "success" | "danger" | "warning" | "muted";
}) {
  const variants = {
    default: "bg-bg-elevated text-text-secondary border-border",
    success: "bg-success-bg text-success-text border-success-DEFAULT/20",
    danger: "bg-danger-bg text-danger-text border-danger-DEFAULT/20",
    warning: "bg-warning-bg text-warning-text border-warning-DEFAULT/20",
    muted: "bg-bg-elevated text-text-muted border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  );
}

// ─── Input Field ──────────────────────────────────────────
export function InputField({
  label,
  hint,
  error,
  prefix,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-medium text-text-muted block">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            {prefix}
          </span>
        )}
        <input
          {...props}
          className={`input-field ${prefix ? "pl-8" : ""} ${suffix ? "pr-8" : ""} ${error ? "border-danger-DEFAULT focus:ring-danger-DEFAULT" : ""} ${props.className ?? ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-danger-text">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
