// Nightly scraper: reads Columbia's Bedework JSON feeds, keeps free performances, writes events.json
import { writeFile } from 'node:fs/promises';

// Each source is an Export URL from events.columbia.edu (Export Options -> Event feed -> JSON).
// To add more categories (theater, dance, etc.), export another feed and add a line here.
const SOURCES = [
  {
    type: 'Performance', // fallback label if an event has no recognizable category
    url: 'https://events.columbia.edu/feeder/main/eventsFeed.do?f=y&sort=dtstart.utc:asc&fexpr=(((vpath=%22/public/aliases/Type/Concert%22)%20or%20(vpath=%22/public/aliases/Type/Exhibition%22)%20or%20(vpath=%22/public/aliases/Type/Film%22)%20or%20(vpath=%22/public/aliases/Type/Performance%22)%20or%20(vpath=%22/public/aliases/Type/Theater%22)))%20and%20(categories.href=%22/public/.bedework/categories/org/UniversityEvents%22)%20and%20(entity_type=%22event%22%7Centity_type=%22todo%22)&skinName=list-json&count=200',
  },
];
// Label each event by its Columbia category (first match wins).
function typeOf(e, fallback) {
  const cats = JSON.stringify(e.categories || []);
  for (const [re, label] of [[/concert/i, 'Concert'], [/theat/i, 'Theater'], [/film/i, 'Film'], [/exhibit/i, 'Exhibition'], [/performance/i, 'Performance']]) {
    if (re.test(cats)) return label;
  }
  return fallback;
}
const DAYS_AHEAD = 60;

const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const plusDays = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Keep if the listing says free, or gives no price. Drop if it shows a price.
function isFree(cost) {
  const c = String(cost || '').trim();
  if (!c) return true;
  if (/free|no cost|no charge|open to all|\$\s*0(\.00)?\b/i.test(c) && !/\$\s*[1-9]/.test(c)) return true;
  return false;
}

// Bedework gives datetime like 20261118T190000; turn it into 2026-11-18T19:00:00
function toIso(start) {
  const dt = start?.datetime;
  if (dt && /^\d{8}T\d{6}$/.test(dt)) {
    return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(9, 11)}:${dt.slice(11, 13)}:00`;
  }
  if (dt && /^\d{8}$/.test(dt)) return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T00:00:00`;
  if (start?.longdate) return `${start.longdate}T00:00:00`;
  return null;
}

const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchSource({ type, url }) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; whatsplayingtonight.com)',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
  const json = JSON.parse(await res.text());
  const list = json?.bwEventList?.events ?? [];
  const lo = nyToday(), hi = plusDays(DAYS_AHEAD);
  const out = [];
  for (const e of list) {
    if (!isFree(e.cost)) continue;
    const start = toIso(e.start);
    if (!start) continue;
    const day = start.slice(0, 10);
    if (day < lo || day > hi) continue;
    if (String(e.status || '').toUpperCase() === 'CANCELLED') continue;
    out.push({
      id: `${e.guid || e.eventlink || e.summary}-${start}`,
      title: clean(e.summary),
      start,
      venue: clean(e.location?.address || ''),
      type: typeOf(e, type),
      desc: clean(e.description).slice(0, 200),
      url: e.eventlink || e.link || '',
    });
  }
  return out;
}

const all = [];
for (const s of SOURCES) {
  try { all.push(...(await fetchSource(s))); }
  catch (err) { console.error(String(err)); }
}
const seen = new Set();
const events = all.filter((e) => !seen.has(e.id) && seen.add(e.id)).sort((a, b) => a.start.localeCompare(b.start));

if (!events.length && process.env.CI) {
  console.error('No events found; keeping previous events.json');
  process.exit(0);
}
await writeFile('events.json', JSON.stringify({ generatedAt: new Date().toISOString(), events }, null, 1));
console.log(`Wrote ${events.length} events`);
