import brandLogoUrl from "@/assets/ArkTrader logo.jpeg";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  imageClassName,
  label = "ArkTrader Hub",
  labelClassName,
  showLabel = true,
}: {
  className?: string;
  imageClassName?: string;
  label?: string;
  labelClassName?: string;
  showLabel?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <img
        src={brandLogoUrl}
        alt=""
        aria-hidden="true"
        className={cn("size-10 shrink-0 rounded-[10px] object-cover", imageClassName)}
      />
      <span
        className={cn(
          showLabel ? "truncate text-lg font-semibold tracking-tight" : "sr-only",
          labelClassName,
        )}
      >
        {label}
      </span>
    </span>
  );
}
