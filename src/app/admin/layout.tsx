import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin";
import { AdminShell } from "@/components/Admin/AdminShell";

/**
 * /admin is never meant to be indexed — it's a gated management surface. The
 * server role guard 404s non-admins (defense-in-depth), and this noindex keeps
 * search engines from ever surfacing it even if they reach a logged-in shell
 * (t_d2dfc405 SEO finding). robots.ts also disallows /admin/.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The /admin layout guards on the request's session cookie (US-016). A
 * static prerender would bake a no-user snapshot and 404 every admin for all
 * time — force dynamic so the role gate evaluates per request (and so the
 * build doesn't execute the Supabase access seam without env in CI).
 */
export const dynamic = "force-dynamic";

/**
 * /admin layout — server-side role guard (US-016). Non-admins get a 404 (the
 * shell is never even rendered). This is the FIRST gate; every API route also
 * checks isAdmin (defense-in-depth — hiding the nav is never the only guard).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminPage();
  if (!admin) notFound();

  return <AdminShell>{children}</AdminShell>;
}
