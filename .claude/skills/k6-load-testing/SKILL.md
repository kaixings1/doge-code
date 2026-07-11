---
name: k6 负载测试
description: "用于 API、浏览器和可扩展性测试的全面 k6 负载测试技能。"
category: testing
risk: safe
source: community
date_added: "2026-03-13"
author: Kairo Official
---
# k6 负载测试
## 概述

k6 是一个现代、以开发者为中心的负载测试工具，使用 JavaScript 编写测试脚本。
k6 是一个现代、以开发者为中心的负载测试工具。
## 核心概念

### 1. k6 测试脚本

使用 JavaScript 编写，包含一个默认函数，定义每个虚拟用户的执行逻辑。

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const res = http.get('https://api.example.com/health');
  check(res, {
    '状态码为 200': (r) => r.status === 200,
    '响应时间 < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

### 2. 测试场景类型

| 场景类型 | 描述 | 适用场景 |
|---------|------|---------|
| 负载测试 | 模拟预期正常负载 | 验证系统在正常流量下表现 |
| 压力测试 | 逐渐增加负载到极限 | 找到系统瓶颈和崩溃点 |
| 峰值测试 | 模拟突发流量 | 验证系统处理流量尖峰能力 |
| 浸泡测试 | 长时间稳定负载 | 检测内存泄漏和资源退化 |

### 3. 选项配置

```javascript
export const options = {
  scenarios: {
    normal_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
    stress_rampup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
```

### 4. 检查点与阈值

```javascript
// 检查：断言验证
check(response, {
  '状态码正确': (r) => r.status === 200,
  '响应时间可接受': (r) => r.timings.duration < 1000,
  '返回数据有效': (r) => JSON.parse(r.body).success === true,
});

// 阈值：全局性能要求
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    group_dgoods: ['p(95)<2000'],
  },
};
```

### 5. 自定义指标

```javascript
import { Counter, Gauge, Trend, Rate } from 'k6/metrics';

// 自定义指标
export const myCounter = new Counter('custom_counter');
export const myGauge = new Gauge('custom_gauge');
export const myTrend = new Trend('custom_trend');
export const myRate = new Rate('custom_rate');

export default function () {
  myCounter.add(1);
  myGauge.set(Math.random() * 100);
  myTrend.add(response.timings.duration);
  myRate.add(response.status === 200 ? 1 : 0);
}
```

### 6. 场景辅助函数

```javascript
// setup：测试前执行一次
export function setup() {
  const res = http.post('https://api.example.com/auth', {
    username: 'test', password: 'test'
  });
  return { token: res.json().token };
}

// teardown：测试后清理
export function teardown(data) {
  http.post('https://api.example.com/logout', null, {
    headers: { Authorization: `Bearer ${data.token}` }
  });
}

// 使用 setup 数据
export default function (data) {
  http.get('https://api.example.com/protected', {
    headers: { Authorization: `Bearer ${data.token}` }
  });
}
```

### 7. 测试数据管理

```javascript
// 使用 CSV 数据
import { SharedArray } from 'k6/data';
const users = new SharedArray('users', () => JSON.parse(open('./users.json')));

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];
  http.post('https://api.example.com/login', user);
}
```

### 8. CI/CD 集成

```bash
# GitHub Actions 示例
- name: Run k6 test
  uses: grafana/k6-action@v0.3.0
  with:
    filename: tests/api-test.js

# 或使用 Docker
docker run -i grafana/k6 run - < tests/api-test.js
```

### 9. 浏览器测试

k6 支持基于 Chromium 的浏览器测试：

```javascript
import { browser } from 'k6/experimental/browser';

export const options = {
  scenarios: {
    browser: {
      executor: 'shared-iterations',
      iterations: 10,
    },
  },
};

export default async function () {
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.click('#login-btn');
  await page.waitForSelector('.dashboard');
}
```

### 10. 结果分析

```bash
# 输出 JSON 结果
k6 run --out json=results.json tests/api-test.js

# 输出 InfluxDB（配合 Grafana 可视化）
k6 run --out influxdb=http://localhost:8086/k6 tests/api-test.js

# HTML 报告
k6 run tests/api-test.js
# 使用 k6-reporter 生成 HTML 报告
```

常见指标解读：
- `http_req_duration`：请求响应时间分布
- `http_req_failed`：失败请求比例
- `vus`：当前活跃虚拟用户数
- `iterations`：已完成迭代次数

## 限制

- 浏览器测试处于实验阶段，API 可能变化
- 大规模测试（10k+ VUs）需要分布式执行
- 仅支持 WebSocket 的简化版本
- 需要 JavaScript/TypeScript 知识编写测试脚本
