const fs = require('fs');
const p = 'src/knowledge/classics-rules.js';
let text = fs.readFileSync(p, 'utf-8');
const oldTieBreaker = `  if (!domain && typeof input === 'string' && input.length >= 10) {
    const buddhistSoft = /\b戒\b|\b定\b|\b慧\b|出离|寂静|涅槃|无明|爱憎|苦集|灭道|四谛|八正道|十二因缘|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四生|八苦|三毒|五蕴|六度|七觉/.test(input);
    const confucianSoft = /为政|治国|礼|仁政|德治|法|刑|王道|霸道|君臣|教化/.test(input);
    if (buddhistSoft && !confucianSoft) {
      domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
    }
  }`;
const newTieBreaker = `  if (!domain && typeof input === 'string' && input.length >= 10) {
    const buddhistSoft = /\b戒\b|\b定\b|\b慧\b|出离|寂静|涅槃|无明|爱憎|苦集|灭道|四谛|八正道|十二因缘|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四生|八苦|三毒|五蕴|六度|七觉/.test(input);
    const confucianSoft = /为政|治国|礼|仁政|德治|法|刑|王道|霸道|君臣|教化/.test(input);
    if (buddhistSoft && !confucianSoft) {
      domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
    } else if (buddhistSoft && confucianSoft) {
      const bScore = input.match(/\b戒\b|\b定\b|\b慧\b|出离|寂静|涅槃|无明|爱憎|苦集|灭道|四谛|八正道|十二因缘|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四生|八苦|三毒|五蕴|六度|七觉/g) || [];
      const cScore = input.match(/为政|治国|礼|仁政|德治|法|刑|王道|霸道|君臣|教化/g) || [];
      if (bScore.length > cScore.length) {
        domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
      }
    }
  }`;
if (!text.includes(oldTieBreaker)) {
  console.log('tie-breaker block not found');
  process.exit(1);
}
text = text.replace(oldTieBreaker, newTieBreaker);
fs.writeFileSync(p, text, 'utf-8');
console.log('patched score-based tie-breaker');
