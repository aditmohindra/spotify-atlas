import { cn } from "@/lib/utils";

export interface AtlasBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "green" | "muted" | "rarity";
  /** Rarity value — drives colour when variant is "rarity". */
  rarity?: "Extremely Rare" | "Rare" | "Niche" | "Underground" | "Core";
}

const rarityStyles: Record<string, string> = {
  "Extremely Rare": "bg-green-soft text-green-dark",
  "Rare":           "bg-amber-50 text-amber-600",
  "Niche":          "bg-purple-100 text-purple-700",
  "Underground":    "bg-blue-50 text-blue-600",
  "Core":           "bg-surface-soft text-muted border border-border",
};

export function AtlasBadge({
  variant = "muted",
  rarity,
  className,
  children,
  ...props
}: AtlasBadgeProps) {
  const base =
    "inline-flex items-center rounded-full font-ui font-semibold text-[10px] px-2 py-0.5 tracking-wide whitespace-nowrap";

  const variantClass =
    variant === "rarity" && rarity
      ? rarityStyles[rarity] ?? rarityStyles["Core"]
      : variant === "green"
        ? "bg-green-soft text-green-dark"
        : "bg-surface-soft text-muted border border-border";

  return (
    <span className={cn(base, variantClass, className)} {...props}>
      {children}
    </span>
  );
}
