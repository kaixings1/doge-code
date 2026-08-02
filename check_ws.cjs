const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('name:', p.name);
console.log('workspaces:', p.workspaces);
const pd = JSON.parse(fs.readFileSync('desktop/package.json', 'utf8'));
console.log('desktop name:', pd.name);
console.log('desktop workspaces:', pd.workspaces);
