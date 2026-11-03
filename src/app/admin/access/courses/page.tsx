"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AccessCoursesRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const course = searchParams.get("course");
    const courseParam = course ? `&course=${encodeURIComponent(course)}` : "";
    router.replace(`/admin/courses?tab=roster${courseParam}`);
  }, [router, searchParams]);

  return (
    <div className="p-8 text-center text-sm text-[var(--ink-muted)]">
      Redirecting to Courses Hub…
    </div>
  );
}

/**
 * /admin/access/courses — Redirects to unified Course Administration Hub at /admin/courses?tab=roster
 * Merged into unified Courses Hub for streamlined navigation and reduced UI redundancy.
 */
export default function AdminAccessCoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-[var(--ink-muted)]">
          Redirecting…
        </div>
      }
    >
      <AccessCoursesRedirect />
    </Suspense>
  );
}
