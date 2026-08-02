// Debug T3 - find the infinite loop
var LT = String.fromCharCode(60), GT = String.fromCharCode(62), CL = String.fromCharCode(47);
var F_START = function() { return LT + 'function'; };
var F_END = function() { return GT; };
var F_CLOSE = function() { return LT + CL + 'function' + GT; };
var PM_START = function(nk) { return LT + 'parameter' + (nk ? ' ' + nk : '') + GT; };
var PM_END = function() { return LT + CL + 'parameter' + GT; };
var buf = '', state = 'text', tn = '';

function mb(n, inp) { return { type: 'tool_use', id: 'f-' + n + '-' + Date.now(), name: n, input: inp }; }

function parse(c) {
  var blocks = [];
  buf += c;
  var i = 0;
  var fs_tag = F_START(), fe_tag = F_END(), fc_tag = F_CLOSE();
  var fs_len = fs_tag.length, fc_len = fc_tag.length;
  console.log('  [DEBUG] parse called: state=' + state + ' buf_len=' + buf.length + ' input_len=' + c.length);
  var iter_count = 0;
  while (i < buf.length) {
    iter_count++;
    if (iter_count > 1000) { console.log('  [DEBUG] INFINITE LOOP DETECTED! i=' + i + ' buf_len=' + buf.length); break; }
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
      if (la.indexOf(fe_tag) === -1 && la.indexOf(fs_tag) === -1) {
        console.log('  [DEBUG] in_fn -> text (lookahead failed). i=' + i + ' buf=' + JSON.stringify(buf.slice(i, i+50)));
        break;
      }
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
      if (la2.indexOf(fs_tag) === -1) {
        blocks.push(mb(tn, ep(buf.slice(i)))); state = 'text'; tn = ''; i = buf.length; continue;
      }
      break;
    }
  }
  buf = buf.slice(i);
  if (buf.length === 0 && state !== 'text') { state = 'text'; tn = ''; }
  console.log('  [DEBUG] parse done: blocks=' + blocks.length + ' state=' + state + ' iter=' + iter_count);
  return blocks;
}

function ep(text) {
  var p = {};
  var re = new RegExp(LT + 'parameter' + '\\s+(?:name\\s*=\\s*"([^"]+)"\\s*)?' + GT + '([\\s\\S]*?)' + LT + CL + 'parameter' + GT, 'g');
  var mt;
  while ((mt = re.exec(text)) !== null) {
    var k, v;
    if (mt[1]) { k = mt[1]; v = mt[2].trim(); } else { var body = mt[2]; var gi = body.indexOf(GT); if (gi !== -1) { k = body.slice(0, gi).trim(); v = body.slice(gi + 1).trim(); } else { k = body.trim(); v = ''; } }
    if (k) p[k] = v;
  }
  return p;
}

function rs() { buf = ''; state = 'text'; tn = ''; }
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
var passed = 0, failed = 0;
function test(name, fn) { rs(); try { fn(); console.log('  [PASS] ' + name); passed++; } catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; } }

console.log('\n=== T3: streaming partial tag (debug) ===\n');
test('T3: streaming partial tag', function() {
  var c1 = parse('Here is a tool: ' + F_START() + ' name="Bash');
  console.log('  c1 result: ' + JSON.stringify(c1) + ' state=' + state);
  var c2 = parse('" ' + F_END() + PM_START('name="cmd"') + 'echo hello' + PM_END() + F_CLOSE());
  console.log('  c2 result: ' + JSON.stringify(c2) + ' state=' + state);
  assert(c2.length === 1 && c2[0].type === 'tool_use' && c2[0].name === 'Bash', 'c2: ' + JSON.stringify(c2));
});

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);