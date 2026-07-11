---
name: 巴西 27 个州商业委员会拍卖师官方数据查询、导出与 REST API 服务工具。
description: "巴西 27 个州商业委员会拍卖师官方数据查询、导出与 REST API 服务工具。"
risk: safe
source: community
date_added: "2026-03-06"
author: renat
---
# 技能：巴西商业委员会拍卖师

## 概述

收集和查询巴西所有 27 个商业委员会的官方拍卖师数据。

## 何时使用此技能

- 用户提到拍卖师或商业委员会相关主题时
- 需要查询巴西拍卖师执业资质时
- 需要批量导出拍卖师数据时

## 目录结构

```
junta-leiloeiros/
├── src/
│   ├── scraper.py       # 爬虫：从各州商业委员会抓取数据
│   ├── api.py           # REST API 服务
│   ├── models.py        # 数据模型
│   └── utils.py         # 工具函数
├── data/
│   ├── raw/             # 原始 HTML/JSON
│   └── processed/       # 清洗后的数据
├── tests/
├── requirements.txt
└── README.md
```

## 安装

```bash
# 克隆或进入技能目录
cd .claude/skills/junta-leiloeiros

# 安装依赖
pip install -r requirements.txt

# 依赖示例：
# requests, beautifulsoup4, flask/fastapi, pandas
```

## 收集数据

### 自动爬取

按州逐个抓取商业委员会网站的拍卖师数据：

```python
from src.scraper import JuntaScraper

scraper = JuntaScraper()
# 抓取单个州
data = scraper.scrape_state('SP')
# 批量抓取所有州
all_data = scraper.scrape_all()
```

### 数据字段

每个拍卖师记录包含：

| 字段 | 说明 |
|------|------|
| nome | 姓名 |
| registro | 执业编号 |
| estado | 所在州 |
| cidade | 城市 |
| telefone | 联系电话 |
| email | 电子邮箱 |
| status | 执业状态（有效/暂停/注销） |
| data_registro | 注册日期 |

## 提供 REST API

启动本地 API 服务：

```bash
python src/api.py
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/leiloeiros | 列出所有拍卖师 |
| GET | /api/leiloeiros/:id | 获取单个拍卖师详情 |
| GET | /api/leiloeiros?estado=SP | 按州筛选 |
| GET | /api/leiloeiros?cidade=Sao+Paulo | 按城市筛选 |
| GET | /api/estados | 列出所有州 |
| GET | /api/stats | 统计数据 |

### 使用示例

```bash
# 搜索圣保罗州拍卖师
curl "http://localhost:8000/api/leiloeiros?estado=SP"

# 按姓名搜索
curl "http://localhost:8000/api/leiloeiros?nome=Silva"
```

## 导出数据

支持多种格式导出：

```python
from src.utils import export

# 导出为 CSV
export.to_csv(all_data, 'leiloeiros.csv')

# 导出为 JSON
export.to_json(all_data, 'leiloeiros.json')

# 导出为 Excel
export.to_excel(all_data, 'leiloeiros.xlsx')
```

## 在 Python 代码中使用

```python
from junta_leiloeiros import JuntaClient

client = JuntaClient()

# 查询拍卖师
leiloeiro = client.get_by_registro('SP-12345')

# 按州搜索
results = client.search(estado='RJ', cidade='Rio de Janeiro')

# 遍历所有拍卖师
for leiloeiro in client.all():
    print(leiloeiro.nome, leiloeiro.cidade)
```

## 添加自定义爬虫

如果需要补充某个州的数据源或修复解析逻辑：

```python
# src/scraper.py 中添加新州
STATES_SCRAPERS = {
    'SP': SpScraper,
    'RJ': RjScraper,
    'MG': MgScraper,
    # 添加新州
    'XX': CustomScraper,
}
```

每个 Scraper 需实现：

```python
class CustomScraper(BaseScraper):
    def scrape(self) -> list[dict]:
        # 返回拍卖师数据列表
        pass

    def validate(self, data: dict) -> bool:
        # 验证数据完整性
        pass
```

## 最佳实践

- 遵守各州网站的 robots.txt 和抓取频率限制
- 数据抓取间隔至少 2 秒，避免被封 IP
- 定期更新数据（建议每月一次）
- 敏感信息（如电话号码）脱敏存储
- 提供数据来源和抓取时间戳

## 限制

- 数据来源于公开网页，不保证实时性和完整性
- 各州网站结构不同，维护成本较高
- 部分州可能无反爬机制，需要代理
- 不提供法律咨询，数据仅供参考
