const fs = require('fs');
const p = 'src/knowledge/classics-rules.js';
let text = fs.readFileSync(p, 'utf-8');
const marker = '  if (!domain) {\n    domain = matchDomain(input);\n  }';
const replacement = `  if (!domain) {
    domain = matchDomain(input);
  }
  if (domain && domain.id === 'confucian-governance') {
    const bScore = (input.match(/诸行无常|生灭法|寂灭|四十二章|法句经|八大人|比丘|沙门|阿罗汉|须陀洹|斯陀含|阿那含|五戒|十善|十二因缘|无明|爱取有|生老病死|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四谛|八正道|十二缘起|出离|寂静|涅槃/g) || []).length;
    const cScore = (input.match(/为政|治国|仁政|德治|王道|霸道|君臣|教化/g) || []).length;
    if (bScore > cScore) {
      domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
    }
  }`;
if (!text.includes(marker)) {
  console.log('matchDomain block not found');
  process.exit(1);
}
text = text.replace(marker, replacement);
fs.writeFileSync(p, text, 'utf-8');
console.log('patched post-match confucian->buddhist correction');
