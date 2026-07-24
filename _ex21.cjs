const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('export async function cliMain'); 
fs.writeFileSync('_climain.txt', s.substring(i,i+500)); 
