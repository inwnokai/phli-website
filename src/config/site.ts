// Single place for business values that are not decided yet.
// Anything set to null is hidden on the site, so nothing unconfirmed goes live.

export const site = {
  name: 'Phli',
  // Final .com domain is not chosen yet. Used for canonical URLs and the sitemap.
  url: import.meta.env.PUBLIC_SITE_URL ?? 'https://phli.example.com',

  // Lead channels (decision #10). Set both before launch.
  lineOaId: (import.meta.env.PUBLIC_LINE_OA_ID as string | undefined) ?? null, // e.g. "@phli"
  contactEmail: (import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined) ?? null,

  // Starting price per line per month in THB (decision #6). null = price block hidden.
  pricePerLineThb: import.meta.env.PUBLIC_PRICE_PER_LINE_THB
    ? Number(import.meta.env.PUBLIC_PRICE_PER_LINE_THB)
    : null,

  // Investor page: market figures must come from the 30 Oct research with a source each.
  // Empty list = section hidden.
  marketFacts: [] as { label: { th: string; en: string }; value: string; source: string }[],

  // Pilot results stay hidden until a pilot finishes and the customer signs consent (decision #9).
  pilotResultsPublished: false,
} as const;

export const lineUrl = site.lineOaId
  ? `https://line.me/R/ti/p/${encodeURIComponent(site.lineOaId)}`
  : null;
export const mailUrl = site.contactEmail ? `mailto:${site.contactEmail}` : null;
