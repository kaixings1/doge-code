import { cn } from "@/lib/utils";

/**
 * Pulsing dot that signals "in flight, watch this." Sky/blue tone is reserved
 * for liveness so it doesn't collide with success/destructive badges.
 *
 * Size: `sm` for inline-with-text, `md` for status rails in lists.
 */
export function RunningDot({
  size = "sm",
  className,
  "aria-label": ariaLabel = "Running",
}: {
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  const px = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn("relative inline-flex", px, className)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 inline-flex rounded-full bg-sky-400 opacity-60",
          "motion-safe:animate-ping",
        )}
      />
      <span
        aria-hidden
        className={cn("relative inline-flex rounded-full bg-sky-500", px)}
      />
    </span>
  );
}
