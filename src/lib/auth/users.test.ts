/**
 * users.test.ts — admin reads of Neon Auth users (R2-1).
 *
 * Replaces the GoTrue Admin API helper tests. The driver is mocked, so this
 * asserts the SQL contract the admin routes depend on:
 *   - listAuthUsers returns id+email rows untouched
 *   - getAuthUser is null-safe, validates the URL segment as a UUID and binds
 *     it as `uuid` (Index Scan) — a non-UUID is "no such user", never 22P02
 *   - authUserIdsExist returns only the known subset, deduped, one query
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const query = vi.fn();
  const neon = vi.fn(() => ({ query }));
  return { mocks: { query, neon } };
});

vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

import {
  authUserIdsExist,
  getAuthUser,
  listAuthUsers,
  __resetAuthUsersSqlForTests,
} from "./users";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://user:pass@host/db";
  __resetAuthUsersSqlForTests();
});

describe("listAuthUsers", () => {
  it("returns id + email for every auth user", async () => {
    mocks.query.mockResolvedValue([
      { id: "u1", email: "a@adroit.io" },
      { id: "u2", email: "b@adroit.io" },
    ]);
    const users = await listAuthUsers();
    expect(users).toEqual([
      { id: "u1", email: "a@adroit.io" },
      { id: "u2", email: "b@adroit.io" },
    ]);
    const [sqlText] = mocks.query.mock.calls[0];
    expect(sqlText).toContain('FROM neon_auth."user"');
  });

  it("creates the driver once per process", async () => {
    mocks.query.mockResolvedValue([]);
    await listAuthUsers();
    await listAuthUsers();
    expect(mocks.neon).toHaveBeenCalledTimes(1);
  });
});

describe("getAuthUser", () => {
  const UUID = "3f2b8c1e-9d4a-4f7b-8c2d-1a6e5b9f0c3d";

  it("returns the matching user", async () => {
    mocks.query.mockResolvedValue([{ id: UUID, email: "a@adroit.io" }]);
    await expect(getAuthUser(UUID)).resolves.toEqual({
      id: UUID,
      email: "a@adroit.io",
    });
  });

  it("returns null for an unknown id", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(getAuthUser(UUID)).resolves.toBeNull();
  });

  it("returns null without querying for an empty id", async () => {
    await expect(getAuthUser("")).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("binds the id as uuid so the PK index is usable", async () => {
    mocks.query.mockResolvedValue([]);
    await getAuthUser(UUID);
    const [sqlText, params] = mocks.query.mock.calls[0];
    expect(sqlText).toContain("id = $1::uuid");
    expect(sqlText).not.toContain("id::text =");
    /* ::text on OUTPUT only. */
    expect(sqlText).toContain("id::text AS id");
    expect(params).toEqual([UUID]);
  });

  it("returns null without querying for a non-UUID id (no 22P02 cast)", async () => {
    await expect(getAuthUser("not-a-uuid")).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("authUserIdsExist", () => {
  const UUID1 = "3f2b8c1e-9d4a-4f7b-8c2d-1a6e5b9f0c3d";
  const UUID2 = "7a1d0c3b-5e2f-4a8b-9c6d-0f1e2a3b4c5d";
  const UUID3 = "b4c5d6e7-f8a9-4b0c-8d1e-2f3a4b5c6d7e";

  it("returns only the ids that exist, deduped into one array-bind query", async () => {
    mocks.query.mockResolvedValue([{ id: UUID1 }, { id: UUID3 }]);
    const known = await authUserIdsExist([
      UUID1,
      UUID2,
      UUID3,
      UUID1,
      "",
      "not-a-uuid",
    ]);
    expect(known).toEqual(new Set([UUID1, UUID3]));
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sqlText, params] = mocks.query.mock.calls[0];
    expect(sqlText).toContain("id = ANY($1::uuid[])");
    expect(sqlText).not.toContain("id::text IN");
    expect(params).toEqual([[UUID1, UUID2, UUID3]]);
  });

  it("short-circuits with no ids", async () => {
    const known = await authUserIdsExist([]);
    expect(known.size).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("short-circuits when every id is a non-UUID", async () => {
    const known = await authUserIdsExist(["", "1", "2", "not-a-uuid"]);
    expect(known.size).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
