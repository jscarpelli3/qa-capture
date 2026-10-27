"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({ idle, pending, className, disabled = false }: { idle: string; pending: string; className?: string; disabled?: boolean }) {
  const status = useFormStatus();
  return <button className={className} type="submit" disabled={disabled || status.pending} aria-busy={status.pending}>{status.pending ? <><span className="buttonSpinner" aria-hidden="true" />{pending}</> : idle}</button>;
}
