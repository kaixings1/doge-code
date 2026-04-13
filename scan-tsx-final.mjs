import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function getAllTsxFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllTsxFiles(fullPath));
      }
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const tsxFiles = getAllTsxFiles(srcDir);
console.log(`Scanning ${tsxFiles.length} tsx files...\n`);

// Match JSX text content: >English Text Here< or 'English Text'
const patterns = [
  />[A-Z][a-z]+ (?:[a-z]+ ){2,}[^<]*</g,
  /'[A-Z][a-z]+ (?:[a-z]+ ){2,}[^']*'/g,
  /"[A-Z][a-z]+ (?:[a-z]+ ){2,}[^"]*"/g,
];

// Skip common code patterns
const skipPatterns = ['import ', 'export ', 'function ', 'const ', 'let ', 'type ', 'interface ', 'return ', 'if (', 'switch (', 'case ', 'class ', 'enum ', 'Symbol.for', 'useCallback', 'useState', 'useMemo', 'useEffect', 'useRef', 'useContext', 'useInput', 'useKeybinding', 'onPress', 'onClick', 'onSubmit'];

let checked = 0;
for (const file of tsxFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let text = match[0];
        // Remove JSX brackets
        text = text.replace(/^>/, '').replace(/</, '').replace(/^['"]/, '').replace(/['"]$/, '');
        
        // Skip if too short or contains code patterns
        if (text.length < 20) continue;
        if (skipPatterns.some(skip => text.includes(skip))) continue;
        // Skip if contains Chinese (already translated)
        if (/[\u4e00-\u9fff]/.test(text)) continue;
        // Skip if it's just component names
        if (/^(Text|Box|Byline|Tab|Dialog|Select|Input|Menu|Button|Link|Form|Field|Card|List|Item|Row|Col|Header|Footer|Content|Main|Sidebar|Panel|Modal|Toast|Alert|Badge|Icon|Image|Avatar|Checkbox|Radio|Slider|Toggle|Switch|Dropdown|Tooltip|Popover|Accordion|Carousel|Pagination|Breadcrumb|Progress|Spinner|Loader|Skeleton|Placeholder|Empty|Error|Success|Warning|Info|Debug|Log|Status|State|Config|Setting|Option|Preference|Theme|Style|Color|Font|Size|Width|Height|Margin|Padding|Border|Radius|Shadow|Opacity|Visibility|Display|Position|Top|Right|Bottom|Left|Center|Middle|Align|Justify|Flex|Grid|Wrap|Overflow|Scroll|ScrollTop|ScrollBottom|ScrollLeft|ScrollRight|ScrollUp|ScrollDown|ScrollForward|ScrollBackward|ScrollPrev|ScrollNext|ScrollFirst|ScrollLast|ScrollTo|ScrollInto|ScrollInView|ScrollIntoView|ScrollIntoViewIfNeeded|ScrollIntoViewIfNeededAsync|ScrollIntoViewIfNeededAsync)(\s|$)/.test(text)) continue;
        // Skip if it's a URL or email
        if (/https?:\/\//.test(text) || /@/.test(text)) continue;
        
        results.push({ file: relPath, text: text.trim() });
      }
      pattern.lastIndex = 0;
    }
    
    checked++;
    if (checked % 100 === 0) console.log(`Checked ${checked}/${tsxFiles.length}`);
  } catch {}
}

console.log(`\n\nFound ${results.length} potential English UI strings:\n`);
for (const r of results.slice(0, 50)) {
  console.log(`${r.file}`);
  console.log(`  "${r.text}"`);
  console.log();
}
