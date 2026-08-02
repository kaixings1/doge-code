// Debug T7/T8/T15
var LT = String.fromCharCode(60), GT = String.fromCharCode(62), CL = String.fromCharCode(47);
function F_START() { return LT + 'function'; }
function F_END() { return GT; }
function F_CLOSE() { return LT + CL + 'function' + GT; }
function PM_START(nk) { return LT + 'parameter' + (nk ? ' ' + nk : '') + GT; }
function PM_END() { return LT + CL + 'parameter' + GT; }

var buf = '', state = 'text', tn = '';
function mb(n, inp) { return { type: 'tool_use', name: n, input: inp }; }

function parse(c) {
  var blocks = []; buf += c; var i = 0;
  var fs_tag = F_START(), fe_tag = F_END(), fc_tag = F_CLOSE();
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
  var p = {}; var re = new RegExp(LT+'parameter'+'\\s+(?:name\\s*=\\s*"([^"]+)"\\s*)?'+GT+'([\\s\\S]*?)'+LT+CL+'parameter'+GT, 'g');
  var mt; while((mt=re.exec(text))!==null) { var k,v; if(mt[1]){k=mt[1];v=mt[2].trim();}else{var body=mt[2];var gi=body.indexOf(GT);if(gi!==-1){k=body.slice(0,gi).trim();v=body.slice(gi+1).trim();}else{k=body.trim();v='';}} if(k) p[k]=v; }
  return p;
}// T7 test
console.log('--- T7: incomplete tag buffered ---');
buf = ''; state = 'text'; tn = '';
var r1 = parse('Some text ' + F_START() + ' name="Test');
console.log('r1:', JSON.stringify(r1));
console.log('buf after r1:', JSON.stringify(buf));
var t7a = r1.length === 1 && r1[0].type === 'text';
var t7b = buf.indexOf(F_START() + ' name="Test') !== -1;
console.log('T7 pass:', t7a && t7b, t7a ? '' : '(r1 failed)', t7b ? '' : '(buf failed: ' + JSON.stringify(buf) + ')');

// T8 test
console.log('\n--- T8: custom key>value param ---');
buf = ''; state = 'text'; tn = '';
var r2 = parse(F_START() + ' TN ' + F_END() + PM_START() + 'cmd>echo hello' + PM_END() + F_CLOSE());
console.log('r2:', JSON.stringify(r2));
var t8a = r2.length === 1 && r2[0].type === 'tool_use';
var t8b = r2[0].input.cmd === 'echo hello';
console.log('T8 pass:', t8a && t8b, t8a ? '' : '(type failed)', t8b ? '' : '(cmd=' + JSON.stringify(r2[0].input.cmd) + ')');

// T15 test
console.log('\n--- T15: whitespace padding ---');
buf = ''; state = 'text'; tn = '';
var r3 = parse('  ' + F_START() + ' name="T" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE() + '  ');
console.log('r3:', JSON.stringify(r3));
var t15a = r3.length === 1 && r3[0].type === 'tool_use';
console.log('T15 pass:', t15a, t15a ? '' : '(len=' + r3.length + ' type=' + (r3[0]&&r3[0].type) + ')');

var passed = (t7a&&t7b ? 1:0) + (t8a&&t8b ? 1:0) + (t15a ? 1:0);
console.log('\nT7/T8/T15: ' + passed + '/3 passed');
