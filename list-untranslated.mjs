import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const indexFiles = [
  'src-index.json',
  'src-index-4k-5k.json', 'src-index-5k-6k.json', 'src-index-6k-7k.json',
  'src-index-7k-8k.json', 'src-index-8k-9k.json', 'src-index-9k-10k.json',
  'src-index-10k-12k.json', 'src-index-12k-15k.json', 'src-index-15k-20k.json',
  'src-index-20k-30k.json', 'src-index-30k-50k.json', 'src-index-50k-plus.json'
];

const files = [];
indexFiles.forEach(f => {
  const path = join('D:\\doge-code', f);
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(data)) data.forEach(d => files.push(d));
  } catch {}
});

const notTranslated = files.filter(f => f.translated === false);
console.log(`Found ${notTranslated.length} untranslated files\n`);

// Output file list for processing
notTranslated.forEach(f => console.log(f.path));
