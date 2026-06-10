import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "relative transition-all duration-150",
  {
    variants: {
      variant: {
        /** White surface, border, soft drop shadow. Default for most cards. */
        default: "bg-surface border border-border shadow-card rounded-atlas-lg",
        /** Tinted surface — use inside already-white sections. */
        soft: "bg-surface-soft border border-border rounded-atlas-lg",
        /** Large hero cards (identity, community hero). */
        hero: "bg-surface border border-border shadow-card rounded-atlas-hero",
        /** No background, no border — raw container with radius only. */
        ghost: "rounded-atlas-md",
      },
      hoverable: {
        true: "hover-lift cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      hoverable: false,
    },
  },
);

export interface AtlasCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Forward a padding preset instead of applying className manually. */
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export function AtlasCard({
  variant,
  hoverable,
  padding = "md",
  className,
  children,
  ...props
}: AtlasCardProps) {
  return (
    <div
      className={cn(cardVariants({ variant, hoverable }), paddingMap[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
}
