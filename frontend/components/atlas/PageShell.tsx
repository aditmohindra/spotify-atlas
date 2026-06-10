import { cn } from "@/lib/utils";

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Constrain content width. Defaults to "lg" (1024px). */
  maxWidth?: "md" | "lg" | "xl" | "2xl" | "full";
}

const maxWidthMap = {
  md:   "max-w-3xl",
  lg:   "max-w-5xl",
  xl:   "max-w-6xl",
  "2xl": "max-w-7xl",
  full: "max-w-none",
} as const;

export function PageShell({
  maxWidth = "xl",
  className,
  children,
  ...props
}: PageShellProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8 py-10",
        maxWidthMap[maxWidth],
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}
