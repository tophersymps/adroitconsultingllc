import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /preview/ holds auth-gated drafts — never indexable (draft-state).
      // /admin/ is the gated course-admin surface — disallow crawlers
      // (defense-in-depth; the layout also emits noindex, t_d2dfc405).
      disallow: ['/api/', '/preview/', '/admin/', '/lab/'],
    },
    sitemap: 'https://adroit.io/sitemap.xml',
  };
}
