// ===== 全局状态 =====
let currentModule = '';
let totalInspections = 0;
let todayInspections = 0;
let savedPoints = [];
let currentProgram = [];
let inspectionRecords = [];
let filmPlaced = false;
let isExposing = false;
let filmDataCache = null;
let originalImageData = null;
let negativeMode = false;

// ===== 主界面切换 =====
function enterModule(name) {
  currentModule = name;
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('moduleView').style.display = 'flex';
  const titles = { xray: '智能拍片', patch: '智能补片', teach: '示教产品', settings: '系统设置' };
  document.getElementById('moduleTitle').textContent = titles[name] || name;
  renderModule(name);
}

function backToMain() {
  document.getElementById('moduleView').style.display = 'none';
  document.getElementById('mainView').style.display = 'flex';
  document.getElementById('moduleContent').innerHTML = '';
}

// ===== 渲染各个模块 =====
function renderModule(name) {
  const container = document.getElementById('moduleContent');
  if (name === 'xray') container.innerHTML = renderXRay();
  else if (name === 'patch') container.innerHTML = renderPatch();
  else if (name === 'teach') container.innerHTML = renderTeach();
  else if (name === 'settings') container.innerHTML = renderSysSettings();
  setTimeout(() => {
    if (name === 'xray') initXRay();
    else if (name === 'patch') initPatch();
    else if (name === 'teach') initTeach();
  }, 50);
}

// ============ 1. 智能拍片 ============
function renderXRay() {
  return `
  <div class="split-panel">
    <div class="split-left" id="xrayLeft">
      <div class="sub-card">
        <div class="card-title">📦 产品 & 检测任务</div>
        <div class="param-row"><span>产品类型</span><select id="productType" onchange="applySmartParams()"><option>涡轮叶片</option><option>铝合金铸件</option><option>焊接管道</option><option>PCB组件</option></select></div>
        <div class="param-row"><span>批次/ID</span><input id="batchId" value="BATCH-2412-01"></div>
        <div class="param-row"><span>焦距 SOD (mm)</span><input id="sod" type="number" value="650" step="10"></div>
        <div class="param-row"><span>胶片尺寸</span><select id="filmSize"><option>14x17</option><option>10x12</option><option>8x10</option></select></div>
        <div class="param-row"><span>设定电压</span><span id="setKvp">70</span> kV <span style="color:var(--text-dim)">实际: <span id="actKvp">70.0</span></span></div>
        <div class="param-row"><span>设定电流</span><span id="setMa">3.0</span> mA <span style="color:var(--text-dim)">实际: <span id="actMa">3.00</span></span></div>
        <div class="param-row"><span>曝光时间</span><span id="setTime">60</span> s <span style="color:var(--text-dim)">老化: <span id="agingVal">1.00</span></span></div>
      </div>
      <div class="sub-card">
        <div class="card-title">⚡ 曝光控制</div>
        <div class="param-row"><span>管电压(kV)</span><input type="range" id="kvSlider" min="40" max="120" value="70" step="1"><span id="kvActualDisp">70.0</span></div>
        <div class="param-row"><span>管电流(mA)</span><input type="range" id="maSlider" min="1" max="8" value="3" step="0.1"><span id="maActualDisp">3.00</span></div>
        <div class="param-row"><span>曝光时间(s)</span><input type="range" id="expTimeSlider" min="5" max="300" value="60" step="1"><span id="expTimeVal">60</span></div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-danger" style="flex:1" onclick="startExposure()">📸 手动曝光</button>
          <button class="btn btn-primary" style="flex:1" onclick="applySmartParams()">🧠 智能曝光</button>
        </div>
        <div id="countdownBox" style="background:#010a14;border-radius:48px;padding:10px;text-align:center;font-size:1.6rem;margin-top:6px">就绪</div>
      </div>
      <div class="sub-card" style="flex:1">
        <div class="card-title">🎞️ 数字胶片</div>
        <div class="film-canvas"><canvas id="filmCanvas" width="280" height="280"></canvas></div>
        <div class="param-row" style="margin-top:4px">
          <span>胶片状态: <strong id="filmStatus">未放置</strong></span>
          <button class="btn btn-sm btn-default" onclick="placeFilm()">放置胶片</button>
          <button class="btn btn-sm btn-default" onclick="toggleNegative()">正负片</button>
        </div>
        <div class="param-row"><span>剩余胶片: 98张</span><span>型号: AGFA D10</span></div>
      </div>
      <div class="sub-card" style="height:80px">
        <div class="card-title">📋 系统日志</div>
        <div class="log-area" id="xrayLog">[系统] 就绪</div>
      </div>
    </div>
    <div class="split-resizer" id="xrayResizer"></div>
    <div class="split-right" id="xrayRight">
      <div class="sub-card">
        <div class="card-title">📊 检测记录 & 统计</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
          <div style="background:#060a14;border-radius:8px;padding:8px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--accent)" id="totalCount">0</div><div style="font-size:0.7rem;color:var(--text-dim)">总检测</div></div>
          <div style="background:#060a14;border-radius:8px;padding:8px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--success)" id="avgTime">0s</div><div style="font-size:0.7rem;color:var(--text-dim)">平均时长</div></div>
          <div style="background:#060a14;border-radius:8px;padding:8px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--warning)" id="timeoutRate">0%</div><div style="font-size:0.7rem;color:var(--text-dim)">超时率</div></div>
          <div style="background:#060a14;border-radius:8px;padding:8px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--text)" id="todayCount">0</div><div style="font-size:0.7rem;color:var(--text-dim)">今日检测</div></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 200px)">
          <table>
            <thead><tr><th>时间</th><th>产品</th><th>kV</th><th>mA</th><th>时长</th><th>结果</th></tr></thead>
            <tbody id="recordTable"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

function initXRay() {
  // 绑定滑块
  ['kvSlider','maSlider','expTimeSlider'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', syncXRaySliders);
  });
  // 绑定分隔条
  initSplitResizer('xrayResizer', 'xrayLeft', 360, 260);
  syncXRaySliders();
  generateFilm();
  updateRecordTable();
  addXRayLog('智能拍片系统就绪');
}

function syncXRaySliders() {
  const kv = parseFloat(document.getElementById('kvSlider')?.value || 70);
  const ma = parseFloat(document.getElementById('maSlider')?.value || 3);
  const time = parseFloat(document.getElementById('expTimeSlider')?.value || 60);
  document.getElementById('setKvp').textContent = kv;
  document.getElementById('setMa').textContent = ma.toFixed(1);
  document.getElementById('setTime').textContent = time;
  document.getElementById('kvActualDisp').textContent = kv.toFixed(1);
  document.getElementById('maActualDisp').textContent = ma.toFixed(2);
  document.getElementById('expTimeVal').textContent = time;
  document.getElementById('actKvp').textContent = (kv + (Math.random()-0.5)*1.2).toFixed(1);
  document.getElementById('actMa').textContent = (ma + (Math.random()-0.5)*0.1).toFixed(2);
}

function applySmartParams() {
  const prod = document.getElementById('productType')?.value || '涡轮叶片';
  const params = {
    '涡轮叶片': { kv: 95, ma: 4.2, time: 120 },
    '铝合金铸件': { kv: 80, ma: 3.5, time: 70 },
    '焊接管道': { kv: 100, ma: 5.0, time: 150 },
    'PCB组件': { kv: 55, ma: 2.0, time: 45 }
  };
  const p = params[prod] || params['涡轮叶片'];
  document.getElementById('kvSlider').value = p.kv;
  document.getElementById('maSlider').value = p.ma;
  document.getElementById('expTimeSlider').value = p.time;
  syncXRaySliders();
  addXRayLog(`智能参数: ${prod} ${p.kv}kV/${p.ma}mA/${p.time}s`);
}

function placeFilm() {
  if (isExposing) return;
  filmPlaced = true;
  document.getElementById('filmStatus').textContent = '已放置';
  addXRayLog('胶片已放置');
}

function toggleNegative() {
  negativeMode = !negativeMode;
  if (negativeMode && originalImageData) {
    const canvas = document.getElementById('filmCanvas');
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, 280, 280);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 255 - img.data[i];
      img.data[i+1] = 255 - img.data[i+1];
      img.data[i+2] = 255 - img.data[i+2];
    }
    ctx.putImageData(img, 0, 0);
  } else {
    generateFilm();
  }
  addXRayLog(`正负片: ${negativeMode ? '负片' : '正片'}`);
}

function generateFilm(storeOriginal = true) {
  const canvas = document.getElementById('filmCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 280;
  ctx.fillStyle = '#03161f';
  ctx.fillRect(0, 0, size, size);

  const prod = document.getElementById('productType')?.value || '涡轮叶片';
  const kv = parseFloat(document.getElementById('kvSlider')?.value || 70);
  const ma = parseFloat(document.getElementById('maSlider')?.value || 3);
  const time = parseFloat(document.getElementById('expTimeSlider')?.value || 60);

  ctx.fillStyle = '#215d70';
  if (prod === '涡轮叶片') {
    ctx.beginPath(); ctx.moveTo(140, 50); ctx.lineTo(190, 100); ctx.lineTo(175, 210); ctx.lineTo(105, 210); ctx.lineTo(90, 100); ctx.fill();
    for (let i = 0; i < 5; i++) ctx.fillRect(95 + i * 14, 130, 5, 35);
  } else if (prod === '铝合金铸件') {
    ctx.beginPath(); ctx.ellipse(140, 140, 70, 60, 0, 0, 2*Math.PI); ctx.fill();
    for (let i = 0; i < 6; i++) ctx.fillRect(70 + i * 22, 120, 5, 25);
  } else if (prod === '焊接管道') {
    ctx.fillRect(40, 100, 200, 60); ctx.fillStyle = '#ffcf8a';
    ctx.fillRect(75, 125, 130, 18);
  } else {
    ctx.fillRect(50, 88, 180, 100);
    for (let i = 0; i < 10; i++) ctx.fillRect(70 + i * 13, 130 + (i%3)*7, 4, 22);
  }
  ctx.fillStyle = '#ffbb77';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(80 + Math.random()*160, 70 + Math.random()*170, 3+Math.random()*5, 0, 2*Math.PI); ctx.fill();
  }
  let brightness = 0.5 + (ma * time / 150);
  let noise = (kv - 40) / 100 * 40;
  let imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    let gray = 0.3 * imgData.data[i] + 0.59 * imgData.data[i+1] + 0.11 * imgData.data[i+2];
    gray = gray * brightness + (Math.random()-0.5) * noise;
    let v = Math.min(245, Math.max(15, gray));
    imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  if (storeOriginal) originalImageData = ctx.getImageData(0, 0, size, size);
  ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#aaf0ff';
  ctx.fillText(`${prod} ${kv}kV ${ma}mA ${time}s`, 8, 18);
  filmDataCache = ctx.getImageData(0, 0, size, size);
}

function startExposure() {
  if (isExposing) return;
  if (!filmPlaced) { addXRayLog('❌ 胶片未放置'); return; }
  syncXRaySliders();
  const time = parseFloat(document.getElementById('expTimeSlider')?.value || 60);
  addXRayLog(`曝光开始`);
  isExposing = true;
  let remaining = time;
  const box = document.getElementById('countdownBox');
  box.textContent = remaining.toFixed(1) + ' s';
  const interval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(interval);
      box.textContent = '✅ 成像完成';
      generateFilm(true);
      const prod = document.getElementById('productType')?.value || '未知';
      const kv = document.getElementById('kvSlider')?.value || 70;
      const ma = document.getElementById('maSlider')?.value || 3;
      inspectionRecords.unshift({
        timestamp: new Date().toLocaleString(),
        product: prod,
        kv, ma,
        duration: time,
        isTimeout: time > 120
      });
      totalInspections++;
      const today = new Date().toDateString();
      todayInspections++;
      updateRecordTable();
      updateMainStats();
      filmPlaced = false;
      document.getElementById('filmStatus').textContent = '未放置';
      isExposing = false;
      addXRayLog('曝光完成');
    } else {
      box.textContent = remaining.toFixed(1) + ' s';
    }
  }, 1000);
}

function updateRecordTable() {
  const tbody = document.getElementById('recordTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  let total = 0, sumDur = 0, timeout = 0;
  inspectionRecords.forEach(r => {
    let row = tbody.insertRow();
    row.insertCell(0).textContent = r.timestamp;
    row.insertCell(1).textContent = r.product;
    row.insertCell(2).textContent = r.kv || '-';
    row.insertCell(3).textContent = r.ma || '-';
    row.insertCell(4).textContent = r.duration + 's';
    row.insertCell(5).innerHTML = r.isTimeout ? '<span style="color:var(--warning)">超时</span>' : '<span style="color:var(--success)">正常</span>';
    total++;
    sumDur += r.duration;
    if (r.isTimeout) timeout++;
  });
  ['totalCount','avgTime','timeoutRate','todayCount'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'totalCount') el.textContent = total;
    else if (id === 'avgTime') el.textContent = total ? (sumDur/total).toFixed(1) + 's' : '0s';
    else if (id === 'timeoutRate') el.textContent = total ? ((timeout/total)*100).toFixed(1) + '%' : '0%';
    else if (id === 'todayCount') el.textContent = todayInspections;
  });
}

function updateMainStats() {
  document.getElementById('totalInspections').textContent = totalInspections;
  document.getElementById('todayInspections').textContent = todayInspections;
}

function addXRayLog(msg) {
  const logDiv = document.getElementById('xrayLog');
  if (!logDiv) return;
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML = `[${time}] ${msg}<br>` + logDiv.innerHTML;
  if (logDiv.children.length > 6) logDiv.removeChild(logDiv.lastChild);
}

// ============ 2. 智能补片 ============
function renderPatch() {
  return `
  <div class="split-panel">
    <div class="split-left" id="patchLeft" style="width:340px">
      <div class="sub-card">
        <div class="card-title">🔍 缺陷检测结果</div>
        <div class="grid-2 mb-8">
          <div style="background:#060a14;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:1.3rem;font-weight:700;color:var(--danger)">3</div>
            <div style="font-size:0.7rem;color:var(--text-dim)"> detected</div>
          </div>
          <div style="background:#060a14;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:1.3rem;font-weight:700;color:var(--warning)">2</div>
            <div style="font-size:0.7rem;color:var(--text-dim)">可疑区域</div>
          </div>
        </div>
        <div style="background:#060a14;border-radius:8px;padding:8px;margin-bottom:8px">
          <div class="param-row"><span>#1 气孔</span><span style="color:var(--danger)">直径 2.4mm</span></div>
          <div class="param-row"><span>#2 裂纹</span><span style="color:var(--danger)">长度 8.7mm</span></div>
          <div class="param-row"><span>#3 夹杂物</span><span style="color:var(--warning)">面积 3.2mm²</span></div>
        </div>
      </div>
      <div class="sub-card">
        <div class="card-title">🛠️ 修补方案</div>
        <div class="param-row"><span>修补方式</span><select><option>激光熔覆</option><option>氩弧焊</option><option>胶接填补</option></select></div>
        <div class="param-row"><span>填充材料</span><select><option>Inconel 625</option><option>不锈钢316L</option><option>铝合金5356</option></select></div>
        <div class="param-row"><span>激光功率</span><input type="range" min="500" max="3000" value="1500" step="50"><span>1500W</span></div>
        <div class="param-row"><span>送粉速率</span><input type="range" min="1" max="10" value="4" step="0.5"><span>4.0 g/min</span></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary" style="flex:1" onclick="addXRayLog('修补路径已生成')">生成路径</button>
          <button class="btn btn-danger" style="flex:1" onclick="addXRayLog('开始修补')">▶ 执行修补</button>
        </div>
      </div>
      <div class="sub-card">
        <div class="card-title">📊 补后检测</div>
        <div class="param-row"><span>补后厚度</span><span>3.2 mm (目标 3.0)</span></div>
        <div class="param-row"><span>表面粗糙度</span><span>Ra 1.6 μm</span></div>
        <div class="param-row"><span>补后探伤</span><span class="tag success">合格</span></div>
        <button class="btn btn-default" style="width:100%;margin-top:6px" onclick="addXRayLog('补后检测完成')">执行补后检测</button>
      </div>
    </div>
    <div class="split-resizer" id="patchResizer"></div>
    <div class="split-right">
      <div class="sub-card" style="flex:1;display:flex;flex-direction:column">
        <div class="card-title">🔬 缺陷可视化</div>
        <div style="flex:1;background:#060a14;border-radius:8px;display:flex;align-items:center;justify-content:center;min-height:400px;color:var(--text-dim);font-size:2rem;position:relative">
          <canvas id="patchCanvas" width="600" height="400" style="border-radius:8px;width:100%;height:auto"></canvas>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-sm btn-default">放大</button>
          <button class="btn btn-sm btn-default">缩小</button>
          <button class="btn btn-sm btn-default">原始尺寸</button>
          <button class="btn btn-sm btn-primary">导出报告</button>
        </div>
      </div>
    </div>
  </div>`;
}

function initPatch() {
  initSplitResizer('patchResizer', 'patchLeft', 340, 260);
  const canvas = document.getElementById('patchCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#03161f';
    ctx.fillRect(0, 0, 600, 400);
    // 画工件轮廓
    ctx.strokeStyle = '#2a6f8f';
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 60, 440, 280);
    ctx.fillStyle = '#0a1a28';
    ctx.fillRect(90, 70, 420, 260);
    // 画缺陷
    ctx.fillStyle = '#ff3b3080';
    ctx.beginPath(); ctx.arc(200, 160, 18, 0, 2*Math.PI); ctx.fill();
    ctx.fillStyle = '#ff3b3060';
    ctx.beginPath(); ctx.ellipse(350, 200, 30, 6, 0.3, 0, 2*Math.PI); ctx.fill();
    ctx.fillStyle = '#ff950080';
    ctx.beginPath(); ctx.arc(420, 130, 12, 0, 2*Math.PI); ctx.fill();
    // 标注
    ctx.fillStyle = '#ff3b30';
    ctx.font = '12px sans-serif';
    ctx.fillText('气孔 2.4mm', 160, 130);
    ctx.fillStyle = '#ff3b30';
    ctx.fillText('裂纹 8.7mm', 350, 180);
    ctx.fillStyle = '#ff9500';
    ctx.fillText('夹杂 3.2mm²', 400, 115);
    // 网格
    ctx.strokeStyle = '#ffffff10';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < 600; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 400); ctx.stroke(); }
    for (let y = 0; y < 400; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke(); }
  }
  addXRayLog('智能补片系统就绪');
}

// ============ 3. 示教产品 ============
function renderTeach() {
  return `
  <div class="split-panel">
    <div class="split-left" id="teachLeft" style="width:360px">
      <div class="sub-card">
        <div class="card-title">📐 示教点位库</div>
        <div id="teachPointList" style="max-height:160px;overflow-y:auto">
          ${savedPoints.length === 0 ? '<div style="color:var(--text-dim);padding:8px;font-size:0.8rem">暂无数点位，请添加</div>' : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary" style="flex:1" onclick="teachAddPoint()">➕ 记录点位</button>
          <button class="btn btn-default" onclick="addXRayLog('点位已清空');savedPoints=[];renderTeachPoints()">清空</button>
        </div>
      </div>
      <div class="sub-card">
        <div class="card-title">🤖 六轴机器人控制</div>
        <div class="param-row"><span>J1</span><input type="range" id="tj1" min="-180" max="180" value="0"><span id="tj1v">0°</span></div>
        <div class="param-row"><span>J2</span><input type="range" id="tj2" min="-90" max="90" value="0"><span id="tj2v">0°</span></div>
        <div class="param-row"><span>J3</span><input type="range" id="tj3" min="-90" max="90" value="0"><span id="tj3v">0°</span></div>
        <div class="param-row"><span>J4</span><input type="range" id="tj4" min="-180" max="180" value="0"><span id="tj4v">0°</span></div>
        <div class="param-row"><span>J5</span><input type="range" id="tj5" min="-90" max="90" value="0"><span id="tj5v">0°</span></div>
        <div class="param-row"><span>J6</span><input type="range" id="tj6" min="-180" max="180" value="0"><span id="tj6v">0°</span></div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-default" onclick="teachResetPose()">⟳ 复位</button>
          <button class="btn btn-default" onclick="addXRayLog('干涉验证: 无碰撞')">⚠️ 干涉验证</button>
          <button class="btn btn-primary" onclick="addXRayLog('覆盖率: '+(85+Math.random()*10).toFixed(1)+'%')">📊 覆盖率</button>
        </div>
      </div>
      <div class="sub-card">
        <div class="card-title">📝 离线编程</div>
        <div class="param-row"><span>程序名称</span><input id="progName" value="默认程序"></div>
        <div id="progPointList" style="max-height:100px;overflow-y:auto"></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-sm btn-default" onclick="teachAddToProg()">添加到程序</button>
          <button class="btn btn-sm btn-default" onclick="addXRayLog('程序已保存')">💾 保存</button>
          <button class="btn btn-sm btn-danger" onclick="teachRunProg()">▶ 执行</button>
        </div>
      </div>
      <div class="sub-card" style="height:80px">
        <div class="card-title">📋 日志</div>
        <div class="log-area" id="teachLog">[系统] 示教模块就绪</div>
      </div>
    </div>
    <div class="split-resizer" id="teachResizer"></div>
    <div class="split-right">
      <div class="sub-card" style="flex:1;display:flex;flex-direction:column">
        <div class="card-title">🎯 3D 示教视图</div>
        <div style="flex:1;background:#060a14;border-radius:8px;display:flex;align-items:center;justify-content:center;min-height:400px;position:relative">
          <canvas id="teachCanvas" width="600" height="450" style="border-radius:8px;width:100%;height:auto"></canvas>
        </div>
        <div class="param-row" style="margin-top:6px">
          <span>末端坐标: <span id="endPos">0.0, 0.0, 0.0</span></span>
          <span>姿态: <span id="endRot">0°, 0°, 0°</span></span>
        </div>
      </div>
    </div>
  </div>`;
}

let teachAngles = [0,0,0,0,0,0];

function initTeach() {
  initSplitResizer('teachResizer', 'teachLeft', 360, 280);
  // 绑定关节滑块
  ['tj1','tj2','tj3','tj4','tj5','tj6'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      teachAngles[i] = parseFloat(el.value);
      document.getElementById(id+'v').textContent = teachAngles[i] + '°';
      updateTeachCanvas();
    });
  });
  renderTeachPoints();
  renderProgPoints();
  updateTeachCanvas();
  addTeachLog('示教模块就绪');
}

function teachAddPoint() {
  const idx = savedPoints.length + 1;
  savedPoints.push({
    name: `P${idx}`,
    angles: [...teachAngles],
    kv: document.getElementById('kvSlider')?.value || 70,
    ma: document.getElementById('maSlider')?.value || 3,
    time: document.getElementById('expTimeSlider')?.value || 60
  });
  renderTeachPoints();
  addTeachLog(`示教点位 P${idx} 已保存`);
}

function renderTeachPoints() {
  const div = document.getElementById('teachPointList');
  if (!div) return;
  if (savedPoints.length === 0) {
    div.innerHTML = '<div style="color:var(--text-dim);padding:8px;font-size:0.8rem">暂无示教点位</div>';
    return;
  }
  div.innerHTML = savedPoints.map((pt, i) => `
    <div class="param-row" style="cursor:pointer;padding:2px 4px;border-radius:4px" onclick="teachLoadPoint(${i})" onmouseover="this.style.background='#0a1520'" onmouseout="this.style.background=''">
      <span>📍 ${pt.name}</span>
      <span style="color:var(--text-dim)">${pt.angles.map(a=>a+'°').join(' ')}</span>
    </div>
  `).join('');
}

function teachLoadPoint(idx) {
  const pt = savedPoints[idx];
  if (!pt) return;
  teachAngles = [...pt.angles];
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`tj${i+1}`);
    if (el) { el.value = teachAngles[i]; document.getElementById(`tj${i+1}v`).textContent = teachAngles[i] + '°'; }
  }
  updateTeachCanvas();
  addTeachLog(`加载点位 ${pt.name}`);
}

function teachResetPose() {
  teachAngles = [0,0,0,0,0,0];
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`tj${i+1}`);
    if (el) { el.value = 0; document.getElementById(`tj${i+1}v`).textContent = '0°'; }
  }
  updateTeachCanvas();
  addTeachLog('机器人复位');
}

function teachAddToProg() {
  if (savedPoints.length === 0) return;
  currentProgram.push(savedPoints.length - 1);
  renderProgPoints();
  addTeachLog('点位已添加到程序');
}

function renderProgPoints() {
  const div = document.getElementById('progPointList');
  if (!div) return;
  if (currentProgram.length === 0) {
    div.innerHTML = '<div style="color:var(--text-dim);padding:4px;font-size:0.75rem">程序为空</div>';
    return;
  }
  div.innerHTML = currentProgram.map((idx, i) => {
    const pt = savedPoints[idx];
    return `<div class="param-row" style="font-size:0.75rem"><span>${i+1}. ${pt?.name || '?'}</span><span style="color:var(--text-dim)">${pt?.kv || '?'}kV</span></div>`;
  }).join('');
}

async function teachRunProg() {
  if (currentProgram.length === 0) { addTeachLog('程序为空'); return; }
  addTeachLog('执行程序...');
  for (let i = 0; i < currentProgram.length; i++) {
    const pt = savedPoints[currentProgram[i]];
    if (!pt) continue;
    teachAngles = [...pt.angles];
    for (let j = 0; j < 6; j++) {
      const el = document.getElementById(`tj${j+1}`);
      if (el) { el.value = teachAngles[j]; document.getElementById(`tj${j+1}v`).textContent = teachAngles[j] + '°'; }
    }
    updateTeachCanvas();
    addTeachLog(`执行点位 ${pt.name}`);
    await new Promise(r => setTimeout(r, 500));
  }
  addTeachLog('程序执行完毕');
}

function updateTeachCanvas() {
  const canvas = document.getElementById('teachCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = 600, h = 450;
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, w, h);

  // 画地面网格
  ctx.strokeStyle = '#1a2a3e';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // 计算机器人位置（简化的2D投影）
  const cx = 300, cy = 350;
  const angles = teachAngles.map(a => a * Math.PI / 180);
  const lengths = [60, 50, 40, 30, 25, 20];

  ctx.save();
  ctx.translate(cx, cy);

  // 底座
  ctx.fillStyle = '#4a7a9c';
  ctx.fillRect(-25, -10, 50, 20);

  // 关节臂（简化连杆）
  let x = 0, y = 0, angle = 0;
  const colors = ['#88aacc', '#cc6644', '#dd8855', '#dd9955', '#ffaa77', '#ff8844'];

  for (let i = 0; i < 6; i++) {
    angle += angles[i];
    const ex = x + Math.cos(angle) * lengths[i];
    const ey = y - Math.sin(angle) * lengths[i];

    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 8 - i;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // 关节球
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();

    x = ex; y = ey;
  }

  // 末端工具
  ctx.fillStyle = '#ff8844';
  ctx.shadowColor = '#ff8844';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // 显示坐标
  const endX = ((x + cx) / w * 100).toFixed(1);
  const endY = ((cy - y) / h * 100).toFixed(1);
  document.getElementById('endPos').textContent = `${endX}, ${endY}, 0.0`;
  document.getElementById('endRot').textContent = `${teachAngles[3].toFixed(0)}°, ${teachAngles[4].toFixed(0)}°, ${teachAngles[5].toFixed(0)}°`;
}

function addTeachLog(msg) {
  const logDiv = document.getElementById('teachLog');
  if (!logDiv) return;
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML = `[${time}] ${msg}<br>` + logDiv.innerHTML;
  if (logDiv.children.length > 6) logDiv.removeChild(logDiv.lastChild);
}

// ============ 4. 系统设置 ============
function renderSysSettings() {
  return `
  <div style="padding:20px;overflow-y:auto;width:100%">
    <div style="max-width:700px">
      <div class="sub-card mb-8">
        <div class="card-title">🏭 设备配置</div>
        <div class="param-row"><span>设备编号</span><input value="DR-X200-001"></div>
        <div class="param-row"><span>设备名称</span><input value="数字化X射线检测系统"></div>
        <div class="param-row"><span>X射线管型号</span><select><option>COMET MXR-225</option><option>YXLON Y.TU 225-D03</option><option>GE Seifert 225</option></select></div>
        <div class="param-row"><span>最大管电压</span><input value="225 kV" readonly></div>
        <div class="param-row"><span>最大管电流</span><input value="8.0 mA" readonly></div>
      </div>
      <div class="sub-card mb-8">
        <div class="card-title">🤖 机器人配置</div>
        <div class="param-row"><span>机器人型号</span><select><option>ABB IRB 6700</option><option>KUKA KR 210</option><option>FANUC M-20iA</option></select></div>
        <div class="param-row"><span>工具坐标系</span><input value="Tool0"></div>
        <div class="param-row"><span>工作速度(%)</span><input type="range" min="10" max="100" value="80"><span>80%</span></div>
        <div class="param-row"><span>安全距离(mm)</span><input type="number" value="50"></div>
      </div>
      <div class="sub-card mb-8">
        <div class="card-title">🔧 检测参数</div>
        <div class="param-row"><span>默认曝光时间(s)</span><input type="number" value="60"></div>
        <div class="param-row"><span>超时阈值(s)</span><input type="number" value="120"></div>
        <div class="param-row"><span>AI辅助诊断</span><select><option>启用</option><option>禁用</option></select></div>
        <div class="param-row"><span>自动保存胶片</span><select><option>是</option><option>否</option></select></div>
      </div>
      <div class="sub-card mb-8">
        <div class="card-title">👤 用户管理</div>
        <div class="param-row"><span>当前用户</span><input value="管理员"></div>
        <div class="param-row"><span>角色</span><select><option>管理员</option><option>工程师</option><option>操作员</option></select></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary">保存设置</button>
          <button class="btn btn-default">恢复默认</button>
          <button class="btn btn-default">导出配置</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ===== 分隔条拖拽（通用） =====
function initSplitResizer(resizerId, leftPanelId, defaultWidth, minWidth) {
  const resizer = document.getElementById(resizerId);
  const leftPanel = document.getElementById(leftPanelId);
  if (!resizer || !leftPanel) return;

  let startX, startWidth;
  const onMouseDown = (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const newWidth = Math.max(minWidth, startWidth + dx);
    const maxWidth = window.innerWidth - 300;
    leftPanel.style.width = Math.min(maxWidth, newWidth) + 'px';
  };
  const onMouseUp = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  resizer.addEventListener('mousedown', onMouseDown);
}

// ===== 弹窗 =====
function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modalOverlay').classList.remove('show');
}

// ===== 时钟 =====
function updateClock() {
  const el = document.getElementById('mainTime');
  if (el) el.textContent = new Date().toLocaleString('zh-CN', { hour12: false });
}
setInterval(updateClock, 1000);

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  updateMainStats();
});
