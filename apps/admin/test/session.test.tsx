import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth";

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { admin, loading, bootError } = useAuth();
  return <div data-testid="state">{loading ? "loading" : admin ? `in:${admin.name}` : bootError ? `error:${bootError}` : "out"}</div>;
}

const renderAuth = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );

describe("session restore on page load", () => {
  it("keeps the session when the server can't be reached", async () => {
    localStorage.setItem("pc_admin_token", "saved-token");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent(/^error:/));
    expect(localStorage.getItem("pc_admin_token")).toBe("saved-token");
  });

  it("ends the session when the API says the token is invalid", async () => {
    localStorage.setItem("pc_admin_token", "old-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in" } }), { status: 401 }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
    expect(localStorage.getItem("pc_admin_token")).toBeNull();
  });

  it("restores the admin when the token is valid", async () => {
    localStorage.setItem("pc_admin_token", "good-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "a1", name: "Priya", email: "p@x.in", role: "SUPPORT", cityIds: null, permissions: [] })));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:Priya"));
  });
});
