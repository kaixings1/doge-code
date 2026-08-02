// Test T3 only - streaming partial tag
var LT = String.fromCharCode(60);
var GT = String.fromCharCode(62);
var CL = String.fromCharCode(47);
var buf = '', state = 'text', tn = '';

function mb(n, inp) { return { type: 'tool_use', id: 'f-' + n + '-' + Date.now(), name: n, input: inp }; }

function parse(c) {
  var blocks = [];
  buf += c;
  var i = 0;
  var fs_tag = LT + 'function';
  var fe_tag = GT;
  var fc_tag = LT + CL + 'function' + GT;
  var fs_len = fs_tag.length;
  var fc_len = fc_tag.length;
  while (i < buf.length) {
    if (state === 'text') {
      var s = buf.indexOf(fs_tag, i);
      if (s === -1) { if (i < buf.length && buf.slice(i).trim()) blocks.push({ type: 'text', text: buf.slice(i).trim() }); break; }
      if (s > i) blocks.push({ type: 'text', text: buf.slice(i, s).trim() });
      state = 'in_fn'; tn = ''; i = s + fs_len;
    } else if (state === 'in_fn') {
      var e = buf.indexOf(fe_tag, i);
      if (e !== -1) {
        var pre = buf.slice(i, e);
        var m = pre.match(/name\s*=\s*"([^"]+)"/);
        tn = m ? m[1] : pre.trim();
        state = 'in_p'; i = e + 1; continue;
      }
      var nx = buf.indexOf(fs_tag, i);
      if (nx !== -1) { tn = ''; i = nx; continue; }
      var la = buf.slice(i, i + 100);
      if (la.indexOf(fe_tag) === -1 && la.indexOf(fs_tag) === -1) { state = 'text'; tn = ''; i = i - fs_len; continue; }
      break;
    } else {
      var cl = buf.indexOf(fc_tag, i);
      var nxf = buf.indexOf(fs_tag, i);
      if (cl !== -1 && (nxf === -1 || cl < nxf)) {
        blocks.push(mb(tn, ep(buf.slice(i, cl))));
        state = 'text'; tn = ''; i = cl + fc_len; continue;
      }
      if (nxf !== -1 && (cl === -1 || nxf < cl)) {
        blocks.push(mb(tn, ep(buf.slice(i, nxf))));
        state = 'in_fn'; tn = ''; i = nxf; continue;
      }
      var la2 = buf.slice(i, i + 100);
      if (la2.indexOf(fs_tag) === -1) { blocks.push(mb(tn, ep(buf.slice(i)))); state = 'text'; tn = ''; i = buf.length; continue; }
      break;
    }
  }
  buf = buf.slice(i);
  if (buf.length === 0 && state !== 'text') { state = 'text'; tn = ''; }
  return blocks;
}

function ep(text) {
  var p = {};
  var re = new RegExp(LT + 'parameter' + '\\s+(?:name\\s*=\\s*"([^"]+)"\\s*)?' + GT + '([\\s\\S]*?)' + LT + CL + 'parameter' + GT, 'g');
  var mt;
  console.log('  ep regex: ' + re.source);
  console.log('  ep input: ' + JSON.stringify(text));
  while ((mt = re.exec(text)) !== null) {
    console.log('  ep match: idx=' + mt.index + ' g1=' + JSON.stringify(mt[1]) + ' g2=' + JSON.stringify(mt[2]));
    var k, v;
    if (mt[1]) { k = mt[1]; v = mt[2].trim(); }
    else {
      var body = mt[2];
      var gi = body.indexOf(GT);
      if (gi !== -1) { k = body.slice(0, gi).trim(); v = body.slice(gi + 1).trim(); }
      else { k = body.trim(); v = ''; }
    }
    if (k) p[k] = v;
  }
  return p;
}

console.log('\n=== T3: streaming partial tag ===\n');

console.log('--- Chunk 1 ---');
var c1 = parse('Here is a tool: ' + LT + 'function name="Bash');
console.log('c1 result: ' + JSON.stringify(c1));
console.log('buf after c1: ' + JSON.stringify(buf));
console.log('state after c1: ' + state);

console.log('\n--- Chunk 2 ---');
var c2 = parse('" ' + GT + LT + 'parameter name="cmd"' + GT + 'echo hello' + LT + CL + 'parameter' + GT + LT + CL + 'function' + GT);
console.log('c2 result: ' + JSON.stringify(c2));
console.log('state after c2: ' + state);
