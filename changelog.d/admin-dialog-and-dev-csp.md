### Admin dialogs legible, dev CSP allows React eval (admin-dialog-and-dev-csp)

**What** - `DeleteUserDialog` and `CreateUserDialog` now use the site's `--surface-card`, `--ink-*` and `--admin-table-border` variables instead of undefined Tailwind colour classes (`bg-background`, `text-foreground`, `border-card-border`). `next.config.ts` adds `'unsafe-eval'` to the CSP `script-src` only when `NODE_ENV` is `development`.

**Why** - the undefined classes rendered the modals with no background, so page content showed through and the text was unreadable. React's dev build uses `eval()` to rebuild call stacks, and the CSP blocked it, which raised the Next dev overlay "1 Issue" on every page. Production builds never use `eval`, and the production CSP is unchanged.

**Verified** - modal confirmed by the owner on `http://localhost:3000/admin/users`; served dev CSP header includes `'unsafe-eval'`; `src/config/next.config.test.ts` passes; eslint clean on both dialogs.

**Known Issues** - None.
