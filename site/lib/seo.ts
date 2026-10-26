/**
 * Public-page metadata for omniatax.io.
 *
 * Canonical host is the apex (https://omniatax.io when PUBLIC_BASE_URL is
 * set to that). www and http are redirected to it. Private account pages
 * are noindex and left out of the sitemap.
 *
 * The only price in structured data is $0.08 per paycheck calculation,
 * with a 14-day trial. Do not add another offer.
 */

import { readFileSync } from 'node:fs';

export interface PageMeta {
  /** Questions and answers on the page. They are also emitted as FAQPage JSON-LD, so they must match the visible text. */
  faq?: { q: string; a: string }[];
  /** Trail from the home page, emitted as BreadcrumbList JSON-LD. */
  breadcrumb?: { name: string; path: string }[];
  /** Public path. Aliases set canonicalPath and are not listed in the sitemap. */
  path: string;
  /** File under site/, used for lastmod. */
  file: string;
  title: string;
  description: string;
  /** When false, robots meta is noindex and the path is omitted from the sitemap. */
  index: boolean;
  /** Defaults to path. */
  canonicalPath?: string;
}

export const PAGES: PageMeta[] = [
  {
    path: '/',
    file: 'index.html',
    title: 'Payroll tax calculation API for developers | Omnia.tax',
    description: 'Calculate US payroll taxes with one API call: federal, state, local and employer taxes for every state. 14-day free trial, then $0.08 per paycheck calculation.',
    index: true,
  },
  {
    path: '/product',
    file: 'product.html',
    title: 'Payroll tax API: gross pay to net pay in one call | Omnia.tax',
    description: 'One API call turns gross pay into federal, state and local withholding, Social Security, Medicare and employer taxes, with every line explained.',
    index: true,
  },
  {
    path: '/coverage',
    file: 'coverage.html',
    title: 'Payroll tax coverage: all 50 states, DC and local taxes | Omnia.tax',
    description: 'Federal income tax, FICA and state withholding for every state and DC, plus thousands of local jurisdictions and local minimum wage ordinances.',
    index: true,
  },
  {
    path: '/pricing',
    file: 'pricing.html',
    title: 'Payroll tax API pricing: $0.08 per paycheck | Omnia.tax',
    description: '14-day free trial, then $0.08 per paycheck calculation. No seat fees, no minimum. Pay only for the payroll tax calculations you run.',
    index: true,
  },
  {
    path: '/docs',
    file: 'docs.html',
    title: 'Payroll tax API documentation | Omnia.tax',
    description: 'How to call the Omnia.tax payroll tax API: authentication, requests, errors, OpenAPI spec, and worked examples.',
    index: true,
  },
  {
    path: '/docs/paycheck',
    file: 'docs-paycheck.html',
    title: 'POST /v1/paycheck: payroll tax calculation endpoint | Omnia.tax',
    description: 'Request and response fields for the paycheck endpoint: earnings, deductions, Form W-4, year-to-date wages, work state, garnishments and minimum wage.',
    index: true,
  },
  {
    path: '/sandbox',
    file: 'sandbox.html',
    title: 'Payroll tax calculator API console | Omnia.tax',
    description: 'Build a paycheck request in the browser and run it on the Omnia.tax payroll tax engine. See every federal, state and local tax line.',
    index: true,
  },
  {
    path: '/changelog',
    file: 'changelog.html',
    title: 'Changelog — Omnia.tax',
    description: 'What changed in the Omnia.tax payroll tax engine and API.',
    index: true,
  },
  {
    path: '/status',
    file: 'status.html',
    title: 'API status — Omnia.tax',
    description: 'Whether the Omnia.tax API is up, and the version that answered.',
    index: true,
  },
  {
    path: '/about',
    file: 'about.html',
    title: 'About OMNIA TAX LLC — Omnia.tax',
    description: 'OMNIA TAX LLC builds the Omnia.tax payroll tax API in Birmingham, Michigan.',
    index: true,
  },
  {
    path: '/contact',
    file: 'contact.html',
    title: 'Contact — Omnia.tax',
    description: 'Email OMNIA TAX LLC about the payroll tax API.',
    index: true,
  },
  {
    path: '/security',
    file: 'security.html',
    title: 'Security — Omnia.tax',
    description: 'How Omnia.tax stores API keys, passwords, and payment details.',
    index: true,
  },
  {
    path: '/terms',
    file: 'legal/terms.html',
    title: 'Terms of Service — Omnia.tax',
    description: 'The terms of service for the Omnia.tax API.',
    index: true,
  },
  {
    path: '/privacy',
    file: 'legal/privacy.html',
    title: 'Privacy Policy — Omnia.tax',
    description: 'What Omnia.tax collects, and what it does not store.',
    index: true,
  },
  {
    path: '/acceptable-use',
    file: 'legal/acceptable-use.html',
    title: 'Acceptable Use Policy — Omnia.tax',
    description: 'What you may and may not do with the Omnia.tax API.',
    index: true,
  },
  {
    path: '/disclaimer',
    file: 'legal/disclaimer.html',
    title: 'Disclaimer — Omnia.tax',
    description: 'Omnia.tax calculations are not tax, legal, or payroll advice.',
    index: true,
  },
  {
    path: '/signup',
    file: 'signup.html',
    title: 'Create an account — Omnia.tax',
    description: 'Create an Omnia.tax account.',
    index: false,
  },
  {
    path: '/signup/verify',
    file: 'signup-verify.html',
    title: 'Check your email — Omnia.tax',
    description: 'Enter the code sent to your email.',
    index: false,
  },
  {
    path: '/signup/business',
    file: 'signup-business.html',
    title: 'Business details — Omnia.tax',
    description: 'Tell Omnia.tax about the business on the account.',
    index: false,
  },
  {
    path: '/signup/payment',
    file: 'signup-payment.html',
    title: 'Payment method — Omnia.tax',
    description: 'Add a card or bank account to start the trial.',
    index: false,
  },
  {
    path: '/signup/key',
    file: 'signup-key.html',
    title: 'Your API key — Omnia.tax',
    description: 'Copy the API key for this account. It is shown once.',
    index: false,
  },
  {
    path: '/signin',
    file: 'signin.html',
    title: 'Sign in — Omnia.tax',
    description: 'Sign in to your Omnia.tax account.',
    index: false,
  },
  {
    path: '/dashboard',
    file: 'dashboard.html',
    title: 'Account dashboard — Omnia.tax',
    description: 'API key, usage, and billing for your Omnia.tax account.',
    index: false,
  },
  {
    path: '/console',
    file: 'sandbox.html',
    title: 'Payroll tax calculator API console | Omnia.tax',
    description: 'Build a paycheck request in the browser and run it on the Omnia.tax payroll tax engine. See every federal, state and local tax line.',
    index: false,
    canonicalPath: '/sandbox',
  },
  {
    path: '/_states',
    file: 'states.html',
    title: 'States reference — Omnia.tax',
    description: 'Internal list of state withholding pages.',
    index: false,
  },
];

/**
 * The generated guides and per-state pages (scripts/build-seo-pages.ts writes the manifest and the
 * HTML). They are public and indexable.
 */
function generatedPages(): PageMeta[] {
  try {
    const manifest = JSON.parse(readFileSync(new URL('./generated-pages.json', import.meta.url), 'utf8')) as {
      path: string; file: string; title: string; description: string; faq: { q: string; a: string }[]; breadcrumb: { name: string; path: string }[];
    }[];
    return manifest.map((m) => ({ path: m.path, file: m.file, title: m.title, description: m.description, index: true, faq: m.faq, breadcrumb: m.breadcrumb }));
  } catch {
    return [];
  }
}
PAGES.push(...generatedPages());

const NOT_FOUND: PageMeta = {
  path: '/404',
  file: 'not-found.html',
  title: 'Page not found — Omnia.tax',
  description: 'That page is not on Omnia.tax.',
  index: false,
};

/** Apex origin. www is not canonical. Falls back to the production host. */
export function canonicalOrigin(): string {
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(configured)) return configured;
  return 'https://omniatax.io';
}

export function pageForRoute(pathname: string): PageMeta | undefined {
  return PAGES.find((p) => p.path === pathname);
}

export function indexablePages(): PageMeta[] {
  return PAGES.filter((p) => p.index);
}

/** Paths a crawler should not request. Also listed in robots.txt. */
export const ROBOTS_DISALLOW = [
  '/dashboard',
  '/signin',
  '/signup',
  '/console',
  '/_states',
  '/api/',
  '/v1/',
];

export function robotsTxt(origin = canonicalOrigin()): string {
  const lines = ['User-agent: *', 'Allow: /', ...ROBOTS_DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${origin}/sitemap.xml`, ''];
  return lines.join('\n');
}

export function sitemapXml(origin: string, lastmod: Record<string, string>): string {
  const urls = indexablePages().map((page) => {
    const loc = origin + (page.path === '/' ? '/' : page.path);
    const mod = lastmod[page.path] ?? lastmod[page.file] ?? new Date().toISOString().slice(0, 10);
    return `  <url><loc>${escapeXml(loc)}</loc><lastmod>${escapeXml(mod)}</lastmod></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Google Search Console token. Empty when unset or not a safe token. */
export function googleSiteVerification(): string | null {
  const raw = (process.env.GOOGLE_SITE_VERIFICATION ?? '').trim();
  if (!raw || !/^[A-Za-z0-9_-]{8,128}$/.test(raw)) return null;
  return raw;
}

const OG_IMAGE = { path: '/logo/og-image.png', width: 1200, height: 630, alt: 'Omnia.tax: payroll tax calculation, as an API.' };

function breadcrumbFor(page: PageMeta): { name: string; path: string }[] | undefined {
  if (page.breadcrumb) return page.breadcrumb;
  if (page.path === '/') return undefined;
  const name = page.title.split(/ [|\u2014] /)[0].trim();
  return [{ name: 'Home', path: '/' }, { name, path: page.canonicalPath ?? page.path }];
}

function jsonLd(origin: string, page: PageMeta): string {
  const org = `${origin}/#organization`;
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': org,
      name: 'OMNIA TAX LLC',
      url: origin,
      logo: { '@type': 'ImageObject', url: `${origin}/logo/favicon-512.png`, width: 512, height: 512 },
      image: `${origin}${OG_IMAGE.path}`,
      description: 'OMNIA TAX LLC builds Omnia.tax, a payroll tax calculation API.',
      email: 'scottholdan@gmail.com',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '595 N Old Woodward Ave',
        addressLocality: 'Birmingham',
        addressRegion: 'MI',
        addressCountry: 'US',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: 'Omnia.tax',
      alternateName: ['Omnia Tax', 'omniatax.io'],
      url: origin,
      inLanguage: 'en-US',
      publisher: { '@id': org },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${origin}/#software`,
      name: 'Omnia.tax',
      url: origin,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Payroll tax calculation API',
      operatingSystem: 'Web',
      description:
        'A payroll tax calculation API. One request returns federal, state, local and employer payroll taxes for a paycheck, with each line explained.',
      featureList: [
        'Federal income tax, Social Security and Medicare',
        'State income tax for all 50 states and DC',
        'Local payroll taxes',
        'Employer taxes: FUTA, state unemployment and paid leave',
        'Wage garnishment limits and minimum wage checks',
        'OpenAPI 3.1 specification and JSON Schema',
      ],
      provider: { '@id': org },
      offers: {
        '@type': 'Offer',
        price: '0.08',
        priceCurrency: 'USD',
        description: '$0.08 per paycheck calculation after a 14-day trial',
      },
    },
  ];
  const crumbs = breadcrumbFor(page);
  if (crumbs) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: origin + (c.path === '/' ? '/' : c.path) })),
    });
  }
  if (page.faq && page.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/**
 * Insert the canonical URL, social tags, robots directive, icons, and (on public
 * pages) JSON-LD. Replaces an existing title and description so each URL
 * has one of each. Adds a nonce to inline scripts for the page CSP.
 */
export function decorateHtml(html: string, routePath: string, nonce: string, origin = canonicalOrigin()): string {
  const page = pageForRoute(routePath) ?? (routePath === '/404' ? NOT_FOUND : undefined);
  if (!page) return addNonces(html, nonce);
  const canonicalPath = page.canonicalPath ?? page.path;
  const url = origin + (canonicalPath === '/' ? '/' : canonicalPath);
  const robots = page.index ? 'index, follow' : 'noindex, nofollow';
  const verify = googleSiteVerification();
  const image = origin + OG_IMAGE.path;
  const tags = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:title" content="${escapeAttr(page.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(page.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Omnia.tax" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(OG_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttr(OG_IMAGE.alt)}" />`,
    `<meta name="theme-color" content="#FBFBF9" />`,
    `<link rel="icon" href="/favicon.ico" sizes="48x48" />`,
    `<link rel="icon" href="/logo/favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="/logo/favicon-192.png" type="image/png" sizes="192x192" />`,
    `<link rel="apple-touch-icon" href="/logo/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/site.webmanifest" />`,
    verify ? `<meta name="google-site-verification" content="${escapeAttr(verify)}" />` : '',
    page.index ? `<script type="application/ld+json" nonce="${escapeAttr(nonce)}">${jsonLd(origin, page)}</script>` : '',
  ].filter(Boolean);

  // One set of icon links, ours: drop whatever the page file carried.
  let out = html.replace(/<link\s+rel="(?:icon|apple-touch-icon)"[^>]*>\s*/gi, '');
  if (/<title>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(page.title)}</title>`);
  else tags.unshift(`<title>${escapeAttr(page.title)}</title>`);
  if (/<meta\s+name="description"[^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeAttr(page.description)}" />`);
  } else {
    tags.unshift(`<meta name="description" content="${escapeAttr(page.description)}" />`);
  }
  out = addNonces(out, nonce);
  return out.replace(/<\/head>/i, `${tags.join('\n')}\n</head>`);
}

function addNonces(html: string, nonce: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (full, attrs: string) => {
    if (/\bnonce\s*=/.test(attrs) || /\bsrc\s*=/.test(attrs)) return full;
    return `<script nonce="${nonce}"${attrs}>`;
  });
}
