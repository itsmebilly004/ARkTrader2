import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { BrandLogo } from "@/components/brand-logo";
import { SupabaseAuthForm } from "@/components/supabase-auth-form";
import { useAuth } from "@/hooks/use-auth";

const search = z.object({
  mode: z.enum(["signin", "signup"]).catch("signin"),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: search,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <BrandLogo className="h-10 w-auto" />
        <p className="text-sm text-muted-foreground">ArkTrader Hub</p>
      </div>
      <SupabaseAuthForm
        defaultMode={mode}
        onSuccess={() => navigate({ to: "/dashboard" })}
      />
    </div>
  );
}
