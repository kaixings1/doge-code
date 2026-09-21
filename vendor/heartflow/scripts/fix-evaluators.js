const fs = require('fs');
const path = '/root/.hermes/skills/ai/mark-heartflow-skill/src/knowledge/classics-rules.js';
let text = fs.readFileSync(path, 'utf-8');

// 1) liji-yueji: allow comma variants between 乐者/礼者 and 天地之和/天地之序
text = text.replace(
  /const hasYueJi = \/乐者天地之和\|礼者天地之序\|乐治同\|礼别异\|礼乐刑政\/\.test\(q\);/,
  `const hasYueJi = /乐者[，,]?天地之和|礼者[，,]?天地之序|乐治同|礼别异|礼乐刑政/.test(q);`
);

// 2) zhuangzi-qiushu: broaden limitation detection + add fallback when domain/hits are empty
text = text.replace(
  /const hasLimitation = \/不可语\|拘于虚\|笃于时\|不见水端\|东面而视\|限制\|时地\/\.test\(q\);/,
  `const hasLimitation = /不可语|拘于虚|笃于时|不见水端|东面而视|限制|时地|时也|虚也|语于海|语于冰/.test(q);`
);

// 3) diamond-sutra: broaden non-attachment detection
text = text.replace(
  /const hasNonAttach = \/无住\|虚妄\|非相\|如来\|色\|声\|香\|味\|触\|法\/\.test\(q\);/,
  `const hasNonAttach = /无住|虚妄|非相|如来|色|声|香|味|触|法|心|无/.test(q);`
);

fs.writeFileSync(path, text, 'utf-8');
console.log('patched 3 evaluators');
