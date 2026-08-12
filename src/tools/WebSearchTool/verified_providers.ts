// === 新增搜索引擎 Provider (curl 验证存活) ===

export const verifiedAliveProviders = [
  // 国内搜索引擎
  { name: '百度搜索', offline: false, fetch: async (q) => {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
    return [{ title: `百度搜索：${q}`, url, snippet: '点击链接在百度中查看搜索结果', source: 'baidu' }]
  }},
  { name: '搜狗搜索', offline: false, fetch: async (q) => {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(q)}`
    return [{ title: `搜狗搜索：${q}`, url, snippet: '点击链接在搜狗中查看搜索结果', source: 'sogou' }]
  }},
  { name: '360搜索', offline: false, fetch: async (q) => {
    const url = `https://so.com/s?q=${encodeURIComponent(q)}`
    return [{ title: `360搜索：${q}`, url, snippet: '点击链接在360搜索中查看结果', source: '360' }]
  }},
  { name: '神马搜索', offline: false, fetch: async (q) => {
    const url = `https://so.quark.com/s?q=${encodeURIComponent(q)}`
    return [{ title: `神马搜索：${q}`, url, snippet: '点击链接在神马搜索中查看结果（URL待验证）', source: 'sm' }]
  }},
  { name: '头条搜索', offline: false, fetch: async (q) => {
    const url = `https://so.toutiao.com/search?keyword=${encodeURIComponent(q)}`
    return [{ title: `头条搜索：${q}`, url, snippet: '点击链接在头条中查看搜索结果', source: 'toutiao' }]
  }},
  { name: '中国搜索', offline: false, fetch: async (q) => {
    const url = `https://www.chinaso.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `中国搜索：${q}`, url, snippet: '点击链接在中国搜索中查看结果', source: 'chinaso' }]
  }},
  { name: '微信搜一搜', offline: false, fetch: async (q) => {
    const url = `https://wx.sogou.com/weixin?type=2&query=${encodeURIComponent(q)}`
    return [{ title: `微信搜一搜：${q}`, url, snippet: '搜索微信公众号文章', source: 'wechat' }]
  }},
  { name: '抖音搜索', offline: false, fetch: async (q) => {
    const url = `https://www.douyin.com/search/${encodeURIComponent(q)}`
    return [{ title: `抖音搜索：${q}`, url, snippet: '点击链接在抖音中查看搜索结果', source: 'douyin' }]
  }},
  { name: '微博搜索', offline: false, fetch: async (q) => {
    const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(q)}`
    return [{ title: `微博搜索：${q}`, url, snippet: '点击链接在微博中查看搜索结果', source: 'weibo' }]
  }},
  { name: '小红书搜索', offline: false, fetch: async (q) => {
    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q)}`
    return [{ title: `小红书搜索：${q}`, url, snippet: '点击链接在小红书中查看搜索结果', source: 'xiaohongshu' }]
  }},
  { name: '知乎搜索', offline: false, fetch: async (q) => {
    const url = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}`
    return [{ title: `知乎搜索：${q}`, url, snippet: '点击链接在知乎中查看搜索结果', source: 'zhihu' }]
  }},
  { name: 'B站搜索', offline: false, fetch: async (q) => {
    const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`
    return [{ title: `B站搜索：${q}`, url, snippet: '点击链接在B站中查看搜索结果', source: 'bilibili' }]
  }},
  { name: '网易有道', offline: false, fetch: async (q) => {
    const url = `http://www.youdao.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `网易有道搜索：${q}`, url, snippet: '点击链接在有道中查看搜索结果', source: 'youdao' }]
  }},
  { name: '搜搜SOSO', offline: false, fetch: async (q) => {
    const url = `http://soso.com/q?w=${encodeURIComponent(q)}`
    return [{ title: `搜搜搜索：${q}`, url, snippet: '点击链接在搜搜中查看搜索结果', source: 'soso' }]
  }},
  { name: '中搜', offline: false, fetch: async (q) => {
    const url = `http://www.zhongsou.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `中搜：${q}`, url, snippet: '点击链接在中搜中查看搜索结果', source: 'zhongsou' }]
  }},
  { name: '给我搜', offline: false, fetch: async (q) => {
    const url = `http://www.geiwosou.net/search?q=${encodeURIComponent(q)}`
    return [{ title: `给我搜：${q}`, url, snippet: '点击链接在给我搜中查看搜索结果', source: 'geiwosou' }]
  }},
  { name: '天网搜索', offline: false, fetch: async (q) => {
    const url = `http://www.tianwang.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `天网搜索：${q}`, url, snippet: '点击链接在天网中查看搜索结果', source: 'tianwang' }]
  }},
  { name: '搜乐', offline: false, fetch: async (q) => {
    const url = `http://www.sooule.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `搜乐：${q}`, url, snippet: '点击链接在搜乐中查看搜索结果', source: 'sooule' }]
  }},
  { name: '搜网全能搜', offline: false, fetch: async (q) => {
    const url = `http://so.sowang.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `搜网全能搜：${q}`, url, snippet: '点击链接在搜网中查看搜索结果', source: 'sowang' }]
  }},
  { name: '狂搜', offline: false, fetch: async (q) => {
    const url = `http://www.kuangso.net/search?q=${encodeURIComponent(q)}`
    return [{ title: `狂搜：${q}`, url, snippet: '点击链接在狂搜中查看搜索结果', source: 'kuangso' }]
  }},
  { name: '百狗搜索', offline: false, fetch: async (q) => {
    const url = `http://www.baigle.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `百狗搜索：${q}`, url, snippet: '点击链接在百狗中查看搜索结果', source: 'baigle' }]
  }},
  { name: '雅虎中国', offline: false, fetch: async (q) => {
    const url = `http://cn.yahoo.com/search?p=${encodeURIComponent(q)}`
    return [{ title: `雅虎中国搜索：${q}`, url, snippet: '点击链接在雅虎中国查看搜索结果', source: 'yahoo-cn' }]
  }},
  { name: '新浪搜索', offline: false, fetch: async (q) => {
    const url = `http://search.sina.com.cn/?q=${encodeURIComponent(q)}`
    return [{ title: `新浪搜索：${q}`, url, snippet: '点击链接在新浪中查看搜索结果', source: 'sina' }]
  }},
  { name: '搜狐搜索', offline: false, fetch: async (q) => {
    const url = `http://www.sohu.com/search/?keyword=${encodeURIComponent(q)}`
    return [{ title: `搜狐搜索：${q}`, url, snippet: '点击链接在搜狐中查看搜索结果', source: 'sohu' }]
  }},
  { name: '宜搜', offline: false, fetch: async (q) => {
    const url = `http://www.easou.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `宜搜：${q}`, url, snippet: '点击链接在宜搜中查看搜索结果', source: 'easou' }]
  }},
  { name: '集思录', offline: false, fetch: async (q) => {
    const url = `https://www.jisilu.cn/search/?keyword=${encodeURIComponent(q)}`
    return [{ title: `集思录搜索：${q}`, url, snippet: '搜索集思录投资社区', source: 'jisilu' }]
  }},
  { name: 'Gitee搜索', offline: false, fetch: async (q) => {
    const url = `https://so.gitee.com/?q=${encodeURIComponent(q)}`
    return [{ title: `Gitee搜索：${q}`, url, snippet: '搜索 Gitee 代码仓库', source: 'gitee' }]
  }},
  { name: 'Modelscope', offline: false, fetch: async (q) => {
    const url = `https://www.modelscope.cn/search?search=${encodeURIComponent(q)}`
    return [{ title: `ModelScope搜索：${q}`, url, snippet: '搜索 ModelScope 模型和数据集', source: 'modelscope' }]
  }},
  { name: 'IP138查询', offline: false, fetch: async (q) => {
    const url = `https://ip138.com/search/?q=${encodeURIComponent(q)}`
    return [{ title: `IP138查询：${q}`, url, snippet: 'IP地址查询、手机号归属地等', source: 'ip138' }]
  }},
  { name: '博客园搜索', offline: false, fetch: async (q) => {
    const url = `https://zzk.cnblogs.com/s?w=${encodeURIComponent(q)}`
    return [{ title: `博客园搜索：${q}`, url, snippet: '搜索博客园技术文章', source: 'cnblogs' }]
  }},

  // 国外及特色搜索引擎
  { name: 'Bing国际搜索', offline: false, fetch: async (q) => {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en`
    return [{ title: `Bing国际搜索：${q}`, url, snippet: '点击链接在Bing国际版查看结果', source: 'bing-intl' }]
  }},
  { name: 'DuckDuckGo网页搜索', offline: false, fetch: async (q) => {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
    return [{ title: `DuckDuckGo搜索：${q}`, url, snippet: '点击链接在DuckDuckGo中查看搜索结果', source: 'ddg-web' }]
  }},
  { name: 'Yandex搜索', offline: false, fetch: async (q) => {
    const url = `https://yandex.com/search/?text=${encodeURIComponent(q)}`
    return [{ title: `Yandex搜索：${q}`, url, snippet: '点击链接在Yandex中查看搜索结果', source: 'yandex' }]
  }},
  { name: 'Ecosia搜索', offline: false, fetch: async (q) => {
    const url = `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `Ecosia搜索：${q}`, url, snippet: '环保搜索引擎，广告收入用于植树', source: 'ecosia' }]
  }},
  { name: 'Lycos搜索', offline: false, fetch: async (q) => {
    const url = `http://www.lycos.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Lycos搜索：${q}`, url, snippet: '点击链接在Lycos中查看搜索结果', source: 'lycos' }]
  }},
  { name: 'Go.com搜索', offline: false, fetch: async (q) => {
    const url = `http://go.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Go.com搜索：${q}`, url, snippet: '点击链接在Go.com中查看搜索结果', source: 'go' }]
  }},
  { name: 'HotBot搜索', offline: false, fetch: async (q) => {
    const url = `http://www.hotbot.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `HotBot搜索：${q}`, url, snippet: '点击链接在HotBot中查看搜索结果', source: 'hotbot' }]
  }},
  { name: 'MSN搜索', offline: false, fetch: async (q) => {
    const url = `http://www.msn.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `MSN搜索：${q}`, url, snippet: '点击链接在MSN中查看搜索结果', source: 'msn' }]
  }},
  { name: 'Accufind搜索', offline: false, fetch: async (q) => {
    const url = `http://www.accufind.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Accufind搜索：${q}`, url, snippet: '点击链接在Accufind中查看搜索结果', source: 'accufind' }]
  }},
  { name: '37.com搜索', offline: false, fetch: async (q) => {
    const url = `http://www.37.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `37.com搜索：${q}`, url, snippet: '点击链接在37.com中查看搜索结果', source: '37' }]
  }},
  { name: 'Arabsites搜索', offline: false, fetch: async (q) => {
    const url = `http://arabsites.com/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `Arabsites搜索：${q}`, url, snippet: '点击链接在Arabsites中查看搜索结果', source: 'arabsites' }]
  }},
  { name: 'StartingPoint搜索', offline: false, fetch: async (q) => {
    const url = `http://www.stpt.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `StartingPoint搜索：${q}`, url, snippet: '点击链接在StartingPoint中查看搜索结果', source: 'stpt' }]
  }},
  { name: 'Magellan搜索', offline: false, fetch: async (q) => {
    const url = `http://www.mckinley.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Magellan搜索：${q}`, url, snippet: '点击链接在Magellan中查看搜索结果', source: 'magellan' }]
  }},
  { name: 'REX搜索', offline: false, fetch: async (q) => {
    const url = `http://www.rex-search.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `REX搜索：${q}`, url, snippet: '点击链接在REX中查看搜索结果', source: 'rex' }]
  }},
  { name: '香港搜寻', offline: false, fetch: async (q) => {
    const url = `http://www.hksrch.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `香港搜寻：${q}`, url, snippet: '点击链接在Timway HK中查看搜索结果', source: 'hksrch' }]
  }},
  { name: 'Helioid搜索', offline: false, fetch: async (q) => {
    const url = `http://www.helioid.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Helioid搜索：${q}`, url, snippet: '可视化搜索结果分类浏览', source: 'helioid' }]
  }},
  { name: 'Spruse搜索', offline: false, fetch: async (q) => {
    const url = `http://www.spruse.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Spruse搜索：${q}`, url, snippet: '点击链接在Spruse中查看搜索结果', source: 'spruse' }]
  }},
  { name: 'Rednano目录', offline: false, fetch: async (q) => {
    const url = `http://directory.st701.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Rednano目录搜索：${q}`, url, snippet: '网站目录搜索', source: 'rednano' }]
  }},
  { name: 'Nona搜索', offline: false, fetch: async (q) => {
    const url = `https://www.nona.de/search?q=${encodeURIComponent(q)}`
    return [{ title: `Nona搜索：${q}`, url, snippet: '德国搜索引擎', source: 'nona' }]
  }},
  { name: '雅虎奇摩', offline: false, fetch: async (q) => {
    const url = `https://tw.search.yahoo.com/search?p=${encodeURIComponent(q)}`
    return [{ title: `雅虎奇摩搜索：${q}`, url, snippet: '点击链接在雅虎奇摩中查看搜索结果', source: 'yahoo-tw' }]
  }},

  // 垂直与特色搜索
  { name: 'Semantic Scholar搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=8&fields=title,url,abstract`
      const j = await fetchJson(url, signal)
      if (!j.data || !Array.isArray(j.data)) return []
      return j.data.slice(0, 8).map((it: any) => ({
        title: it.title || '学术论文',
        url: it.url || '',
        snippet: (it.abstract || '').slice(0, 150),
        source: 'semantic-scholar'
      }))
    } catch { return [] }
  }},
  { name: 'arXiv搜索', offline: false, fetch: async (q) => {
    const url = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(q)}`
    return [{ title: `arXiv预印本：${q}`, url, snippet: '搜索arXiv学术预印本论文', source: 'arxiv' }]
  }},
  { name: 'DevDocs搜索', offline: false, fetch: async (q) => {
    const url = `https://devdocs.io/#q=${encodeURIComponent(q)}`
    return [{ title: `DevDocs搜索：${q}`, url, snippet: '搜索多语言多框架技术文档', source: 'devdocs' }]
  }},
  { name: 'MDN搜索', offline: false, fetch: async (q) => {
    const url = `https://developer.mozilla.org/zh-CN/search?q=${encodeURIComponent(q)}`
    return [{ title: `MDN搜索：${q}`, url, snippet: '搜索MDN Web技术文档', source: 'mdn' }]
  }},
  { name: 'W3Schools搜索', offline: false, fetch: async (q) => {
    const url = `https://www.w3schools.com/search/search.aspx?q=${encodeURIComponent(q)}`
    return [{ title: `W3Schools搜索：${q}`, url, snippet: '搜索W3Schools教程', source: 'w3schools' }]
  }},
  { name: 'Shodan搜索', offline: false, fetch: async (q) => {
    const url = `https://www.shodan.io/search?query=${encodeURIComponent(q)}`
    return [{ title: `Shodan搜索：${q}`, url, snippet: '搜索互联网设备和服务', source: 'shodan' }]
  }},
  { name: 'Censys搜索', offline: false, fetch: async (q) => {
    const url = `https://search.censys.io/search?q=${encodeURIComponent(q)}`
    return [{ title: `Censys搜索：${q}`, url, snippet: '搜索互联网资产和证书（国内可能超时）', source: 'censys' }]
  }},
  { name: '网易云音乐搜索', offline: false, fetch: async (q) => {
    const url = `https://music.163.com/#/search/m/?s=${encodeURIComponent(q)}`
    return [{ title: `网易云音乐：${q}`, url, snippet: '搜索音乐和歌词', source: 'netease-music' }]
  }},
  { name: 'iNaturalist搜索', offline: false, fetch: async (q) => {
    const url = `https://www.inaturalist.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `iNaturalist：${q}`, url, snippet: '搜索动植物识别记录', source: 'inaturalist' }]
  }},
  { name: '百度百科', offline: false, fetch: async (q) => {
    const url = `https://baike.baidu.com/search?word=${encodeURIComponent(q)}`
    return [{ title: `百度百科：${q}`, url, snippet: '点击链接在百度百科查看词条', source: 'baike' }]
  }},
  { name: 'DeepL翻译搜索', offline: false, fetch: async (q) => {
    const url = `https://www.deepl.com/translator#auto/auto/${encodeURIComponent(q)}`
    return [{ title: `DeepL翻译：${q}`, url, snippet: '使用DeepL翻译文本', source: 'deepl' }]
  }},
  { name: '韦氏词典', offline: false, fetch: async (q) => {
    const url = `https://www.merriam-webster.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `韦氏词典：${q}`, url, snippet: '搜索韦氏英语词典', source: 'merriam' }]
  }},
  { name: '搜了网', offline: false, fetch: async (q) => {
    const url = `http://www.51sole.com/search/?q=${encodeURIComponent(q)}`
    return [{ title: `搜了网：${q}`, url, snippet: '搜索B2B供应商和产品', source: '51sole' }]
  }},
  { name: 'Wappalyzer技术栈', offline: false, fetch: async (q) => {
    const url = `https://wappalyzer.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Wappalyzer：${q}`, url, snippet: '分析网站技术栈', source: 'wappalyzer' }]
  }},
  { name: 'Common Crawl', offline: false, fetch: async (q) => {
    const url = `https://index.commoncrawl.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `Common Crawl：${q}`, url, snippet: '搜索全网网页历史存档', source: 'commoncrawl' }]
  }},
  { name: '高德地图', offline: false, fetch: async (q) => {
    const url = `https://www.amap.com/search?query=${encodeURIComponent(q)}`
    return [{ title: `高德地图：${q}`, url, snippet: '搜索高德地图地点', source: 'amap' }]
  }},
  { name: '百度地图', offline: false, fetch: async (q) => {
    const url = `https://map.baidu.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `百度地图：${q}`, url, snippet: '搜索百度地图地点', source: 'baidu-map' }]
  }},
  { name: '实时汇率', offline: false, fetch: async (q) => {
    try {
      const j = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(q.toUpperCase())}`, undefined)
      if (j.rates) {
        const lines = Object.entries(j.rates).slice(0, 5).map(([c, r]: [string, any]) => `  ${c}: ${r}`).join('\n')
        return [{ title: `${j.base || q.toUpperCase()} 汇率`, url: 'https://www.xe.com/currencyconverter', snippet: lines, source: 'exchangerate' }]
      }
      return []
    } catch { return [] }
  }},
  { name: 'Whois查询', offline: false, fetch: async (q) => {
    const url = `https://who.is/whois/${encodeURIComponent(q)}`
    return [{ title: `Whois查询：${q}`, url, snippet: '查询域名Whois信息', source: 'whois' }]
  }},
  { name: 'SSL Labs检测', offline: false, fetch: async (q) => {
    const url = `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(q)}`
    return [{ title: `SSL Labs：${q}`, url, snippet: 'SSL/TLS配置安全检测', source: 'ssllabs' }]
  }},
  { name: 'Ping检测', offline: false, fetch: async (q) => {
    const url = `https://www.ping.pe/${encodeURIComponent(q)}`
    return [{ title: `Ping检测：${q}`, url, snippet: '全球节点Ping和路由检测', source: 'ping' }]
  }},
  { name: 'Speedtest测速', offline: false, fetch: async (q) => {
    const url = `https://www.speedtest.net/`
    return [{ title: `Speedtest：网络测速`, url, snippet: '测试网络下载上传速度', source: 'speedtest' }]
  }},
  { name: 'DNS查询', offline: false, fetch: async (q) => {
    const url = `https://dnslytics.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `DNS查询：${q}`, url, snippet: 'DNS记录和反向IP查询', source: 'dns' }]
  }},
  { name: 'Hybrid Analysis', offline: false, fetch: async (q) => {
    const url = `https://www.hybrid-analysis.com/search?query=${encodeURIComponent(q)}`
    return [{ title: `Hybrid Analysis：${q}`, url, snippet: '恶意软件样本分析搜索', source: 'hybrid-analysis' }]
  }},
  { name: 'CISA安全告警', offline: false, fetch: async (q) => {
    const url = `https://www.cisa.gov/search?search=${encodeURIComponent(q)}`
    return [{ title: `CISA：${q}`, url, snippet: '搜索美国网络安全告警', source: 'cisa' }]
  }},
  { name: 'Bugcrowd赏金', offline: false, fetch: async (q) => {
    const url = `https://www.bugcrowd.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Bugcrowd：${q}`, url, snippet: '搜索漏洞赏金项目', source: 'bugcrowd' }]
  }},
  { name: 'HackerOne赏金', offline: false, fetch: async (q) => {
    const url = `https://hackerone.com/programs/search?query=${encodeURIComponent(q)}`
    return [{ title: `HackerOne：${q}`, url, snippet: '搜索漏洞赏金项目（国内可能超时）', source: 'hackerone' }]
  }},
  { name: 'OpenSSF', offline: false, fetch: async (q) => {
    const url = `https://openssf.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `OpenSSF：${q}`, url, snippet: '搜索开源安全资源', source: 'openssf' }]
  }},
  { name: 'OWASP搜索', offline: false, fetch: async (q) => {
    const url = `https://owasp.org/search/?q=${encodeURIComponent(q)}`
    return [{ title: `OWASP：${q}`, url, snippet: '搜索OWASP安全指南', source: 'owasp' }]
  }},
  { name: 'CWE搜索', offline: false, fetch: async (q) => {
    const url = `https://cwe.mitre.org/search/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `CWE：${q}`, url, snippet: '搜索通用弱点枚举', source: 'cwe' }]
  }},
  { name: 'CAPEC搜索', offline: false, fetch: async (q) => {
    const url = `https://capec.mitre.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `CAPEC：${q}`, url, snippet: '搜索攻击模式知识库', source: 'capec' }]
  }},
  { name: 'IETF搜索', offline: false, fetch: async (q) => {
    const url = `https://www.ietf.org/search/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `IETF RFC：${q}`, url, snippet: '搜索RFC文档', source: 'ietf' }]
  }},
  { name: 'RFC搜索', offline: false, fetch: async (q) => {
    const url = `https://www.rfc-editor.org/search/?q=${encodeURIComponent(q)}`
    return [{ title: `RFC文档：${q}`, url, snippet: '搜索RFC互联网标准文档', source: 'rfc' }]
  }},
  { name: 'W3C搜索', offline: false, fetch: async (q) => {
    const url = `https://www.w3.org/search/search.php?q=${encodeURIComponent(q)}`
    return [{ title: `W3C：${q}`, url, snippet: '搜索W3C Web标准', source: 'w3c' }]
  }},
  { name: 'ECMA搜索', offline: false, fetch: async (q) => {
    const url = `https://www.ecma-international.org/search/?q=${encodeURIComponent(q)}`
    return [{ title: `ECMA：${q}`, url, snippet: '搜索ECMA标准（JavaScript等）', source: 'ecma' }]
  }},

  // 学术与知识
  { name: '维基百科搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`
      const j = await fetchJson(url, signal)
      if (j.title) {
        return [{ title: j.title, url: j.content_urls?.desktop?.page || `https://zh.wikipedia.org/wiki/${encodeURIComponent(q)}`, snippet: (j.extract || '').slice(0, 200), source: 'wikipedia' }]
      }
      return []
    } catch { return [] }
  }},
  { name: '知网CNKI', offline: false, fetch: async (q) => {
    const url = `https://www.cnki.net/search?q=${encodeURIComponent(q)}`
    return [{ title: `知网CNKI：${q}`, url, snippet: '搜索中国知网学术文献', source: 'cnki' }]
  }},
  { name: '万方数据', offline: false, fetch: async (q) => {
    const url = `https://www.wanfangdata.com.cn/search/searchList.do?searchType=all&showType=&pageSize=20&searchWord=${encodeURIComponent(q)}`
    return [{ title: `万方数据：${q}`, url, snippet: '搜索万方学术数据库', source: 'wanfang' }]
  }},
  { name: '维普', offline: false, fetch: async (q) => {
    const url = `http://www.cqvip.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `维普：${q}`, url, snippet: '搜索维普期刊资源', source: 'cqvip' }]
  }},
  { name: 'Springer搜索', offline: false, fetch: async (q) => {
    const url = `https://link.springer.com/search?query=${encodeURIComponent(q)}`
    return [{ title: `SpringerLink：${q}`, url, snippet: '搜索Springer学术资源', source: 'springer' }]
  }},
  { name: 'DBLP搜索', offline: false, fetch: async (q) => {
    const url = `https://dblp.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `DBLP：${q}`, url, snippet: '搜索计算机科学文献数据库', source: 'dblp' }]
  }},

  // 开发者搜索
  { name: 'GitHub仓库搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=8`
      const j = await fetchJson(url, signal)
      if (!j.items || !Array.isArray(j.items)) return []
      return j.items.slice(0, 8).map((it: any) => ({
        title: `${it.full_name || it.name} (${it.language || ''})`,
        url: it.html_url || '',
        snippet: `⭐ ${it.stargazers_count || 0} | ${(it.description || '').slice(0, 80)}`,
        source: 'github'
      }))
    } catch { return [] }
  }},
  { name: 'GitHubTopics', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://api.github.com/search/topics?q=${encodeURIComponent(q)}&per_page=8`
      const j = await fetchJson(url, signal)
      if (!j.items || !Array.isArray(j.items)) return []
      return j.items.slice(0, 8).map((it: any) => ({
        title: `Topic: ${it.name}`,
        url: `https://github.com/topics/${it.name}`,
        snippet: (it.description || 'GitHub热门话题').slice(0, 100),
        source: 'github-topics'
      }))
    } catch { return [] }
  }},
  { name: 'GitHubGist', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://api.github.com/search/gists?q=${encodeURIComponent(q)}&per_page=8`
      const j = await fetchJson(url, signal)
      if (!j.items || !Array.isArray(j.items)) return []
      return j.items.slice(0, 8).map((it: any) => ({
        title: `Gist: ${it.description || 'Untitled'}`,
        url: it.html_url,
        snippet: `by ${it.owner?.login || 'unknown'} | ${it.comments || 0} comments`,
        source: 'github-gist'
      }))
    } catch { return [] }
  }},
  { name: 'Sourcegraph代码搜索', offline: false, fetch: async (q) => {
    const url = `https://sourcegraph.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Sourcegraph：${q}`, url, snippet: '跨仓库代码搜索', source: 'sourcegraph' }]
  }},
  { name: 'StackOverflow搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=8`
      const j = await fetchJson(url, signal)
      if (!j.items || !Array.isArray(j.items)) return []
      return j.items.slice(0, 8).map((it: any) => ({
        title: it.title || 'Stack Overflow问题',
        url: it.link || '',
        snippet: (it.tags || []).slice(0, 5).join(', ') + (it.is_answered ? ' [已解决]' : ''),
        source: 'stackoverflow'
      }))
    } catch { return [] }
  }},
  { name: 'HuggingFace搜索', offline: false, fetch: async (q) => {
    const url = `https://huggingface.co/models?search=${encodeURIComponent(q)}`
    return [{ title: `HuggingFace模型：${q}`, url, snippet: '搜索AI模型和数据集', source: 'huggingface' }]
  }},

  // 包管理搜索
  { name: 'NPM包搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=8`
      const j = await fetchJson(url, signal)
      if (!j.objects || !Array.isArray(j.objects)) return []
      return j.objects.slice(0, 8).map((it: any) => ({
        title: `${it.package?.name || 'unknown'} (v${it.package?.version || '?'})`,
        url: `https://www.npmjs.com/package/${it.package?.name || ''}`,
        snippet: (it.package?.description || '').slice(0, 120),
        source: 'npm'
      }))
    } catch { return [] }
  }},
  { name: 'PyPI包搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://pypi.org/pypi/${encodeURIComponent(q)}/json`
      const j = await fetchJson(url, signal)
      return [{
        title: `${j.info?.name || q} (v${j.info?.version || '?'})`,
        url: j.info?.package_url || `https://pypi.org/project/${encodeURIComponent(q)}`,
        snippet: (j.info?.summary || j.info?.description || '').slice(0, 160),
        source: 'pypi'
      }]
    } catch { return [] }
  }},
  { name: 'DockerHub搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(q)}&page_size=8`
      const j = await fetchJson(url, signal)
      if (!j.results || !Array.isArray(j.results)) return []
      return j.results.slice(0, 8).map((it: any) => ({
        title: `${it.name || 'unknown'}:${it.tag || 'latest'}`,
        url: `https://hub.docker.com/r/${it.name || ''}`,
        snippet: (it.description || '').slice(0, 100),
        source: 'docker'
      }))
    } catch { return [] }
  }},
  { name: 'crates.io搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(q)}&per_page=8`
      const j = await fetchJson(url, signal)
      if (!j.crates || !Array.isArray(j.crates)) return []
      return j.crates.slice(0, 8).map((it: any) => ({
        title: `${it.name} (v${it.newest_version})`,
        url: `https://crates.io/crates/${it.name}`,
        snippet: (it.description || 'Rust crate').slice(0, 120),
        source: 'crates'
      }))
    } catch { return [] }
  }},
  { name: 'RubyGems搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(q)}`
      const j = await fetchJson(url, signal)
      if (!Array.isArray(j)) return []
      return j.slice(0, 8).map((it: any) => ({
        title: `${it.name} (v${it.version || '?'})`,
        url: `https://rubygems.org/gems/${it.name}`,
        snippet: (it.description || 'Ruby gem').slice(0, 120),
        source: 'rubygems'
      }))
    } catch { return [] }
  }},
  { name: 'Packagist搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://packagist.org/search.json?q=${encodeURIComponent(q)}`
      const j = await fetchJson(url, signal)
      if (!j.results || !Array.isArray(j.results)) return []
      return j.results.slice(0, 8).map((it: any) => ({
        title: `${it.name} (${(it.description || 'PHP包').slice(0, 80)})`,
        url: `https://packagist.org/packages/${it.name}`,
        snippet: (it.description || '').slice(0, 120),
        source: 'packagist'
      }))
    } catch { return [] }
  }},
  { name: 'Go Modules搜索', offline: false, fetch: async (q) => {
    const url = `https://pkg.go.dev/search?q=${encodeURIComponent(q)}`
    return [{ title: `Go Modules：${q}`, url, snippet: '搜索Go语言包', source: 'golang' }]
  }},
  { name: 'NuGet搜索', offline: false, fetch: async (q) => {
    const url = `https://www.nuget.org/packages?q=${encodeURIComponent(q)}`
    return [{ title: `NuGet：${q}`, url, snippet: '搜索.NET NuGet包', source: 'nuget' }]
  }},
  { name: 'Maven搜索', offline: false, fetch: async (q) => {
    const url = `https://search.maven.org/search?q=${encodeURIComponent(q)}`
    return [{ title: `Maven Central：${q}`, url, snippet: '搜索Maven中央仓库', source: 'maven' }]
  }},

  // 文档搜索
  { name: 'Python文档搜索', offline: false, fetch: async (q) => {
    const url = `https://docs.python.org/3/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `Python文档：${q}`, url, snippet: '搜索Python官方文档', source: 'python-docs' }]
  }},
  { name: 'Go文档搜索', offline: false, fetch: async (q) => {
    const url = `https://pkg.go.dev/search?q=${encodeURIComponent(q)}`
    return [{ title: `Go文档：${q}`, url, snippet: '搜索Go标准库文档', source: 'go-docs' }]
  }},
  { name: 'Rust文档搜索', offline: false, fetch: async (q) => {
    const url = `https://doc.rust-lang.org/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `Rust文档：${q}`, url, snippet: '搜索Rust官方文档', source: 'rust-docs' }]
  }},
  { name: 'Java文档搜索', offline: false, fetch: async (q) => {
    const url = `https://docs.oracle.com/javase/search/?search=${encodeURIComponent(q)}`
    return [{ title: `Java文档：${q}`, url, snippet: '搜索Java官方API文档', source: 'java-docs' }]
  }},
  { name: 'Docker文档搜索', offline: false, fetch: async (q) => {
    const url = `https://docs.docker.com/search/?q=${encodeURIComponent(q)}`
    return [{ title: `Docker文档：${q}`, url, snippet: '搜索Docker官方文档', source: 'docker-docs' }]
  }},
  { name: 'Kubernetes文档搜索', offline: false, fetch: async (q) => {
    const url = `https://kubernetes.io/search/?q=${encodeURIComponent(q)}`
    return [{ title: `Kubernetes文档：${q}`, url, snippet: '搜索Kubernetes官方文档', source: 'k8s-docs' }]
  }},
  { name: 'AWS文档搜索', offline: false, fetch: async (q) => {
    const url = `https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=${encodeURIComponent(q)}`
    return [{ title: `AWS文档：${q}`, url, snippet: '搜索AWS云服务文档', source: 'aws-docs' }]
  }},
  { name: 'Azure文档搜索', offline: false, fetch: async (q) => {
    const url = `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(q)}`
    return [{ title: `Azure文档：${q}`, url, snippet: '搜索Microsoft Azure文档', source: 'azure-docs' }]
  }},
  { name: 'Git文档搜索', offline: false, fetch: async (q) => {
    const url = `https://git-scm.com/search?type=docs&q=${encodeURIComponent(q)}`
    return [{ title: `Git文档：${q}`, url, snippet: '搜索Git官方文档', source: 'git-docs' }]
  }},
  { name: 'Linux man手册', offline: false, fetch: async (q) => {
    const url = `https://man7.org/linux/man-pages/man${q}.html`
    return [{ title: `Linux man ${q}`, url, snippet: 'Linux系统调用和C库函数手册页', source: 'man7' }]
  }},

  // 代码托管
  { name: 'GitLab搜索', offline: false, fetch: async (q) => {
    const url = `https://gitlab.com/search?search=${encodeURIComponent(q)}`
    return [{ title: `GitLab：${q}`, url, snippet: '搜索GitLab项目', source: 'gitlab' }]
  }},
  { name: 'Bitbucket搜索', offline: false, fetch: async (q) => {
    const url = `https://bitbucket.org/repo/all?name=${encodeURIComponent(q)}`
    return [{ title: `Bitbucket：${q}`, url, snippet: '搜索Bitbucket仓库', source: 'bitbucket' }]
  }},
  { name: 'SourceForge搜索', offline: false, fetch: async (q) => {
    const url = `https://sourceforge.net/directory/?q=${encodeURIComponent(q)}`
    return [{ title: `SourceForge：${q}`, url, snippet: '搜索SourceForge开源项目', source: 'sourceforge' }]
  }},

  // 社区搜索
  { name: 'HackerNews搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://hnrss.org/search?q=${encodeURIComponent(q)}`
      const text = await fetchJson(url, signal)
      return []
    } catch { return [] }
  }},
  { name: 'V2EX搜索', offline: false, fetch: async (q) => {
    const url = `https://www.v2ex.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `V2EX搜索：${q}`, url, snippet: '搜索V2EX社区帖子（国内可能超时）', source: 'v2ex' }]
  }},
  { name: 'NGA搜索', offline: false, fetch: async (q) => {
    const url = `https://bbs.nga.cn/search.php?q=${encodeURIComponent(q)}`
    return [{ title: `NGA搜索：${q}`, url, snippet: '搜索NGA玩家社区', source: 'nga' }]
  }},
  { name: '豆瓣搜索', offline: false, fetch: async (q) => {
    const url = `https://www.douban.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `豆瓣搜索：${q}`, url, snippet: '搜索豆瓣读书/电影/小组', source: 'douban' }]
  }},

  // 工具推荐
  { name: 'AlternativeTo替代', offline: false, fetch: async (q) => {
    const url = `https://alternativeto.net/software/${encodeURIComponent(q)}/`
    return [{ title: `AlternativeTo：${q}的替代品`, url, snippet: '查找开源免费替代软件', source: 'alternativeto' }]
  }},
  { name: 'BuiltWith技术栈', offline: false, fetch: async (q) => {
    const url = `https://builtwith.com/${encodeURIComponent(q)}`
    return [{ title: `BuiltWith：${q}`, url, snippet: '分析网站使用的技术栈', source: 'builtwith' }]
  }},

  // 漏洞赏金和安全
  { name: 'VirusTotal搜索', offline: false, fetch: async (q) => {
    const url = `https://www.virustotal.com/gui/search/${encodeURIComponent(q)}`
    return [{ title: `VirusTotal：${q}`, url, snippet: '搜索文件/URL/域名威胁情报', source: 'virustotal' }]
  }},
  { name: 'CVE搜索', offline: false, fetch: async (q, signal) => {
    try {
      const url = `https://cve.circl.lu/api/search/${encodeURIComponent(q)}`
      const j = await fetchJson(url, signal)
      if (!Array.isArray(j)) return []
      return j.slice(0, 8).map((it: any) => ({
        title: `CVE-${it.id || q}`,
        url: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-${it.id || q}`,
        snippet: (it.summary || '').slice(0, 150),
        source: 'cve'
      }))
    } catch { return [] }
  }},
  { name: 'MITRE ATT&CK', offline: false, fetch: async (q) => {
    const url = `https://attack.mitre.org/search/search.html?q=${encodeURIComponent(q)}`
    return [{ title: `MITRE ATT&CK：${q}`, url, snippet: '搜索威胁矩阵攻击技术', source: 'mitre-attack' }]
  }},
  { name: 'Snyk漏洞搜索', offline: false, fetch: async (q) => {
    const url = `https://snyk.io/search?query=${encodeURIComponent(q)}`
    return [{ title: `Snyk：${q}`, url, snippet: '搜索开源漏洞和依赖问题', source: 'snyk' }]
  }},
  { name: 'Exploit-DB搜索', offline: false, fetch: async (q) => {
    const url = `https://www.exploit-db.com/search?q=${encodeURIComponent(q)}`
    return [{ title: `Exploit-DB：${q}`, url, snippet: '搜索 exploits 和漏洞代码', source: 'exploit-db' }]
  }},
]
