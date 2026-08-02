// Debug T8 - analyze why ep() returns empty object
var LT = String.fromCharCode(60), GT = String.fromCharCode(62), CL = String.fromCharCode(47);

var buf = '', state = 'text', tn = '';

function mb(n, inp) { return { type: 'tool_use', name: n, input: inp }; }

function parse(c) {
  var blocks = []; buf += c; var i = 0;
  var fs_tag = LT + 'function', fe_tag = GT, fc_tag = LT + CL + 'function' + GT;
  var fs_len = fs_tag.length, fc_len = fc_tag.length;
  while (i < buf.length) {
    if (state === 'text') {
      var s = buf.indexOf(fs_tag, i);
      if (s === -1) { if (i < buf.length && buf.slice(i).trim()) blocks.push({type:'text',text:buf.slice(i).trim()}); break; }
      if (s > i) blocks.push({type:'text',text:buf.slice(i,s).trim()});
      state = 'in_fn'; tn = ''; i = s + fs_len;
    } else if (state === 'in_fn') {
      var e = buf.indexOf(fe_tag, i);
      if (e !== -1) { var pre = buf.slice(i,e); var m = pre.match(/name\s*=\s*"([^"]+)"/); tn = m?m[1]:pre.trim(); state='in_p'; i=e+1; continue; }
      var nx = buf.indexOf(fs_tag, i); if (nx !== -1) { tn=''; i=nx; continue; }
      var la = buf.slice(i, i+100);
      if (la.indexOf(fe_tag) === -1 && la.indexOf(fs_tag) === -1) { break; }
      break;
    } else {
      var cl = buf.indexOf(fc_tag, i); var nxf = buf.indexOf(fs_tag, i);
      if (cl !== -1 && (nxf===-1 || cl<nxf)) { blocks.push(mb(tn,ep(buf.slice(i,cl)))); state='text'; tn=''; i=cl+fc_len; continue; }
      if (nxf !== -1 && (cl===-1 || nxf<cl)) { blocks.push(mb(tn,ep(buf.slice(i,nxf)))); state='in_fn'; tn=''; i=nxf; continue; }
      var la2 = buf.slice(i,i+100); if (la2.indexOf(fs_tag)===-1) { blocks.push(mb(tn,ep(buf.slice(i)))); state='text'; tn=''; i=buf.length; continue; }
      break;
    }
  }
  buf = buf.slice(i); if (buf.length===0 && state!=='text') { state='text'; tn=''; }
  return blocks;
}

function ep(text) {
  console.log('  [ep] input text:', JSON.stringify(text));
  var p = {};
  var re = new RegExp(LT+'parameter'+'\\s+(?:name\\s*=\\s*"([^"]+)"\\s*)?'+GT+'([\\s\\S]*?)'+LT+CL+'parameter'+GT, 'g');
  var mt;
  var matchCount = 0;
  while ((mt = re.exec(text)) !== null) {
    matchCount++;
    console.log('  [ep] match #' + matchCount + ': full=' + JSON.stringify(mt[0]));
    console.log('  [ep]   mt[1] (name attr)=' + JSON.stringify(mt[1]));
    console.log('  [ep]   mt[2] (content)=' + JSON.stringify(mt[2]));
    var k, v;
    if (mt[1]) { k = mt[1]; v = mt[2].trim(); }
    else {
      var body = mt[2];
      var gi = body.indexOf(GT);
      if (gi !== -1) { k = body.slice(0,gi).trim(); v = body.slice(gi+1).trim(); }
      else { k = body.trim(); v = ''; }
    }
    console.log('  [ep]   k=' + JSON.stringify(k) + ', v=' + JSON.stringify(v));
    if (k) p[k] = v;
  }
  console.log('  [ep] total matches: ' + matchCount + ', result: ' + JSON.stringify(p));
  return p;
}

function rs() { buf = ''; state = 'text'; tn = ''; }

console.log('\n=== T8 Debug: custom key>value param ===\n');
rs();

// Build the raw input step by step
var f_start = LT + 'function';
var f_end = GT;
var f_close = LT + CL + 'function' + GT;
var pm_start_empty = LT + 'parameter' + GT;
var pm_end = LT + CL + 'parameter' + GT;

console.log('Tags:');
console.log('  f_start=' + JSON.stringify(f_start));
console.log('  f_end=' + JSON.stringify(f_end));
console.log('  f_close=' + JSON.stringify(f_close));
console.log('  pm_start_empty=' + JSON.stringify(pm_start_empty));
console.log('  pm_end=' + JSON.stringify(pm_end));

var raw = f_start + ' TN ' + f_end + pm_start_empty + 'cmd>echo hello' + pm_end + f_close;
console.log('\nRaw input:', JSON.stringify(raw));
console.log('Raw input chars:', raw.split('').map(function(c){ return c.charCodeAt(0); }).join(' '));

var r = parse(raw);
console.log('\nResult:', JSON.stringify(r));
console.log('Expected: [{type:"tool_use", name:"TN", input:{cmd:"echo hello"}}]');
console.log('Actual input:', JSON.stringify(r[0] && r[0].input));

// Also test ep() directly with just the parameter content
console.log('\n--- Direct ep() test ---');
var paramContent = pm_start_empty + 'cmd>echo hello' + pm_end;
console.log('paramContent:', JSON.stringify(paramContent));
var directResult = ep(paramContent);
console.log('ep() result:', JSON.stringify(directResult));

// Test with name attribute version
console.log('\n--- Named param test ---');
var namedParam = pm_start_empty.replace('parameter>', 'parameter name="cmd">') + 'echo hello' + pm_end;
console.log('namedParam:', JSON.stringify(namedParam));
var namedResult = ep(namedParam);
console.log('ep() result:', JSON.stringify(namedResult));
