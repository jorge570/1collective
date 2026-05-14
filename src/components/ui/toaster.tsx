"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-[var(--color-popover)] text-[var(--color-popover-foreground)] border shadow-lg",
          description: "text-[var(--color-muted-foreground)]",
          actionButton: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
          cancelButton: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        },
      }}
    />
  );
}

export { toast } from "sonner";
