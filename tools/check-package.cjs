'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'forticnapp-lacework');
const skill = fs.readFileSync(path.join(out, 'SKILL.md'), 'utf8');
if (!skill.startsWith('---\nname: FortiCNAPP Assistant\n') || !skill.includes('## FortiAgent runtime')) throw new Error('Adapter missing');
for (const dir of ['references', 'scripts']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    const source = fs.readFileSync(path.join(root, dir, file));
    const built = fs.readFileSync(path.join(out, dir, file));
    if (!source.equals(built)) throw new Error(`Package differs: ${dir}/${file}`);
  }
}
const docs = ['SKILL.md', ...fs.readdirSync(path.join(out, 'references')).map(f => `references/${f}`)];
for (const doc of docs) {
  const text = fs.readFileSync(path.join(out, doc), 'utf8');
  for (const match of text.matchAll(/\]\((references\/[^)#]+)(?:#[^)]*)?\)/g)) {
    if (!fs.existsSync(path.join(out, match[1]))) throw new Error(`Missing link ${match[1]} in ${doc}`);
  }
}
cp.execFileSync(process.execPath, [path.join(out, 'scripts/helpers.test.cjs')], {stdio:'inherit'});
const scan = cp.execFileSync(process.execPath, [path.join(root, 'tools/fortiagent-scan.cjs'), out], {encoding:'utf8'});
process.stdout.write(scan);
if (!/hits: 0\s*$/.test(scan)) throw new Error('Policy scanner reported hits');
console.log('Package checks passed');
