// Replicates forticlaw-skill-policy-v1 instruction detectors, per file, with hit locations.
const fs = require('fs'), path = require('path');
const DET = {
  'instruction.policy_bypass': [/\b(?:bypass|disable|skip|ignore|circumvent)\b.{0,80}\b(?:approval|audit|identity|permission|policy)\b/giu],
  'instruction.prompt_override': [/\bignore\b.{0,60}\b(?:previous|prior|system|developer|higher[- ]priority)\b.{0,30}\binstructions?\b/giu, /\b(?:reveal|print|return|expose)\b.{0,40}\b(?:system|developer) prompt\b/giu],
  'instruction.destructive_command': [/\brm\s+(?:-\S+\s+){0,4}-[a-z]*(?:rf|fr)[a-z]*\s+(?:--no-preserve-root|[/~*])/giu, /\b(?:mkfs(?:\.\w+|\s+-t\b)|fdisk\s|format\s+[a-z]:)/giu, /\bdd\b[^.;!?\n]{0,60}\bof=\/dev\//giu],
  'instruction.exfiltration': [/\b(?:send|upload|post|exfiltrate)\b.{0,60}\b(?:credentials?|passwords?|tokens?|private keys?|\.ssh)\b/giu, /\bcurl\b.{0,100}\b(?:id_rsa|credentials|api[_ -]?key|token)\b/giu],
  'instruction.obfuscated_execution': [/\b(?:base64\s+(?:--decode|-d)|openssl\s+(?:base64|enc)\b[^.;!?\n]{0,40}-d)\b.{0,80}\|\s*(?:ba)?sh\b/giu, /\b(?:eval\s*\(|atob\s*\(|encodedcommand\b|frombase64string\b)/giu],
};
const NEG = /\b(?:do not|don'?t|never|must not|may not|cannot|can'?t|no need to|refuse to)\b/iu;
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(e.name==='.git'?[]:walk(p)):[p];});}
const root = process.argv[2]; const skip = (process.argv[3]||'').split(',').filter(Boolean);
let total = 0;
for (const f of walk(root)) {
  const rel = path.relative(root, f); if (skip.some(s => rel.startsWith(s))) continue;
  const text = fs.readFileSync(f,'utf8').normalize('NFKC');
  for (const s of text.split(/[.;!?\n]+/u)) for (const [code, pats] of Object.entries(DET)) for (const p of pats) {
    p.lastIndex = 0; let m;
    while ((m = p.exec(s)) !== null) {
      const before = s.slice(Math.max(0, m.index-16), m.index);
      if (!NEG.test(before)) { total++; console.log(`${code}  ${rel}\n   match: «${m[0].slice(0,140)}»\n   sentence: ${s.trim().slice(0,260)}\n`); }
      if (m.index === p.lastIndex) p.lastIndex++;
    }
  }
}
console.log(`hits: ${total}`);
