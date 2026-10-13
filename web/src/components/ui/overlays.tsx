import { useState, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  DialogPrimitive as D,
  HoverCardPrimitive as H,
  DropdownPrimitive as M,
} from "../../../addons/ui";
export { M as DropdownMenu };
// shadcn/ui's Radix composition, with the site's semantic CSS tokens.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  sheet = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  sheet?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : document.querySelector<HTMLElement>(
                  ".wallet-chip, .wallet-button",
                );
            target?.focus();
          }}
          className={sheet ? "dialog-content sheet-content" : "dialog-content"}
          aria-describedby={description ? "dialog-description" : undefined}
        >
          <D.Title className="dialog-title">{title}</D.Title>
          {description && (
            <D.Description id="dialog-description" className="muted">
              {description}
            </D.Description>
          )}
          <D.Close
            className="icon-button dialog-close"
            aria-label="Close dialog"
          >
            <X size={20} />
          </D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export function HoverCard({
  children,
  content,
  label,
}: {
  children: ReactNode;
  content: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    contentRef = useRef<HTMLDivElement>(null);
  return (
    <H.Root open={open} onOpenChange={setOpen} openDelay={180} closeDelay={160}>
      <H.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className="info-trigger"
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setTimeout(() => {
                const target =
                  contentRef.current?.querySelector<HTMLElement>("button") ||
                  contentRef.current;
                target?.focus();
              }, 0);
            }
          }}
        >
          {children}
        </button>
      </H.Trigger>
      <H.Portal>
        <H.Content
          ref={contentRef}
          tabIndex={-1}
          onFocus={() => setOpen(true)}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            trigger.current?.focus();
            setOpen(false);
          }}
          className="hover-card"
          sideOffset={8}
          collisionPadding={16}
        >
          {content}
        </H.Content>
      </H.Portal>
    </H.Root>
  );
}
