import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-glass-border bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo imageClassName="size-10 rounded-[12px]" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="/#features" className="hover:text-foreground">
            Features
          </a>
          <a href="/#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="/#disclaimer" className="hover:text-foreground">
            Risk
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild>
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth" search={{ mode: "signin" }}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="shadow-[0_0_30px_-5px_oklch(0.78_0.16_230_/_0.5)]">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Sign up
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
