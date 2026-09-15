/**
 * client.test.ts — src/lib/r2/client.ts (Cloudflare R2 / S3 read path).
 *
 * Locks the three things the audio routes depend on:
 *   1. env contract — all four R2_* vars required, missing ones named, and the
 *      endpoint derived from the account id (region "auto", path-style);
 *   2. error mapping — a missing object becomes null (route -> 404) while any
 *      other failure throws (route -> fail-closed 401); never a URL;
 *   3. server-side only read — a GetObject with the configured bucket and key;
 *   4. streaming read — the body comes back as a stream (never buffered here),
 *      an un-ranged read sends NO Range, and a ranged read passes the Range
 *      through to the GetObjectCommand and reports R2's span length.
 * The AWS SDK itself is mocked: no network, no credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";

const hoisted = vi.hoisted(() => ({
  send: vi.fn(),
  constructorOptions: [] as unknown[],
  commands: [] as { type: string; input: unknown }[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  const command = (type: string) =>
    class {
      constructor(public input: unknown) {
        hoisted.commands.push({ type, input });
      }
    };
  return {
    S3Client: class {
      constructor(options: unknown) {
        hoisted.constructorOptions.push(options);
      }
      send = hoisted.send;
    },
    GetObjectCommand: command("GetObject"),
    HeadObjectCommand: command("HeadObject"),
    PutObjectCommand: command("PutObject"),
  };
});

import {
  contentTypeForKey,
  formatRangeHeader,
  getR2Object,
  getR2ObjectRange,
  getR2ObjectStream,
  headR2Object,
  isMissingObjectError,
  putR2Object,
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

/** A one-chunk Node Readable, which is what the SDK hands back at runtime. */
function readableOf(bytes: Uint8Array) {
  return Readable.from([bytes]);
}

describe("getR2ObjectStream / getR2ObjectRange", () => {
  const saved = { ...process.env };
  const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x05]); // "ID3" + 2 bytes

  beforeEach(() => {
    resetR2Client();
    hoisted.send.mockReset();
    hoisted.commands.length = 0;
    Object.assign(process.env, FULL_ENV);
  });

  afterEach(() => {
    for (const key of Object.keys(FULL_ENV)) delete process.env[key];
    Object.assign(process.env, saved);
    resetR2Client();
  });

  it("streams the whole object without buffering and sends NO Range", async () => {
    hoisted.send.mockResolvedValue({ Body: readableOf(mp3), ContentLength: mp3.byteLength });

    const object = await getR2ObjectStream("blog/x/af_heart.mp3");

    expect(object?.size).toBe(mp3.byteLength);
    const received = new Uint8Array(await new Response(object!.stream).arrayBuffer());
    expect(received).toEqual(mp3);
    // The un-ranged read is byte-for-byte the GetObject input it always sent.
    expect(hoisted.commands[0]).toEqual({
      type: "GetObject",
      input: { Bucket: "adroit-audio", Key: "blog/x/af_heart.mp3" },
    });
  });

  it("passes the Range through to the S3 GetObject and streams only that span", async () => {
    const span = mp3.subarray(1, 3);
    hoisted.send.mockResolvedValue({ Body: readableOf(span), ContentLength: span.byteLength });

    const object = await getR2ObjectRange("blog/x/af_heart.mp3", { start: 1, end: 2 });

    expect(hoisted.commands[0]).toEqual({
      type: "GetObject",
      input: { Bucket: "adroit-audio", Key: "blog/x/af_heart.mp3", Range: "bytes=1-2" },
    });
    // Content-Length is R2's own span length: 2 bytes came back, not 5.
    expect(object?.size).toBe(2);
    const received = new Uint8Array(await new Response(object!.stream).arrayBuffer());
    expect(received).toEqual(span);
    expect(Array.from(received)).toEqual([0x44, 0x33]);
  });

  it("formats a single inclusive span as the HTTP Range R2 expects", () => {
    expect(formatRangeHeader({ start: 0, end: 99 })).toBe("bytes=0-99");
    expect(formatRangeHeader({ start: 7276555, end: 7276555 })).toBe("bytes=7276555-7276555");
    expect(formatRangeHeader({ start: 1024, end: 2047 })).toBe("bytes=1024-2047");
  });

  it("falls back to the span length when R2 omits Content-Length on a ranged read", async () => {
    hoisted.send.mockResolvedValue({ Body: readableOf(mp3.subarray(0, 3)) });
    const object = await getR2ObjectRange("blog/x/af_heart.mp3", { start: 0, end: 2 });
    expect(object?.size).toBe(3);
  });

  it("reports size 0 (no Content-Length header) when R2 omits it on a whole-object read", async () => {
    hoisted.send.mockResolvedValue({ Body: readableOf(mp3) });
    const object = await getR2ObjectStream("blog/x/af_heart.mp3");
    expect(object?.size).toBe(0);
  });

  it("accepts a web ReadableStream body unchanged", async () => {
    const web = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(mp3);
        controller.close();
      },
    });
    hoisted.send.mockResolvedValue({ Body: web, ContentLength: mp3.byteLength });
    const object = await getR2ObjectStream("blog/x/af_heart.mp3");
    expect(new Uint8Array(await new Response(object!.stream).arrayBuffer())).toEqual(mp3);
  });

  it("returns null for a missing key (route maps this to 404)", async () => {
    hoisted.send.mockRejectedValue(Object.assign(new Error("nope"), { name: "NoSuchKey" }));
    expect(await getR2ObjectStream("blog/missing/af_heart.mp3")).toBeNull();
    expect(await getR2ObjectRange("blog/missing/af_heart.mp3", { start: 0, end: 9 })).toBeNull();
  });

  it("rethrows a non-404 failure so the route fails closed", async () => {
    hoisted.send.mockRejectedValue(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    await expect(getR2ObjectStream("blog/x/af_heart.mp3")).rejects.toThrow("denied");
    await expect(getR2ObjectRange("blog/x/af_heart.mp3", { start: 0, end: 9 })).rejects.toThrow(
      "denied",
    );
  });

  it("returns null when the response carries no body", async () => {
    hoisted.send.mockResolvedValue({ Body: undefined });
    expect(await getR2ObjectStream("blog/x/af_heart.mp3")).toBeNull();
    expect(await getR2ObjectRange("blog/x/af_heart.mp3", { start: 0, end: 9 })).toBeNull();
  });

  it("throws (fail closed) when the R2 env is incomplete, and sends nothing", async () => {
    const incomplete = { R2_BUCKET: "adroit-audio" } as unknown as NodeJS.ProcessEnv;
    await expect(getR2ObjectStream("blog/x/af_heart.mp3", incomplete)).rejects.toThrow(/incomplete/);
    await expect(
      getR2ObjectRange("blog/x/af_heart.mp3", { start: 0, end: 9 }, incomplete),
    ).rejects.toThrow(/incomplete/);
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("never returns a URL (the object stays server-side)", async () => {
    hoisted.send.mockResolvedValue({ Body: readableOf(mp3), ContentLength: mp3.byteLength });
    const object = await getR2ObjectRange("blog/x/af_heart.mp3", { start: 0, end: 1 });
    expect(Object.keys(object!).sort()).toEqual(["size", "stream"]);
  });
});

describe("contentTypeForKey", () => {
  it("maps the write-path key extensions the reader serves", () => {
    expect(contentTypeForKey("blog/x/af_heart.mp3")).toBe("audio/mpeg");
    expect(contentTypeForKey("blog/x/af_heart.timing.json")).toBe("application/json");
    expect(contentTypeForKey("blog/x/narration.txt")).toBe("application/octet-stream");
  });
});

describe("headR2Object", () => {
  const env = FULL_ENV as unknown as NodeJS.ProcessEnv;

  beforeEach(() => {
    resetR2Client();
    hoisted.send.mockReset();
    hoisted.commands.length = 0;
  });

  it("heads the configured bucket/key and reports size, etag and metadata", async () => {
    hoisted.send.mockResolvedValue({
      ContentLength: 4096,
      ETag: '"abc123"',
      ContentType: "audio/mpeg",
      Metadata: { sha256: "deadbeef" },
    });

    const head = await headR2Object("blog/x/af_heart.mp3", env);

    expect(head).toEqual({
      size: 4096,
      etag: '"abc123"',
      contentType: "audio/mpeg",
      metadata: { sha256: "deadbeef" },
    });
    expect(hoisted.commands[0]).toEqual({
      type: "HeadObject",
      input: { Bucket: "adroit-audio", Key: "blog/x/af_heart.mp3" },
    });
  });

  it("defaults a missing Content-Length to 0 instead of undefined", async () => {
    hoisted.send.mockResolvedValue({});
    const head = await headR2Object("blog/x/af_heart.mp3", env);
    expect(head?.size).toBe(0);
  });

  it("returns null for a key R2 does not hold", async () => {
    hoisted.send.mockRejectedValue(
      Object.assign(new Error("nope"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }),
    );
    expect(await headR2Object("blog/missing/af_heart.mp3", env)).toBeNull();
  });

  it("rethrows a non-404 failure (a bad credential is not a missing object)", async () => {
    hoisted.send.mockRejectedValue(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    await expect(headR2Object("blog/x/af_heart.mp3", env)).rejects.toThrow("denied");
  });
});

describe("putR2Object", () => {
  const env = FULL_ENV as unknown as NodeJS.ProcessEnv;
  const body = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // "ID3" + a byte

  beforeEach(() => {
    resetR2Client();
    hoisted.send.mockReset();
    hoisted.commands.length = 0;
  });

  it("PUTs the bytes to the configured bucket with the key's content type, then re-reads R2", async () => {
    hoisted.send
      .mockResolvedValueOnce({}) // PutObject
      .mockResolvedValueOnce({ ContentLength: body.byteLength, ETag: '"etag"' }); // HeadObject

    const head = await putR2Object({ key: "blog/x/af_heart.mp3", body }, env);

    expect(hoisted.commands[0]).toEqual({
      type: "PutObject",
      input: {
        Bucket: "adroit-audio",
        Key: "blog/x/af_heart.mp3",
        Body: body,
        ContentType: "audio/mpeg",
        ContentLength: body.byteLength,
        Metadata: undefined,
      },
    });
    // The verification is a second, independent read of R2 — never the PUT reply.
    expect(hoisted.commands[1]).toEqual({
      type: "HeadObject",
      input: { Bucket: "adroit-audio", Key: "blog/x/af_heart.mp3" },
    });
    expect(hoisted.send).toHaveBeenCalledTimes(2);
    expect(head.size).toBe(body.byteLength);
    expect(head.etag).toBe('"etag"');
  });

  it("uses the timing-manifest content type and carries caller metadata", async () => {
    hoisted.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: body.byteLength });

    await putR2Object(
      {
        key: "blog/x/af_heart.timing.json",
        body,
        metadata: { sha256: "cafe" },
      },
      env,
    );

    expect(hoisted.commands[0].input).toMatchObject({
      ContentType: "application/json",
      Metadata: { sha256: "cafe" },
    });
  });

  it("honours an explicit contentType override", async () => {
    hoisted.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: body.byteLength });
    await putR2Object({ key: "blog/x/blob.bin", body, contentType: "audio/mpeg" }, env);
    expect(hoisted.commands[0].input).toMatchObject({ ContentType: "audio/mpeg" });
  });

  it("throws when R2 reports a different size after the PUT (a short write is not a success)", async () => {
    hoisted.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ContentLength: body.byteLength - 1 });

    await expect(putR2Object({ key: "blog/x/af_heart.mp3", body }, env)).rejects.toThrow(
      /put verification failed/,
    );
  });

  it("throws when the object is absent right after the PUT", async () => {
    hoisted.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "NoSuchKey" }));

    await expect(putR2Object({ key: "blog/x/af_heart.mp3", body }, env)).rejects.toThrow(
      /no object/,
    );
  });

  it("fails closed when the R2 env is incomplete (no silent no-op write)", async () => {
    const incomplete = { R2_BUCKET: "adroit-audio" } as unknown as NodeJS.ProcessEnv;
    await expect(putR2Object({ key: "blog/x/af_heart.mp3", body }, incomplete)).rejects.toThrow(
      /incomplete/,
    );
    expect(hoisted.send).not.toHaveBeenCalled();
  });
});
