### Admin modals follow design system and fix see-through background (admin-modal-styling-and-legibility)

**What** - Fixed `CatalogOrgDialog`, `CourseProfileDialog`, `BulkUserActionDialogs`, `AccessGrid` popover, `RosterPanel`, and `/admin/courses` page containers where `bg-[var(--surface-card, #FFFFFF)]` broke Tailwind's class parser (due to the space after comma), producing no background and causing modals to render see-through. Replaced with standard `--surface-card`, `--admin-table-border`, and `--ink-primary` tokens with explicit inline style fallbacks and `backdrop-blur-xs` overlays.

**Why** - In Tailwind CSS, arbitrary class brackets containing spaces (e.g. `bg-[var(--surface-card, #FFFFFF)]`) fail to generate CSS rules because HTML class attributes split on whitespace. This left `CatalogOrgDialog` and other admin panels with transparent backgrounds, allowing underlying text to bleed through. Additionally, form controls in `CourseProfileDialog` were using `bg-transparent` rather than design-system surface tokens, causing contrast and illegibility issues.

**Verified** - Ran full test suite (`npm test`, 193 test files, 1841 tests passed); ran linter (`npm run lint`, clean with 0 warnings/errors); verified all broken classes eliminated with `git grep`.

**Known Issues** - None.
