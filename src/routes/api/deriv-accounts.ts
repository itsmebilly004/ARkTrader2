import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/deriv-accounts")({
  server: {
    handlers: {
      POST: async () => Response.json({ error: "Deriv OAuth not used" }, { status: 404 }),
    },
  },
});
