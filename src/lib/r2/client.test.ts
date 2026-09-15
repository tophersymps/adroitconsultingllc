/**
 * client.test.ts — src/lib/r2/client.ts (Cloudflare R2 / S3 read path).
 *
 * Locks the three things the audio routes depend on:
 *   1. env contract — all four R2_* vars required, missing ones named, and the
 *      endpoint derived from the account id (region "auto", path-style);
 *   2. error mapping — a missing object becomes null (route -> 404) while any
 *      other failure throws (route -> fail-closed 401); never a URL;
 *   3. server-side only read — a GetObject with the configured bucket and key.
 * The AWS SDK itself is mocked: no network, no credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  send: vi.fn(),
  constructorOptions: [] as unknown[],
  commands: [] as { input: unknown }[],
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(options: unknown) {
      hoisted.constructorOptions.push(options);
    }
    send = hoisted.send;
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {
      hoisted.commands.push(this as unknown as { input: unknown });
    }
  },
}));

import {
  getR2Object,
  isMissingObjectError,
  readR2Config,
  r2Endpoint,
  resetR2Client,
  R2_ENV_KEYS,
} from "./client";

const FULL_ENV = {
  R2_ACCOUNT_ID: "acct-1234",
  R2_BUCKET: "adroit-audio",
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret",
};

function streamOf(bytes: Uint8Array) {
  return { transformToByteArray: async () => bytes };
}

describe("readR2Config", () => {
  it("reads all four values and derives the R2 S3 endpoint", () => {
    const config = readR2Config({ ...FULL_ENV } as unknown as NodeJS.ProcessEnv);
    expect(config).toEqual({
      accountId: "acct-1234",
      bucket: "adroit-audio",
      accessKeyId: "key-id",
      secretAccessKey: "secret",
      endpoint: "https://acct-1234.r2.cloudflarestorage.com",
    });
  });

  it("throws and names every missing env var", () => {
    expect(() =>
      readR2Config({ R2_BUCKET: "adroit-audio" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/);
  });

  it("throws when nothing is configured", () => {
    expect(() => readR2Config({} as unknown as NodeJS.ProcessEnv)).toThrow(/incomplete/);
  });

  it("exposes the canonical env var names", () => {
    expect(R2_ENV_KEYS).toEqual({
      accountId: "R2_ACCOUNT_ID",
      bucket: "R2_BUCKET",
      accessKeyId: "R2_ACCESS_KEY_ID",
      secretAccessKey: "R2_SECRET_ACCESS_KEY",
    });
  });

  it("builds the endpoint from an account id", () => {
    expect(r2Endpoint("abc")).toBe("https://abc.r2.cloudflarestorage.com");
  });
});

describe("isMissingObjectError", () => {
  it("treats NoSuchKey / NotFound / NoSuchBucket / HTTP 404 as missing", () => {
    expect(isMissingObjectError({ name: "NoSuchKey" })).toBe(true);
    expect(isMissingObjectError({ name: "NotFound" })).toBe(true);
    expect(isMissingObjectError({ name: "NoSuchBucket" })).toBe(true);
    expect(isMissingObjectError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it("does NOT treat an auth or network failure as a missing object", () => {
    expect(isMissingObjectError({ name: "AccessDenied" })).toBe(false);
    expect(isMissingObjectError({ name: "TimeoutError" })).toBe(false);
    expect(isMissingObjectError(new Error("boom"))).toBe(false);
    expect(isMissingObjectError(null)).toBe(false);
    expect(isMissingObjectError("nope")).toBe(false);
  });
});

describe("getR2Object", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    resetR2Client();
    hoisted.send.mockReset();
    hoisted.constructorOptions.length = 0;
    hoisted.commands.length = 0;
    Object.assign(process.env, FULL_ENV);
  });

  afterEach(() => {
    for (const key of Object.keys(FULL_ENV)) delete process.env[key];
    Object.assign(process.env, saved);
    resetR2Client();
  });

  it("creates the client for R2 (region auto, path style, scoped creds)", async () => {
    hoisted.send.mockResolvedValue({ Body: streamOf(new Uint8Array([1])), ContentLength: 1 });
    await getR2Object("blog/x/af_heart.mp3");
    expect(hoisted.constructorOptions[0]).toMatchObject({
      region: "auto",
      endpoint: "https://acct-1234.r2.cloudflarestorage.com",
      forcePathStyle: true,
      credentials: { accessKeyId: "key-id", secretAccessKey: "secret" },
    });
  });

  it("issues a GetObject with the configured bucket and the requested key", async () => {
    hoisted.send.mockResolvedValue({ Body: streamOf(new Uint8Array([1])), ContentLength: 1 });
    await getR2Object("blog/x/af_heart.mp3");
    expect(hoisted.commands[0].input).toEqual({
      Bucket: "adroit-audio",
      Key: "blog/x/af_heart.mp3",
    });
  });

  it("returns the bytes and the Content-Length size (server-side only)", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33]); // "ID3"
    hoisted.send.mockResolvedValue({ Body: streamOf(bytes), ContentLength: 3 });
    const object = await getR2Object("blog/x/af_heart.mp3");
    expect(object).toEqual({ bytes, size: 3 });
    // Nothing URL-shaped is ever returned.
    expect(JSON.stringify(object)).not.toContain("http");
  });

  it("falls back to the decoded length when Content-Length is absent", async () => {
    hoisted.send.mockResolvedValue({ Body: streamOf(new Uint8Array(7)) });
    const object = await getR2Object("blog/x/af_heart.mp3");
    expect(object?.size).toBe(7);
  });

  it("returns null for a missing key (route maps this to 404)", async () => {
    hoisted.send.mockRejectedValue(Object.assign(new Error("nope"), { name: "NoSuchKey" }));
    expect(await getR2Object("blog/missing/af_heart.mp3")).toBeNull();
  });

  it("rethrows a non-404 failure so the route fails closed", async () => {
    hoisted.send.mockRejectedValue(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    await expect(getR2Object("blog/x/af_heart.mp3")).rejects.toThrow("denied");
  });

  it("throws (fail closed) when the R2 env is incomplete", async () => {
    for (const key of Object.keys(FULL_ENV)) delete process.env[key];
    resetR2Client();
    await expect(getR2Object("blog/x/af_heart.mp3")).rejects.toThrow(/incomplete/);
  });

  it("returns null when the response carries no body", async () => {
    hoisted.send.mockResolvedValue({ Body: undefined });
    expect(await getR2Object("blog/x/af_heart.mp3")).toBeNull();
  });
});
