import { cn } from "@/lib/utils";

/** Marca do Grupo Ley — monograma "L" em bloco com gradiente da marca. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-primary text-primary-foreground shadow-sm",
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4v16h10" />
      </svg>
    </span>
  );
}
