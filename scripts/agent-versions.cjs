'use strict';
// MIT, Copyright (c) 2026 Andrew Bearsley. FortiAgent adaptation.
const entities = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0', ndash:'\u2013', mdash:'\u2014', lsquo:'\u2018', rsquo:'\u2019', ldquo:'\u201c', rdquo:'\u201d'};
function decodeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (all, key) => {
    if (key[0] !== '#') return entities[key] ?? all;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd';
  });
}
function parseVersions(html) {
  const body = /<article class="reader__page"[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (!body) throw new Error('reader__page not found; page structure changed');
  const rows = [], seen = new Set();
  for (const table of body[1].matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    for (const row of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => decodeHtml(c[1].replace(/<[^>]+>/g, '')).trim());
      if (!cells.length || !/^\d+\.\d/.test(cells[0]) || seen.has(cells[0])) continue;
      seen.add(cells[0]);
      const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : null;
      rows.push({version:cells[0], latest:(cells[1] ?? '').toLowerCase().includes('latest'), eoe:date(cells[3]), eos:date(cells[4])});
    }
  }
  const latest = rows.find(r => r.latest)?.version;
  if (!rows.length || !latest) throw new Error('Version table or Latest marker not found');
  return {latest, rows};
}
function formatVersions(platform, result) {
  return [`${platform}: latest=${result.latest ?? 'None'}`, ...result.rows.slice(0, 6).map(r =>
    `   ${r.version.padEnd(8)} EOE=${(r.eoe ?? 'Not Announced').padEnd(14)} EOS=${r.eos ?? 'Not Announced'}`)].join('\n');
}
async function main() {
  const base = 'https://docs.fortinet.com/document/forticnapp/latest';
  for (const [platform, path] of [['linux','agent-support/49926/linux-agent-versions'], ['windows','agent-support/244773/windows-agent-versions']]) {
    const response = await fetch(`${base}/${path}`, {headers:{'User-Agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`${platform}: documentation HTTP ${response.status}`);
    console.log(formatVersions(platform, parseVersions(await response.text())));
  }
}
module.exports = {decodeHtml, parseVersions, formatVersions};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
