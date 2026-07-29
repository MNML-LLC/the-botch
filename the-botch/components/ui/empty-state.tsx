import * as React from "react";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type EmptyStateAction = {
  label: string;
  href: string;
};

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
};

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </div>
      {action && (
        <Button asChild size="sm" className="bg-slate-800 hover:bg-slate-700">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
