/**
 * src/lib/access.identity.test.ts — regression for the R2-1 identity split
 * (task t_33739716, HIGH finding from the security review t_78da64c1).
 *
 * The bug: after R2-1, `getAccessUserId()` returns the Managed Better Auth id
 * while `loadRole()` keys `public.user_roles` by that same id. For a legacy
 * (Supabase-era) account the two ids did not exist in the same place, so the
 * role read found nothing and every admin resolved as `member` → `/admin` and
 * every `/api/admin/*` route 403'd.
 *
 * The fix is data (supabase/migrations/neon/005_identity_continuity.sql
 * imports each legacy identity into neon_auth."user" with its ORIGINAL uuid),
 * so this test pins the CONTRACT the fix relies on:
 *   1. the id from the session is passed to the role lookup unchanged;
 *   2. the role lookup is keyed by id only — never by email (an email-keyed
 *      lookup would let whoever controls a staff address inherit the role);
 *   3. an imported admin id therefore resolves `isAdmin: true`, and a guest
 *      triggers no role lookup at all.
 *
 * The live data invariant is proved separately by
 * scripts/verify-identity-continuity.py (read-only, against the real DB).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { getSessionUser: vi.fn() },
  db: { role: null as { role: string } | null, lookups: [] as string[] },
}));

vi.mock("@/lib/session", () => ({ getSessionUser: h.session.getSessionUser }));

vi.mock("@/lib/db/server", () => {
  interface FakeQuery {
    select: () => FakeQuery;
    eq: (column: string, value: string) => FakeQuery;
    is: () => FakeQuery;
    order: () => FakeQuery;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
  }
  function makeQuery(table: string): FakeQuery {
    const q: FakeQuery = {
      select: () => q,
      eq: (column, value) => {
        h.db.lookups.push(`${table}.${column}=${value}`);
        return q;
      },
      is: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: h.db.role, error: null }),
    };
    return q;
  }
  return {
    getSupabaseServerClient: async () => ({
      from: (table: string) => makeQuery(table),
    }),
  };
});

import { accessSeam, getAccessUserId } from "@/lib/access";

/** Real ids from the legacy public."user" table (imported verbatim by 005). */
const IMPORTED_ADMIN_ID = "eeafd509-9093-4117-90a4-b9e5ceed790e";
const IMPORTED_ADMIN_EMAIL = "chris.sympson@gmail.com";
const IMPORTED_MEMBER_ID = "5552e4cb-895e-4622-b608-efd45b7165f5";

beforeEach(() => {
  h.db.lookups.length = 0;
  h.db.role = { role: "admin" };
  h.session.getSessionUser.mockReset();
});

describe("identity continuity: getAccessUserId → loadRole", () => {
  it("resolves an imported legacy admin id as admin", async () => {
    h.session.getSessionUser.mockResolvedValue({
      id: IMPORTED_ADMIN_ID,
      email: IMPORTED_ADMIN_EMAIL,
      name: "chris.sympson",
    });

    const userId = await getAccessUserId();
    expect(userId).toBe(IMPORTED_ADMIN_ID);

    await expect(accessSeam.isAdmin(userId)).resolves.toBe(true);
    expect(h.db.lookups).toEqual([`user_roles.user_id=${IMPORTED_ADMIN_ID}`]);
  });

  it("keys the role lookup by id only — never by email", async () => {
    h.session.getSessionUser.mockResolvedValue({
      id: IMPORTED_ADMIN_ID,
      email: IMPORTED_ADMIN_EMAIL,
      name: "chris.sympson",
    });

    await accessSeam.isAdmin(await getAccessUserId());

    expect(h.db.lookups).toHaveLength(1);
    expect(h.db.lookups[0]).not.toContain("@");
    expect(h.db.lookups[0]).not.toContain(IMPORTED_ADMIN_EMAIL);
    expect(h.db.lookups[0]).toContain("user_id");
  });

  it("an imported non-admin resolves as member (no privilege from the import)", async () => {
    h.session.getSessionUser.mockResolvedValue({
      id: IMPORTED_MEMBER_ID,
      email: "natalie.sympson@gmail.com",
      name: "natalie.sympson",
    });
    h.db.role = { role: "member" };

    await expect(accessSeam.isAdmin(await getAccessUserId())).resolves.toBe(false);
    expect(h.db.lookups).toEqual([`user_roles.user_id=${IMPORTED_MEMBER_ID}`]);
  });

  it("an identity with no role row is not an admin", async () => {
    h.session.getSessionUser.mockResolvedValue({
      id: "c35bcdce-05da-465f-8d2f-0131037250fe",
      email: "sympson3w@hotmail.com",
      name: "sympson3w",
    });
    h.db.role = null;

    await expect(accessSeam.isAdmin(await getAccessUserId())).resolves.toBe(false);
  });

  it("a guest resolves no id and performs no role lookup", async () => {
    h.session.getSessionUser.mockResolvedValue(null);

    const userId = await getAccessUserId();
    expect(userId).toBeNull();
    await expect(accessSeam.isAdmin(userId)).resolves.toBe(false);
    expect(h.db.lookups).toEqual([]);
  });
});
