const https = require(https)  
const url = https://static.stepfun.com/static/chat-web/_next/static/chunks/app/chats/  
  + String.fromCharCode(37,53,66) + \"chatSessionId\" + String.fromCharCode(37,53,68)  
  + /page-23332faa3d96cb79.js  
https.get(url, function(r) {  
  let data = \"\"  
  r.on(\"data\", function(c) { data += c })  
  r.on(\"end\", function() { console.log(r.statusCode, data.length) })  
})  
.on(\"error\", function(e) { console.log(e.code, e.message) })  
// download  
const http = require(\"http\")  
const https = require(\"https\")  
const host = \"static.stepfun.com\"  
const path = \"/static/chat-web/_next/static/chunks/app/chats/\"  
const enc = Buffer.from(\"[\").toString(\"base64\").substring(0,2) 
