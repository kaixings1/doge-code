// ============================================================================
// Stock Command - API Layer
// 东方财富/新浪财经/腾讯财经 数据接口封装
// ============================================================================
import { getSecid, retry, getCache, setCache } from './utils.js';
// ============================================================================
// 基础 HTTP 请求封装
// ============================================================================
/**
 * 带超时和重试的 fetch 请求
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * 获取 JSON 数据（带缓存）
 */
async function fetchJSON(url, cacheKey, cacheTtl = 30000) {
    if (cacheKey) {
        const cached = getCache(cacheKey);
        if (cached)
            return cached;
    }
    const data = await retry(async () => {
        const res = await fetchWithTimeout(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
    }, 3, 1000);
    if (cacheKey)
        setCache(cacheKey, data, cacheTtl);
    return data;
}
/**
 * 获取文本数据
 */
async function fetchText(url) {
    return retry(async () => {
        const res = await fetchWithTimeout(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        return res.text();
    }, 3, 1000);
}
// ============================================================================
// 实时行情
// ============================================================================
/**
 * 获取实时行情（东方财富）
 * @param code 股票代码（如 600519）
 */
export async function getRealtimeQuote(code) {
    const secid = getSecid(code);
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f52,f57,f58,f60,f62,f115,f116,f117,f168,f169,f170,f171,f177,f183,f184,f185,f186,f187,f188,f189,f190,f191,f192&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `quote_${code}`, 10000);
    if (!data.data) {
        throw new Error(`未找到股票 ${code} 的行情数据`);
    }
    const d = data.data;
    const price = d.f43 / 1000;
    const prevClose = d.f60 / 1000;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return {
        code,
        name: d.f58 || code,
        price,
        change,
        changePercent,
        high: d.f44 / 1000,
        low: d.f45 / 1000,
        open: d.f46 / 1000,
        prevClose,
        volume: d.f47 / 10000, // 转换为万手
        amount: d.f48 / 100000000, // 转换为亿
        turnoverRate: d.f168 / 100,
        pe: d.f115 / 100,
        pb: d.f169 / 100,
        marketCap: d.f116 / 100000000, // 转换为亿
        totalShares: d.f116 / price / 100000000, // 总股本（亿股）
        floatShares: d.f117 / price / 100000000, // 流通股本（亿股）
        high52w: d.f170 / 1000,
        low52w: d.f171 / 1000,
        amplitude: price !== 0 ? ((price - prevClose) / prevClose) * 100 : 0,
        volumeRatio: d.f50 / 100,
        timestamp: new Date().toISOString(),
    };
}
/**
 * 批量获取实时行情
 * @param codes 股票代码数组
 */
export async function getBatchQuotes(codes) {
    const results = [];
    // 东方财富支持批量查询，用逗号分隔 secid
    const secids = codes.map(code => getSecid(code)).join(',');
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18&secids=${secids}&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url);
    if (data.data?.diff) {
        for (const item of data.data.diff) {
            const price = item.f2 / 100;
            const prevClose = item.f18 / 100;
            const change = price - prevClose;
            const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
            results.push({
                code: item.f12,
                name: item.f14,
                price,
                change,
                changePercent,
                high: item.f15 / 100,
                low: item.f16 / 100,
                open: item.f17 / 100,
                prevClose,
                volume: item.f5,
                amount: item.f6 / 100000000,
                turnoverRate: item.f8 / 100,
                pe: item.f9 / 100,
                pb: item.f23 / 100,
                marketCap: item.f20 / 100000000,
                totalShares: 0,
                floatShares: item.f21 / 100000000,
                high52w: item.f24 / 100,
                low52w: item.f25 / 100,
                amplitude: item.f7 / 100,
                volumeRatio: item.f10 / 100,
                timestamp: new Date().toISOString(),
            });
        }
    }
    return results;
}
// ============================================================================
// K线历史数据
// ============================================================================
/**
 * 获取K线历史数据（东方财富）
 * @param code 股票代码
 * @param period K线周期
 * @param count 数据条数（默认120）
 */
export async function getKLineData(code, period = 'daily', count = 120) {
    const secid = getSecid(code);
    // 周期参数映射
    const periodMap = {
        daily: '101', // 日K
        weekly: '102', // 周K
        monthly: '103', // 月K
        '5min': '5', // 5分钟
        '15min': '15', // 15分钟
        '30min': '30', // 30分钟
        '60min': '60', // 60分钟
    };
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${periodMap[period]}&fqt=1&end=20500101&lmt=${count}&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `kline_${code}_${period}_${count}`, 300000);
    if (!data.data?.klines || data.data.klines.length === 0) {
        return [];
    }
    return data.data.klines.map(line => {
        const parts = line.split(',');
        // 格式：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
        const open = parseFloat(parts[1]);
        const close = parseFloat(parts[2]);
        const high = parseFloat(parts[3]);
        const low = parseFloat(parts[4]);
        return {
            date: parts[0],
            open,
            close,
            high,
            low,
            volume: parseFloat(parts[5]),
            amount: parseFloat(parts[6]),
            changePercent: parseFloat(parts[7]) || 0,
            turnoverRate: parseFloat(parts[10]) || 0,
        };
    });
}
// ============================================================================
// 公司概况
// ============================================================================
/**
 * 获取公司概况
 * @param code 股票代码
 */
export async function getCompanyOverview(code) {
    const secid = getSecid(code);
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f162,f163,f164,f165,f166,f167,f168,f169,f170,f171,f173,f177,f183,f184,f185,f186,f187,f188,f189,f190,f191,f192&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `overview_${code}`, 300000);
    if (!data.data) {
        throw new Error(`未找到股票 ${code} 的公司概况`);
    }
    const d = data.data;
    const lines = [];
    lines.push(`名称: ${d.f58} (${d.f57})`);
    lines.push(`总市值: ${(d.f116 / 1e8).toFixed(2)}亿 | 流通市值: ${(d.f117 / 1e8).toFixed(2)}亿`);
    lines.push(`PE(动): ${(d.f162 / 100).toFixed(2)} | PE(TTM): ${(d.f163 / 100).toFixed(2)} | PE(静): ${(d.f164 / 100).toFixed(2)}`);
    lines.push(`PB: ${(d.f167 / 100).toFixed(2)} | 市销率: ${(d.f165 / 100).toFixed(2)}`);
    lines.push(`PEG: ${(d.f166 / 100).toFixed(2)} | 股息率: ${(d.f173 / 100).toFixed(2)}%`);
    lines.push(`52周高: ${(d.f170 / 1000).toFixed(2)} | 52周低: ${(d.f171 / 1000).toFixed(2)}`);
    lines.push(`换手率: ${(d.f168 / 100).toFixed(2)}% | 量比: ${(d.f50 / 100).toFixed(2)}`);
    return lines.join('\n');
}
// ============================================================================
// 财务数据
// ============================================================================
/**
 * 获取主要财务指标
 * @param code 股票代码
 */
export async function getFinanceData(code) {
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_OPERATE_INCOME,YSTZ,PARENT_NETPROFIT,SJLTZ,WEIGHTAVG_ROE,BASIC_EPS,BPS,MGJYXJJE,XSMLL,DATATYPE&filter=(SECUCODE="${code}.SH")&pageNumber=1&pageSize=6&sortTypes=-1&sortColumns=REPORTDATE`;
    const data = await fetchJSON(url, `finance_${code}`, 300000);
    if (!data.result?.data?.length) {
        return `未找到 ${code} 的财务数据`;
    }
    const lines = [];
    lines.push('报告期    |营收(亿)|同比% |净利(亿)|同比% |ROE%  |EPS   |BPS   |毛利率%');
    lines.push('----------|-------|------|--------|------|------|------|------|-------');
    for (const item of data.result.data) {
        const r = item.TOTAL_OPERATE_INCOME ? (item.TOTAL_OPERATE_INCOME / 1e8).toFixed(1) : 'N/A';
        const p = item.PARENT_NETPROFIT ? (item.PARENT_NETPROFIT / 1e8).toFixed(2) : 'N/A';
        lines.push(`${(item.REPORTDATE?.slice(0, 10) || '').padEnd(10)}|${r.padStart(7)}|${(item.YSTZ || 0).toFixed(1).padStart(6)}|${p.padStart(8)}|${(item.SJLTZ || 0).toFixed(1).padStart(6)}|${(item.WEIGHTAVG_ROE || 0).toFixed(2).padStart(6)}|${(item.BASIC_EPS || 0).toFixed(2).padStart(6)}|${(item.BPS || 0).toFixed(2).padStart(6)}|${(item.XSMLL || 0).toFixed(1).padStart(7)}`);
    }
    return lines.join('\n');
}
/**
 * 获取利润表详情
 * @param code 股票代码
 */
export async function getIncomeStatement(code) {
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_DMSK_FN_ILE&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_OPERATE_INCOME,OPERATE_INCOME,OPERATE_COST,OPERATE_PROFIT,TOTAL_PROFIT,INCOME_TAX,NETPROFIT&filter=(SECUCODE="${code}.SH")&pageNumber=1&pageSize=4&sortTypes=-1&sortColumns=REPORTDATE`;
    const data = await fetchJSON(url, `income_${code}`, 300000);
    if (!data.result?.data?.length) {
        return `未找到 ${code} 的利润表数据`;
    }
    const lines = [];
    const item = data.result.data[0];
    lines.push(`利润表 (${item.REPORTDATE?.slice(0, 10)})`);
    lines.push(`营业收入: ${((item.TOTAL_OPERATE_INCOME || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`营业成本: ${((item.OPERATE_COST || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`营业利润: ${((item.OPERATE_PROFIT || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`利润总额: ${((item.TOTAL_PROFIT || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`所得税:   ${((item.INCOME_TAX || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`净利润:   ${((item.NETPROFIT || 0) / 1e8).toFixed(2)}亿`);
    return lines.join('\n');
}
/**
 * 获取资产负债表
 * @param code 股票代码
 */
export async function getBalanceSheet(code) {
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_DMSK_FN_BLE&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_ASSETS,TOTAL_LIABILITIES,TOTAL_EQUITY,INVENTORY,ACCOUNTS_RECEIVABLE,CASH_EQUIVALENTS&filter=(SECUCODE="${code}.SH")&pageNumber=1&pageSize=4&sortTypes=-1&sortColumns=REPORTDATE`;
    const data = await fetchJSON(url, `balance_${code}`, 300000);
    if (!data.result?.data?.length) {
        return `未找到 ${code} 的资产负债表数据`;
    }
    const lines = [];
    const item = data.result.data[0];
    lines.push(`资产负债表 (${item.REPORTDATE?.slice(0, 10)})`);
    lines.push(`总资产:     ${((item.TOTAL_ASSETS || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`总负债:     ${((item.TOTAL_LIABILITIES || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`股东权益:   ${((item.TOTAL_EQUITY || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`存货:       ${((item.INVENTORY || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`应收账款:   ${((item.ACCOUNTS_RECEIVABLE || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`现金及等价物: ${((item.CASH_EQUIVALENTS || 0) / 1e8).toFixed(2)}亿`);
    return lines.join('\n');
}
/**
 * 获取现金流量表
 * @param code 股票代码
 */
export async function getCashFlow(code) {
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_DMSK_FN_CFE&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,NET_OPERATE_CASH,NET_INVEST_CASH,NET_FINANCE_CASH,FREE_CASH_FLOW&filter=(SECUCODE="${code}.SH")&pageNumber=1&pageSize=4&sortTypes=-1&sortColumns=REPORTDATE`;
    const data = await fetchJSON(url, `cashflow_${code}`, 300000);
    if (!data.result?.data?.length) {
        return `未找到 ${code} 的现金流量表数据`;
    }
    const lines = [];
    const item = data.result.data[0];
    lines.push(`现金流量表 (${item.REPORTDATE?.slice(0, 10)})`);
    lines.push(`经营活动现金流: ${((item.NET_OPERATE_CASH || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`投资活动现金流: ${((item.NET_INVEST_CASH || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`筹资活动现金流: ${((item.NET_FINANCE_CASH || 0) / 1e8).toFixed(2)}亿`);
    lines.push(`自由现金流:     ${((item.FREE_CASH_FLOW || 0) / 1e8).toFixed(2)}亿`);
    return lines.join('\n');
}
// ============================================================================
// 资金流向
// ============================================================================
/**
 * 获取个股资金流向
 * @param code 股票代码
 */
export async function getFundFlow(code) {
    const secid = getSecid(code);
    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&lmt=10&klt=101&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `fundflow_${code}`, 60000);
    if (!data.data?.klines || data.data.klines.length === 0) {
        return { code, name: '', mainInflow: 0, mainOutflow: 0, mainNetInflow: 0, retailInflow: 0, retailOutflow: 0, retailNetInflow: 0, date: '' };
    }
    const latest = data.data.klines[data.data.klines.length - 1].split(',');
    return {
        code,
        name: '',
        mainInflow: parseFloat(latest[1]) / 100000000,
        mainOutflow: parseFloat(latest[2]) / 100000000,
        mainNetInflow: parseFloat(latest[3]) / 100000000,
        retailInflow: parseFloat(latest[4]) / 100000000,
        retailOutflow: parseFloat(latest[5]) / 100000000,
        retailNetInflow: parseFloat(latest[6]) / 100000000,
        date: latest[0],
    };
}
// ============================================================================
// 分红历史
// ============================================================================
/**
 * 获取分红历史
 * @param code 股票代码
 */
export async function getDividendHistory(code) {
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPD_LC_SHAREBONUS_DETALL&columns=SECUCODE,SECURITY_NAME_ABBR,PLAN_NOTICE_DATE,REPORT_DATE,PLAN_NOTICE_DATE,BONUS_IT_RATIO,BONUS_STOCK_RATIO,TRANSFER_SHARE_RATIO,EX_DIVIDEND_DATE,RECORD_DATE,PAYMENT_DATE,PROGRESS,PLAN_NOTICE_DATE&filter=(SECUCODE="${code}.SH")&pageNumber=1&pageSize=10&sortTypes=-1&sortColumns=REPORT_DATE`;
    const data = await fetchJSON(url, `dividend_${code}`, 300000);
    if (!data.result?.data?.length) {
        return [];
    }
    return data.result.data.map(item => ({
        code,
        name: '',
        year: parseInt(item.REPORT_DATE?.slice(0, 4) || '0'),
        plan: item.PROGRESS || '',
        cashPerShare: item.BONUS_IT_RATIO || 0,
        stockPerShare: item.BONUS_STOCK_RATIO || 0,
        reservePerShare: item.TRANSFER_SHARE_RATIO || 0,
        exDividendDate: item.EX_DIVIDEND_DATE || '',
        recordDate: item.RECORD_DATE || '',
        paymentDate: item.PAYMENT_DATE || '',
        dividendYield: 0,
    }));
}
// ============================================================================
// 新闻/公告
// ============================================================================
/**
 * 获取个股新闻
 * @param code 股票代码
 * @param count 条数
 */
export async function getStockNews(code, count = 10) {
    const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?cb=jQuery&sr=-1&page_size=${count}&page_index=1&ann_type=SHA,SZA,FU&client_source=web&stock_list=${code}&f_node=0&s_node=0`;
    const text = await fetchText(url);
    // 处理 JSONP 响应
    const jsonMatch = text.match(/jQuery\d*_\d*\((.*)\)/);
    if (!jsonMatch)
        return [];
    try {
        const data = JSON.parse(jsonMatch[1]);
        if (!data.data?.list)
            return [];
        return data.data.list.map((item) => ({
            title: item.title || '',
            source: item.source || '',
            time: item.notice_date || '',
            url: item.url || '',
            summary: item.title || '',
            type: 'announcement',
        }));
    }
    catch {
        return [];
    }
}
// ============================================================================
// 市场概览
// ============================================================================
/**
 * 获取主要指数行情
 */
export async function getIndexQuotes() {
    const indices = [
        { code: '1.000001', name: '上证指数' },
        { code: '0.399001', name: '深证成指' },
        { code: '0.399006', name: '创业板指' },
        { code: '1.000688', name: '科创50' },
        { code: '1.000300', name: '沪深300' },
        { code: '1.000905', name: '中证500' },
        { code: '1.000852', name: '中证1000' },
        { code: '100.HSI', name: '恒生指数' },
        { code: '100.HSCEI', name: '恒生科技' },
    ];
    const secids = indices.map(i => i.code).join(',');
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f1,f2,f3,f4,f6,f12,f13,f14&secids=${secids}&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `indices`, 10000);
    if (!data.data?.diff)
        return [];
    return data.data.diff.map(item => ({
        code: item.f12,
        name: item.f14,
        price: item.f2,
        change: item.f4,
        changePercent: item.f3,
        volume: item.f6,
    }));
}
/**
 * 获取板块涨幅排行
 * @param type 板块类型: 'industry' 行业 / 'concept' 概念
 * @param count 条数
 */
export async function getSectorRanking(type = 'industry', count = 20) {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${count}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f33,f11,f62,f128,f136,f115,f152,f124,f104,f105,f106&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `sectors_${type}`, 60000);
    if (!data.data?.diff)
        return [];
    return data.data.diff.slice(0, count).map(item => ({
        name: item.f14,
        changePercent: item.f3,
        leader: item.f12,
        leaderPrice: item.f15,
        leaderChange: item.f16,
        stockCount: item.f104,
        upCount: item.f105,
        downCount: item.f106,
    }));
}
/**
 * 获取涨幅榜/跌幅榜/成交量榜/成交额榜
 * @param type 类型: 'gainer' / 'loser' / 'volume' / 'amount'
 * @param count 条数
 */
export async function getTopStocks(type, count = 20) {
    const sortField = type === 'gainer' ? 'f3' : type === 'loser' ? 'f3' : type === 'volume' ? 'f5' : 'f6';
    const order = type === 'loser' ? 1 : 0; // 0=降序, 1=升序
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${count}&po=${order}&np=1&fltt=2&invt=2&fid=${sortField}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `top_${type}`, 30000);
    if (!data.data?.diff)
        return [];
    return data.data.diff.slice(0, count).map(item => ({
        code: item.f12,
        name: item.f14,
        price: item.f2,
        changePercent: item.f3,
        volume: item.f5,
        amount: item.f6 / 100000000,
    }));
}
// ============================================================================
// 股票搜索
// ============================================================================
/**
 * 搜索股票（按名称或代码）
 * @param keyword 搜索关键词
 */
export async function searchStock(keyword) {
    const url = `https://searchapi.eastmoney.com/api/snapshot/get?type=1&client=wap&baidu=false&${keyword.match(/^\d+$/) ? 'code=' + keyword : 'q=' + encodeURIComponent(keyword)}&pageindex=0&pagesize=10&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url);
    if (!data.datas)
        return [];
    return data.datas.map(item => ({
        code: item.CODE,
        name: item.NAME,
        price: item.PRICE,
        changePercent: item.CHANGE_PERCENT,
        volume: 0,
        amount: 0,
    }));
}
// ============================================================================
// 行业对比
// ============================================================================
/**
 * 获取行业对比数据
 * @param code 股票代码
 */
export async function getIndustryComparison(code) {
    const secid = getSecid(code);
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f127,f128,f162,f167,f168,f169,f170,f171&ut=fa5fd1943c7b386f172d6893dbbd1180`;
    const data = await fetchJSON(url, `industry_${code}`, 300000);
    if (!data.data) {
        return { industry: '', avgPE: 0, avgPB: 0, avgROE: 0, avgChangePercent: 0, stockCount: 0, leader: '', stocks: [] };
    }
    const d = data.data;
    return {
        industry: d.f127 || '',
        avgPE: d.f162 / 100,
        avgPB: d.f167 / 100,
        avgROE: 0,
        avgChangePercent: 0,
        stockCount: 0,
        leader: '',
        stocks: [],
    };
}
// ============================================================================
// 综合导出
// ============================================================================
/**
 * 获取完整股票分析数据
 * @param code 股票代码
 */
export async function getFullAnalysis(code) {
    const lines = [];
    try {
        const quote = await getRealtimeQuote(code);
        lines.push(`=== ${quote.name} (${quote.code}) 综合分析 ===`);
        lines.push('');
        lines.push(`现价: ${quote.price.toFixed(2)} | 涨跌: ${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);
        lines.push(`今开: ${quote.open.toFixed(2)} | 最高: ${quote.high.toFixed(2)} | 最低: ${quote.low.toFixed(2)} | 昨收: ${quote.prevClose.toFixed(2)}`);
        lines.push(`成交量: ${quote.volume.toFixed(2)}万手 | 成交额: ${quote.amount.toFixed(2)}亿`);
        lines.push(`换手率: ${quote.turnoverRate.toFixed(2)}% | 量比: ${quote.volumeRatio.toFixed(2)}`);
        lines.push(`PE: ${quote.pe.toFixed(2)} | PB: ${quote.pb.toFixed(2)} | 市值: ${quote.marketCap.toFixed(2)}亿`);
    }
    catch (err) {
        lines.push(`行情获取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    return lines.join('\n');
}
