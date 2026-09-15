# Supabase Setup — adroit-blog

**Task:** t_596af0ac · **Completed by:** alpha (DevOps) · **Date:** 2026-08-06

## What Was Provisioned

### 1. Database Schema (Migration `001_create_progress_tables.sql`)

Three tables created in the Supabase project `zrggxfdyptiahskogwnn`:

| Table | Purpose |
|-------|---------|
| `read_progress` | Tracks which blog posts/lessons a user has read |
| `lesson_completion` | Tracks which lessons a user has completed |
| `quiz_attempt` | Stores individual quiz answer attempts |

All tables include:
- UUID primary keys with `gen_random_uuid()` defaults
- `user_id` foreign key column (indexed)
- Row Level Security (RLS) policies — users can only access their own data
- Per-table CRUD policies (SELECT, INSERT, UPDATE, DELETE)

### 2. Supabase CLI Configuration

- Project linked: `zrggxfdyptiahskogwnn`
- Migration file: `supabase/migrations/001_create_progress_tables.sql`
- Auth config in `supabase/config.toml` updated for production URLs

### 3. Auth Configuration

Updated in `supabase/config.toml`:

```toml
[auth]
site_url = "https://adroit.io"
additional_redirect_urls = [
  "https://adroit.io",
  "https://www.adroit.io",
  "https://adroit-blog.vercel.app",
  "http://localhost:3000",
]
enable_signup = true
enable_confirmations = true
```

## Environment Variables Required

These are already in `.env.local` — ensure they match the Supabase project:

```
NEXT_PUBLIC_SUPABASE_URL=https://zrggxfdyptiahskogwnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

**⚠️ NOTE:** The anon key in `.env.local` appears truncated. Please verify it matches the full key from the Supabase dashboard (Project Settings → API).

## Tables DDL Reference

### read_progress

```sql
CREATE TABLE read_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('blog', 'lesson')),
  content_slug text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_content UNIQUE (user_id, content_slug)
);
CREATE INDEX idx_read_progress_user_id ON read_progress (user_id);
```

### lesson_completion

```sql
CREATE TABLE lesson_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_slug text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_lesson UNIQUE (user_id, lesson_slug)
);
CREATE INDEX idx_lesson_completion_user_id ON lesson_completion (user_id);
```

### quiz_attempt

```sql
CREATE TABLE quiz_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_name text NOT NULL,
  question_index int NOT NULL,
  correct_answer_index int NOT NULL,
  user_answer_index int NOT NULL,
  is_correct boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quiz_attempt_user_id ON quiz_attempt (user_id);
CREATE INDEX idx_quiz_attempt_quiz_name ON quiz_attempt (quiz_name);
```

## RLS Policies

All three tables have RLS enabled with per-user policies:

- `Users can view their own [data]` — FOR SELECT
- `Users can insert their own [data]` — FOR INSERT
- `Users can update their own [data]` — FOR UPDATE
- `Users can delete their own [data]` — FOR DELETE

## Next Steps for Steel (t_aae7f2b2)

1. **Create Supabase client module** — `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts`
2. **Implement hooks** — `useReadProgress`, `useLessonProgress`, `useQuizProgress`
3. **Implement API routes** — `/api/progress/read`, `/api/progress/lesson`, `/api/progress/quiz`, `/api/progress/summary`
4. **Implement UI components** — `MarkAsRead`, `ProgressIndicator`, `QuizWidget`
5. **Integrate into pages** — blog, learn hub, series lessons, quiz pages

See `docs/implementation-plan-progress.md` for the full build decomposition (6 tasks).

## How to Verify Tables

```bash
cd /Users/kelex/Documents/Fortress-of-Solitude/adroit-blog
supabase db push  # Pushes any pending migrations
supabase db pull  # Pulls remote schema to local (requires Docker)
```

## Test Users and Auth Emails — never cause a bounce

**Rule: never create a test/QA/verification auth user through the public signup endpoint on this
project.** `POST /auth/v1/signup` always sends a confirmation email while
`enable_confirmations = true`; if the address has no mailbox the send is a hard bounce, and because
this project's total email volume is in the single digits a couple of bounces is a double-digit
bounce rate — which is exactly what produced Supabase's "we may restrict your email sending
privileges" warning on 2026-09-15.

Use the Admin API, which creates the account already confirmed and **sends nothing**:

```bash
cd <repo>
node scripts/qa-create-test-user.cjs <label>            # create a confirmed test user
node scripts/qa-create-test-user.cjs <label> --delete   # remove it when the check is done
```

The helper plus-addresses a real inbox (`kelex1812+qa-<label>@gmail.com`, override with
`QA_TEST_EMAIL_BASE`) and prints `{ email, password, id, emails_sent: 0 }` for the browser pass.
Never hand-write a plausible address at `adroit.io` unless that mailbox actually exists — the
`qa.admin@ / qa.member@ / qa.granted@adroit.io` accounts look "confirmed" only because the Admin API
set `email_confirm`; nobody ever received mail at them.

The only three things in this app that can send email at all are Supabase Auth:
signup confirmation (`/api/auth/login`), resend confirmation (`/api/auth/resend-confirmation`) and
password reset (`/api/auth/reset-password/request`). `/api/contact` goes to Salesforce Web-to-Lead
and sends no email. There is no custom SMTP configured, so sends come from the shared
`noreply@mail.app.supabase.io` sender at a **2 emails/hour** cap — which will starve real user
confirmations once signups grow.

## How to Push Auth Config Changes

When the anon key is verified complete:

```bash
cd /Users/kelex/Documents/Fortress-of-Solitude/adroit-blog
supabase link --project-ref zrggxfdyptiahskogwnn
supabase config push  # Pushes auth/storage config to remote
```

Or update directly in the Supabase Dashboard:
- Go to https://app.supabase.com/project/zrggxfdyptiahskogwnn/settings/auth
- Verify `site_url` is `https://adroit.io`
- Verify redirect URLs include all production domains
- Verify `enable_confirmations` is enabled
