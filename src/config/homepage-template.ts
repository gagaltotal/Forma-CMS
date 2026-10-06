/**
 * Template LANDING PAGE premium siap pakai untuk tipe konten `home`.
 *
 * Dipakai oleh:
 *  - `src/services/seed.service.ts` (seed otomatis pertama kali boot, atau via CLI)
 *  - `scripts/seed-homepage.mjs` (perintah manual `npm run seed:homepage`)
 *
 * Semua field bersifat opsional di resolver landing page: jika sebuah array kosong,
 * halaman akan memakai fallback bawaan sehingga tampilan tetap elegan.
 */

export const HOME_CONTENT_TYPE = {
  apiId: 'home',
  displayName: 'Home',
  fields: [
    { name: 'eyebrow', type: 'text' },
    { name: 'header', type: 'text' },
    { name: 'subtitle', type: 'text' },
    { name: 'body', type: 'richtext' },
    { name: 'cta_primary', type: 'json' },
    { name: 'cta_secondary', type: 'json' },
    { name: 'stats', type: 'json' },
    { name: 'features', type: 'json' },
    { name: 'steps', type: 'json' },
    { name: 'logos', type: 'json' },
    { name: 'plans', type: 'json' },
    { name: 'faq', type: 'json' },
    { name: 'testimonials', type: 'json' },
    { name: 'footer', type: 'text' },
  ],
} as const;

export const buildHomepageTemplate = (): Record<string, unknown> => ({
  eyebrow: 'Headless CMS · Developer-first',
  header: 'Turn your content engine into a premium digital experience.',
  subtitle: 'Model your content once, deliver it everywhere, and let product, marketing, and editorial teams move faster without friction.',
  body: '<p>Build with a clean content model, publish from one place, and serve your public experience from any frontend. Forma ships with REST and GraphQL, a built-in media library, draft &amp; publish, and versioning out of the box.</p>',
  cta_primary: { label: 'Open CMS', href: '/admin/' },
  cta_secondary: { label: 'Explore features', href: '#features' },
  stats: [
    { label: 'Content types', value: '13+' },
    { label: 'Publishing flow', value: 'Fast' },
    { label: 'Delivery', value: 'Any frontend' },
  ],
  features: [
    { title: 'Structured content', description: 'Model powerful content types with relational fields, media, rich text, and validation.' },
    { title: 'Flexible delivery', description: 'Serve your frontend with REST, GraphQL, or direct CMS integration from the same content source.' },
    { title: 'Trusted workflows', description: 'Use RBAC, audit trails, draft & publish, and versioning to keep teams aligned.' },
    { title: 'Media library', description: 'Drag & drop uploads with alt text and public URLs, ready for any frontend.' },
    { title: 'Secure by default', description: 'Hardened sessions, CSRF protection, rate limiting, and a tamper-evident audit log.' },
    { title: 'Self-hosted', description: 'Run it anywhere with SQLite, PostgreSQL, or MySQL — no vendor lock-in.' },
  ],
  steps: [
    { title: 'Model your content', description: 'Create content types visually with 13 field types and instant API preview.' },
    { title: 'Publish with control', description: 'Draft, review, and publish. Every change is versioned and audited.' },
    { title: 'Deliver anywhere', description: 'Consume REST or GraphQL from React, Next.js, Vue, mobile, or any stack.' },
  ],
  logos: ['Northwind', 'Acme', 'Globex', 'Initech', 'Umbrella'],
  plans: [
    { name: 'Starter', price: '$0', period: 'forever', description: 'For side projects and prototypes.', features: ['1 project', 'SQLite', 'REST + GraphQL', 'Community support'], ctaLabel: 'Get started', ctaHref: '/admin/', highlighted: false },
    { name: 'Team', price: '$29', period: 'per month', description: 'For growing product teams.', features: ['Unlimited content types', 'PostgreSQL / MySQL', 'RBAC & audit log', 'Priority support'], ctaLabel: 'Start free trial', ctaHref: '/admin/', highlighted: true },
    { name: 'Enterprise', price: 'Custom', period: 'contact us', description: 'For large organizations.', features: ['SSO / OIDC', 'Dedicated support', 'SLA & onboarding', 'Custom integrations'], ctaLabel: 'Talk to us', ctaHref: '/admin/', highlighted: false },
  ],
  faq: [
    { question: 'Is Forma really self-hostable?', answer: 'Yes. Run it with Docker or Node.js and choose SQLite, PostgreSQL, or MySQL. Your data stays on your infrastructure.' },
    { question: 'Which APIs does it expose?', answer: 'Every content type automatically gets REST endpoints and a GraphQL schema — no extra code required.' },
    { question: 'Can I control who sees what?', answer: 'Role-based access control lets you grant per-content-type permissions and keep drafts private until you publish.' },
    { question: 'Does it support SSO?', answer: 'Yes. Configure any OIDC provider (Google, Azure, Keycloak, and more) and let users sign in with a single click.' },
  ],
  testimonials: [
    { quote: 'Forma gave our team a clean content workflow without forcing us into a rigid UI or a slow stack.', name: 'Ariana', role: 'VP Product' },
  ],
  footer: `© ${new Date().getFullYear()} Forma CMS`,
});