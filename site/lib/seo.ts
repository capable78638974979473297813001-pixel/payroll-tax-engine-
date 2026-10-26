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

export interface PageMeta {
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
    title: 'Omnia.tax — Payroll tax calculation API',
    description: 'Gross-to-net US payroll tax, line by line. 14-day trial, then $0.08 per paycheck calculation.',
    index: true,
  },
  {
    path: '/product',
    file: 'product.html',
    title: 'Product — Gross-to-net payroll tax API | Omnia.tax',
    description: 'One API call turns gross pay into federal, state, and local withholding.',
    index: true,
  },
  {
    path: '/coverage',
    file: 'coverage.html',
    title: 'US payroll tax coverage — Omnia.tax',
    description: 'Federal income tax, FICA, and state withholding for every state, plus local taxes where the engine has them.',
    index: true,
  },
  {
    path: '/pricing',
    file: 'pricing.html',
    title: 'Pricing — $0.08 per paycheck | Omnia.tax',
    description: '14-day trial, then $0.08 per paycheck calculation. No seat fees.',
    index: true,
  },
  {
    path: '/docs',
    file: 'docs.html',
    title: 'API documentation — Omnia.tax',
    description: 'How to call the Omnia.tax paycheck API: authentication, requests, errors, and examples.',
    index: true,
  },
  {
    path: '/docs/paycheck',
    file: 'docs-paycheck.html',
    title: 'POST /v1/paycheck — Omnia.tax API',
    description: 'Request and response fields for a US gross-to-net paycheck calculation.',
    index: true,
  },
  {
    path: '/sandbox',
    file: 'sandbox.html',
    title: 'Paycheck API console — Omnia.tax',
    description: 'Build a paycheck request in the browser and run it on the Omnia.tax engine.',
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
    title: 'Paycheck API console — Omnia.tax',
    description: 'Build a paycheck request in the browser and run it on the Omnia.tax engine.',
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

function jsonLd(origin: string): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'OMNIA TAX LLC',
        url: origin,
        logo: `${origin}/logo/apple-touch-icon.png`,
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
        name: 'Omnia.tax',
        url: origin,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Omnia.tax',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '0.08',
          priceCurrency: 'USD',
          description: '$0.08 per paycheck calculation after a 14-day trial',
        },
      },
    ],
  };
  return JSON.stringify(graph);
}

/**
 * Insert the canonical URL, social tags, robots directive, and (on public
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
  const tags = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:title" content="${escapeAttr(page.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(page.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Omnia.tax" />`,
    `<meta property="og:image" content="${escapeAttr(origin + '/logo/apple-touch-icon.png')}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(origin + '/logo/apple-touch-icon.png')}" />`,
    verify ? `<meta name="google-site-verification" content="${escapeAttr(verify)}" />` : '',
    page.index ? `<script type="application/ld+json" nonce="${escapeAttr(nonce)}">${jsonLd(origin)}</script>` : '',
    html.includes('rel="apple-touch-icon"') ? '' : `<link rel="apple-touch-icon" href="/logo/apple-touch-icon.png" />`,
    html.includes('rel="icon"') ? '' : `<link rel="icon" href="/logo/favicon.svg" type="image/svg+xml" />`,
  ].filter(Boolean);

  let out = html;
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
