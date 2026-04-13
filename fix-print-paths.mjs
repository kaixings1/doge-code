import { readFileSync, writeFileSync } from 'fs';

const file = 'D:\\doge-code\\src\\cli\\print.ts';
let content = readFileSync(file, 'utf8');

const replacements = [
  ["from '../../", "from 'src/"],
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

writeFileSync(file, content, 'utf8');
console.log('Fixed print.ts import paths');
