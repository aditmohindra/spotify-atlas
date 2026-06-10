import { cn } from "@/lib/utils";

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Optional element aligned to the right of the title row. */
  action?: React.ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      {eyebrow && (
        <span className="text-eyebrow">{eyebrow}</span>
      )}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-ink leading-snug">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {subtitle && (
        <p className="text-sm text-muted leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
