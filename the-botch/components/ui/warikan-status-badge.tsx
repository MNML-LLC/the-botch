import * as React from "react";

import { cn } from "@/lib/utils";
import { WARIKAN_STATUS_LABELS } from "@/lib/constants";
import type { WarikanStatus } from "@/lib/generated/prisma/client";

const STATUS_STYLES: Record<WarikanStatus, string> = {
  ENTERING: "bg-blue-100 text-blue-700",
  PAYING: "bg-amber-100 text-amber-700",
  CLOSED: "bg-green-100 text-green-700",
};

type WarikanStatusBadgeProps = {
  status: WarikanStatus;
  className?: string;
};

function WarikanStatusBadge({ status, className }: WarikanStatusBadgeProps) {
  return (
    <span
      data-slot="warikan-status-badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {WARIKAN_STATUS_LABELS[status]}
    </span>
  );
}

export { WarikanStatusBadge };
export type { WarikanStatusBadgeProps };
