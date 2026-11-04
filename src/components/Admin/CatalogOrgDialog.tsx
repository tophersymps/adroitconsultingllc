"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CatalogGroup,
  CatalogSection,
} from "@/shared/contracts-course-catalog";

interface CatalogOrgDialogProps {
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function CatalogOrgDialog({
  onClose,
  onToast,
}: CatalogOrgDialogProps) {
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Section form state
  const [secName, setSecName] = useState("");
  const [secSlug, setSecSlug] = useState("");
  const [secOrder, setSecOrder] = useState("0");

  // Group form state
  const [grpSectionId, setGrpSectionId] = useState("");
  const [grpName, setGrpName] = useState("");
  const [grpSlug, setGrpSlug] = useState("");
  const [grpOrder, setGrpOrder] = useState("0");

  const loadOrg = useCallback(async () => {
    try {
      const [secRes, grpRes] = await Promise.all([
        fetch("/api/admin/catalog/sections"),
        fetch("/api/admin/catalog/groups"),
      ]);
      const [secJson, grpJson] = await Promise.all([
        secRes.json(),
        grpRes.json(),
      ]);
      const secList = (secJson.data ?? []) as CatalogSection[];
      setSections(secList);
      setGroups((grpJson.data ?? []) as CatalogGroup[]);
      if (secList.length > 0 && !grpSectionId) {
        setGrpSectionId(secList[0]!.id);
      }
    } catch {
      onToast("Failed to load sections and groups");
    } finally {
      setLoading(false);
    }
  }, [grpSectionId, onToast]);

  useEffect(() => {
    // Data-fetch on mount — setState runs after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrg();
  }, [loadOrg]);

  function slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSaveSection(e: React.FormEvent) {
    e.preventDefault();
    const name = secName.trim();
    const slug = (secSlug.trim() || slugify(name));
    if (!name || !slug) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/catalog/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          sort_order: Math.max(0, Number.parseInt(secOrder, 10) || 0),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onToast(json.error ?? "Failed to save section");
        return;
      }
      setSecName("");
      setSecSlug("");
      setSecOrder("0");
      onToast(`Saved section "${name}"`);
      await loadOrg();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = grpName.trim();
    const slug = (grpSlug.trim() || slugify(name));
    if (!grpSectionId || !name || !slug) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/catalog/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section_id: grpSectionId,
          name,
          slug,
          sort_order: Math.max(0, Number.parseInt(grpOrder, 10) || 0),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onToast(json.error ?? "Failed to save group");
        return;
      }
      setGrpName("");
      setGrpSlug("");
      setGrpOrder("0");
      onToast(`Saved group "${name}"`);
      await loadOrg();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage catalog sections and groups"
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--admin-table-border)] bg-[var(--surface-card)] p-6 shadow-2xl"
        style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 border-b border-[var(--admin-table-border)] pb-3" style={{ borderColor: "var(--admin-table-border)" }}>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink-primary)]">
              Catalog Sections &amp; Groups
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Create or update top-level Learn sections and vendor/family groups (upserts by slug).
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

        {loading ? (
          <p className="text-sm text-[var(--ink-muted)]">Loading catalog hierarchy…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sections column */}
            <div className="space-y-4">
              <div>
                <h3 className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)] mb-2">
                  Top-Level Sections ({sections.length})
                </h3>
                <div
                  className="rounded-xl border border-[var(--admin-table-border)] divide-y divide-[var(--admin-table-border)] max-h-48 overflow-y-auto bg-[var(--surface-card)]"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  {sections.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-[var(--ink-muted)]">
                      No sections yet. Create one below.
                    </p>
                  ) : (
                    sections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSecName(s.name);
                          setSecSlug(s.slug);
                          setSecOrder(String(s.sort_order ?? 0));
                          setGrpSectionId(s.id);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--surface-sunken)] transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-[var(--ink-primary)]">
                            {s.name}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--ink-faint)]">
                            {s.slug}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                          order #{s.sort_order}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveSection} className="space-y-2.5 rounded-xl border border-[var(--admin-table-border)] p-3.5 bg-[var(--surface-sunken)]/50" style={{ borderColor: "var(--admin-table-border)" }}>
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-primary)]">
                  Add / Update Section
                </div>
                <label className="block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                  Name
                  <input
                    type="text"
                    required
                    value={secName}
                    onChange={(e) => {
                      setSecName(e.target.value);
                      if (!secSlug) setSecSlug(slugify(e.target.value));
                    }}
                    placeholder="e.g. Cloud & Enterprise Architecture"
                    className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2.5 py-1.5 text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="col-span-2 block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                    Slug
                    <input
                      type="text"
                      required
                      value={secSlug}
                      onChange={(e) => setSecSlug(e.target.value)}
                      placeholder="cloud-architecture"
                      className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2.5 py-1.5 font-mono text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    />
                  </label>
                  <label className="block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                    Order
                    <input
                      type="number"
                      min={0}
                      value={secOrder}
                      onChange={(e) => setSecOrder(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2 py-1.5 font-mono text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--color-navy)" }}
                >
                  Save Section
                </button>
              </form>
            </div>

            {/* Groups column */}
            <div className="space-y-4">
              <div>
                <h3 className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)] mb-2">
                  Groups ({groups.length})
                </h3>
                <div
                  className="rounded-xl border border-[var(--admin-table-border)] divide-y divide-[var(--admin-table-border)] max-h-48 overflow-y-auto bg-[var(--surface-card)]"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  {groups.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-[var(--ink-muted)]">
                      No groups yet. Select a section to add one.
                    </p>
                  ) : (
                    groups.map((g) => {
                      const parentSec = sections.find((s) => s.id === g.section_id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setGrpSectionId(g.section_id);
                            setGrpName(g.name);
                            setGrpSlug(g.slug);
                            setGrpOrder(String(g.sort_order ?? 0));
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          <div>
                            <div className="font-semibold text-[var(--ink-primary)]">
                              {g.name}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--ink-faint)]">
                              {parentSec?.name ?? "Section"} · {g.slug}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                            order #{g.sort_order}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveGroup} className="space-y-2.5 rounded-xl border border-[var(--admin-table-border)] p-3.5 bg-[var(--surface-sunken)]/50" style={{ borderColor: "var(--admin-table-border)" }}>
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-primary)]">
                  Add / Update Group
                </div>
                <label className="block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                  Parent Section
                  <select
                    value={grpSectionId}
                    onChange={(e) => setGrpSectionId(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2.5 py-1.5 text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  >
                    <option value="">— select section —</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                  Group Name
                  <input
                    type="text"
                    required
                    value={grpName}
                    onChange={(e) => {
                      setGrpName(e.target.value);
                      if (!grpSlug) setGrpSlug(slugify(e.target.value));
                    }}
                    placeholder="e.g. Salesforce Ecosystem"
                    className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2.5 py-1.5 text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="col-span-2 block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                    Slug
                    <input
                      type="text"
                      required
                      value={grpSlug}
                      onChange={(e) => setGrpSlug(e.target.value)}
                      placeholder="salesforce"
                      className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2.5 py-1.5 font-mono text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    />
                  </label>
                  <label className="block text-[11.5px] font-semibold text-[var(--ink-primary)]">
                    Order
                    <input
                      type="number"
                      min={0}
                      value={grpOrder}
                      onChange={(e) => setGrpOrder(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[var(--admin-table-border)] px-2 py-1.5 font-mono text-xs bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy || sections.length === 0}
                  className="w-full rounded-md py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--color-navy)" }}
                >
                  Save Group
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
