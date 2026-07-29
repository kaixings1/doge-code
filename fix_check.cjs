const fs = require('fs');
const l = fs.readFileSync('desktop/src/main/apiClient.ts', 'utf-8').split('\n');
for (let i = 382; i < 394; i++) {
  console.log((i + 1) + ': ' + l[i]);
}