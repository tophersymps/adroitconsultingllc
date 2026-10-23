/**
 * src/lib/db/service.ts — the PRIVILEGED write path, over a direct
 * `DATABASE_URL` connection (Phase 3 of the Neon migration, R2-2).
 *
 * WHY THIS FILE EXISTS AT ALL. The Neon Data API has no service key: every
 * request is authorized by the caller's JWT and then filtered by RLS. That is
 * the point of the migration — but three tables are deliberately
 * server-write-only, because a client that can write them can forge progress:
 *
 *   | table             | policy shipped in supabase/migrations/neon/001_rls.sql |
 *   |-------------------|-------------------------------------------------------|
 *   | quiz_attempt      | "quiz_attempt deny client insert/update/delete"        |
 *   | quiz_run          | "quiz_run deny client insert"                          |
 *   | completion_events | "completion_events deny client insert"                 |
 *
 * Their legitimate writers (the quiz routes and the completion log) are
 * server-side code that has already recomputed the value being written, so
 * they connect directly as the database role in `DATABASE_URL` instead of
 * asking RLS for permission a client cannot be granted.
 *
 * SCOPE RULE (R2-2): this module is the ONLY place in `src/` that writes SQL,
 * and it is only for those deny-client-insert writes. Everything else — every
 * read, every user-scoped write, every admin operation — goes through the Data
 * API client (`server.ts`) and is gated by RLS, including the `is_admin()`
 * policies for the admin surface. Do not grow a query builder here; if a call
 * site needs a read or a user-scoped write, use `getSupabaseServerClient()`.
 *
 * FAILS CLOSED: a missing `DATABASE_URL` throws when a helper is called, which
 * the routes surface as a 500 — never a silently skipped progress write.
 */

// Build-time guard (review F-7, restored for R2-2 / SEC-R2-2-M2):
// `DATABASE_URL` is the most privileged credential in the app. Importing this
// module from a Client Component must fail the build instead of silently
// shipping the direct-SQL path to the browser.
import "server-only";
import { neon } from "@neondatabase/serverless";

export interface QuizAttemptWrite {
  user_id: string;
  quiz_name: string;
  question_index: number;
  correct_answer_index: number;
  user_answer_index: number;
  is_correct: boolean;
  attempted_at: string;
}

export interface QuizRunWrite {
  user_id: string;
  quiz_name: string;
  correct: number;
  total: number;
  score: number;
  completed_at: string;
}

export interface CompletionEventWrite {
  user_id: string;
  course_id: string | null;
  event_type: string;
  lesson: number | null;
  lesson_slug: string | null;
  metadata: Record<string, unknown> | null;
  completed_at: string;
}

export interface WriteResult {
  error: Error | null;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function sqlClient() {
  return neon(databaseUrl());
}

/**
 * Upsert server-graded attempts. Conflicts on the same
 * (user_id, quiz_name, question_index) replace the previous answer, which is
 * the semantics the retired `upsert(..., { onConflict })` had.
 */
export async function upsertQuizAttempts(
  rows: QuizAttemptWrite[],
): Promise<WriteResult> {
  if (rows.length === 0) return { error: null };
  try {
    const sql = sqlClient();
    for (const row of rows) {
      await sql.query(
        `INSERT INTO public.quiz_attempt
           (user_id, quiz_name, question_index, correct_answer_index,
            user_answer_index, is_correct, attempted_at)
         VALUES ($1::uuid, $2, $3::int, $4::int, $5::int, $6::boolean, $7::timestamptz)
         ON CONFLICT (user_id, quiz_name, question_index) DO UPDATE SET
           correct_answer_index = EXCLUDED.correct_answer_index,
           user_answer_index = EXCLUDED.user_answer_index,
           is_correct = EXCLUDED.is_correct,
           attempted_at = EXCLUDED.attempted_at`,
        [
          row.user_id,
          row.quiz_name,
          row.question_index,
          row.correct_answer_index,
          row.user_answer_index,
          row.is_correct,
          row.attempted_at,
        ],
      );
    }
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

/** Append one run row (best-score MAX semantics are computed by the caller). */
export async function insertQuizRun(row: QuizRunWrite): Promise<WriteResult> {
  try {
    const sql = sqlClient();
    await sql.query(
      `INSERT INTO public.quiz_run
         (user_id, quiz_name, correct, total, score, completed_at)
       VALUES ($1::uuid, $2, $3::int, $4::int, $5::int, $6::timestamptz)`,
      [
        row.user_id,
        row.quiz_name,
        row.correct,
        row.total,
        row.score,
        row.completed_at,
      ],
    );
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

/** Append one row to the immutable completion log (ADR-211). */
export async function insertCompletionEvent(
  row: CompletionEventWrite,
): Promise<WriteResult> {
  try {
    const sql = sqlClient();
    await sql.query(
      `INSERT INTO public.completion_events
         (user_id, course_id, event_type, lesson, lesson_slug, metadata, completed_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::int, $5, $6::jsonb, $7::timestamptz)`,
      [
        row.user_id,
        row.course_id,
        row.event_type,
        row.lesson,
        row.lesson_slug,
        row.metadata === null ? null : JSON.stringify(row.metadata),
        row.completed_at,
      ],
    );
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
