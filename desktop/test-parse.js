// parseFunctionToolUse unit test
// Run: bun test-parse.js

var buf = '', state = 'text', tn = '';

function mb(n, inp) {
  return { type: 'tool_use', id: 'f-' + n + '-' + Date.now(), name: n, input: inp };
}

function parse(c) {
  var blocks = [];
  buf += c;
  var i = 0;
  while (i < buf.length) {
    if (state === 'text') {
      var s = buf.indexOf('fn_start', i);
      if (s === -1) {
        if (i < buf.length && buf.slice(i).trim()) blocks.push({ type: 'text', text: buf.slice(i).trim() });
        break;
      }
      if (s > i) blocks.push({ type: 'text', text: buf.slice(i, s).trim() });
      state = 'in_fn'; tn = ''; i = s + 9;
    } else if (state === 'in_fn') {
      var e = buf.indexOf('fn_end', i);
      if (e !== -1) {
        var pre = buf.slice(i, e);
        var m = pre.match(/nm\s+"([^"]+)"/);
        tn = m ? m[1] : pre.trim();
        state = 'in_p'; i = e + 7; continue;
      }
      break;
    } else {
      var cl = buf.indexOf('fn_close', i);
      var nx = buf.indexOf('fn_start', i);
      if (cl !== -1 && (nx === -1 || cl < nx)) {
        blocks.push(mb(tn, ep(buf.slice(i, cl))));
        state = 'text'; tn = ''; i = cl + 9; continue;
      }
      if (nx !== -1 && (cl === -1 || nx < cl)) {
        blocks.push(mb(tn, ep(buf.slice(i, nx))));
        state = 'in_fn'; tn = ''; i = nx; continue;
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
  var re = /pm\s+(?:nk\s+"([^"]+)"\s+)?>([\s\S]*?)<\/pm>/g;
  var mt;
  while ((mt = re.exec(text)) !== null) {
    var k = mt[1] || '';
    var v = mt[2].trim();
    if (k) p[k] = v;
  }
  return p;
}

function rs() { buf = ''; state = 'text'; tn = ''; }
function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

var passed = 0, failed = 0;
function test(name, fn) {
  rs();
  try { fn(); console.log('  [PASS] ' + name); passed++; }
  catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}

console.log('\n=== Testing parseFunctionToolUse ===\n');

test('T1: standard format', function() {
  var raw = 'fn_start nm="ReadFile" fn_end pm nk="path">/tmp/a.txt</pm>fn_close';
  var r = parse(raw);
  assert(r.length === 1, 'len=' + r.length);
  assert(r[0].type === 'tool_use', 't=' + r[0].type);
  assert(r[0].name === 'ReadFile', 'n=' + r[0].name);
  assert(r[0].input.path === '/tmp/a.txt', 'p=' + r[0].input.path);
});

test('T2: custom format (no name attr)', function() {
  rs();
  var raw = 'fn_start ReadFile fn_end pm nk="path">/tmp/a.txt</pm>fn_close';
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].name === 'ReadFile');
});

test('T3: streaming partial tag', function() {
  rs();
  var c1 = parse('text fn_start nm="Bash');
  assert(c1.length === 1 && c1[0].type === 'text', 'c1=' + JSON.stringify(c1));
  var c2 = parse('" fn_end pm nk="cmd">echo hi</pm>fn_close');
  assert(c2.length === 1 && c2[0].type === 'tool_use' && c2[0].name === 'Bash');
});

test('T4: streaming tool then text', function() {
  rs();
  var c1 = parse('Result: fn_start nm="RF" fn_end pm nk="p">/t.txt</pm>fn_close');
  assert(c1.length === 2 && c1[0].type === 'text' && c1[1].type === 'tool_use');
  var c2 = parse(' Done!');
  assert(c2.length === 1 && c2[0].type === 'text' && c2[0].text === 'Done!');
});

test('T5: multiple calls', function() {
  rs();
  var raw = 'fn_start nm="A" fn_end pm nk="x">1</pm>fn_closefn_start nm="B" fn_end pm nk="y">2</pm>fn_close';
  var r = parse(raw);
  assert(r.length === 2 && r[0].name === 'A' && r[1].name === 'B');
});

test('T6: plain text', function() {
  rs();
  var r = parse('Hello plain text.');
  assert(r.length === 1 && r[0].type === 'text' && r[0].text === 'Hello plain text.');
});

test('T7: incomplete tag buffered', function() {
  rs();
  var r = parse('text fn_start nm="Test');
  assert(r.length === 1 && r[0].type === 'text');
  assert(buf.indexOf('fn_start nm="Test') !== -1, 'buf=' + buf);
});

test('T8: key>value param', function() {
  rs();
  var raw = 'fn_start TN fn_end pm>cmd>echo hi</pm>fn_close';
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].input.cmd === 'echo hi');
});

test('T9: empty param', function() {
  rs();
  var raw = 'fn_start nm="T" fn_end pm nk="e"></pm>fn_close';
  var r = parse(raw);
  assert(r.length === 1 && r[0].input.e === '', 'val=' + JSON.stringify(r[0].input.e));
});

test('T10: mixed text tool text', function() {
  rs();
  var raw = 'Before fn_start nm="T" fn_end pm nk="x">1</pm>fn_close After';
  var r = parse(raw);
  assert(r.length === 3, 'len=' + r.length + ' ' + JSON.stringify(r));
  assert(r[0].type === 'text' && r[0].text === 'Before');
  assert(r[1].type === 'tool_use' && r[1].name === 'T');
  assert(r[2].type === 'text' && r[2].text === 'After');
});

test('T11: tag split at fn_end', function() {
  rs();
  var c1 = parse('fn_start nm="');
  assert(c1.length === 0);
  var c2 = parse('T" fn_end pm nk="x">1</pm>fn_close');
  assert(c2.length === 1 && c2[0].name === 'T');
});

test('T12: content after closing', function() {
  rs();
  var raw = 'fn_start nm="T" fn_end pm nk="x">1</pm>fn_close and more';
  var r = parse(raw);
  assert(r.length === 2 && r[0].type === 'tool_use' && r[1].type === 'text' && r[1].text === 'and more');
});

test('T13: multiline param', function() {
  rs();
  var raw = 'fn_start nm="W" fn_end pm nk="c">line1' + String.fromCharCode(10) + 'line2</pm>fn_close';
  var r = parse(raw);
  assert(r.length === 1 && r[0].input.c === 'line1\nline2', 'val=' + r[0].input.c);
});

test('T14: empty function', function() {
  rs();
  var raw = 'fn_start nm="Noop" fn_end fn_close';
  var r = parse(raw);
  assert(r.length === 1 && r[0].type === 'tool_use' && r[0].name === 'Noop');
});

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
