import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only card wrappers used to replace horizontally-scrollable data
 * tables with a stacked card layout on narrow viewports.
 *
 * Usage pattern per page:
 *   <div className="hidden md:block"> ...existing <Table> ... </div>
 *   <MobileCardList className="md:hidden"> ...MobileCard rows... </MobileCardList>
 */

export function MobileCardList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}

interface MobileCardProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function MobileCard({
  title,
  badge,
  onClick,
  actions,
  children,
  className,
}: MobileCardProps) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        "rounded-xl border bg-card shadow-sm p-3 transition-colors",
        clickable && "cursor-pointer active:bg-muted/60 hover:bg-muted/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-sm min-w-0 flex-1 break-words">{title}</div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {children && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {children}
        </div>
      )}
      {actions && (
        <div className="mt-2 pt-2 border-t flex items-center justify-end gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  value,
  full,
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={cn(full && "col-span-2", align === "right" && "text-right")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

/** Utility to wrap an existing table so it hides on mobile. */
export function DesktopOnlyTable({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("hidden md:block", className)}>{children}</div>;
}
