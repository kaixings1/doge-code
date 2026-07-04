---
name: alpha-vantage
description: "访问 20+ 年的全球金融数据：股票、期权、外汇、加密货币、大宗商品、经济指标和 50+ 技术指标。"
risk: unknown
source: community
metadata:
    skill-author: K-Dense Inc.
---

# Alpha Vantage — 金融市场数据

Access 20+ years of global financial data: equities, options, forex, crypto, commodities, economic indicators, and 50+ technical indicators.

## API Key Setup (Required)

1. Get a free key at https://www.alphavantage.co/support/#api-key (premium plans available for higher rate limits)
2. Set as environment variable:

```bash
export ALPHAVANTAGE_API_KEY="your_key_here"
```

## 安装

```bash
uv pip install requests pandas
```

## Base URL & Request Pattern

All requests go to:

```
https://www.alphavantage.co/query?function=FUNCTION_NAME&apikey=YOUR_KEY&...params
```

```python
import requests
import os

API_KEY = os.environ.get("ALPHAVANTAGE_API_KEY")
BASE_URL = "https://www.alphavantage.co/query"

def av_get(function, **params):
    response = requests.get(BASE_URL, params={"function": function, "apikey": API_KEY, **params})
    return response.json()
```

## Quick Start Examples

```python
# Stock quote (latest price)
quote = av_get("GLOBAL_QUOTE", symbol="AAPL")
price = quote["Global Quote"]["05. price"]

# Daily OHLCV
daily = av_get("TIME_SERIES_DAILY", symbol="AAPL", outputsize="compact")
ts = daily["Time Series (Daily)"]

# Company fundamentals
overview = av_get("OVERVIEW", symbol="AAPL")
print(overview["MarketCapitalization"], overview["PERatio"])

# Income statement
income = av_get("INCOME_STATEMENT", symbol="AAPL")
annual = income["annualReports"][0]  # Most recent annual

# Crypto price
crypto = av_get("DIGITAL_CURRENCY_DAILY", symbol="BTC", market="USD")

# Economic indicator
gdp = av_get("REAL_GDP", interval="annual")

# Technical indicator
rsi = av_get("RSI", symbol="AAPL", interval="daily", time_period=14, series_type="close")
```

## API Categories

| Category | Key Functions |