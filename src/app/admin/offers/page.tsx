import Link from "next/link";

/**
 * /admin/offers — Offers · Coupons placeholder (ADR-224). Honest empty state:
 * billing/coupons/trials are design-time affordances ONLY — no Stripe, no
 * schema migration, nothing implying billing is live. Static read-only page,
 * gated by the /admin layout.
 */
export default function AdminOffersPage() {
  return (
    <div className="max-w-[760px]">
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
        Offers · Coupons
      </h1>
      <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 mb-6">
        Discount codes, trials, and one-time offers.
      </p>

      <div className="rounded-2xl border border-dashed px-6 py-8" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-sunken)" }}>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--signal-pending)] mb-2">
          Coming with billing
        </div>
        <h2 className="text-[16px] font-bold text-[var(--ink-primary)] mb-1">
          No offers yet.
        </h2>
        <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed">
          Coupons and trials land when billing ships. Until then, access is
          granted directly (Grant / One-time) or covered by a subscription —
          no offers are live.
        </p>
        <div className="mt-4">
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold no-underline hover:underline"
            style={{ color: "var(--color-red)" }}
          >
            Grant access directly →
          </Link>
        </div>
      </div>
    </div>
  );
}
