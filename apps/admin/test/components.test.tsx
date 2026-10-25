import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { AuthProvider } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";

afterEach(() => vi.restoreAllMocks());

describe("ConfirmDialog", () => {
  it("won't confirm without a reason", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onClose={() => {}} onConfirm={onConfirm} title="Reject driver?" confirmLabel="Reject" reasonLabel="Reason" />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Give a reason");

    await userEvent.type(screen.getByLabelText("Reason"), "Licence photo is blurred");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledWith("Licence photo is blurred");
  });

  it("keeps the dialog open and shows the server's message when the action fails", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={() => Promise.reject(new Error("This ride isn't waiting for approval"))}
        title="Approve?"
        confirmLabel="Approve"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't waiting for approval");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("LoginPage", () => {
  it("shows the API's error message for a wrong password", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Email or password is incorrect" } }), { status: 401 }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByLabelText("Email"), "admin@primecabs.local");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
  });

  it("asks for both fields before calling the server", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email and password");
    expect(spy).not.toHaveBeenCalled();
  });
});
