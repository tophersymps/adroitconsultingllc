/**
 * Exam naming matrix — every exam surface × every series (B6, Workstream B
 * integration).
 *
 * Workstream B replaced the hardcoded "Certification Prep" wording with one
 * label source (`src/lib/exam-labels.ts`) keyed by each series' `examKind`.
 * B3/B4/B5 each proved their own slice; this card proves the SEAM: for all 12
 * series the app ships, every surface that can name the exam names the RIGHT
 * exam and never the other one.
 *
 * What a failure here means:
 *  - a surface forgot to plumb `kind` (it renders the other kind's wording), or
 *  - a series' `examKind` in `content/learn/<slug>/series.json` flipped, or
 *  - the copy table drifted from `api-contracts.md` §C.
 *
 * Surfaces covered (one `describe` each, each looping all 12 series):
 *  - series page: ExamCard, CheckCardList
 *  - exam page: ExamLocked (locked panel), ExamWidget (timed run), GuestCTA
 *    (guest exam / check / certificate tiers), exam-page <head> via
 *    `examLabels(kind).seoTitle/seoDescription` (the page composes the head
 *    from exactly these two calls — see app/atlas/[series]/exam/page.tsx)
 *  - certificate page: Certificate component
 *  - sky/chronicle: `chronicleLabel` for an `exam` completion event
 *
 * Test-only literals: this file spells out no exam wording — every expected
 * string is read from `EXAM_LABELS`, so changing the copy in one place cannot
 * leave a stale expectation behind (and the grep test allow-lists tests
 * precisely because assertions must name the strings).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { learnSeries } from "@/data/learn";
import { getCertExam, getKnowledgeChecks } from "@/lib/quiz";
import { EXAM_LABELS, examLabels } from "@/lib/exam-labels";
import {
  CERT_CHECK_PASS_PCT,
  CERT_EXAM_MINUTES,
  CERT_EXAM_PASS_PCT,
} from "@/lib/exam-config";
import { chronicleLabel } from "@/lib/sky";
import type { ExamKind } from "@/data/types";
import type { CompletionEventRow } from "@/shared/contracts-constellations";
import ExamCard from "./ExamCard";
import ExamLocked from "./ExamLocked";
import ExamWidget from "./ExamWidget";
import Certificate from "./Certificate";
import GuestCTA from "./GuestCTA";
import CheckCardList from "./CheckCardList";

/* ── the 12 series, straight from the generated content dataset ────────── */

interface SeriesFixture {
  slug: string;
  name: string;
  kind: ExamKind;
  checkCount: number;
  questionCount: number;
}

const SERIES: SeriesFixture[] = learnSeries.map((s) => {
  const exam = getCertExam(s.slug);
  return {
    slug: s.slug,
    name: s.name,
    kind: s.examKind,
    checkCount: getKnowledgeChecks(s.slug).length,
    questionCount: exam?.questions.length ?? 0,
  };
});

const otherKind = (kind: ExamKind): ExamKind =>
  kind === "course-completion" ? "certification-prep" : "course-completion";

/** Every spelling of the OTHER kind's exam name — none may ever render. */
function otherKindLabels(kind: ExamKind): string[] {
  const other = EXAM_LABELS[otherKind(kind)];
  return [other.full, other.short, other.phrase];
}

/**
 * The core matrix assertion: the surface names its own kind's exam (at least
 * one of full/short/phrase) and never mentions the other kind's exam in any
 * spelling.
 */
function expectKindCorrect(text: string, kind: ExamKind, own: string[], surface: string, slug: string) {
  const haystack = text.toLowerCase();
  const ownHits = own.filter((label) => haystack.includes(label.toLowerCase()));
  expect(
    ownHits.length,
    `${surface} for ${slug} (${kind}) must render at least one ${kind} label; expected one of ${JSON.stringify(own)}`,
  ).toBeGreaterThan(0);
  for (const forbidden of otherKindLabels(kind)) {
    expect(
      haystack,
      `${surface} for ${slug} (${kind}) must not render the other kind's label ${JSON.stringify(forbidden)}:\n${text}`,
    ).not.toContain(forbidden.toLowerCase());
  }
}

const ownLabels = (kind: ExamKind) => {
  const own = EXAM_LABELS[kind];
  return [own.full, own.short, own.phrase];
};

const renderText = (ui: React.ReactElement): string => {
  const { container } = render(ui);
  return container.textContent ?? "";
};

/* ── fixtures ──────────────────────────────────────────────────────────── */

beforeEach(() => {
  // ExamCard and CheckCardList hydrate from /api/progress/quiz/tiers. Offline
  // is the locked render path — the label must be kind-correct there too
  // (US-012 degraded path), so a rejected fetch is the right fixture.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in the label matrix"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── the matrix ────────────────────────────────────────────────────────── */

describe("exam naming matrix — dataset shape", () => {
  it("covers all 12 shipped series with the seeded kind split (8 course-completion, 4 certification-prep)", () => {
    expect(SERIES).toHaveLength(12);
    expect(SERIES.filter((s) => s.kind === "course-completion")).toHaveLength(8);
    expect(SERIES.filter((s) => s.kind === "certification-prep")).toHaveLength(4);
    for (const s of SERIES) {
      expect(s.kind, `${s.slug} must declare examKind`).toMatch(/^(course-completion|certification-prep)$/);
      expect(s.questionCount, `${s.slug} must have an exam document`).toBeGreaterThan(0);
    }
  });
});

describe("series page — ExamCard names the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const text = renderText(
        <ExamCard
          series={fixture.slug}
          totalChecks={fixture.checkCount}
          kind={fixture.kind}
          questionCount={fixture.questionCount}
          passPct={CERT_EXAM_PASS_PCT}
          minutes={CERT_EXAM_MINUTES}
        />,
      );
      // The card states the name twice: compact kicker + full heading.
      expect(text).toContain(EXAM_LABELS[fixture.kind].short);
      expect(text).toContain(EXAM_LABELS[fixture.kind].full);
      expectKindCorrect(
        text,
        fixture.kind,
        [EXAM_LABELS[fixture.kind].full, EXAM_LABELS[fixture.kind].short],
        "ExamCard",
        fixture.slug,
      );
      // Counts are props — never a cert-prep constant leaking onto a Tracks card.
      expect(text).toContain(`${fixture.questionCount} questions`);
      expect(text).toContain(`${CERT_EXAM_MINUTES} minutes`);
      expect(text).toContain(`pass ≥ ${CERT_EXAM_PASS_PCT}%`);
    });
  }
});

describe("series page — CheckCardList names the exam the checks unlock, for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const text = renderText(
        <CheckCardList
          series={fixture.slug}
          checksMeta={getKnowledgeChecks(fixture.slug)}
          kind={fixture.kind}
        />,
      );
      expect(text).toContain(`the ${EXAM_LABELS[fixture.kind].phrase}`);
      expectKindCorrect(text, fixture.kind, [EXAM_LABELS[fixture.kind].phrase], "CheckCardList", fixture.slug);
    });
  }
});

describe("exam page — ExamLocked names the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      // An honest locked state: exactly the series' real check count, none passed.
      const checks = Array.from({ length: fixture.checkCount }, (_, i) => ({
        n: i + 1,
        bestScore: 0,
        attempts: 0,
        passed: false,
      }));
      const text = renderText(
        <ExamLocked
          series={fixture.slug}
          checks={checks}
          seriesName={fixture.name}
          kind={fixture.kind}
          minutes={CERT_EXAM_MINUTES}
        />,
      );
      expect(text).toContain(`${EXAM_LABELS[fixture.kind].short} · locked`);
      expect(text).toContain(EXAM_LABELS[fixture.kind].lockHeading(fixture.checkCount));
      expect(text).toContain(`${CERT_EXAM_MINUTES}-minute run`);
      // The unlock pass mark is the shared check constant, not a literal.
      expect(text).toContain(`${CERT_CHECK_PASS_PCT}%+`);
      expectKindCorrect(
        text,
        fixture.kind,
        ownLabels(fixture.kind),
        "ExamLocked",
        fixture.slug,
      );
    });
  }
});

describe("exam page — ExamWidget names the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const exam = getCertExam(fixture.slug)!;
      const text = renderText(
        <ExamWidget
          quizName={`${fixture.slug}:exam`}
          questions={exam.questions.map((q) => ({ question: q.question, options: q.options }))}
          seriesSlug={fixture.slug}
          seriesName={fixture.name}
          kind={fixture.kind}
        />,
      );
      expect(text).toContain(`${EXAM_LABELS[fixture.kind].short} · ${fixture.name}`);
      expect(text).toContain(EXAM_LABELS[fixture.kind].full);
      expectKindCorrect(text, fixture.kind, ownLabels(fixture.kind), "ExamWidget", fixture.slug);
      // The pass mark and duration are the shared contract, not literals.
      expect(text).toContain(`pass ≥ ${CERT_EXAM_PASS_PCT}%`);
      expect(text).toContain(`${CERT_EXAM_MINUTES} minutes`);
    });
  }
});

describe("exam page — guest tiers name the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind}) — exam, check and certificate tiers`, () => {
      const own = EXAM_LABELS[fixture.kind];

      const examTier = renderText(
        <GuestCTA
          tier="exam"
          kind={fixture.kind}
          checkCount={fixture.checkCount}
          questionCount={fixture.questionCount}
          minutes={CERT_EXAM_MINUTES}
        />,
      );
      expect(examTier).toContain(`${own.short} · locked for guests`);
      expect(examTier).toContain(`${fixture.questionCount} questions`);
      expectKindCorrect(examTier, fixture.kind, [own.short], "GuestCTA exam tier", fixture.slug);

      const certTier = renderText(<GuestCTA tier="certificate" kind={fixture.kind} />);
      expect(certTier).toContain(`the timed ${own.phrase}`);
      expectKindCorrect(certTier, fixture.kind, [own.phrase], "GuestCTA certificate tier", fixture.slug);

      const checkTier = renderText(<GuestCTA tier="check" kind={fixture.kind} />);
      expect(checkTier).toContain(`unlocking the timed ${own.phrase}`);
      expectKindCorrect(checkTier, fixture.kind, [own.phrase], "GuestCTA check tier", fixture.slug);
    });
  }
});

describe("certificate page — Certificate names the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const own = EXAM_LABELS[fixture.kind];
      const text = renderText(
        <Certificate
          recipientName="Sam Tester"
          courseName={fixture.name}
          completedAt="Aug 10, 2026"
          examScore={88}
          totalLessons={46}
          series={fixture.slug}
          kind={fixture.kind}
        />,
      );
      // Both the page head line and the printed document body name the exam.
      expect(text).toContain(`the ${own.phrase} is passed at ${CERT_EXAM_PASS_PCT}% or higher`);
      expect(text).toContain(`lessons and the timed ${own.phrase}.`);
      expectKindCorrect(text, fixture.kind, [own.phrase], "Certificate", fixture.slug);
    });
  }
});

describe("seo head — the exam page <head> is composed from the label source for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const own = examLabels(fixture.kind);
      const title = own.seoTitle(fixture.name);
      const description = own.seoDescription(fixture.name);
      const text = `${title} ${description}`;
      expect(title).toContain(`${fixture.name}: ${EXAM_LABELS[fixture.kind].full}`);
      expect(text).toContain(EXAM_LABELS[fixture.kind].full);
      expectKindCorrect(text, fixture.kind, [EXAM_LABELS[fixture.kind].full], "exam <head>", fixture.slug);
    });
  }
});

describe("chronicle — an exam completion event names the exam for every series", () => {
  for (const fixture of SERIES) {
    it(`${fixture.slug} (${fixture.kind})`, () => {
      const event = {
        id: "e1",
        user_id: "u1",
        course_id: "c1",
        lesson_slug: fixture.slug,
        event_type: "exam",
        score: 88,
        completed_at: "2026-08-10T12:00:00.000Z",
      } as unknown as CompletionEventRow;
      const label = chronicleLabel(event, {
        courseName: fixture.name,
        examKind: fixture.kind,
      });
      expect(label).toBe(`${fixture.name} · ${EXAM_LABELS[fixture.kind].phrase} passed`);
      expectKindCorrect(label, fixture.kind, [EXAM_LABELS[fixture.kind].phrase], "chronicleLabel", fixture.slug);
    });
  }
});

/* ── the evidence table (printed once; pasted into the card metadata) ──── */

describe("evidence table", () => {
  it("prints series → rendered label for all 12 series", () => {
    const rows = SERIES.map((f) => ({
      series: f.slug,
      kind: f.kind,
      rendered: EXAM_LABELS[f.kind].full,
      card: EXAM_LABELS[f.kind].short,
      phrase: EXAM_LABELS[f.kind].phrase,
    }));
    console.log(
      [
        "| series | examKind | ExamCard/Widget full | short | phrase |",
        "|---|---|---|---|---|",
        ...rows.map((r) => `| ${r.series} | ${r.kind} | ${r.rendered} | ${r.card} | ${r.phrase} |`),
      ].join("\n"),
    );
    expect(rows).toHaveLength(12);
  });
});
