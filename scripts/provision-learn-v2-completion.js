#!/usr/bin/env node
/**
 * provision-learn-v2-completion.js — Learn v2 completion backfill (t_f94e01d5).
 *
 * Closes three phase-audit gaps (G2/G4) against the LIVE Supabase database,
 * using the same SERVICE-ROLE client the /api/admin/* route handlers use
 * (getSupabaseServiceClient). Idempotent + auditable: safe to re-run, and the
 * exact writes below are the review surface for downstream QA (zod).
 *
 *   G2 — Provision the Hermes Consultant Track L2/L3 course rows
 *        (hermes-consultant-intermediate, hermes-consultant-advanced) which
 *        have content + series.json + lessons but NO live `courses` row, so
 *        they never render. Org fields mirror migration 009's backfill:
 *        tracks section + hermes-consultant-track group, track hermes-consultant,
 *        level 2/3, sort_order 20/30, difficulty Intermediate/Advanced.
 *        access_model = 'granted' (matches the Hermes track — stealth-granted,
 *        NOT sub-or-one-time). Status = 'live' (content publishes daily).
 *
 *        ALSO seeds course_prerequisites (L2 requires L1, L3 requires L2) which
 *        migration 8d could not create — it ran before L2/L3 rows existed, so
 *        the outline's Prerequisites section was empty.
 *
 *   G4 — Populate the profile prose (recommended_background, audience,
 *        learning_outcomes, course_tags) for EVERY live course. Migration 009
 *        only backfilled org + difficulty; these prose fields are empty
 *        everywhere. Prose below is derived from each series' description +
 *        lesson content — no invented facts.
 *
 * Usage: node scripts/provision-learn-v2-completion.js
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.local');

function loadEnv() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) throw new Error(`Missing ${ENV_PATH}`);
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || serviceKey.includes('...')) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
}
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findRow(table, column, value) {
  const { data, error } = await sb.from(table).select('*').eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Course target state — org + profile. `series_slug` is the join key.
 * Prose is derived from content/learn/<slug>/series.json descriptions.
 */
const COURSES = [
  {
    series_slug: 'hermes-consultant',
    title: 'Hermes Agent Consultant',
    org: { section_slug: 'tracks', group_slug: 'hermes-consultant-track', track: 'hermes-consultant', level: 1, sort_order: 10 },
    difficulty: 'Beginner',
    profile: {
      recommended_background: 'Comfortable with the command line and basic programming concepts; some familiarity with AI assistants or LLM APIs helps but is not required.',
      audience: 'Technical professionals becoming agent-implementation consultants',
      learning_outcomes: [
        'Scope an agent-implementation engagement from discovery through delivery',
        'Apply implementation craft and delivery practice to real client work',
        'Package, price, and run a consulting engagement end to end',
      ],
      course_tags: ['Consulting', 'AI Agents', 'Hermes'],
    },
  },
  {
    series_slug: 'hermes-consultant-intermediate',
    title: 'Hermes Agent Consultant · Intermediate',
    org: { section_slug: 'tracks', group_slug: 'hermes-consultant-track', track: 'hermes-consultant', level: 2, sort_order: 20 },
    difficulty: 'Intermediate',
    profile: {
      recommended_background: 'Completion of Level 1 (Hermes Agent Consultant) or equivalent agent-implementation delivery experience.',
      audience: 'Working practitioners running full client engagements',
      learning_outcomes: [
        'Run a full engagement in a complex client environment',
        'Estimate multi-week delivery and drive team execution',
        'Apply incident discipline and pricing practice on live work',
      ],
      course_tags: ['Consulting', 'Delivery', 'Hermes'],
    },
  },
  {
    series_slug: 'hermes-consultant-advanced',
    title: 'Hermes Agent Consultant · Advanced',
    org: { section_slug: 'tracks', group_slug: 'hermes-consultant-track', track: 'hermes-consultant', level: 3, sort_order: 30 },
    difficulty: 'Advanced',
    profile: {
      recommended_background: 'Completion of Levels 1 and 2 of the Hermes Consultant Track, or principal-level consulting experience.',
      audience: 'Principals building and scaling a consulting practice',
      learning_outcomes: [
        'Architect agent systems at organizational scale',
        'Run delivery operations with healthy margins',
        'Set value-based pricing and build a go-to-market plan',
        'Hire and scale a delivery team',
      ],
      course_tags: ['Consulting', 'Practice', 'Scale', 'Hermes'],
    },
  },
  {
    series_slug: 'salesforce-architect',
    title: 'Salesforce System Architect Primer',
    org: { section_slug: 'certifications', group_slug: 'salesforce-certifications', sort_order: 10 },
    difficulty: 'Intermediate',
    profile: {
      recommended_background: 'Working knowledge of the Salesforce platform; comfort with declarative automation and basic Apex is helpful.',
      audience: 'Salesforce developers, architects, and teams scaling on the platform',
      learning_outcomes: [
        'Design robust Flow and declarative automation',
        'Apply Apex patterns that hold up as a platform scales',
        'Make defensible architecture tradeoffs for Salesforce builds',
      ],
      course_tags: ['Salesforce', 'Architecture', 'Flow', 'Apex'],
    },
  },
  {
    series_slug: 'omni-studio-cert',
    title: 'OmniStudio Developer Certification',
    org: { section_slug: 'certifications', group_slug: 'salesforce-certifications', sort_order: 20 },
    difficulty: 'Advanced',
    profile: {
      recommended_background: 'Salesforce platform experience; familiarity with OmniStudio components or the OmniStudio Developer exam guide.',
      audience: 'Developers preparing for the Certified OmniStudio Developer exam',
      learning_outcomes: [
        'Work through all 46 exam-guide requirements systematically',
        'Configure OmniStudio components with real walkthroughs',
        'Avoid common exam traps and pass practice questions',
      ],
      course_tags: ['Salesforce', 'OmniStudio', 'Certification'],
    },
  },
  {
    series_slug: 'agentic-ai',
    title: 'Agentic AI Implementation Path',
    org: { section_slug: 'learning-paths', sort_order: 10 },
    difficulty: 'Intermediate',
    profile: {
      recommended_background: 'Comfortable with the command line and basic Python or TypeScript; some LLM API experience helps.',
      audience: 'Practitioners shipping agentic AI systems',
      learning_outcomes: [
        'Build single-agent prototypes that ship',
        'Orchestrate multi-agent systems in production',
        'Apply evaluation and guardrails to agentic workloads',
      ],
      course_tags: ['AI', 'Agents', 'Orchestration'],
    },
  },
  {
    series_slug: 'ai-at-work',
    title: 'AI at Work',
    org: { section_slug: 'learning-paths', sort_order: 20 },
    difficulty: 'Beginner',
    profile: {
      recommended_background: 'None — a vendor-agnostic primer for using AI in day-to-day work, for any team and any AI tool.',
      audience: 'Knowledge workers, managers, and teams adopting AI',
      learning_outcomes: [
        'Use AI tools effectively for daily productivity',
        'Craft prompts that get reliable, useful output',
        'Build small automations and drive team-wide adoption',
      ],
      course_tags: ['AI', 'Productivity', 'Adoption'],
    },
  },
];

async function getOrgRefs() {
  const { data: sections, error: se } = await sb.from('catalog_sections').select('id,slug');
  if (se) throw se;
  const { data: groups, error: ge } = await sb.from('catalog_groups').select('id,slug');
  if (ge) throw ge;
  const secById = Object.fromEntries(sections.map((s) => [s.slug, s.id]));
  const grpById = Object.fromEntries(groups.map((g) => [g.slug, g.id]));
  return { secById, grpById };
}

async function main() {
  const { secById, grpById } = await getOrgRefs();
  console.log('sections:', secById, '\ngroups:', grpById);

  for (const c of COURSES) {
    let row = await findRow('courses', 'series_slug', c.series_slug);
    const section_id = c.org.section_slug ? secById[c.org.section_slug] : null;
    const group_id = c.org.group_slug ? grpById[c.org.group_slug] : null;
    if (!c.org.section_slug && !c.org.group_slug) {
      // standalone learning path — always has a section
      throw new Error(`${c.series_slug}: missing section_slug`);
    }
    const patch = {
      title: c.title,
      section_id,
      group_id,
      track: c.org.track ?? null,
      level: c.org.level ?? null,
      sort_order: c.org.sort_order ?? 0,
      difficulty: c.difficulty,
      recommended_background: c.profile.recommended_background,
      audience: c.profile.audience,
      learning_outcomes: c.profile.learning_outcomes,
      course_tags: c.profile.course_tags,
      status: 'live',
      updated_at: new Date().toISOString(),
    };
    if (!row) {
      // G2 provision: access_model granted matches the Hermes track (stealth).
      const { data, error } = await sb.from('courses').insert({
        series_slug: c.series_slug,
        title: c.title,
        status: 'live',
        access_model: 'granted',
        price_cents: null,
        ...patch,
      }).select('*').single();
      if (error) throw error;
      row = data;
      console.log(`PROVISIONED ${c.series_slug} (id ${row.id})`);
    } else {
      const { data, error } = await sb.from('courses').update(patch).eq('series_slug', c.series_slug).select('*').single();
      if (error) throw error;
      row = data;
      console.log(`UPDATED    ${c.series_slug} (org + profile filled)`);
    }
    c._id = row.id;
  }

  // G2: seed prerequisites (L2 requires L1; L3 requires L2) — the migration
  // 8d insert was a no-op because L2/L3 rows did not exist yet.
  const bySlug = Object.fromEntries(COURSES.map((c) => [c.series_slug, c._id]));
  const prereqs = [
    { course_id: bySlug['hermes-consultant-intermediate'], required_course_id: bySlug['hermes-consultant'], sort_order: 10 },
    { course_id: bySlug['hermes-consultant-advanced'], required_course_id: bySlug['hermes-consultant-intermediate'], sort_order: 10 },
  ];
  for (const p of prereqs) {
    const { data: existing, error: findErr } = await sb
      .from('course_prerequisites')
      .select('id')
      .eq('course_id', p.course_id)
      .eq('required_course_id', p.required_course_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      console.log('PREREQ exists (skip)', p.course_id, '→', p.required_course_id);
      continue;
    }
    const { error } = await sb.from('course_prerequisites').insert(p);
    if (error) throw error;
    console.log('PREREQ seeded', p.course_id, '→', p.required_course_id);
  }

  console.log('\nDone. Verify on /learn (tracks section) + /learn/<slug> outlines.');
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
