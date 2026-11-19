### Admin modals follow design system and add course settings controls (admin-modal-styling-and-legibility)

**What** - Fixed `CatalogOrgDialog`, `CourseProfileDialog`, `BulkUserActionDialogs`, `AccessGrid` popover, `RosterPanel`, and `/admin/courses` page containers where `bg-[var(--surface-card, #FFFFFF)]` broke Tailwind's class parser (due to the space after comma), producing no background and causing modals to render see-through. Added Access Model (`free`, `subscription`, `one-time`, `sub-or-one-time`, `granted`) and Lifecycle Status (`pending`, `live`, `archived`) editing controls to `CourseProfileDialog` and directly to each course card in `/admin/courses` Card View.

**Why** - In Tailwind CSS, arbitrary class brackets containing spaces fail to generate CSS rules because HTML class attributes split on whitespace, leaving dialogs transparent. In addition, admins had no way to change course access models (such as Free, Sub or One-time, or One-time) from the default Card View or within the course edit dialog.

**Verified** - Ran full test suite (`npm test`, 193 test files, 1843 tests passed); ran linter (`npm run lint`, clean with 0 warnings/errors); added tests in `src/app/admin/courses/page.test.tsx` verifying card view access-model switcher and `CourseProfileDialog` access model/status/price controls.

**Known Issues** - None.
