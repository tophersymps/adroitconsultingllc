import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildContactNotificationText,
  buildContactNotificationHtml,
  sendContactNotification,
} from "./contact-notifications";
import type { ContactLeadPayload } from "@/shared/contracts";

const sampleLead: ContactLeadPayload = {
  fullName: "Alice Smith",
  email: "alice@example.com",
  company: "Example Enterprises",
  role: "VP Engineering",
  service: "OmniStudio Architecture",
  timeline: "Next quarter",
  message: "Looking for consultation on scaling our platform.",
};

describe("contact-notifications text & html formatting", () => {
  it("formats plain text summary with all fields", () => {
    const text = buildContactNotificationText(sampleLead);
    expect(text).toContain("Name:     Alice Smith");
    expect(text).toContain("Email:    alice@example.com");
    expect(text).toContain("Company:  Example Enterprises");
    expect(text).toContain("Role:     VP Engineering");
    expect(text).toContain("Service:  OmniStudio Architecture");
    expect(text).toContain("Timeline: Next quarter");
    expect(text).toContain("Looking for consultation on scaling our platform.");
  });

  it("escapes malicious HTML in form fields to prevent email HTML injection", () => {
    const maliciousLead: ContactLeadPayload = {
      fullName: "<script>alert('xss')</script>",
      email: "attacker@example.com",
      company: "<b>Bold Corp</b>",
      service: "Security Audit",
      message: "<img src=x onerror=alert(1)>",
    };

    const html = buildContactNotificationHtml(maliciousLead);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Bold Corp&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("sendContactNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips email sending when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendContactNotification(sampleLead);
    expect(result.emailSent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dispatches email to contact@adroit.io when RESEND_API_KEY is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_12345");
    vi.stubEnv("CONTACT_NOTIFICATION_TO", "contact@adroit.io");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");

    let capturedUrl: string | undefined;
    let capturedOptions: RequestInit | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
        capturedUrl = String(url);
        capturedOptions = options;
        return new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await sendContactNotification(sampleLead);
    expect(result.emailSent).toBe(true);
    expect(capturedUrl).toBe("https://api.resend.com/emails");
    expect(capturedOptions?.method).toBe("POST");

    const headers = capturedOptions?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer re_test_12345");

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body.to).toEqual(["contact@adroit.io"]);
    expect(body.reply_to).toBe("alice@example.com");
    expect(body.subject).toContain("Alice Smith");
    expect(body.subject).toContain("Example Enterprises");
  });

  it("dispatches discord webhook when DISCORD_WEBHOOK_URL is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/123/abc");

    let discordCalled = false;
    let discordBody: unknown;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
        if (String(url).includes("discord.com")) {
          discordCalled = true;
          discordBody = JSON.parse(options?.body as string);
          return new Response(null, { status: 204 });
        }
        return new Response("Not found", { status: 404 });
      }),
    );

    const result = await sendContactNotification(sampleLead);
    expect(result.discordSent).toBe(true);
    expect(discordCalled).toBe(true);
    expect((discordBody as { embeds: unknown[] }).embeds).toBeDefined();
  });

  it("handles Resend API error cleanly without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_invalid_key");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("Forbidden: Invalid API key", { status: 403 });
      }),
    );

    const result = await sendContactNotification(sampleLead);
    expect(result.emailSent).toBe(false);
    expect(result.error).toContain("403");
  });
});
