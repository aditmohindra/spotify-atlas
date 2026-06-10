import { cn } from "@/lib/utils";

export interface StatBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The metric value — rendered in JetBrains Mono. */
  value: string | number;
  /** Short descriptive label below the value. */
  label: string;
  /** Optional unit appended to the value (e.g. "%", "K"). */
  unit?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { value: "text-xl",  label: "text-xs" },
  md: { value: "text-3xl", label: "text-xs" },
  lg: { value: "text-5xl", label: "text-sm" },
} as const;

export function StatBlock({
  value,
  label,
  unit,
  size = "md",
  className,
  ...props
}: StatBlockProps) {
  const { value: valueSize, label: labelSize } = sizeMap[size];

  return (
    <div className={cn("flex flex-col gap-0.5", className)} {...props}>
      <span className={cn("font-stat font-semibold text-ink leading-none tabular-nums", valueSize)}>
        {value}
        {unit && (
          <span className="font-normal ml-0.5" style={{ fontSize: "0.55em", color: "#667085" }}>
            {unit}
          </span>
        )}
      </span>
      <span
        className={cn("font-ui tracking-wide uppercase", labelSize)}
        style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", color: "#667085" }}
      >
        {label}
      </span>
    </div>
  );
}
