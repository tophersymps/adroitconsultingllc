/**
 * CourseProfileDialog — Learn v2 course profile + org editor (ADR-208/209).
 *
 * Admin form for the migration-009 fields: section/group/track/level/sort_order
 * (org) + difficulty/recommended_background/audience/learning_outcomes/
 * course_tags (profile) + structured prerequisites. Saves via
 *   PATCH /api/admin/courses/[slug]                     (org + profile fields)
 *   PUT   /api/admin/courses/[slug]/prerequisites       (prerequisite set)
 * every mutation server-side audited (course.profile_change).
 */
"use client";

import { useEffect, useState } from "react";
import type {
  CatalogGroup,
  CatalogSection,
  CourseRow,
  Difficulty,
} from "@/shared/contracts-course-catalog";

const DIFFICULTIES: Difficulty[] = ["Beginner", "Intermediate", "Advanced"];

interface CourseProfileDialogProps {
  course: CourseRow;
  /** All courses (for the prerequisite picker + section/group labels). */
  allCourses: CourseRow[];
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
}

export default function CourseProfileDialog({
  course,
  allCourses,
  onClose,
  onSaved,
  onToast,
}: CourseProfileDialogProps) {
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local form state, initialized from the course row. section/group MUST
  // seed from the stored course.section_id/group_id — initializing to "" left
  // the dropdowns blank and the Group list empty (filtered against ""), so a
  // course's existing org never showed. (Chris report, 2026-08-29.)
  const [sectionId, setSectionId] = useState<string>(course.section_id ?? "");
  const [groupId, setGroupId] = useState<string>(course.group_id ?? "");
  const [track, setTrack] = useState<string>(course.track ?? "");
  const [level, setLevel] = useState<string>(
    course.level != null ? String(course.level) : "",
  );
  const [sortOrder, setSortOrder] = useState<string>(
    course.sort_order != null ? String(course.sort_order) : "0",
  );
  const [difficulty, setDifficulty] = useState<string>(course.difficulty ?? "");
  const [background, setBackground] = useState<string>(
    course.recommended_background ?? "",
  );
  const [audience, setAudience] = useState<string>(course.audience ?? "");
  const [outcomesText, setOutcomesText] = useState<string>(
    (course.learning_outcomes ?? []).join("\n"),
  );
  const [tagsText, setTagsText] = useState<string>(
    (course.course_tags ?? []).join(", "),
  );
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [secRes, grpRes, preRes] = await Promise.all([
          fetch("/api/admin/catalog/sections"),
          fetch("/api/admin/catalog/groups"),
          fetch(`/api/admin/courses/${course.series_slug}/prerequisites`),
        ]);
        const [secJson, grpJson, preJson] = await Promise.all([
          secRes.json(),
          grpRes.json(),
          preRes.json(),
        ]);
        if (!active) return;
        setSections(secJson.data ?? []);
        setGroups(grpJson.data ?? []);
        setPrereqIds(preJson.data ?? []);
      } catch {
        // sections/groups are best-effort; the org fields stay editable as text
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [course.series_slug]);

  const sectionGroups = groups.filter((g) => g.section_id === sectionId);

  async function onSave() {
    setSaving(true);
    try {
      const profileBody: Record<string, unknown> = {
        section_id: sectionId || null,
        group_id: groupId || null,
        track: track.trim() || null,
        level: level === "" ? null : Number(level),
        sort_order: sortOrder === "" ? 0 : Number(sortOrder),
        difficulty: (difficulty || null) as Difficulty | null,
        recommended_background: background.trim() || null,
        audience: audience.trim() || null,
        learning_outcomes: outcomesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        course_tags: tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await fetch(`/api/admin/courses/${course.series_slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profileBody),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        onToast(json.error || "Save failed");
        return;
      }
      // Save prerequisites (only when the course row exists / id present).
      if (course.id) {
        await fetch(`/api/admin/courses/${course.series_slug}/prerequisites`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requiredCourseIds: prereqIds }),
        });
      }
      onToast(`Saved ${course.series_slug}`);
      onSaved();
      onClose();
    } catch {
      onToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function togglePrereq(id: string) {
    setPrereqIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const otherCourses = allCourses.filter((c) => c.id !== course.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit profile for ${course.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-[var(--surface-card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink-primary)]">
              Edit course profile
            </h2>
            <p className="font-mono text-[11px] text-[var(--ink-muted)]">
              {course.series_slug}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--ink-muted)]">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* Org */}
            <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <legend className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)] mb-1">
                Organization
              </legend>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Section
                <select
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    setGroupId("");
                  }}
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  <option value="">— uncategorized —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Group
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  disabled={!sectionId}
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent disabled:opacity-50"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  <option value="">— standalone —</option>
                  {sectionGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Track
                <input
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                  placeholder="hermes-consultant"
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                  style={{ borderColor: "var(--admin-table-border)" }}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                  Level
                  <input
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    type="number"
                    min={1}
                    max={10}
                    className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                </label>
                <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                  Sort order
                  <input
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                </label>
              </div>
            </fieldset>

            {/* Profile */}
            <fieldset className="space-y-3">
              <legend className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">
                Profile
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                  Difficulty
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  >
                    <option value="">— set difficulty —</option>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                  Audience
                  <input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Consultants, Developers…"
                    className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                </label>
              </div>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Recommended background
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  rows={2}
                  placeholder="comfortable with the command line and basic Python"
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                  style={{ borderColor: "var(--admin-table-border)" }}
                />
              </label>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Learning outcomes (one per line)
                <textarea
                  value={outcomesText}
                  onChange={(e) => setOutcomesText(e.target.value)}
                  rows={3}
                  placeholder="What you'll be able to do after…"
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                  style={{ borderColor: "var(--admin-table-border)" }}
                />
              </label>
              <label className="block text-[12px] font-semibold text-[var(--ink-primary)]">
                Course tags (comma-separated)
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Salesforce, Certification"
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] bg-transparent"
                  style={{ borderColor: "var(--admin-table-border)" }}
                />
              </label>
            </fieldset>

            {/* Prerequisites */}
            <fieldset>
              <legend className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)] mb-1">
                Prerequisites (this course requires…)
              </legend>
              {otherCourses.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink-muted)]">
                  No other courses to select.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {otherCourses.map((c) => {
                    const checked = prereqIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-[12.5px] text-[var(--ink-primary)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePrereq(c.id)}
                        />
                        <span className="truncate">{c.title}</span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          {c.series_slug}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-[13px] font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-md bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] px-4 py-2 text-[13px] font-semibold hover:bg-[var(--surface-inverse-hover)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
