# Free hosting when Vercel Hobby blocks private org repos

## Decision for this repository

| Constraint | Implication |
|------------|----------------|
| Vercel Hobby | Does **not** deploy from **private GitHub organization** repositories without upgrading to Pro. |
| This app ([`apps/web`](../apps/web)) | Uses a **dynamic** Route Handler at `/api/contact` (Salesforce Web-to-Lead, reCAPTCHA, rate limiting). |
| Conclusion | You need a **Node runtime** (`next start` or equivalent). **Static export only** would drop the API route unless you move the form to an external backend. |

**Recommended free path:** deploy on **Render** using [`render.yaml`](../render.yaml) (private org repos are allowed on the free web tier; instances spin down after idle time).

**Stay on Vercel for free:** make the repo **public**, move it to a **personal** GitHub account, or set up an **org → personal private mirror** and connect Vercel to the mirror.

**Alternatives:** **Fly.io** or any Docker host using [`apps/web/Dockerfile`](../apps/web/Dockerfile). **Cloudflare Pages** is a better fit for static sites; running full Next.js + Route Handlers there needs extra adapters (more setup than Render for this project).

---

## Runtime (verify-runtime)

Production build output includes:

- Static pages (○) for marketing routes.
- Dynamic API (ƒ) for `POST /api/contact`.

So the host must run **`npm run build`** then **`npm run start`** (or the Docker `node server.js` entrypoint from the standalone output).

---

## Pilot deploy on Render

1. Push these files to your GitHub org repo (`render.yaml` at repo root).
2. In [Render](https://dashboard.render.com): **New** → **Blueprint** (or **Web Service** if you prefer manual setup).
3. Connect the **organization** repository and grant the Render GitHub app access to that org if prompted.
4. For a Blueprint, select the branch (e.g. `main`) and apply. Set **Root Directory** to `apps/web` if you use a manual Web Service instead of the Blueprint.
5. In **Environment**, set the same variables as [`apps/web/.env.example`](../apps/web/.env.example) (at minimum `NEXT_PUBLIC_SITE_URL`, `SALESFORCE_OID`, and reCAPTCHA keys for production).
6. Deploy. After the first deploy, open your Render URL and test the contact form.

`render.yaml` lists `sync: false` placeholders for secrets—enter real values in the Render dashboard after the service is created.

---

## Pilot deploy on Fly.io (Docker)

From the repository root:

```bash
cd apps/web
fly launch --dockerfile Dockerfile
```

Use the Dockerfile in this folder; build context must be **`apps/web`** (see `Dockerfile` comments). Set the same environment variables as on Render.

---

## Vercel compatibility

[`next.config.ts`](../apps/web/next.config.ts) sets `output: "standalone"`. Vercel’s build still works; standalone output is used for Docker and smaller production images.
