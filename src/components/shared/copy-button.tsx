"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  toastText?: string;
  className?: string;
  compact?: boolean;
}

export function CopyButton({
  value,
  label,
  toastText = "Copied to clipboard",
  className,
  compact = false,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      toast.success(toastText);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      onClick={handleCopy}
      aria-label={label ? `Copy ${label}` : "Copy to clipboard"}
      className={cn(
        "min-h-11 min-w-11 gap-1.5 font-mono text-xs",
        copied && "border-emerald-300 bg-emerald-50 text-emerald-700",
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-500" />
      )}
      {!compact && label && <span className="truncate max-w-[130px]">{label}</span>}
    </Button>
  );
}

