import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Ajuda } from "@/components/ajuda";
import { Card } from "@/components/ui/card";

type Tom = "default" | "brand" | "success" | "warning" | "danger";

const TONS: Record<Tom, { ring: string; icon: string; chip: string }> = {
  default: {
    ring: "",
    icon: "bg-secondary text-secondary-foreground",
    chip: "",
  },
  brand: {
    ring: "",
    icon: "bg-brand/10 text-brand",
    chip: "",
  },
  success: {
    ring: "",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    chip: "",
  },
  warning: {
    ring: "",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    chip: "",
  },
  danger: {
    ring: "ring-1 ring-red-500/20",
    icon: "bg-red-500/10 text-red-600 dark:text-red-400",
    chip: "",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tom = "default",
  ajuda,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tom?: Tom;
  ajuda?: string;
}) {
  const t = TONS[tom];
  return (
    <Card className={cn("p-5 transition-shadow hover:shadow-md", t.ring)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {label}
            {ajuda && <Ajuda titulo={label} texto={ajuda} />}
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint && (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
              t.icon
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}
