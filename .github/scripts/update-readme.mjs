#!/usr/bin/env node
/**
 * Auto-updates the GitHub profile README:
 *   1. Fetches all public repositories of the user from the GitHub API.
 *   2. Renders them as project cards between
 *      <!-- PROJECTS:START --> and <!-- PROJECTS:END --> in README.md.
 *   3. Regenerates two animated, self-hosted SVG cards:
 *        assets/github-summary.svg  (profile stats)
 *        assets/top-languages.svg   (language breakdown)
 *
 * Zero dependencies — runs on Node 18+ (uses the built-in fetch).
 * Fine-tune output via .github/projects.config.json (pin / exclude / override).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const README_PATH = path.join(ROOT, 'README.md');
const CONFIG_PATH = path.join(ROOT, '.github', 'projects.config.json');
const SUMMARY_SVG = path.join(ROOT, 'assets', 'github-summary.svg');
const LANG_SVG = path.join(ROOT, 'assets', 'top-languages.svg');

const START = '<!-- PROJECTS:START -->';
const END = '<!-- PROJECTS:END -->';

// ───────────────────────────── helpers ─────────────────────────────
const LANGS = {
  'C#': { color: '239120', logo: 'dotnet' },
  JavaScript: { color: 'F7DF1E', logo: 'javascript', logoColor: 'black' },
  TypeScript: { color: '3178C6', logo: 'typescript' },
  HTML: { color: 'E34F26', logo: 'html5' },
  CSS: { color: '1572B6', logo: 'css3' },
  PHP: { color: '777BB4', logo: 'php' },
  Python: { color: '3776AB', logo: 'python' },
  Java: { color: 'ED8B00', logo: 'openjdk' },
  Vue: { color: '4FC08D', logo: 'vuedotjs' },
  'ASP.NET': { color: '512BD4', logo: 'dotnet' },
  TSQL: { color: 'CC2927', logo: 'microsoftsqlserver' },
  Dart: { color: '0175C2', logo: 'dart' },
  Go: { color: '00ADD8', logo: 'go' },
  Shell: { color: '4EAA25', logo: 'gnubash' },
};

const KEYWORD_EMOJI = [
  [/dental|teeth|tooth/i, '🦷'],
  [/clinic|health|med|hospital|doctor|patient/i, '🏥'],
  [/e-?commerce|shop|store|cart/i, '🛒'],
  [/portfolio|protfolio|website/i, '🌐'],
  [/download/i, '📥'],
  [/saas|cloud/i, '☁️'],
  [/task|todo|manage|project/i, '📋'],
  [/community|portal|collab|social|chat/i, '🤝'],
  [/automation|bot|suite/i, '⚡'],
  [/erp|inventory|warehouse|wms|pos/i, '📦'],
  [/twin|ai|ml|vision/i, '🤖'],
  [/api|server|backend/i, '🔌'],
];

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Encode text for a shields.io static badge path segment. */
const shieldText = (s) => encodeURIComponent(String(s).replace(/-/g, '--').replace(/_/g, '__'));

const badge = (label, message, color, logo, logoColor = 'white') =>
  `https://img.shields.io/badge/${shieldText(label)}-${shieldText(message)}-${color}?style=flat-square` +
  (logo ? `&logo=${encodeURIComponent(logo)}&logoColor=${logoColor}` : '');

const humanize = (name) =>
  name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const monthYear = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const pickEmoji = (repo) => KEYWORD_EMOJI.find(([re]) => re.test(repo.name))?.[1] ?? '💠';

async function gh(endpoint) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'profile-readme-updater',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${endpoint}: ${await res.text()}`);
  return res.json();
}

async function fetchAllRepos(user) {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/users/${user}/repos?per_page=100&type=owner&sort=pushed&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

// ───────────────────────────── README cards ─────────────────────────────
function renderCard(repo, override = {}) {
  const lang = repo.language;
  const meta = LANGS[lang] ?? { color: '64748B', logo: 'github' };
  const emoji = override.emoji ?? pickEmoji(repo);
  const title = override.title ?? humanize(repo.name);
  const description =
    override.description ||
    (repo.description && repo.description.trim()) ||
    `${humanize(repo.name)} — ${lang ? `a high-performance ${lang} application` : 'a full-stack software system'} engineered by Basit Ali.`;
  const homepage = override.homepage || (repo.homepage && repo.homepage.trim()) || null;
  const topics = (
    (override.topics && override.topics.length ? override.topics : null) ||
    (repo.topics && repo.topics.length ? repo.topics : null) ||
    []
  ).slice(0, 5);

  const badges = [
    lang && `<img src="${badge('', lang, meta.color, meta.logo, meta.logoColor)}" alt="${esc(lang)}" />`,
    `<img src="${badge('★ Stars', repo.stargazers_count, 'f59e0b')}" alt="Stars" />`,
    repo.forks_count > 0 && `<img src="${badge('Forks', repo.forks_count, '8b5cf6', 'git')}" alt="Forks" />`,
    `<img src="${badge('Updated', monthYear(repo.pushed_at), '0ea5e9')}" alt="Last updated" />`,
  ]
    .filter(Boolean)
    .join(' ');

  const actions = [
    `<a href="${repo.html_url}"><img src="${badge('', 'View Code', '1e293b', 'github')}" alt="View code" /></a>`,
    homepage &&
      `<a href="${esc(homepage)}"><img src="${badge('', 'Live Demo', '22c55e', 'vercel')}" alt="Live demo" /></a>`,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `<td width="50%" valign="top">`,
    `<h3>${emoji} <a href="${repo.html_url}">${esc(title)}</a></h3>`,
    `<p>${esc(description)}</p>`,
    topics.length ? `<p>${topics.map((t) => `<code>${esc(t)}</code>`).join(' ')}</p>` : '',
    `<p>${badges}</p>`,
    actions,
    `</td>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderProjects(repos, config) {
  const rows = [];
  for (let i = 0; i < repos.length; i += 2) {
    const pair = repos.slice(i, i + 2).map((r) => renderCard(r, config.overrides?.[r.name]));
    if (pair.length === 1) pair.push('<td width="50%" valign="top"></td>');
    rows.push(`<tr>\n${pair.join('\n')}\n</tr>`);
  }

  return [
    START,
    '<!-- ⚠️ Auto-generated by .github/scripts/update-readme.mjs — edits here will be overwritten. -->',
    '<table>',
    rows.join('\n'),
    '</table>',
    END,
  ].join('\n');
}

// ───────────────────────────── animated SVG cards ─────────────────────────────
const SVG_FONT = `'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif`;

function renderSummarySvg({ user, stats }) {
  const tiles = [
    { value: stats.repos, label: 'Repositories', sub: 'public projects', color: '#7dd3fc' },
    { value: stats.stars, label: 'Stars', sub: 'across projects', color: '#c4b5fd' },
    { value: stats.followers, label: 'Followers', sub: 'growing network', color: '#86efac' },
    { value: stats.languages, label: 'Languages', sub: 'in production', color: '#fcd34d' },
  ];
  const tilesSvg = tiles
    .map(
      (t, i) => `
    <g transform="translate(${560 + i * 152},72)"><g class="tile" style="animation-delay:${(0.35 + i * 0.15).toFixed(2)}s">
      <rect width="136" height="118" rx="16" fill="#ffffff" fill-opacity=".07" stroke="${t.color}" stroke-opacity=".25"/>
      <text x="68" y="44" fill="${t.color}" font-size="30" font-weight="700">${t.value}</text>
      <text x="68" y="72" fill="#e2e8f0" font-size="14">${t.label}</text>
      <text x="68" y="94" fill="#94a3b8" font-size="12">${t.sub}</text>
    </g></g>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260" viewBox="0 0 1200 260" role="img" aria-labelledby="title desc">
  <title id="title">${esc(user.name ?? user.login)} — GitHub summary</title>
  <desc id="desc">Live summary of public repositories, stars, followers and languages. Auto-generated.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/><stop offset="52%" stop-color="#172554"/><stop offset="100%" stop-color="#0e7490"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity=".08"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="card"><rect x="8" y="8" width="1184" height="244" rx="24"/></clipPath>
  </defs>
  <style>
    text { font-family: ${SVG_FONT}; }
    .fade { opacity: 0; animation: fadeUp .8s ease-out forwards; }
    .tile { opacity: 0; animation: fadeUp .8s cubic-bezier(.2,.8,.2,1) forwards; text-anchor: middle; }
    .orb  { animation: float 8s ease-in-out infinite alternate; }
    .bar  { animation: pulse 3s ease-in-out infinite; }
    .shine { animation: sweep 6s ease-in-out infinite; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes float  { from { transform: translate(0,0); } to { transform: translate(-30px,20px); } }
    @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
    @keyframes sweep  { 0% { transform: translateX(-1200px); } 60%,100% { transform: translateX(1200px); } }
  </style>
  <g clip-path="url(#card)">
    <rect x="8" y="8" width="1184" height="244" fill="url(#bg)"/>
    <circle class="orb" cx="1090" cy="-10" r="170" fill="#38bdf8" opacity=".09"/>
    <circle class="orb" cx="1160" cy="230" r="120" fill="#a78bfa" opacity=".09" style="animation-delay:-4s"/>
    <rect class="shine" x="8" y="8" width="400" height="244" fill="url(#shine)"/>
  </g>
  <rect class="bar" x="52" y="55" width="6" height="150" rx="3" fill="url(#accent)"/>
  <text class="fade" x="88" y="78" fill="#bae6fd" font-size="15" font-weight="700" letter-spacing="2">GITHUB PROFILE SUMMARY</text>
  <text class="fade" style="animation-delay:.1s" x="88" y="124" fill="#ffffff" font-size="34" font-weight="700">${esc(user.name ?? user.login)}</text>
  <text class="fade" style="animation-delay:.2s" x="88" y="153" fill="#cbd5e1" font-size="17">Software Engineer · Full-Stack Developer</text>
  <text class="fade" style="animation-delay:.3s" x="88" y="184" fill="#94a3b8" font-size="14">@${esc(user.login)}${user.location ? ' · ' + esc(user.location) : ''}</text>
  <text class="fade" style="animation-delay:.4s" x="88" y="226" fill="#64748b" font-size="11">⚡ Auto-generated from the GitHub API</text>
  ${tilesSvg}
</svg>
`;
}

function renderLanguagesSvg(langCounts) {
  const entries = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  const W = 560;
  const barW = W - 60;
  let x = 30;
  const segments = entries
    .map(([lang, n], i) => {
      const w = (n / total) * barW;
      const seg = `<rect class="seg" style="animation-delay:${(i * 0.12).toFixed(2)}s" x="${x.toFixed(1)}" y="70" width="${w.toFixed(1)}" height="12" fill="#${(LANGS[lang] ?? { color: '64748B' }).color}"/>`;
      x += w;
      return seg;
    })
    .join('\n    ');

  const legend = entries
    .map(([lang, n], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pct = ((n / total) * 100).toFixed(1);
      return `<g transform="translate(${30 + col * 260},${118 + row * 30})"><g class="item" style="animation-delay:${(0.4 + i * 0.1).toFixed(2)}s">
      <circle cx="6" cy="-4" r="6" fill="#${(LANGS[lang] ?? { color: '64748B' }).color}"/>
      <text x="20" y="0" fill="#e2e8f0" font-size="14">${esc(lang)}</text>
      <text x="220" y="0" fill="#94a3b8" font-size="13" text-anchor="end">${pct}%</text>
    </g></g>`;
    })
    .join('\n    ');

  const H = 118 + Math.ceil(entries.length / 2) * 30 + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#172554"/></linearGradient>
    <clipPath id="bar"><rect x="30" y="70" width="${barW}" height="12" rx="6"/></clipPath>
  </defs>
  <style>
    text { font-family: ${SVG_FONT}; }
    .seg  { transform-box: fill-box; transform-origin: left; transform: scaleX(0); animation: grow .9s cubic-bezier(.2,.8,.2,1) forwards; }
    .item { opacity: 0; animation: fade .6s ease-out forwards; }
    @keyframes grow { to { transform: scaleX(1); } }
    @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" fill="url(#bg)" stroke="#38bdf8" stroke-opacity=".2"/>
  <text x="30" y="44" fill="#7dd3fc" font-size="17" font-weight="700">Most Used Languages</text>
  <text x="${W - 30}" y="44" fill="#64748b" font-size="12" text-anchor="end">by repository</text>
  <g clip-path="url(#bar)">
    <rect x="30" y="70" width="${barW}" height="12" fill="#1e293b"/>
    ${segments}
  </g>
    ${legend}
</svg>
`;
}

// ───────────────────────────── main ─────────────────────────────
async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const user = process.env.GH_USERNAME || config.username;
  const exclude = new Set([...(config.exclude ?? []), user].map((s) => s.toLowerCase()));
  const pinned = (config.pinned ?? []).map((s) => s.toLowerCase());

  const [profile, allRepos] = await Promise.all([gh(`/users/${user}`), fetchAllRepos(user)]);

  const eligible = allRepos.filter(
    (r) =>
      !r.private &&
      (config.includeForks || !r.fork) &&
      (config.includeArchived || !r.archived) &&
      !exclude.has(r.name.toLowerCase()),
  );

  const rank = (r) => {
    const p = pinned.indexOf(r.name.toLowerCase());
    return p === -1 ? Number.MAX_SAFE_INTEGER : p;
  };
  const sorted = [...eligible].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.pushed_at) - new Date(a.pushed_at),
  );
  const shown = sorted.slice(0, config.maxProjects ?? 12);

  // README
  const readme = await fs.readFile(README_PATH, 'utf8');
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error(`Markers ${START} / ${END} not found in README.md`);
  const nextReadme = readme.slice(0, s) + renderProjects(shown, config) + readme.slice(e + END.length);

  // SVG cards
  const langCounts = {};
  for (const r of eligible) if (r.language) langCounts[r.language] = (langCounts[r.language] ?? 0) + 1;
  const stats = {
    repos: eligible.length,
    stars: eligible.reduce((n, r) => n + r.stargazers_count, 0),
    followers: profile.followers,
    languages: Object.keys(langCounts).length,
  };

  await fs.mkdir(path.dirname(SUMMARY_SVG), { recursive: true });
  const writeIfChanged = async (file, content) => {
    const prev = await fs.readFile(file, 'utf8').catch(() => null);
    if (prev?.replace(/\r\n/g, '\n') === content.replace(/\r\n/g, '\n')) return false;
    await fs.writeFile(file, content);
    return true;
  };

  const changed = [
    (await writeIfChanged(README_PATH, nextReadme)) && 'README.md',
    (await writeIfChanged(SUMMARY_SVG, renderSummarySvg({ user: profile, stats }))) && 'github-summary.svg',
    (await writeIfChanged(LANG_SVG, renderLanguagesSvg(langCounts))) && 'top-languages.svg',
  ].filter(Boolean);

  console.log(`✔ ${shown.length}/${eligible.length} projects rendered for @${user}`);
  console.log(changed.length ? `✔ Updated: ${changed.join(', ')}` : '• No changes');
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
