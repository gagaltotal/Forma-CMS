import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/container.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const toText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => toText(v)).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const normalizeKey = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, '');

function readRowValue(row: Record<string, unknown>, candidates: string[]): string {
  if (!row) return '';
  const keys = Object.keys(row).reduce<Record<string, unknown>>((map, key) => {
    map[normalizeKey(key)] = row[key];
    return map;
  }, {});
  for (const candidate of candidates) {
    const value = keys[normalizeKey(candidate)];
    if (value != null && String(value).trim() !== '') return toText(value);
  }
  return '';
}

function parseJsonList(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function readList(row: Record<string, unknown>, candidates: string[]): Array<Record<string, unknown>> {
  const raw = (() => {
    if (!row) return undefined;
    const keys = Object.keys(row).reduce<Record<string, unknown>>((map, key) => {
      map[normalizeKey(key)] = row[key];
      return map;
    }, {});
    for (const candidate of candidates) {
      const value = keys[normalizeKey(candidate)];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  })();
  return parseJsonList(raw);
}

function readLink(row: Record<string, unknown>, candidates: string[]): { label: string; href: string } {
  const data = (() => {
    const keys = Object.keys(row).reduce<Record<string, unknown>>((map, key) => {
      map[normalizeKey(key)] = row[key];
      return map;
    }, {});
    for (const candidate of candidates) {
      const target = keys[normalizeKey(candidate)];
      if (target !== undefined && target !== null) return target;
    }
    return undefined;
  })();

  if (!data) return { label: 'Open CMS', href: '/admin/' };
  if (typeof data === 'string') return { label: 'Open CMS', href: data };
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const label = readRowValue(obj, ['label', 'title', 'text', 'name']) || 'Open CMS';
    const href = readRowValue(obj, ['href', 'url', 'path', 'link']) || '/admin/';
    return { label, href };
  }
  return { label: String(data), href: '/admin/' };
}

function buildBodyHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '<p>Model your content once and publish everywhere.</p>';
  if (trimmed.startsWith('<')) return trimmed;
  return `<p>${escapeHtml(trimmed)}</p>`;
}

interface LandingStat { label: string; value: string }
interface LandingFeature { title: string; description: string }
interface LandingStep { title: string; description: string }
interface LandingPlan { name: string; price: string; period: string; description: string; features: string[]; ctaLabel: string; ctaHref: string; highlighted: boolean }
interface LandingFaq { question: string; answer: string }
interface LandingTestimonial { quote: string; name: string; role: string }
interface LandingPage {
  title: string; eyebrow: string; header: string; subtitle: string; bodyHtml: string;
  ctaPrimary: { label: string; href: string }; ctaSecondary: { label: string; href: string };
  stats: LandingStat[]; features: LandingFeature[]; steps: LandingStep[]; logos: string[];
  plans: LandingPlan[]; faq: LandingFaq[]; testimonial: LandingTestimonial; footer: string;
}

/** Template premium bawaan. Dipakai bila belum ada konten `home` di CMS. */
const defaultPremium: LandingPage = {
  title: 'Forma CMS',
  eyebrow: 'Headless CMS · Developer-first',
  header: 'Turn your content engine into a premium digital experience.',
  subtitle: 'Model your content once, deliver it everywhere, and let product, marketing, and editorial teams move faster without friction.',
  bodyHtml: '<p>Build with a clean content model, publish from one place, and serve your public experience from any frontend.</p>',
  ctaPrimary: { label: 'Open CMS', href: '/admin/' },
  ctaSecondary: { label: 'Explore features', href: '#features' },
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
  testimonial: {
    quote: 'Forma gave our team a clean content workflow without forcing us into a rigid UI or a slow stack.',
    name: 'Ariana',
    role: 'VP Product',
  },
  footer: `© ${new Date().getFullYear()} Forma CMS`,
};

async function resolveLandingPage(ctx: AppContext): Promise<LandingPage> {
  const fallback = defaultPremium;
  const candidates = [...ctx.services.schema.list()].sort((a, b) => {
    const score = (ct: { apiId: string; fields: Array<{ name: string }> }) => {
      const normalized = normalizeKey(ct.apiId);
      if (['home', 'homepage', 'landing', 'site', 'page'].includes(normalized)) return 6;
      const names = new Set(ct.fields.map((field) => normalizeKey(field.name)));
      return ['header', 'body', 'content', 'footer', 'title', 'subtitle', 'description', 'features', 'testimonials'].some((key) => names.has(key)) ? 3 : 0;
    };
    return score(b) - score(a);
  });

  const chosen = candidates[0];
  if (!chosen) return fallback;

  const principal = { kind: 'public' as const, id: null, perms: new Set<string>([`content:${chosen.apiId}:read`]), ip: null };
  try {
    const result = await ctx.services.content.list(principal, chosen.apiId, { page: 1, pageSize: 20 });
    const row = result.data[0] as Record<string, unknown> | undefined;
    if (!row) return fallback;

    const title = readRowValue(row, ['title', 'name', 'brand', 'siteTitle']) || chosen.displayName || fallback.title;
    const subtitle = readRowValue(row, ['subtitle', 'subheadline', 'intro', 'description', 'summary']) || fallback.subtitle;
    const bodyRaw = readRowValue(row, ['body', 'content', 'html', 'copy']) || subtitle;

    const stats = readList(row, ['stats', 'metrics', 'numbers', 'highlights'])
      .map((item) => ({ label: readRowValue(item, ['label', 'title', 'name']), value: readRowValue(item, ['value', 'number', 'amount', 'metric']) }))
      .filter((item) => item.label && item.value);

    const features = readList(row, ['features', 'featureList', 'highlights', 'benefits'])
      .map((item) => ({ title: readRowValue(item, ['title', 'name', 'heading']), description: readRowValue(item, ['description', 'summary', 'body', 'copy']) }))
      .filter((item) => item.title && item.description);

    const steps = readList(row, ['steps'])
      .map((item) => ({ title: readRowValue(item, ['title', 'name', 'heading']), description: readRowValue(item, ['description', 'summary', 'body', 'copy']) }))
      .filter((item) => item.title && item.description);

    const logos = readList(row, ['logos'])
      .map((item) => readRowValue(item, ['name', 'label', 'title']))
      .filter(Boolean);

    const plans = readList(row, ['plans', 'pricing']).map((item) => {
      const cta = readLink(item, ['cta', 'ctaPrimary', 'button']);
      return {
        name: readRowValue(item, ['name', 'title', 'plan']),
        price: readRowValue(item, ['price', 'amount', 'cost']),
        period: readRowValue(item, ['period', 'interval', 'per']),
        description: readRowValue(item, ['description', 'summary', 'subtitle']),
        features: readList(item, ['features', 'items', 'includes']).map((f) => readRowValue(f, ['label', 'name', 'title', 'text'])).filter(Boolean),
        ctaLabel: cta.label,
        ctaHref: cta.href,
        highlighted: readRowValue(item, ['highlighted', 'featured', 'popular']) === 'true',
      };
    }).filter((plan) => plan.name && plan.price);

    const faq = readList(row, ['faq', 'faqs', 'questions'])
      .map((item) => ({ question: readRowValue(item, ['question', 'q', 'title']), answer: readRowValue(item, ['answer', 'a', 'description', 'body']) }))
      .filter((item) => item.question && item.answer);

    const testimonial = readList(row, ['testimonials', 'quotes', 'reviews']).find(Boolean) ?? {};

    return {
      title,
      eyebrow: readRowValue(row, ['eyebrow', 'badge', 'tagline', 'kicker']) || fallback.eyebrow,
      header: readRowValue(row, ['header', 'headline', 'heroTitle', 'heading']) || fallback.header,
      subtitle,
      bodyHtml: buildBodyHtml(bodyRaw),
      ctaPrimary: readLink(row, ['ctaPrimary', 'primaryCta', 'primaryButton', 'buttonPrimary']),
      ctaSecondary: readLink(row, ['ctaSecondary', 'secondaryCta', 'secondaryButton', 'buttonSecondary']),
      stats: stats.length ? stats : fallback.stats,
      features: features.length ? features : fallback.features,
      steps: steps.length ? steps : fallback.steps,
      logos: logos.length ? logos : fallback.logos,
      plans: plans.length ? plans : fallback.plans,
      faq: faq.length ? faq : fallback.faq,
      testimonial: {
        quote: readRowValue(testimonial, ['quote', 'text', 'message', 'body']) || fallback.testimonial.quote,
        name: readRowValue(testimonial, ['name', 'person', 'author']) || fallback.testimonial.name,
        role: readRowValue(testimonial, ['role', 'title', 'position']) || fallback.testimonial.role,
      },
      footer: readRowValue(row, ['footer', 'copyright', 'tagline']) || `© ${new Date().getFullYear()} ${title}`,
    };
  } catch {
    return fallback;
  }
}

/** Panel admin (aset statis hasil build). `dotfiles: deny` + perlindungan traversal bawaan @fastify/static. */
export async function adminUiRoutes(app: FastifyInstance, ctx?: AppContext): Promise<void> {
  const dir = [
    path.join(here, '..', '..', 'dist', 'admin'),
    path.join(here, '..', 'admin'),
  ].find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (dir) {
    await app.register(fastifyStatic, {
      root: dir, prefix: '/admin/', index: 'index.html', dotfiles: 'deny', list: false, cacheControl: false,
      setHeaders: (res) => { res.header('Cache-Control', 'no-cache'); },
    });
  } else {
    app.log.warn('Panel admin belum di-build. Jalankan: npm run build:admin');
  }
  app.get('/admin', async (_req, reply) => reply.redirect('/admin/'));
  app.get('/', async (_req, reply) => {
    if (!ctx) return reply.redirect('/admin/');
    const page = await resolveLandingPage(ctx);
    const brandInitial = (page.title.trim()[0] ?? 'F').toUpperCase();

    // Ikon SVG inline (tanpa dependensi/JS). Path dipisah dengan `|`.
    const ICON = {
      layers: 'M12 2 2 7l10 5 10-5-10-5z|M2 12l10 5 10-5|M2 17l10 5 10-5',
      globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
      shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z|M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M21 15l-5-5L5 21',
      lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4',
      server: 'M4 4h16v6H4z|M4 14h16v6H4z|M8 7h.01|M8 17h.01',
      check: 'M20 6 9 17l-5-5',
      arrow: 'M5 12h14|M13 6l6 6-6 6',
      plus: 'M12 5v14|M5 12h14',
    } as const;
    const iconSvg = (d: string, cls = 'h-5 w-5') =>
      `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.split('|').map((p) => `<path d="${p}"/>`).join('')}</svg>`;
    const FEATURE_ICONS: string[] = [ICON.layers, ICON.globe, ICON.shield, ICON.image, ICON.lock, ICON.server];

    const statsHtml = page.stats.map((item) => `
      <div class="glass rounded-2xl border border-white/10 p-4">
        <div class="text-2xl font-bold tracking-tight text-white">${escapeHtml(item.value)}</div>
        <div class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">${escapeHtml(item.label)}</div>
      </div>`).join('');

    const featureHtml = page.features.map((feature, i) => `
      <article class="group glass rounded-2xl border border-white/10 p-6 transition hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-glow">
        <div class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-sky-500/20 text-brand-100 ring-1 ring-white/10">${iconSvg(FEATURE_ICONS[i % FEATURE_ICONS.length]!)}</div>
        <h3 class="mt-5 text-lg font-semibold text-white">${escapeHtml(feature.title)}</h3>
        <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(feature.description)}</p>
      </article>`).join('');

    const stepHtml = page.steps.map((step, i) => `
      <div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-sm font-semibold text-brand-200 ring-1 ring-brand-400/30">${String(i + 1).padStart(2, '0')}</div>
        <h3 class="mt-5 text-lg font-semibold text-white">${escapeHtml(step.title)}</h3>
        <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(step.description)}</p>
      </div>`).join('');

    const logoHtml = page.logos.map((name) => `<span class="text-lg font-semibold tracking-tight text-slate-500/90">${escapeHtml(name)}</span>`).join('');

    const planHtml = page.plans.map((plan) => `
      <article class="relative flex flex-col rounded-3xl border p-7 ${plan.highlighted ? 'border-brand-400/60 bg-gradient-to-b from-brand-500/15 to-slate-900/60 shadow-glow' : 'glass border-white/10'}">
        ${plan.highlighted ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Most popular</span>' : ''}
        <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">${escapeHtml(plan.name)}</h3>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-4xl font-black tracking-tight text-white">${escapeHtml(plan.price)}</span>
          <span class="text-sm text-slate-400">${escapeHtml(plan.period)}</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-slate-400">${escapeHtml(plan.description)}</p>
        <ul class="mt-6 space-y-3 text-sm text-slate-300">
          ${plan.features.map((f) => `<li class="flex items-start gap-2.5"><span class="mt-0.5 text-brand-300">${iconSvg(ICON.check, 'h-4 w-4')}</span><span>${escapeHtml(f)}</span></li>`).join('')}
        </ul>
        <a href="${escapeHtml(plan.ctaHref)}" class="mt-8 inline-flex justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${plan.highlighted ? 'bg-gradient-to-r from-brand-500 to-indigo-500 text-white shadow-glow hover:brightness-110' : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'}">${escapeHtml(plan.ctaLabel)}</a>
      </article>`).join('');

    const faqHtml = page.faq.map((item) => `
      <details class="group glass rounded-2xl border border-white/10 p-5">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-white">
          ${escapeHtml(item.question)}
          <span class="text-brand-300 transition group-open:rotate-45">${iconSvg(ICON.plus)}</span>
        </summary>
        <p class="mt-3 text-sm leading-6 text-slate-400">${escapeHtml(item.answer)}</p>
      </details>`).join('');

    const testimonialHtml = `
      <article class="glass relative overflow-hidden rounded-3xl border border-white/10 p-8 sm:p-10">
        <div class="text-6xl leading-none text-brand-400/70">&ldquo;</div>
        <p class="mt-3 max-w-3xl text-lg leading-8 text-slate-200 sm:text-xl">${escapeHtml(page.testimonial.quote)}</p>
        <div class="mt-6 flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-400 font-semibold text-white">${escapeHtml((page.testimonial.name.trim()[0] ?? '?').toUpperCase())}</span>
          <div class="flex flex-col">
            <strong class="text-white">${escapeHtml(page.testimonial.name)}</strong>
            <span class="text-sm text-slate-400">${escapeHtml(page.testimonial.role)}</span>
          </div>
        </div>
      </article>`;

    const primaryBtn = 'inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110';
    const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10';

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="application-name" content="${escapeHtml(page.title)}" />
    <meta name="description" content="${escapeHtml(page.subtitle)}" />
    <meta name="theme-color" content="#020617" />
    <title>${escapeHtml(page.title)}</title>
    <!-- CSS Tailwind di-build lokal oleh scripts/build-admin.mjs (bukan CDN: CSP hanya mengizinkan 'self'). -->
    <link rel="stylesheet" href="/admin/landing.css" />
  </head>
  <body class="landing-bg min-h-screen font-sans text-slate-100 antialiased">
    <div class="landing-grid min-h-screen">
      <div class="mx-auto max-w-7xl px-5 pb-14 sm:px-8 lg:px-10">
        <header class="glass sticky top-4 z-30 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 shadow-card sm:px-5">
          <a href="#top" class="flex items-center gap-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-indigo-500 to-sky-400 font-bold text-white shadow-glow">${escapeHtml(brandInitial)}</span>
            <span class="text-lg font-semibold tracking-tight text-white">${escapeHtml(page.title)}</span>
          </a>
          <nav class="hidden items-center gap-1 text-sm text-slate-300 md:flex">
            <a href="#features" class="rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white">Features</a>
            <a href="#how" class="rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white">How it works</a>
            <a href="#pricing" class="rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white">Pricing</a>
            <a href="#faq" class="rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white">FAQ</a>
          </nav>
          <a href="${escapeHtml(page.ctaPrimary.href)}" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15">${escapeHtml(page.ctaPrimary.label)}</a>
        </header>

        <main>
          <section id="top" class="grid items-center gap-12 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
            <div class="animate-fade-up">
              <span class="inline-flex items-center rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">${escapeHtml(page.eyebrow)}</span>
              <h1 class="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">${escapeHtml(page.header)}</h1>
              <p class="mt-6 max-w-xl text-lg leading-8 text-slate-300">${escapeHtml(page.subtitle)}</p>
              <div class="mt-8 flex flex-wrap gap-3">
                <a href="${escapeHtml(page.ctaPrimary.href)}" class="${primaryBtn}">${escapeHtml(page.ctaPrimary.label)}${iconSvg(ICON.arrow, 'h-4 w-4')}</a>
                <a href="${escapeHtml(page.ctaSecondary.href)}" class="${secondaryBtn}">${escapeHtml(page.ctaSecondary.label)}</a>
              </div>
              <div class="prose-landing mt-8 max-w-xl">${page.bodyHtml}</div>
              <div class="mt-10 grid gap-3 sm:grid-cols-3">${statsHtml}</div>
            </div>

            <div class="relative">
              <div class="absolute -right-6 -top-10 h-52 w-52 rounded-full bg-brand-500/30 blur-3xl"></div>
              <div class="absolute -bottom-10 -left-6 h-52 w-52 rounded-full bg-sky-500/25 blur-3xl"></div>
              <div class="glass relative animate-float rounded-[28px] border border-white/10 p-5 shadow-card">
                <div class="flex items-center gap-2">
                  <span class="h-3 w-3 rounded-full bg-rose-400/80"></span>
                  <span class="h-3 w-3 rounded-full bg-amber-400/80"></span>
                  <span class="h-3 w-3 rounded-full bg-emerald-400/80"></span>
                  <span class="ml-2 text-xs text-slate-400">api-preview</span>
                </div>
                <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-xs leading-6 text-slate-300">
                  <p><span class="text-brand-300">GET</span> /api/content/article</p>
                  <p class="text-slate-500">{</p>
                  <p class="ps-4">&quot;data&quot;: [{</p>
                  <p class="ps-8">&quot;title&quot;: <span class="text-emerald-300">&quot;Hello world&quot;</span>,</p>
                  <p class="ps-8">&quot;slug&quot;: <span class="text-emerald-300">&quot;hello-world&quot;</span>,</p>
                  <p class="ps-8">&quot;status&quot;: <span class="text-sky-300">&quot;published&quot;</span></p>
                  <p class="ps-4">}]</p>
                  <p class="text-slate-500">}</p>
                </div>
                <div class="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div class="rounded-xl border border-white/10 bg-white/5 p-3"><p class="text-sm font-semibold text-white">REST</p></div>
                  <div class="rounded-xl border border-white/10 bg-white/5 p-3"><p class="text-sm font-semibold text-white">GraphQL</p></div>
                  <div class="rounded-xl border border-white/10 bg-white/5 p-3"><p class="text-sm font-semibold text-white">Media</p></div>
                </div>
              </div>
            </div>
          </section>

          <section class="mt-20 border-y border-white/5 py-8">
            <p class="text-center text-xs uppercase tracking-[0.25em] text-slate-500">Trusted by teams building on Forma</p>
            <div class="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">${logoHtml}</div>
          </section>

          <section id="features" class="mt-20">
            <div class="max-w-2xl">
              <h2 class="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">Everything you need to ship great content</h2>
              <p class="mt-4 text-base leading-7 text-slate-400">From modelling to delivery, Forma gives your team the building blocks of a modern content platform.</p>
            </div>
            <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${featureHtml}</div>
          </section>

          <section id="how" class="glass mt-20 rounded-[32px] border border-white/10 p-7 sm:p-10">
            <h2 class="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">How it works</h2>
            <div class="mt-10 grid gap-8 md:grid-cols-3">${stepHtml}</div>
          </section>

          <section id="pricing" class="mt-20">
            <div class="max-w-2xl">
              <h2 class="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">Simple, transparent pricing</h2>
              <p class="mt-4 text-base leading-7 text-slate-400">Start free and scale as your content operation grows.</p>
            </div>
            <div class="mt-10 grid gap-6 lg:grid-cols-3">${planHtml}</div>
          </section>

          <section class="mt-20 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>${testimonialHtml}</div>
            <div id="faq">
              <h2 class="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">Frequently asked questions</h2>
              <div class="mt-6 space-y-3">${faqHtml}</div>
            </div>
          </section>

          <section class="mt-20 overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-r from-brand-600/30 via-indigo-600/20 to-sky-500/20 p-10 text-center shadow-glow sm:p-14">
            <h2 class="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">Ready to build with Forma?</h2>
            <p class="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">Spin up the admin panel, model your first content type, and publish in minutes.</p>
            <div class="mt-8 flex flex-wrap justify-center gap-3">
              <a href="${escapeHtml(page.ctaPrimary.href)}" class="${primaryBtn}">${escapeHtml(page.ctaPrimary.label)}</a>
              <a href="${escapeHtml(page.ctaSecondary.href)}" class="${secondaryBtn}">${escapeHtml(page.ctaSecondary.label)}</a>
            </div>
          </section>
        </main>

        <footer class="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 text-sm text-slate-500 sm:flex-row">
          <p>${escapeHtml(page.footer)}</p>
          <nav class="flex items-center gap-5">
            <a href="#features" class="transition hover:text-slate-300">Features</a>
            <a href="#pricing" class="transition hover:text-slate-300">Pricing</a>
            <a href="${escapeHtml(page.ctaPrimary.href)}" class="transition hover:text-slate-300">Open CMS</a>
          </nav>
        </footer>
      </div>
    </div>
  </body>
</html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
