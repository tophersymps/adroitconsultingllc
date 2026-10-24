"use client";

/**
 * src/components/SearchDataProvider.tsx — carries the server-filtered learn
 * search payload to `SearchOverlay` (security t_a6b7630b, CWE-200).
 *
 * `Header` and `SearchOverlay` are client components, so neither can call the
 * server helper in `@/lib/learn-public`. The root layout (a server component)
 * filters the dataset before the boundary and hands the projected arrays down
 * through this provider, so every route's overlay searches launched content
 * only and no stealth series string ever reaches a client chunk.
 *
 * The value is the payload from `getPublicSearchData()`; the default is empty
 * so a component rendered outside the provider (unit tests, isolated stories)
 * simply has no learn results rather than reaching for the full dataset.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { PublicSearchData } from "@/lib/learn-public";

const EMPTY: PublicSearchData = { series: [], lessons: [] };

const SearchDataContext = createContext<PublicSearchData>(EMPTY);

export function useSearchData(): PublicSearchData {
  return useContext(SearchDataContext);
}

export default function SearchDataProvider({
  value,
  children,
}: {
  value: PublicSearchData;
  children: ReactNode;
}) {
  return (
    <SearchDataContext.Provider value={value}>
      {children}
    </SearchDataContext.Provider>
  );
}
