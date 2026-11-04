"use client";

import { useState } from "react";
import type {
  AdminCourseListRow,
  UserRole,
} from "@/shared/contracts-course-catalog";
import type { CreateAdminUserInput, CreateAdminUserResult } from "@/lib/hooks/useAdminUsers";

interface CreateUserDialogProps {
  courses: AdminCourseListRow[];
  onClose: () => void;
  onCreate: (input: CreateAdminUserInput) => Promise<CreateAdminUserResult>;
}

export default function CreateUserDialog({
  courses,
  onClose,
  onCreate,
}: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [sendInvite, setSendInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grantableCourses = courses.filter(
    (c) => c.course.access_model !== "free" && c.course.status !== "archived",
  );

  function toggleCourse(courseId: string) {
    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const res = await onCreate({
        email: trimmedEmail,
        display_name: displayName.trim() || undefined,
        role,
        course_ids: [...selectedCourses],
        send_invite: sendInvite,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to create user.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--admin-table-border)] bg-[var(--surface-card)] p-6 shadow-xl"
        style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-table-border)] pb-3">
          <div>
            <h2
              id="create-user-dialog-title"
              className="text-base font-semibold tracking-tight text-[var(--ink-primary)]"
            >
              Invite / Create User
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Provision a user account with optional course access and send a password-setup link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-primary)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Email Address *
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="mt-1 w-full rounded border border-[var(--admin-table-border)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Display Name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional full name"
                className="mt-1 w-full rounded border border-[var(--admin-table-border)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Initial Role
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 w-full rounded border border-[var(--admin-table-border)] bg-[var(--surface-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-primary)]">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="rounded border-[var(--admin-table-border)]"
                />
                <span>Send password-setup email link</span>
              </label>
            </div>
          </div>

          {grantableCourses.length > 0 && (
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Initial Course Grants ({selectedCourses.size} selected)
              </div>
              <div className="mt-1.5 max-h-40 divide-y divide-[var(--admin-table-border)] overflow-y-auto rounded border border-[var(--admin-table-border)]">
                {grantableCourses.map(({ course }) => {
                  const checked = selectedCourses.has(course.id);
                  return (
                    <label
                      key={course.id}
                      className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-[var(--surface-card-soft)]"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCourse(course.id)}
                          className="rounded border-[var(--admin-table-border)]"
                        />
                        <span className="font-medium text-[var(--ink-primary)]">
                          {course.title || course.series_slug}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                        {course.access_model}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--admin-table-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded border border-[var(--admin-table-border)] px-3 py-1.5 font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-[var(--ink-primary)] px-3.5 py-1.5 font-mono text-xs font-medium text-[var(--surface-card)] hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
