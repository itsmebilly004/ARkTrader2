import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy Deriv OAuth redirect — no longer used. Redirect to dashboard.
export const Route = createFileRoute("/redirect")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
