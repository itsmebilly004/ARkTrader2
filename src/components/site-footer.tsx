import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-glass-border py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-center">
        <div>
          <BrandLogo imageClassName="size-10 rounded-[12px]" labelClassName="font-semibold" />
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Independent third-party platform built on top of the Deriv API. Not affiliated with
            Deriv.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/" className="hover:text-foreground">
            Privacy
          </Link>
          <a
            href="https://deriv.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Deriv
          </a>
        </div>
      </div>
    </footer>
  );
}
