// test-real-impl.js
// Unit test for parseFunctionToolUse with EXACT logic from VirtualMessageList.tsx
// Run: bun test-real-impl.js

// Character codes for XML tags (to avoid literal < > in source)
var LT = String.fromCharCode(60);  // <
var GT = String.fromCharCode(62);  // >
var CL = String.fromCharCode(47);  // /

// Build actual XML tags at runtime
function F_START() { return LT + 'function'; }
function F_END() { return GT; }
function F_CLOSE() { return LT + CL + 'function' + GT; }
function PM_START(nk) { return LT + 'parameter' + (nk ? ' ' + nk : '') + GT; }
function PM_END() { return LT + CL + 'parameter' + GT; }

// --- EXACT parseFunctionToolUse implementation from VirtualMessageList.tsx ---
var buf = '', state = 'text', tn = '';

function mb(n, inp) {
  return { type: 'tool_use', id: 'f-' + n + '-' + Date.now(), name: n, input: inp };
}

function parse(c) {
  var blocks = [];
  buf += c;
  var i = 0;
  var fn_start_tag = F_START();
  var fn_end_tag = F_END();
  var fn_close_tag = F_CLOSE();
  var fn_start_len = fn_start_tag.length;
  var fn_close_len = fn_close_tag.length;

  while (i < buf.length) {
    if (state === 'text') {
      var s = buf.indexOf(fn_start_tag, i);
      if (s === -1) {
        if (i < buf.length && buf.slice(i).trim()) blocks.push({ type: 'text', text: buf.slice(i).trim() });
        break;
      }
      if (s > i) blocks.push({ type: 'text', text: buf.slice(i, s).trim() });
      state = 'in_fn'; tn = ''; i = s + fn_start_len;
    } else if (state === 'in_fn') {
      var e = buf.indexOf(fn_end_tag, i);
      if (e !== -1) {
        var pre = buf.slice(i, e);
        var m = pre.match(/name\s*=\s*"([^"]+)"/);
        tn = m ? m[1] : pre.trim();
        state = 'in_p'; i = e + 1; continue;
      }
      var nx = buf.indexOf(fn_start_tag, i);
      if (nx !== -1) { tn = ''; i = nx; continue; }
      var la = buf.slice(i, i + 100);
      if (la.indexOf(fn_end_tag) === -1 && la.indexOf(fn_start_tag) === -1) {
        break;
      }
      break;
    } else {
      var cl = buf.indexOf(fn_close_tag, i);
      var nxf = buf.indexOf(fn_start_tag, i);
      if (cl !== -1 && (nxf === -1 || cl < nxf)) {
        blocks.push(mb(tn, ep(buf.slice(i, cl))));
        state = 'text'; tn = ''; i = cl + fn_close_len; continue;
      }
      if (nxf !== -1 && (cl === -1 || nxf < cl)) {
        blocks.push(mb(tn, ep(buf.slice(i, nxf))));
        state = 'in_fn'; tn = ''; i = nxf; continue;
      }
      var la2 = buf.slice(i, i + 100);
      if (la2.indexOf(fn_start_tag) === -1) {
        blocks.push(mb(tn, ep(buf.slice(i))));
        state = 'text'; tn = ''; i = buf.length; continue;
      }
      break;
    }
  }
  buf = buf.slice(i);
  if (buf.length === 0 && state !== 'text') { state = 'text'; tn = ''; }
  return blocks;
}

function ep(text) {
  var p = {};
  var re = new RegExp(LT + 'parameter' + '\\s*(?:name\\s*=\\s*"([^"]+)"\\s*)?' + GT + '([\\s\\S]*?)' + LT + CL + 'parameter' + GT, 'g');
  var mt;
  while ((mt = re.exec(text)) !== null) {
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

// --- Test framework ---
function rs() { buf = ''; state = 'text'; tn = ''; }
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }

var passed = 0, failed = 0;
function test(name, fn) {
  rs();
  try { fn(); console.log('  [PASS] ' + name); passed++; }
  catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}

console.log('\n=== Testing parseFunctionToolUse ===\n');

// --- Tests using actual XML tags ---

test('T1: standard format', function() {
  var raw = 'text ' + F_START() + ' name="ReadFile" ' + F_END() + PM_START('name="path"') + '/tmp/a.txt' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 2, 'Expected 2 blocks (text+tool_use), got ' + r.length + ': ' + JSON.stringify(r));
  assert(r[0].type === 'text' && r[0].text === 'text', 'block0: ' + JSON.stringify(r[0]));
  assert(r[1].type === 'tool_use', 'block1 type: ' + r[1].type);
  assert(r[1].name === 'ReadFile', 'name: ' + r[1].name);
  assert(r[1].input.path === '/tmp/a.txt', 'path: ' + r[1].input.path);
});

test('T2: custom format no name attr', function() {
  rs();
  var raw = F_START() + 'ReadFile' + F_END() + PM_START('name="path"') + '/tmp/a.txt' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].name === 'ReadFile');
});

test('T3: streaming partial tag', function() {
  rs();
  var c1 = parse('Here is a tool: ' + F_START() + ' name="Bash');
  assert(c1.length === 1 && c1[0].type === 'text', 'chunk1: ' + JSON.stringify(c1));
  var c2 = parse('" ' + F_END() + PM_START('name="cmd"') + 'echo hello' + PM_END() + F_CLOSE());
  assert(c2.length === 1 && c2[0].type === 'tool_use' && c2[0].name === 'Bash');
});

test('T4: streaming tool then text', function() {
  rs();
  var c1 = parse('Result: ' + F_START() + ' name="RF" ' + F_END() + PM_START('name="p"') + '/t.txt' + PM_END() + F_CLOSE());
  assert(c1.length === 2 && c1[0].type === 'text' && c1[1].type === 'tool_use');
  var c2 = parse(' Done!');
  assert(c2.length === 1 && c2[0].type === 'text' && c2[0].text === 'Done!');
});

test('T5: multiple tool calls', function() {
  rs();
  var raw = F_START() + ' name="A" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE() +
            F_START() + ' name="B" ' + F_END() + PM_START('name="y"') + '2' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 2 && r[0].name === 'A' && r[1].name === 'B');
});

test('T6: plain text only', function() {
  rs();
  var r = parse('Hello, this is just plain text.');
  assert(r.length === 1 && r[0].type === 'text' && r[0].text === 'Hello, this is just plain text.');
});

test('T7: incomplete tag buffered', function() {
  rs();
  var r = parse('Some text ' + F_START() + ' name="Test');
  assert(r.length === 1 && r[0].type === 'text');
  assert(buf === ' name="Test"', 'buf=' + JSON.stringify(buf));
});

test('T8: custom key>value param', function() {
  rs();
  var raw = F_START() + ' TN ' + F_END() + PM_START() + 'cmd>echo hello' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].input.cmd === 'echo hello');
});

test('T9: empty parameter', function() {
  rs();
  var raw = F_START() + ' name="T" ' + F_END() + PM_START('name="e"') + '' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 1);
  assert(r[0].input.e === '', 'Expected empty, got: ' + JSON.stringify(r[0].input.e));
});

test('T10: mixed text+tool+text', function() {
  rs();
  var raw = 'Before ' + F_START() + ' name="T" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE() + ' After';
  var r = parse(raw);
  assert(r.length === 3, 'Expected 3 blocks, got ' + r.length + ': ' + JSON.stringify(r));
  assert(r[0].type === 'text' && r[0].text === 'Before');
  assert(r[1].type === 'tool_use' && r[1].name === 'T');
  assert(r[2].type === 'text' && r[2].text === 'After');
});

test('T11: tag split across chunks', function() {
  rs();
  var c1 = parse(F_START() + ' name="');
  assert(c1.length === 0);
  var c2 = parse('T" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE());
  assert(c2.length === 1 && c2[0].name === 'T');
});

test('T12: content after closing tag', function() {
  rs();
  var raw = F_START() + ' name="T" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE() + ' and more text';
  var r = parse(raw);
  assert(r.length === 2 && r[0].type === 'tool_use' && r[1].type === 'text' && r[1].text === 'and more text');
});

test('T13: multiline param content', function() {
  rs();
  var nl = String.fromCharCode(10);
  var raw = F_START() + ' name="W" ' + F_END() + PM_START('name="c"') + 'line1' + nl + 'line2' + PM_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 1 && r[0].input.c === 'line1\nline2', 'Got: ' + JSON.stringify(r[0].input));
});

test('T14: empty function no params', function() {
  rs();
  var raw = F_START() + ' name="Noop" ' + F_END() + F_CLOSE();
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].name === 'Noop');
});

test('T15: whitespace padding', function() {
  rs();
  var raw = '  ' + F_START() + ' name="T" ' + F_END() + PM_START('name="x"') + '1' + PM_END() + F_CLOSE() + '  ';
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use', 'len=' + r.length + ' blocks=' + JSON.stringify(r));
});

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
