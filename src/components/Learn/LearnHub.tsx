/**
 * LearnHub — client orchestrator for the /learn hub (Learn Platform v2).
 *
 * Buckets purely from DB org rows (catalog_sections / catalog_groups) — the
 * old bucketOf() regex + content group/subgroup are GONE (ADR-206/207). The
 * server passes the slim LearnCardSeries projection (with DB-derived
 * section/group/track/level/sortOrder/difficulty) + the section/group lists.
 * `gate` (guest vs signed-in) drives card click-through + SeriesProgress.
 */

"use client";

import { useMemo, useState } from "react";
import PathCard from "./PathCard";
import LearnFilters from "./LearnFilters";
import ContinueLearning from "./ContinueLearning";
import EmptyState from "./EmptyState";
import type { LearnCardSeries } from "@/data/types";
import type { CardGateState } from "@/shared/contracts-account";

interface OrgRef {
  slug: string;
  name: string;
}

export interface LearnHubProps {
  courses: LearnCardSeries[];
  gate: CardGateState;
  /** Top-level sections in DB sort_order (Certifications / Tracks / Learning Paths). */
  sections: OrgRef[];
  /** Groups under a section (Salesforce Certifications, Hermes Consultant Track…). */
  groups: { slug: string; name: string; sectionSlug: string }[];
}

/** Order within a group: level asc (null last), then sort_order. */
export function groupOrder(a: LearnCardSeries, b: LearnCardSeries): number {
  const la = a.level ?? Number.MAX_SAFE_INTEGER;
  const lb = b.level ?? Number.MAX_SAFE_INTEGER;
  if (la !== lb) return la - lb;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

export default function LearnHub({
  courses,
  gate,
  sections,
  groups,
}: LearnHubProps) {
  const [sectionSlug, setSectionSlug] = useState<string | null>(null);
  const [groupSlug, setGroupSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Sections that actually contain a course (skip empty sections), with counts.
  const presentSections = sections
    .filter((s) => courses.some((c) => c.section?.slug === s.slug))
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      count: courses.filter((c) => c.section?.slug === s.slug).length,
    }));

  const visible = useMemo(() => {
    let list = courses;
    if (sectionSlug) list = list.filter((c) => c.section?.slug === sectionSlug);
    if (groupSlug) list = list.filter((c) => c.group?.slug === groupSlug);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          (c.difficulty ?? "").toLowerCase().includes(q) ||
          (c.group?.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [courses, sectionSlug, groupSlug, query]);

  return (
    <>
      <LearnFilters
        sections={presentSections}
        groups={groups}
        sectionSlug={sectionSlug}
        groupSlug={groupSlug}
        query={query}
        onSectionChange={(s) => {
          setSectionSlug(s);
          setGroupSlug(null); // group scope resets when the section changes
        }}
        onGroupChange={setGroupSlug}
        onQueryChange={setQuery}
      />

      <ContinueLearning />

      {visible.length === 0 ? (
        <div className="mt-9">
          <EmptyState />
        </div>
      ) : (
        presentSections.map((section) => {
          const sectionCards = visible.filter(
            (c) => c.section?.slug === section.slug,
          );
          if (sectionCards.length === 0) return null;

          // Group by DB group (or "Standalone" for ungrouped courses).
          const byGroup = new Map<string, LearnCardSeries[]>();
          for (const c of sectionCards) {
            const key = c.group?.name ?? "Standalone";
            if (!byGroup.has(key)) byGroup.set(key, []);
            byGroup.get(key)!.push(c);
          }
          const orderedGroups = Array.from(byGroup.entries())
            .map(([name, items]) => ({
              name,
              // Standalone bucket sorts last.
              order: name === "Standalone" ? Number.MAX_SAFE_INTEGER : 0,
              items: items.sort(groupOrder),
            }))
            .sort((a, b) => a.order - b.order);

          const sectionCount = sectionCards.length;

          return (
            <section key={section.slug} className="mt-9 first:mt-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-[3px] h-4 rounded-sm bg-[var(--accent)]" aria-hidden />
                <h2 className="font-mono text-[12px] font-bold text-[var(--ink-faint)] uppercase tracking-[0.1em]">
                  {section.name}
                </h2>
                <span className="font-mono text-[10.5px] font-bold text-[var(--accent-on-tint)] bg-[var(--accent)]/[0.08] px-2 py-0.5 rounded-full">
                  {sectionCount} {sectionCount === 1 ? "course" : "courses"}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-[var(--border-default)] to-transparent" aria-hidden />
              </div>

              {orderedGroups.map(({ name, items }) => (
                <div key={name} className="mb-6 last:mb-0">
                  {name !== "Standalone" && (
                    <div className="flex items-center gap-2.5 mb-4">
                      <h3 className="text-[13px] font-bold text-[var(--ink-primary)] tracking-[-0.01em]">
                        {name}
                      </h3>
                      <span className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {items.map((c) => (
                      <PathCard
                        key={c.slug}
                        series={c}
                        gate={gate}
                        loginNext={`/learn/${c.slug}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}
    </>
  );
}
