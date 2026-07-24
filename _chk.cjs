var fs=require('fs');var s=fs.readFileSync('doge.exe');var idx=s.indexOf('[STEP-');console.log('found at', idx); 
