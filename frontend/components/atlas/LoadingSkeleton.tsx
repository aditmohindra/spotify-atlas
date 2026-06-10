import { cn } from "@/lib/utils";

export interface LoadingSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render multiple stacked skeleton lines. When set, `className` applies to each line. */
  lines?: number;
  /** Make the last line shorter — typical for paragraph text. */
  shortenLast?: boolean;
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-full bg-border",
        className,
      )}
    />
  );
}

export function LoadingSkeleton({
  lines,
  shortenLast = true,
  className,
  ...props
}: LoadingSkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className={cn("flex flex-col gap-2", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine
            key={i}
            className={cn(
              "h-3",
              shortenLast && i === lines - 1 ? "w-2/3" : "w-full",
              className,
            )}
          />
        ))}
      </div>
    );
  }

  return <SkeletonLine className={cn("h-3 w-full", className)} {...props} />;
}

/** Pre-built skeleton for an AtlasCard — matches default card padding. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-surface border border-border rounded-atlas-lg p-6 shadow-card", className)}>
      <div className="flex flex-col gap-3">
        <LoadingSkeleton className="h-4 w-1/3" />
        <LoadingSkeleton className="h-3 w-full" />
        <LoadingSkeleton className="h-3 w-5/6" />
        <LoadingSkeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
