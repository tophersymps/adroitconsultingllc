This is the **Adroit Consulting** marketing site: [Next.js](https://nextjs.org) (React) with the App Router, TypeScript, and Tailwind CSS. The repo root is one level up; planning docs live in `../../docs/planning` and brand masters in `../../brand/logo`.

## Getting Started

From this directory, install and run the dev server:

```bash
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Edit routes under `src/app/` (for example `src/app/page.tsx`). Static assets served at `/` are in `public/` (favicons and Open Graph image are synced from `../../brand/logo`).

Set `NEXT_PUBLIC_SITE_URL` in production (for example `https://www.adroitconsulting.com`) so Open Graph URLs resolve correctly.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
