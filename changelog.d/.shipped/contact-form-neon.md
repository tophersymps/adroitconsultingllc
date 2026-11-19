### Update contact form to use Neon and email notifications (contact-form-neon)

**What** - Retired the Salesforce Web-to-Lead integration on `/api/contact` in favor of direct persistence in Neon (`public.contact_inquiries`) via `@neondatabase/serverless`. Added email notifications dispatching to `contact@adroit.io` via Resend with customizable from/to environment variables and pre-wired Discord webhook support.

**Why** - Access to the previous Salesforce instance was lost, preventing contact submissions from funneling through. Neon provides a reliable, self-hosted relational store with zero-policy default-deny RLS protection and instant notification dispatch to `contact@adroit.io`.

**Verified** - Applied migration `009_contact_inquiries.sql` to Neon branch `dev-admin-ux`, executed parameterized insert/cleanup tests on the table, verified RLS initplan checks (`src/lib/rls-policy-initplan.test.ts`), ran full vitest suite for the contact route and notifications (`src/app/api/contact/route.test.ts`, `src/lib/contact-notifications.test.ts`), and verified lint (`npm run lint`).

**Known Issues** - None.
