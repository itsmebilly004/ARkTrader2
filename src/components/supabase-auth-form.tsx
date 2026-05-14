import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

interface SupabaseAuthFormProps {
  defaultMode?: "signin" | "signup";
  onSuccess?: () => void;
}

export function SupabaseAuthForm({
  defaultMode = "signin",
  onSuccess,
}: SupabaseAuthFormProps) {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [busy, setBusy] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        toast.success("Account created! Check your email to confirm.");
        form.reset();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        toast.success("Signed in successfully.");
        form.reset();
        onSuccess?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out.");
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (user) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Signed in as</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={handleSignOut}
        >
          {busy ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <h2 className="text-xl font-semibold">
          {mode === "signup" ? "Create account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Enter your email and a password to register."
            : "Enter your credentials to sign in."}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            form.reset();
          }}
        >
          {mode === "signup" ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}
