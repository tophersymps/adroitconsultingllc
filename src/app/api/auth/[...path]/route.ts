/**
 * /api/auth/[...path] — Managed Better Auth proxy (Neon Auth).
 *
 * Mounts the SDK's auth proxy so every Better Auth endpoint the app or its
 * future client UI needs (get-session, sign-in/email, sign-out,
 * request-password-reset, reset-password, send-verification-email, …) is
 * served same-origin with the HttpOnly session cookies written server-side.
 *
 * Route precedence: the hand-written routes in this folder (login, session,
 * logout, reset-password/*, resend-confirmation) are static segments and win
 * over this catch-all, so their hardened behaviour is unchanged.
 *
 * The handler is built lazily per request (not at module scope) so `next build`
 * never needs the auth env, and a missing env returns a 503 instead of a
 * module-load crash.
 */
import { NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";

type Handler = (
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export const dynamic = "force-dynamic";

function delegate(method: Method): Handler {
  return async (request, ctx) => {
    try {
      const handlers = getAuthServer().handler();
      return await handlers[method](request, ctx);
    } catch (err) {
      console.error("[api/auth/[...path]] auth backend unavailable", err);
      return NextResponse.json(
        { error: "Auth service unavailable. Please try again later." },
        { status: 503 },
      );
    }
  };
}

export const GET = delegate("GET");
export const POST = delegate("POST");
export const PUT = delegate("PUT");
export const DELETE = delegate("DELETE");
export const PATCH = delegate("PATCH");
