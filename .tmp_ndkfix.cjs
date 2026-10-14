const fs = require('fs');
const targets = [
  'D:/.github/mobileapp/ZorvAI/terminal-core/build.gradle.kts',
  'D:/.github/mobileapp/ZorvAI/app/build.gradle.kts',
  'D:/.github/mobileapp/ZorvAI/aidl-aci-browser/build.gradle.kts',
];
const OLD = '27.0.12077973';
const NEW = '28.2.13676358';
for (const t of targets) {
  let s = fs.readFileSync(t, 'utf8');
  const before = (s.match(new RegExp(OLD.replace(/\./g,'\\.'),'g'))||[]).length;
  s = s.split(OLD).join(NEW);
  fs.writeFileSync(t, s);
  console.log(`${t} : replaced ${before}`);
}
