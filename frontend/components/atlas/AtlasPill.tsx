import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-ui font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        /** Green — active filter, selected archetype. */
        green: "bg-green-soft text-green-dark",
        /** Neutral tint — default tag. */
        muted: "bg-surface-soft text-muted border border-border",
        /** Outline only — inactive filter. */
        outline: "border border-border text-muted bg-transparent hover:bg-surface-soft",
        /** Solid ink — high contrast tag. */
        ink: "bg-ink/8 text-ink",
      },
      size: {
        xs: "text-[10px] px-2 py-0.5",
        sm: "text-xs px-2.5 py-1",
        md: "text-sm px-3 py-1.5",
      },
    },
    defaultVariants: {
      variant: "muted",
      size: "sm",
    },
  },
);

export interface AtlasPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function AtlasPill({
  variant,
  size,
  className,
  children,
  ...props
}: AtlasPillProps) {
  return (
    <span className={cn(pillVariants({ variant, size }), className)} {...props}>
      {children}
    </span>
  );
}
