// Nightly scraper: pulls Localist calendars, keeps free performances, writes events.json
import { writeFile } from 'node:fs/promises';

// Add more Localist-powered calendars here (same API shape).
const SOURCES = [
  { name: 'Columbia University Events Calendar', base: 'https://events.columbia.edu' },
];
const DAYS_AHEAD = 60;
const PERFORMANCE = /concert|music|jazz|recital|orchestra|choir|chorus|a cappella|theat|play\b|musical|comedy|improv|open mic|dance|performance|showcase|poetry|spoken word|band\b/i;

const isFree = (e) =>
  e.free === true || /^\s*(free|no cost|no charge|\$?0(\.00)?)\b/i.test(e.ticket_cost || '');

function guessType(text) {
  if (/comedy|improv|sketch|stand-?up/i.test(text)) return 'Comedy';
  if (/open mic|poetry|spoken word/i.test(text)) return 'Open mic';
  if (/dance/i.test(text)) return 'Dance';
  if (/theat|play\b|musical/i.test(text)) return 'Theater';
  return 'Concert';
}

async function fetchSource({ name, base }) {
  const out = [];
  let page = 1, total = 1;
  while (page <= total && page <= 20) {
    const url = `${base}/api/2/events?days=${DAYS_AHEAD}&pp=100&page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'whatsplayingtonight.com' } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} for ${url}`);
    const json = await res.json();
    total = json.page?.total ?? 1;
    for (const wrap of json.events ?? []) {
      const e = wrap.event;
      if (!isFree(e)) continue;
      const tags = Object.values(e.filters ?? {}).flat().map((f) => f.name).join(' ');
      const hay = `${e.title} ${tags} ${e.description_text ?? ''}`;
      if (!PERFORMANCE.test(`${e.title} ${tags}`)) continue;
      for (const inst of e.event_instances ?? []) {
        const i = inst.event_instance;
        out.push({
          id: `${e.id}-${i.start}`,
          title: e.title,
          start: i.start,               // ISO string, already in campus local time
          venue: e.location_name || '',
          type: guessType(hay),
          desc: (e.description_text || '').slice(0, 200).trim(),
          url: e.localist_url || e.url || '',
          source: name,
        });
      }
    }
    page++;
  }
  return out;
}

const all = [];
for (const s of SOURCES) {
  try { all.push(...(await fetchSource(s))); }
  catch (err) { console.error(String(err)); }   // one bad source shouldn't kill the run
}
const seen = new Set();
const events = all
  .filter((e) => !seen.has(e.id) && seen.add(e.id))
  .sort((a, b) => a.start.localeCompare(b.start));

if (!events.length && process.env.CI) {
  console.error('No events found; keeping previous events.json');
  process.exit(0);
}
await writeFile('events.json', JSON.stringify({ generatedAt: new Date().toISOString(), events }, null, 1));
console.log(`Wrote ${events.length} events`);
