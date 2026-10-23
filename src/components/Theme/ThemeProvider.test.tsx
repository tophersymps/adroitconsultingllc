/**
 * ThemeProvider — hydration contract (QA R2-4 F4).
 *
 * The stored theme lives in localStorage, which the server cannot read. The
 * provider must (a) render the light/OS-light state on the server AND during
 * hydration so React keeps the server markup, (b) then switch to the stored
 * preference, and (c) never write the pre-hydration default back over the
 * visitor's stored preference — that last one silently reset every dark-mode
 * visitor to light on load.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { ThemeProvider, useThemeContext } from "./ThemeProvider";

function Probe() {
  const { mode, resolvedDark } = useThemeContext();
  return (
    <span data-testid="mode">
      {mode}:{String(resolvedDark)}
    </span>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeProvider hydration", () => {
  it("renders the light default on the server", () => {
    const html = renderToString(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(html).toContain(">light<");
    expect(html).toContain(">false<");
  });

  it("adopts a stored dark preference after hydration without overwriting it", async () => {
    window.localStorage.setItem(
      "adroit-theme",
      JSON.stringify({ mode: "dark", v: 2 }),
    );

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId("mode")).toHaveTextContent("dark:true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("adroit-theme")!)).toEqual({
      mode: "dark",
      v: 2,
    });
  });
});
