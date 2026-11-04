import "server-only";
import type { ContactLeadPayload } from "@/shared/contracts";

export interface ContactNotificationResult {
  emailSent: boolean;
  discordSent?: boolean;
  error?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildContactNotificationText(lead: ContactLeadPayload): string {
  return [
    `New Contact Form Submission:`,
    ``,
    `Name:     ${lead.fullName}`,
    `Email:    ${lead.email}`,
    `Company:  ${lead.company}`,
    `Role:     ${lead.role || "(not provided)"}`,
    `Service:  ${lead.service}`,
    `Timeline: ${lead.timeline || "(not provided)"}`,
    ``,
    `Message:`,
    lead.message?.trim() || "(no message provided)",
  ].join("\n");
}

export function buildContactNotificationHtml(lead: ContactLeadPayload): string {
  const safeName = escapeHtml(lead.fullName);
  const safeEmail = escapeHtml(lead.email);
  const safeCompany = escapeHtml(lead.company);
  const safeRole = escapeHtml(lead.role || "Not provided");
  const safeService = escapeHtml(lead.service);
  const safeTimeline = escapeHtml(lead.timeline || "Not provided");
  const safeMessage = lead.message?.trim()
    ? escapeHtml(lead.message.trim()).replace(/\n/g, "<br/>")
    : "<em>No message provided</em>";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="margin-top: 0; color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; font-size: 20px;">
        New Contact Inquiry
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; width: 120px; font-weight: 600;">Name:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${safeName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Company:</td>
          <td style="padding: 8px 0; color: #0f172a;">${safeCompany}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Role:</td>
          <td style="padding: 8px 0; color: #0f172a;">${safeRole}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Service:</td>
          <td style="padding: 8px 0; color: #0f172a;">${safeService}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Timeline:</td>
          <td style="padding: 8px 0; color: #0f172a;">${safeTimeline}</td>
        </tr>
      </table>

      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Message</div>
        <div style="color: #334155; line-height: 1.6; font-size: 14px;">${safeMessage}</div>
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <a href="mailto:${safeEmail}?subject=Re:%20Inquiry%20regarding%20${encodeURIComponent(lead.service)}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          Reply to ${safeName}
        </a>
      </div>
    </div>
  `;
}

/**
 * Dispatches notifications for a newly stored contact inquiry.
 * Sends email via Resend to contact@adroit.io.
 * If DISCORD_WEBHOOK_URL is set, also delivers an embed to Discord.
 */
export async function sendContactNotification(
  lead: ContactLeadPayload,
): Promise<ContactNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_NOTIFICATION_TO || "contact@adroit.io";
  const fromEmail = process.env.CONTACT_NOTIFICATION_FROM || "Adroit Inquiries <contact@adroit.io>";

  let emailSent = false;
  let emailError: string | undefined;

  if (!apiKey) {
    console.warn(
      "[contact-notification] RESEND_API_KEY is not configured - skipping email dispatch to " +
        toEmail,
    );
  } else {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          reply_to: lead.email.trim(),
          subject: `[Lead] ${lead.fullName} (${lead.company}) — ${lead.service}`,
          text: buildContactNotificationText(lead),
          html: buildContactNotificationHtml(lead),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "(unable to read body)");
        emailError = `Resend failed with status ${response.status}: ${body.slice(0, 300)}`;
        console.error(`[contact-notification] ${emailError}`);
      } else {
        emailSent = true;
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[contact-notification] Error sending email via Resend:", emailError);
    }
  }

  // Optional Discord notification if webhook URL is configured
  let discordSent: boolean | undefined;
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    try {
      const res = await fetch(discordWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: "New Contact Inquiry",
              color: 0x2563eb,
              fields: [
                { name: "Name", value: lead.fullName, inline: true },
                { name: "Company", value: lead.company, inline: true },
                { name: "Email", value: lead.email, inline: true },
                { name: "Service", value: lead.service, inline: true },
                { name: "Role", value: lead.role || "N/A", inline: true },
                { name: "Timeline", value: lead.timeline || "N/A", inline: true },
                {
                  name: "Message",
                  value: lead.message?.slice(0, 1000) || "No message provided",
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      discordSent = res.ok;
    } catch (err) {
      console.error("[contact-notification] Error sending Discord notification:", err);
      discordSent = false;
    }
  }

  return {
    emailSent,
    discordSent,
    error: emailError,
  };
}
