import { createFileRoute, redirect } from "@tanstack/react-router";

// OAuth callback is no longer used — redirect straight to the dashboard.
export const Route = createFileRoute("/deriv-callback")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
