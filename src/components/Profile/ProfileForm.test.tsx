/**
 * ProfileForm — editable display name + username on /profile (client).
 *
 * Locks the WCAG 2.5.8 mobile touch floor for the /profile form: both
 * text inputs and the Clear / Save changes buttons must carry a min-h-[44px]
 * hit target (the account identity surface is a primary touch surface).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProfileForm from "./ProfileForm";

describe("ProfileForm — mobile touch floor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives every field and action a >=44px touch target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { id: "u1" },
        profile: { displayName: "Jane Doe", username: "janedoe" },
      }),
    }));

    render(<ProfileForm />);

    await waitFor(() => expect(screen.getByLabelText("Display name")).toBeEnabled());

    const displayName = screen.getByLabelText("Display name");
    const username = screen.getByLabelText("Username");
    expect(displayName).toHaveClass("min-h-[44px]");
    expect(username).toHaveClass("min-h-[44px]");

    const clear = screen.getByRole("button", { name: "Clear" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(clear).toHaveClass("min-h-[44px]");
    expect(save).toHaveClass("min-h-[44px]");
  });
});