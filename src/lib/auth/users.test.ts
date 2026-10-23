/**
 * users.test.ts — admin reads of Neon Auth users (R2-1).
 *
 * Replaces the GoTrue Admin API helper tests. The driver is mocked, so this
 * asserts the SQL contract the admin routes depend on:
 *   - listAuthUsers returns id+email rows untouched
 *   - getAuthUser is null-safe and matches on id::text (no uuid cast 500)
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
  it("returns the matching user", async () => {
    mocks.query.mockResolvedValue([{ id: "u1", email: "a@adroit.io" }]);
    await expect(getAuthUser("u1")).resolves.toEqual({
      id: "u1",
      email: "a@adroit.io",
    });
  });

  it("returns null for an unknown id", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(getAuthUser("missing")).resolves.toBeNull();
  });

  it("returns null without querying for an empty id", async () => {
    await expect(getAuthUser("")).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("compares id::text so a non-UUID id cannot raise a cast error", async () => {
    mocks.query.mockResolvedValue([]);
    await getAuthUser("not-a-uuid");
    const [sqlText] = mocks.query.mock.calls[0];
    expect(sqlText).toContain("id::text = $1");
  });
});

describe("authUserIdsExist", () => {
  it("returns only the ids that exist, deduped into one query", async () => {
    mocks.query.mockResolvedValue([{ id: "1" }, { id: "3" }]);
    const known = await authUserIdsExist(["1", "2", "3", "1", ""]);
    expect(known).toEqual(new Set(["1", "3"]));
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sqlText, params] = mocks.query.mock.calls[0];
    expect(sqlText).toContain("IN ($1, $2, $3)");
    expect(params).toEqual(["1", "2", "3"]);
  });

  it("short-circuits with no ids", async () => {
    const known = await authUserIdsExist([]);
    expect(known.size).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
