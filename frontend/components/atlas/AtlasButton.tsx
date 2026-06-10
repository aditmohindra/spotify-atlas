import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-ui font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        /** Solid Spotify green — primary actions. */
        primary:
          "bg-green text-white hover:bg-green-dark active:scale-[0.98] shadow-sm",
        /** White with border — secondary/neutral actions. */
        secondary:
          "bg-surface text-ink border border-border hover:bg-surface-soft active:scale-[0.98] shadow-card",
        /** No background — tertiary/text actions. */
        ghost:
          "text-muted hover:text-ink hover:bg-surface-soft active:scale-[0.98]",
        /** Green tint — soft positive action. */
        "green-soft":
          "bg-green-soft text-green-dark hover:bg-green/20 active:scale-[0.98]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-atlas-sm gap-1.5",
        md: "h-10 px-5 text-sm rounded-atlas-sm",
        lg: "h-12 px-7 text-base rounded-atlas-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface AtlasButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function AtlasButton({
  variant,
  size,
  className,
  children,
  ...props
}: AtlasButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
