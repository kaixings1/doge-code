import axios from 'axios';
import { LRUCache } from 'lru-cache';
import { logEvent, } from '../../services/analytics/index.js';
import { queryHaiku } from '../../services/api/claude.js';
import { AbortError } from '../../utils/errors.js';
import { getWebFetchUserAgent } from '../../utils/http.js';
import { logError } from '../../utils/log.js';
import { isBinaryContentType, persistBinaryContent, } from '../../utils/mcpOutputStorage.js';
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';
import { isPreapprovedHost } from './preapproved.js';
import { makeSecondaryModelPrompt } from './prompt.js';
// Custom error classes for domain blocking
class DomainBlockedError extends Error {
    constructor(domain) {
        super(`Claude Code is unable to fetch from ${domain}`);
        this.name = 'DomainBlockedError';
    }
}
class DomainCheckFailedError extends Error {
    constructor(domain) {
        super(`Unable to verify if domain ${domain} is safe to fetch. This may be due to network restrictions or enterprise security policies blocking claude.ai.`);
        this.name = 'DomainCheckFailedError';
    }
}
class EgressBlockedError extends Error {
    domain;
    constructor(domain) {
        super(JSON.stringify({
            error_type: 'EGRESS_BLOCKED',
            domain,
            message: `访问 ${domain} 被网络出口代理阻止。`,
        }));
        this.domain = domain;
        this.name = 'EgressBlockedError';
    }
}
// Cache with 15-minute TTL and 50MB size limit
// LRUCache handles automatic expiration and eviction
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const URL_CACHE = new LRUCache({
    maxSize: MAX_CACHE_SIZE_BYTES,
    ttl: CACHE_TTL_MS,
});
// Separate cache for preflight domain checks. URL_CACHE is URL-keyed, so
// fetching two paths on the same domain triggers two identical preflight
// HTTP round-trips to api.anthropic.com. This hostname-keyed cache avoids
// that. Only 'allowed' is cached — blocked/failed re-check on next attempt.
const DOMAIN_CHECK_CACHE = new LRUCache({
    max: 128,
    ttl: 5 * 60 * 1000, // 5 minutes — shorter than URL_CACHE TTL
});
export function clearWebFetchCache() {
    URL_CACHE.clear();
    DOMAIN_CHECK_CACHE.clear();
}
let turndownServicePromise;
function getTurndownService() {
    return (turndownServicePromise ??= import('turndown').then(m => {
        const Turndown = m.default;
        return new Turndown();
    }));
}
// PSR requested limiting the length of URLs to 250 to lower the potential
// for a data exfiltration. However, this is too restrictive for some customers'
// legitimate use cases, such as JWT-signed URLs (e.g., cloud service signed URLs)
// that can be much longer. We already require user approval for each domain,
// which provides a primary security boundary. In addition, Claude Code has
// other data exfil channels, and this one does not seem relatively high risk,
// so I'm removing that length restriction. -ab
const MAX_URL_LENGTH = 2000;
// Per PSR:
// "Implement resource consumption controls because setting limits on CPU,
// memory, and network usage for the Web Fetch tool can prevent a single
// request or user from overwhelming the system."
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024;
// Timeout for the main HTTP fetch request (60 seconds).
// Prevents hanging indefinitely on slow/unresponsive servers.
const FETCH_TIMEOUT_MS = 60_000;
// Timeout for the domain blocklist preflight check (10 seconds).
const DOMAIN_CHECK_TIMEOUT_MS = 10_000;
// Cap same-host redirect hops. Without this a malicious server can return
// a redirect loop (/a → /b → /a …) and the per-request FETCH_TIMEOUT_MS
// resets on every hop, hanging the tool until user interrupt. 10 matches
// common client defaults (axios=5, follow-redirects=21, Chrome=20).
const MAX_REDIRECTS = 10;
// Truncate to not spend too many tokens
export const MAX_MARKDOWN_LENGTH = 100_000;
export function isPreapprovedUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname);
    }
    catch {
        return false;
    }
}
export function validateURL(url) {
    if (url.length > MAX_URL_LENGTH) {
        return false;
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return false;
    }
    // We don't need to check protocol here, as we'll upgrade http to https when making the request
    // As long as we aren't supporting aiming to cookies or internal domains,
    // we should block URLs with usernames/passwords too, even though these
    // seem exceedingly unlikely.
    if (parsed.username || parsed.password) {
        return false;
    }
    // Initial filter that this isn't a privileged, company-internal URL
    // by checking that the hostname is publicly resolvable
    const hostname = parsed.hostname;
    const parts = hostname.split('.');
    if (parts.length < 2) {
        return false;
    }
    return true;
}
// 本地白名单：这些域名无需远程检查，直接允许
const LOCAL_DOMAIN_WHITELIST = new Set([
    'www.chinabidding.com.cn',
    'search.ccgp.gov.cn',
    'standard.co.uk',
    'thenation.com',
    'brookings.edu',
    'spectator.sk',
    'gazeta.pl',
    'aljazeera.com',
    'explorer.bitcoin.com',
    'gulfnews.com',
    'baidu.com',
    'heroku.com',
    'webull.com',
    'stock.xueqiu.com',
    'wired.com',
    'finance.sina.com.cn',
    'papertrail.com',
    'cs.com.cn',
    'miro.com',
    'code.claude.com',
    'docs.oracle.com',
    'theglobeandmail.com',
    'yahoo.co.jp',
    'vercel.com/docs',
    'codesandbox.io',
    'wiley.com',
    'investing.de',
    'threejs.org',
    'foreignpolicy.com',
    'aptoscan.com',
    'antena3.ro',
    'mozilla.org',
    'expressjs.com',
    'coingecko.com',
    'gitlab.com',
    'wordpress.org',
    'hindustantimes.com',
    'espn.com',
    'neon.tech',
    'tradingview.co',
    'capacitorjs.com',
    'investing.com',
    'vultr.com',
    'ukrinform.ua',
    'quasar.dev',
    'cngold.org',
    'investing.co.uk',
    'lastampa.it',
    'telegram.org',
    'tiktok.com',
    'foreignaffairs.com',
    'forbes.com',
    'oxfam.org',
    'rmf24.pl',
    'pboc.gov.cn',
    'anzctr.org.au',
    'docs.unrealengine.com',
    'comex.com',
    'ynet.co.il',
    'tradingeconomics.com',
    'theverge.com',
    'uk.finance.yahoo.com',
    'theage.com.au',
    'keras.io',
    'dn.pt',
    'middle-east-online.com',
    'netlify.com',
    'bloomberg.com',
    'zacks.com',
    'blockstream.info',
    'livemint.com',
    'docs.netlify.com',
    'efts.sec.gov',
    'shfe.com.cn',
    'aurora.dev',
    'usnews.com',
    'pingdom.com',
    'kingsoft.com',
    'registeredtrial.ru',
    'numpy.org',
    'interia.pl',
    'metro.co.uk',
    'bea.gov',
    'census.gov',
    'diepresse.com',
    'icrc.org',
    'gitpod.io',
    'codepen.io',
    'biorxiv.org',
    'papertrailapp.com',
    'cypress.io',
    'youtube.com',
    'ncbi.nlm.nih.gov',
    'supabase.com',
    'sipri.org',
    'linkedin.com',
    'semanticscholar.org',
    'suiscan.xyz',
    'thedailybeast.com',
    'bnt.bg',
    'agentskills.io',
    'finviz.org',
    'thetrace.org',
    'taobao.com',
    'bundesbank.de',
    'www.docker.com',
    'thenewrepublic.com',
    'repubblica.it',
    'reddit.com',
    'explorer.solana.com',
    'wto.org',
    'vscode.dev',
    'theprint.in',
    'kotlinlang.org',
    'fxstreet.com',
    'trip.com',
    'deadline.com',
    'britannica.com',
    'ft.com',
    'interfax.ru',
    'github.blog',
    'corriere.it',
    'nuget.org',
    'flutter.dev',
    'fool.com',
    'jerusalempost.com',
    'gradle.org',
    'money.finance.sina.com.cn',
    'goldprice.com',
    'cme.com',
    'gridsome.org',
    'cell.com',
    'springer.com',
    'timesofisrael.com',
    'pandas.pydata.org',
    'tauri.app',
    'robinhood.com',
    'globalissues.org',
    'billboard.com',
    'arabnews.com',
    'commerce.gov',
    'un.org',
    'direktno.hr',
    'pbs.org',
    'weixin.qq.com',
    'mastodon.social',
    'ilo.org',
    'czce.com.cn',
    'developer.mozilla.org',
    'vox.com',
    'coda.io',
    'rubygems.org',
    'finviz.com',
    'middleeasteye.net',
    'matplotlib.org',
    'theatlantic.com',
    'pub.dev',
    'nginx.org',
    'cris.nccr.go.th',
    'cordova.apache.org',
    'flipsidecrypto.xyz',
    'blockchair.com',
    'myfxbook.com',
    'sentry.io',
    'wsj.com',
    'ruby-lang.org',
    'logstash.net',
    'hub.docker.com',
    'flask.palletsprojects.com',
    'commondreams.org',
    'rbc.ru',
    'thewire.in',
    'aajtak.in',
    'dailyfx.com',
    'chinaclearing.cn',
    'ycharts.com',
    'figma.com',
    'thelancet.com',
    'status.io',
    'huawei.com',
    'asp.net',
    'medrxiv.org',
    'nbcsports.com',
    'mempool.space',
    'independent.co.uk',
    'scikit-learn.org',
    'focus.de',
    'amnesty.org',
    'baiducontent.com',
    'www.php.net',
    'thequint.com',
    'digi24.ro',
    'kctstrial.or.kr',
    'unctad.org',
    'dailystar.com.lb',
    'opensecrets.org',
    'react.dev',
    'index.hr',
    'rt.com',
    'oneindia.com',
    'hkma.gov.hk',
    'shclearing.com',
    'heise.de',
    'gold.org',
    'd3js.org',
    'cbssports.com',
    'trctrialregister.com',
    'arstechnica.com',
    'reason.com',
    'storybook.js.org',
    'marketwatch.com',
    'bytedance.com',
    'ant-group.com',
    'interactivebrokers.com',
    'cloudflare.com',
    'eurex.com',
    'rtp.pt',
    'mdpi.com',
    'spark.apache.org',
    'rollbar.com',
    'kiplinger.com',
    'irozhlas.cz',
    'tradingview.com',
    'federalreserve.gov',
    'docusaurus.io',
    'sbs.com.au',
    'electronjs.org',
    'web.archive.org',
    'aastocks.com',
    'npmjs.com',
    'gubatj.eastmoney.com',
    'jestjs.io',
    'worldcat.org',
    'origo.hu',
    'rts.rs',
    'unhcr.org',
    'plos.org',
    'twitter.com',
    'unicef.org',
    'newsweek.com',
    'fb.com',
    'golang.org',
    'doc.rust-lang.org',
    'nova.bg',
    'hv.hu',
    'sueddeutsche.de',
    'firstpost.com',
    'theepochtimes.com',
    'bmj.com',
    'optionstrack.org',
    'scroll.in',
    'prisma.io',
    'www.sqlite.org',
    'celoscan.com',
    'stock.163.com',
    'pypi.org',
    'sse.com.cn',
    'elmundo.es',
    'cambridge.org',
    'thehill.com',
    'graphql.org',
    'agerpres.ro',
    'parler.com',
    'aei.org',
    'data.sec.gov',
    'bTV.bg',
    'nansen.ai',
    'abpnews.com',
    'lemonde.fr',
    'miui.com',
    'airbrake.io',
    'tass.ru',
    'a1.com.mk',
    'observador.pt',
    'publico.pt',
    'statuspage.io',
    'coincodex.com',
    'replit.com',
    'nytimes.com',
    'rand.org',
    'cloudflare.net',
    'hsbc.com.hk',
    'isrctn.com',
    'whalewisdom.com',
    'platform.claude.com',
    'xe.com',
    'huffpost.com',
    'drks.de',
    'barchart.com',
    'ruby-doc.org',
    'arbiscan.io',
    'parlamentnilisty.cz',
    'docs.swift.org',
    'honeybadger.io',
    'edgar.sec.gov',
    'jrj.com.cn',
    '360safe.com',
    'bilibili.com',
    'notion.site',
    'tmall.com',
    'nationalgeographic.com',
    'learn.microsoft.com',
    'truthsocial.com',
    'www.ansible.com',
    'foxnews.com',
    'docs.djangoproject.com',
    'snapchat.com',
    'instagram.com',
    'solscan.io',
    'vanguard.com',
    'b92.net',
    'gatsbyjs.com',
    'deno.land',
    'nature.org',
    'pinterest.com',
    'github.com',
    'pinduoduo.com',
    'zdnet.com',
    'nodejs.org',
    'science.org',
    'qq.com',
    'tagesanzeiger.ch',
    'solana.fm',
    'bytetree.com',
    'indiewire.com',
    'dune.com',
    'sagepub.com',
    'jquery.com',
    'netease.com',
    'calcalist.co.il',
    'sina.com',
    'rollingstone.com',
    'fec.gov',
    'www.postgresql.org',
    'dotnet.microsoft.com',
    'weibo.com',
    'clickup.com',
    'kurir.rs',
    'pytorch.org',
    'businesstoday.in',
    'requests.readthedocs.io',
    'aktualne.cz',
    'schwab.com',
    'imf.org',
    'thehindu.com',
    'gitee.com',
    'faz.net',
    'wionews.com',
    'kommersant.ru',
    'finra.org',
    'haaretz.com',
    'bankofjapan.co.jp',
    'trialregister.nl',
    'whatsapp.com',
    'news.com.au',
    'sports.yahoo.com',
    'aol.com',
    'fly.io',
    'reservebank.co.nz',
    'chain.link',
    'slate.com',
    'diplomacy-foreign.gov.il',
    'thenationalnews.com',
    'ipfs.io',
    'ionicframework.com',
    'smithsonian.org',
    'btc.com',
    'money.163.com',
    'logrocket.com',
    'pubmed.ncbi.nlm.nih.gov',
    '444.hu',
    'deccanherald.com',
    'jira.com',
    'finance.qq.com',
    'cffex.com.cn',
    'kubernetes.io',
    'angular.io',
    'newsmax.com',
    'republicworld.com',
    'fao.org',
    'stock.finance.sina.com.cn',
    'bhaskar.com',
    'messari.io',
    '24.mk',
    'lapresse.ca',
    'httpd.apache.org',
    'github.dev',
    'jamanetwork.com',
    'sec.gov',
    'cnn.com',
    'amarujala.com',
    'kanal5.com.mk',
    'engadget.com',
    'reactnative.dev',
    'bankrate.com',
    'python.org',
    'morningstar.com',
    'tencent.com',
    'sfc.hk',
    'evz.ro',
    'etrade.com',
    'xiaomi.com',
    'who.int',
    'abc.es',
    'ice.com',
    'welt.de',
    'gurufocus.com',
    'puppeteer.github.io',
    'docs.spring.io',
    'kuaishou.com',
    'nzherald.co.nz',
    'optimistic.etherscan.io',
    'go.dev',
    'ctv.ca',
    'harmonyos.com',
    'cnstock.com',
    '126.com',
    'ca.finance.yahoo.com',
    'weforum.org',
    'variety.com',
    'codespaces.com',
    'financialexpress.com',
    'nzz.ch',
    'redis.io',
    'docs.flutter.dev',
    '360.cn',
    'arxiv.org',
    'railway.app',
    'swift.org',
    'vuejs.org',
    'fidelity.com',
    'media.mk',
    'ohchr.org',
    'lematin.ch',
    'ieee.org',
    'ctrip.com',
    'nbcnews.com',
    'telegraph.co.uk',
    'npr.org',
    'remix.run',
    'dataroma.com',
    'khaleejtimes.com',
    'douyin.com',
    'blockcypher.com',
    'flickr.com',
    'earningswhispers.com',
    'pravda.com.ua',
    'gem.hkex.com.hk',
    'iiss.org',
    'abc.net.au',
    'kitco.com',
    'savethechildren.org',
    'novayagazeta.ru',
    'markiza.sk',
    'politico.com',
    'victorops.com',
    'confluence.atlassian.com',
    'cfr.org',
    'mainboard.hkex.com.hk',
    'hal.science',
    'jutarnji.hr',
    'express.co.uk',
    'jagran.com',
    'boj.or.jp',
    'monday.com',
    'tandfonline.com',
    'wps.cn',
    'mas.gov.sg',
    'cryptopanic.com',
    'asana.com',
    'basescan.org',
    'abcnews.go.com',
    'developer.apple.com',
    'newsbytesapp.com',
    'mi.cn',
    'onet.pl',
    'simplywall.st',
    'polygonscan.com',
    'au.finance.yahoo.com',
    'hkex.com.hk',
    'render.com',
    'coding.net',
    'moonbeam.network',
    'vercel.com',
    'dnevnik.bg',
    'clinicaltrials.gov',
    'al-monitor.com',
    'firebase.google.com',
    'dictionary.com',
    'elpais.com',
    'discordapp.com',
    'bbc.com',
    'linode.com',
    'cqamc.com.cn',
    'raw.githubusercontent.com',
    'nerdwallet.com',
    'wp.pl',
    'macrotrends.net',
    'talkingpointsmemo.com',
    'betterstack.com',
    'reuters.com',
    'sciencedirect.com',
    'packagist.org',
    'aliyun.com',
    'barrons.com',
    'stackoverflow.com',
    'usatoday.com',
    'wikipedia.org',
    'nextjs.org',
    'newyorker.com',
    'cloud.google.com',
    'solanabeach.io',
    'bun.sh',
    'heritage.org',
    'opsgenie.com',
    'liberation.fr',
    'exceptionless.org',
    'blazor.net',
    'selenium.dev',
    'hnonline.sk',
    'raygun.com',
    'yahoo.com',
    'maven.apache.org',
    'handelsblatt.com',
    'docs.python.org',
    'newspost.com',
    'valueinvesting.io',
    'nova.rs',
    'yahoo.co.uk',
    'public.com',
    'tokenterminal.com',
    'symfony.com',
    'medium.com',
    'stock.hexun.com',
    'merriam-webster.com',
    'huggingface.co',
    'rawstory.com',
    'pmc.org',
    'rust-lang.org',
    'jprn.jp',
    'mi.com',
    'peerj.com',
    'index.hu',
    'devcenter.heroku.com',
    'ctri.nic.in',
    'bitbucket.org',
    'snowtrace.io',
    'docs.unity.com',
    '163.com',
    'arweave.org',
    'jsfiddle.net',
    'timesofindia.indiatimes.com',
    'bankofengland.co.uk',
    'tumblr.com',
    'coinmarketcap.com',
    'apnews.com',
    'polkadot.subscan.io',
    'notion.so',
    'researchgate.net',
    'se.pl',
    'planetscale.com',
    'indianexpress.com',
    'novinky.cz',
    'treasury.gov',
    'koyfin.com',
    'salon.com',
    'hexun.com',
    '360.com',
    'banque-france.fr',
    'developers.google.com',
    'facebook.com',
    'chictr.org.cn',
    'sportskeeda.com',
    'xueqiu.com',
    'svelte.dev',
    'stockanalysis.com',
    'dart.dev',
    'spiegel.de',
    'theguardian.com',
    '24sata.hr',
    'worldbank.org',
    'reactrouter.com',
    'chainalysis.com',
    'motherjones.com',
    'etherscan.io',
    'tipranks.com',
    'tomcat.apache.org',
    'derstandard.at',
    'hollywoodreporter.com',
    'ftmscan.com',
    'bbc.co.uk',
    'gist.github.com',
    'investors.com',
    'crates.io',
    'hotnews.ro',
    'xamarin.com',
    'india.com',
    'stuff.co.nz',
    'docs.aws.amazon.com',
    'getbootstrap.com',
    'businessinsider.com',
    'kibana.org',
    'inews.co.uk',
    'marketscreener.com',
    'wikimedia.org',
    'unian.ua',
    'lbma.org.uk',
    'zeenews.india.com',
    'jdcloud.com',
    'rollcall.com',
    'csis.org',
    'unnews.org',
    'bscscan.com',
    'lme.com',
    'sogou.com',
    'cbc.ca',
    'webpack.js.org',
    'nativescript.org',
    'en.cppreference.com',
    'sina.com.cn',
    'stockchase.com',
    'eastmoney.com',
    'instatus.com',
    'slack.com',
    'blic.rs',
    'pdfdrive.com',
    'oecd.org',
    'worldwildlife.org',
    'meduza.io',
    'kyivpost.com',
    'redcross.org',
    'egypttoday.com',
    'apache.org',
    'boci.com.hk',
    'www.kaggle.com',
    'www.terraform.io',
    'nejm.org',
    'bugsnag.com',
    'democracynow.org',
    'redux.js.org',
    'astro.build',
    'zhihu.com',
    'glitch.com',
    'thefiscaltimes.com',
    'economist.com',
    'rba.gov.au',
    'ine.cn',
    'marketdataportal.com',
    'forexlive.com',
    'economictimes.indiatimes.com',
    'stock.qq.com',
    'aktuality.sk',
    'cnet.com',
    'stackblitz.com',
    'thestar.com',
    'jd.com',
    'dev.mysql.com',
    'carnegieendowment.org',
    'frontiersin.org',
    'dce.com.cn',
    'denik.cz',
    'etnet.com.hk',
    'doctorswithoutborders.org',
    'btcscan.org',
    'overleaf.com',
    'toutiao.com',
    'seekingalpha.com',
    'bis.org',
    'lesechos.fr',
    'hrw.org',
    'szclearing.com',
    'greenpeace.org',
    'dailymail.co.uk',
    'goodreads.com',
    'smh.com.au',
    'modelcontextprotocol.io',
    'axios.com',
    'atlassian.com',
    'wwf.panda.org',
    'developer.android.com',
    'foxbusiness.com',
    'sapo.pt',
    'alibaba.com',
    'bls.gov',
    'ilmessaggero.it',
    'www.typescriptlang.org',
    'hibernate.org',
    'glassnode.com',
    'chip.de',
    'docker.io',
    'sketch.com',
    'news18.com',
    'quora.com',
    'standardchartered.com.hk',
    '10jqka.com.cn',
    'discord.com',
    'pagerduty.com',
    'vitest.dev',
    'thegraph.com',
    'washingtonpost.com',
    'globes.co.il',
    'smithsonianmag.com',
    'tailwindcss.com',
    'digitalocean.com',
    'oann.com',
    'filebase.com',
    'thetimes.co.uk',
    'uptimerobot.com',
    'mozilla.com',
    'trello.com',
    'moneycontrol.com',
    'git-scm.com',
    'latimes.com',
    'silverprice.com',
    'idnes.cz',
    'lefigaro.fr',
    'threads.net',
    'acm.org',
    'chathamhouse.org',
    'chinabond.com.cn',
    'airtable.com',
    'stock.jrj.com.cn',
    'github.io',
    'time.com',
    'meituan.com',
    'jupyter.org',
    'www.tensorflow.org',
    'cbsnews.com',
    'thesun.co.uk',
    'testing-library.com',
    'nature.com',
    'cfets.com.cn',
    'elastic.co',
    'hkexnews.hk',
    'euclinicaltrialsregister.eu',
    'huaweicloud.com',
    'archive.org',
    'szse.cn',
    'byteimg.com',
    'hindawi.com',
    'counterpunch.org',
    'x.com',
    'oanda.com',
    'www.mongodb.com',
    'vedomosti.ru',
    'rtcs.rs',
    'fastapi.tiangolo.com',
    'golem.de',
    'laravel.com',
    'newindianexpress.com',
    'stockpage.10jqka.com.cn',
    'pkg.go.dev',
    'mirror.co.uk',
    'zpravy.idnes.cz',
    'ecb.europa.eu',
    'navbharattimes.indiatimes.com',
    'iwenku.org',
    'php.net',
    'ndtv.com',
    'zeplin.io',
    'dnaindia.com',
    'nationalgeographic.org',
    'stocktwits.com',
    'treasurydirect.gov',
    'ustr.gov',
    'playwright.dev',
    'github.com/anthropics',
    'finance.yahoo.com',
    'globalnews.ca',
    'lavanguardia.com',
    'defillama.com',
    'truthout.org',
    // === Global tech / high-tech news (open access) ===
    'techcrunch.com',
    'technologyreview.com',
    'news.ycombinator.com',
    'crunchbase.com',
    'spectrum.ieee.org',
    'bleepingcomputer.com',
    'anandtech.com',
    'techradar.com',
    'pcworld.com',
    'macrumors.com',
    '9to5mac.com',
    '9to5google.com',
    'thenextweb.com',
    'venturebeat.com',
    'tomshardware.com',
    'digitaltrends.com',
    'gizmodo.com',
    'extremetech.com',
    'theregister.com',
    'siliconangle.com',
    // === Free music / audio platforms ===
    'soundcloud.com',
    'bandcamp.com',
    'freemusicarchive.org',
    'jamendo.com',
    'mixcloud.com',
    'last.fm',
    'allmusic.com',
    'discogs.com',
    'pitchfork.com',
    // === Movies / TV / streaming info ===
    'imdb.com',
    'rottentomatoes.com',
    'metacritic.com',
    'trakt.tv',
    'themoviedb.org',
    'justwatch.com',
    'tvguide.com',
    'epguides.com',
    // === Images / stock photos / media assets ===
    'unsplash.com',
    'pexels.com',
    'pixabay.com',
    'depositphotos.com',
    'imgur.com',
    'giphy.com',
    'tenor.com',
    // === Documents / reference / learning ===
    'scribd.com',
    'issuu.com',
    'academia.edu',
    'dev.to',
    // === Developer communities & coding platforms ===
    'serverfault.com',
    'superuser.com',
    'askubuntu.com',
    'mathoverflow.net',
    'codeproject.com',
    'dzone.com',
    'hackernoon.com',
    'sitepoint.com',
    'freecodecamp.org',
    'launchpad.net',
    'sourceforge.net',
    'v2ex.com',
    'hackernews.ycombinator.com',
    'lobste.rs',
    // === Chinese developer communities ===
    'csdn.net',
    'oschina.net',
    'juejin.cn',
    'cnblogs.com',
    'segmentfault.com',
    'jianshu.com',
    'kanxue.com',
    '52pojie.cn',
    'piaoyun.org',
    'vckbase.com',
    'nowcoder.com',
    'leetcode.cn',
    'leetcode.com',
    'hackerrank.com',
    'codewars.com',
    'edabit.com',
    'runoob.com',
    'w3schools.com',
    'tutorialspoint.com',
    'geeksforgeeks.org',
    'w3cschool.cn',
    'imooc.com',
    'xuetangx.com',
    'study.163.com',
    'ke.qq.com',
    'chinaunix.net',
    'linuxquestions.org',
    'unix.stackexchange.com',
    'ask.linuxidc.com',
    'bbs.chinaunix.net',
    'bbs.51cto.com',
    'bbs.imooc.com',
    'bbs.csdn.net',
    // === Massive free archives / reference ===
    'openlibrary.org',
    'gutenberg.org',
    'wikiquote.org',
    'musopen.org',
    'musicbrainz.org',
    // === Movies / TV community ===
    'letterboxd.com',
    'fandom.com',
    // === Major Chinese tech media (open access) ===
    '36kr.com',
    'huxiu.com',
    'jiqizhixin.com',
    'pingwest.com',
    'ithome.com',
    'leiphone.com',
    'cnbeta.com.tw',
    'sspai.com',
    'geekpark.net',
    // === Bidding & tender platforms (China, open access) ===
    // National platforms
    'bulletin.cebpubservice.com',
    'www.chinabidding.com.cn',
    'www.ccgp.gov.cn',
    // Central SOE bidding platforms
    'bidding.sinopec.com',
    'ebidding.sinopec.com',
    'bid.nengyuan.sinopec.com',
    'ecp.sgcc.com.cn',
    'www.cnpcbidding.com.cn',
    'ebid.cnooc.com',
    'www.cnooc.com.cn',
    'bidding.cccc.com.cn',
    'ebid.chnenergy.com.cn',
    'bidding.chinacoal.com.cn',
    'bidding.huaneng.com.cn',
    'ebidding.chng.com.cn',
    'bid.csrzic.com',
    'bidding.dongfang.com',
    'bidding.spic.com.cn',
    'cgbidding.spic.com.cn',
    'ebidding.chd.com.cn',
    'www.cscec.com',
    'bidding.crccom.cn',
    'bidding.crcc.cn',
    'bidding.crctt.com',
    'ebidding.crcc.com',
    'ebidding.cr20.com',
    'bidding.cnrsj.com',
    'bidding.avic.com',
    'bidding.cetc.com.cn',
    'bidding.csair.cn',
    'ebidding.coscoshipping.com',
    'bidding.ctg.com.cn',
    'bidding.chinagoldgroup.com.cn',
    'bidding.picc.com.cn',
    'bidding.cmall.com',
    'cgbidding.cgnpc.com.cn',
    'cgbidding.chinalong.com.cn',
    // Industry / enterprise supplier portals
    'zb.casc.cn',
    'bid.haier.com',
    'bidding.midea.com',
    'bid.hikvision.com',
    'bidding.dji.com',
    'supplier.lenovo.com.cn',
    'bidding.xiaomi.com',
    'gssup.huawei.com',
    'bid.oppo.com',
    'bidding.vivo.com',
    'bidding.tcl.com',
    'bidding.gree.com',
    'bid.meizu.com',
    // Industry-specific tender platforms
    'bidding.ccpif.org.cn',
    'www.chinabuilding.com.cn',
    'bidding.computerworld.com.cn',
    'bid.ybj.beijing.gov.cn',
    'ggzy.sxggzyfw.com',
    // Provincial public resource trading centers
    'ggzy.beijing.gov.cn',
    'ggzy.tj.gov.cn',
    'ggzy.sh.gov.cn',
    'ggzy.hebei.gov.cn',
    'ggzy.shanxi.gov.cn',
    'ggzy.ln.gov.cn',
    'ggzy.jl.gov.cn',
    'ggzy.heilongjiang.gov.cn',
    'ggzy.jiangsu.gov.cn',
    'ggzy.zj.gov.cn',
    'ggzy.ah.gov.cn',
    'ggzy.fujian.gov.cn',
    'ggzy.jx.gov.cn',
    'ggzy.sd.gov.cn',
    'ggzy.henan.gov.cn',
    'ggzy.hubei.gov.cn',
    'ggzy.hunan.gov.cn',
    'ggzy.gd.gov.cn',
    'ggzy.hainan.gov.cn',
    'ggzy.cq.gov.cn',
    'ggzy.sc.gov.cn',
    'ggzy.gz.gov.cn',
    'ggzy.yn.gov.cn',
    'ggzy.xz.gov.cn',
    'ggzy.sn.gov.cn',
    'ggzy.gs.gov.cn',
    'ggzy.qh.gov.cn',
    'ggzy.nx.gov.cn',
    'ggzy.xinjiang.gov.cn',
    'ggzy.nmg.gov.cn',
    // === Translation / language tools ===
    'translate.google.com',
    'translate.baidu.com',
    'fanyi.youdao.com',
    'fanyi.qq.com',
    'fanyi.sogou.com',
    'cn.bing.com/translate',
    'deepl.com',
    // === Dictionary / idioms / characters / poetry ===
    'hanyu.baidu.com',
    'www.zdic.net',
    'www.gushiwen.cn',
    'so.gushiwen.cn',
    'www.xiexingcun.com',
    'www.chinese.cn',
    'baike.baidu.com',
    'zh.wikipedia.org',
    'www.51663.net',
    'www.51juzi.com',
    'www.guoxuedashi.com',
    'www.guoxue123.com',
    'www.shicimingju.com',
    // === Health / medical / fitness ===
    'www.chunyuyisheng.com',
    'www.guahao.com',
    'www.haodf.com',
    'www.xywy.com',
    'www.a-hospital.com',
    'www.baikemy.com',
    'www.120ask.com',
    'www.miaoshou.com',
    'www.dxy.com',
    'www.fit.jx.cn',
    // === Finance / stock / fund / crypto / commodities ===
    'finance.eastmoney.com',
    'www.yicai.com',
    'www.caixin.com',
    'www.cls.cn',
    'www.jin10.com',
    'www.kuaixun66.cn',
    'www.hexun.com',
    'www.jrj.com.cn',
    'www.cfi.cn',
    'www.p5w.net',
    'www.10jqka.com.cn',
    'www.zhitongcaijing.com',
    'www.gelonghui.com',
    'www.wallstreetcn.com',
    'www.investing.com',
    'www.marketwatch.com',
    'www.bloomberg.com',
    'www.cnbc.com',
    'www.reuters.com',
    'www.ft.com',
    'www.economist.com',
    'www.bscscan.com',
    'www.etherscan.io',
    'www.coingecko.com',
    // === Entertainment / movies / TV / novels ===
    'www.maoyan.com',
    'www.douban.com',
    'movie.douban.com',
    'www.tvmao.com',
    'www.bangumi.tv',
    'www.dongmanmanhua.cn',
    'www.acfun.cn',
    'www.qidian.com',
    'www.zongheng.com',
    'www.17k.com',
    'www.jjwxc.net',
    'www.hongxiu.com',
    'www.ciweimao.com',
    'www.xs8.cn',
    'www.faloo.com',
    'www.kanshu.com',
    'www.biquge.co',
    'www.biquge.com.cn',
    // === Education / exam / school ===
    'www.gaokao.com',
    'www.exam8.com',
    'www.51test.net',
    'www.233.com',
    'www.offcn.com',
    'www.huatu.com',
    'www.zige365.com',
    'www.21cnjy.com',
    'www.jyeoo.com',
    'www.ks5u.com',
    'www.qkw3.com',
    'www.eol.cn',
    'www.chsi.com.cn',
    'www.kaoyan.com',
    'www.nvq.net.cn',
    'www.guoshi.cn',
    // === Games / puzzles / riddles ===
    'www.7k7k.com',
    'www.4399.com',
    'www.2144.cn',
    'www.66game.cn',
    'www.duole.com',
    'www.xiaopi.com',
    'www.iplaygame.com',
    'www.kuaihou.com',
    'www.downyouxi.com',
    // === Fortune / culture / traditional ===
    'www.xzw.com',
    'www.d1xz.net',
    'www.zhougongjiemeng.cn',
    'www.jiemeng.com',
    'www.qqssly.com',
    // === Image / OCR / visual tools ===
    'images.google.com',
    'lens.google.com',
    'tinypng.com',
    'www.tutieshi.com',
    'www.xiaba.cc',
    'www.dota2.com.cn',
    'www.photopea.com',
    'www.remove.bg',
    'www.bigjpg.com',
    // === OCR / speech / recognition services ===
    'ai.baidu.com',
    'console.bce.baidu.com',
    'open.duer.baidu.com',
    'speech.baidu.com',
    'aiqicha.baidu.com',
    'open.xiaomishuo.com',
    'www.iflytek.com',
    'www.yitutech.com',
    'www.hikvision.com',
    'ai.sensetime.com',
    'megvii.com',
    'www.cloudminds.com',
    'www.aliyun.com/product/ocr',
    'ai.aliyun.com',
    'www.tencentcloud.com',
    'youtu.tencent.com',
    'ai.qq.com',
    'ocr.sogou.com',
    'www.paddlepaddle.org.cn',
    // === Color / unit / encoding / hash tools ===
    'www.color-hex.com',
    'www.colortell.com',
    'www.25xz.com',
    'www.colorwiz.com',
    'tool.chinaz.com',
    'www.css88.com',
    'www.jb51.net',
    'www.jb51.net/tools',
    'www.bejson.com',
    'www.json.cn',
    'www.jsonformatter.org',
    'codebeautify.org',
    'www.base64encode.org',
    'www.urlencode.org',
    'www.bing.com',
    'tool.lu',
    'www.favicon.cc',
    'www.fontawesome.com',
    'www.360shouhu.com',
    'www.shanbay.com',
    'www.eudic.net',
    'www.iciba.com',
    'www.youdao.com',
    'dict.cn',
    'www.hanyu.baidu.com',
    'www.cihai.com.cn',
    'www.chaoyu.com',
    'www.kuaidu.org',
    'www.xiangying.org',
    'www.hongyan365.com',
    // === Chinese forums / communities ===
    'www.chiphell.com',
    'www.nga.cn',
    'www.52crg.com',
    'www.52samsung.com',
    'tieba.baidu.com',
    'www.tiexue.net',
    'bbs.hupu.com',
    // === Music platforms ===
    'www.ximalaya.com',
    'www.lizhi.fm',
    'www.qingting.fm',
    'www.ting.fm',
    'www.kuwo.cn',
    'www.kugou.com',
    'www.1ting.com',
    'www.9sky.com',
    'music.163.com',
    'y.qq.com',
    'www.musicradar.com',
    'www.nme.com',
    'www.grammy.com',
    'www.rockhall.com',
    'www.genius.com',
    'www.songmeanings.com',
    'www.azlyrics.com',
    'www.lyrics.com',
    'www.lyricfind.com',
    'www.letras.com',
    'www.lrclib.net',
    'www.musixmatch.com',
    'www.songfacts.com',
    'www.setlist.fm',
    'www.bandsintown.com',
    'www.pollstar.com',
    'www.livenation.com',
    'www.ticketmaster.com',
    'www.stubhub.com',
    'www.seatgeek.com',
    'www.viagogo.com',
    'www.tickets.cn',
    'www.damai.cn',
    'www.piaoxingqiu.com',
    'www.zhanleixing.com',
    'www.228.com.cn',
    'www.52piao.com',
    'www.nuomi.com',
    'www.kaola.com',
    'www.xiami.com',
    'music.douyin.com',
    'www.tiktok.com/music',
    'www.spotify.com',
    'www.apple.com/music',
    'www.youtube.com/music',
    'www.amazon.com/music',
    'music.youtube.com',
    'www.pandora.com',
    'www.iheart.com',
    'www.tidal.com',
    'www.deezer.com',
    // === News media ===
    'www.voanews.com',
    'www.voachinese.com',
    'www.voachineseblog.com',
    'www.voati.com',
    'cn.rfi.fr',
    'www.rfi.fr',
    'www.dw.com',
    'www.sputniknews.cn',
    'www.sputniknews.com',
    'www.rt.com/news',
    'www.cgtn.com',
    'news.cctv.com',
    'www.xinhuanet.com',
    'www.people.com.cn',
    'www.chinanews.com',
    'www.cankaoxiaoxi.com',
    'www.guancha.cn',
    'www.thepaper.cn',
    'www.cb.com.cn',
    'www.jiemian.com',
    'www.163.com',
    'www.sohu.com',
    'www.toutiao.com',
    'live.kuaishou.com',
    'www.huya.com',
    'www.douyu.com',
    'live.bilibili.com',
    'www.twitch.tv',
    'www.vimeo.com',
    'www.dailymotion.com',
    'www.ted.com',
    'www.bbc.com/zhongwen',
    'www.bbc.com/urdu',
    'www.bbc.com/arabic',
    'www.bbc.com/russian',
    'www.dw.com/zh',
    'www.bbc.com',
    'www.cnn.com',
    'www.foxnews.com',
    'www.msnbc.com',
    'www.abcnews.go.com',
    'abc.com',
    'www.cbsnews.com',
    'www.nbcnews.com',
    'www.usatoday.com',
    'www.washingtonpost.com',
    'www.nytimes.com',
    'www.wsj.com',
    'www.telegraph.co.uk',
    'www.dailymail.co.uk',
    'www.thesun.co.uk',
    'www.mirror.co.uk',
    'www.express.co.uk',
    'www.bbc.co.uk',
    'www.channel4.com',
    'www.channel5.com',
    'www.itv.com',
    'www.sky.com',
    'www.aljazeera.com',
    'www.trt.net.tr',
    'www.france24.com',
    'www.euronews.com',
    'www.dpa.com',
    'www.zeit.de',
    'www.tagesschau.de',
    'www.zdf.de',
    'www.daserste.de',
    'www.br.de',
    'www.wdr.de',
    'www.hr.de',
    'www.swr.de',
    'www.rbb.de',
    'www.ndr.de',
    'www.mdr.de',
    'www.kika.de',
    'www.phoenix.de',
    'www.3sat.de',
    'www.arte.tv',
    'www.france.tv',
    'www.france2.fr',
    'www.tf1.fr',
    'www.francetvinfo.fr',
    'www.bfmtv.com',
    'www.cnews.fr',
    'www.lefigaro.fr',
    'www.lemonde.fr',
    'www.liberation.fr',
    'www.lesechos.fr',
    'www.courrierinternational.com',
    'www.lexpress.fr',
    'www.parismatch.com',
    'www.lepoint.fr',
    'www.marianne.net',
    'www.ladepeche.fr',
    'www.lhumanite.fr',
    'www.nouvelobs.com',
    'www.slate.fr',
    'www.mediapart.fr',
    'www.20minutes.fr',
    'www.rtl.fr',
    'www.europe1.fr',
    'www.franceinter.fr',
    'www.franceinfo.fr',
    'www.radionotredame.fr',
    // === Chinese domestic media ===
    'open.163.com',
    'www.iqiyi.com',
    'www.youku.com',
    'v.qq.com',
    'film.sohu.com',
    'www.1905.com',
    'www.mgtv.com',
    'www.pptv.com',
    'www.fun.tv',
    'www.tudou.com',
    'video.sina.com.cn',
    'video.qq.com',
    'v.ifeng.com',
    'www.56.com',
    'www.ku6.com',
    'v.youku.com',
    'tv.sohu.com',
    'www.zhejiangtv.com',
    'www.jstv.com',
    'www.anhui.tv',
    'www.hbtv.com.cn',
    'www.gdtv.cn',
    'www.sztv.com.cn',
    'www.bjtv.gov.cn',
    'cn.bing.com',
    'www.baidu.com',
    'www.zhaobiao.com',
    'www.jianyu360.com',
    'www.bidizhaobiao.com',
    // 可继续添加其它域名...
]);
export async function checkDomainBlocklist(domain) {
    if (DOMAIN_CHECK_CACHE.has(domain)) {
        return { status: 'allowed' };
    }
    if (LOCAL_DOMAIN_WHITELIST.has(domain)) {
        return { status: 'allowed' };
    }
    try {
        const response = await axios.get(`https://api.anthropic.com/api/web/domain_info?domain=${encodeURIComponent(domain)}`, { timeout: DOMAIN_CHECK_TIMEOUT_MS });
        if (response.status === 200) {
            if (response.data.can_fetch === true) {
                DOMAIN_CHECK_CACHE.set(domain, true);
                return { status: 'allowed' };
            }
            return { status: 'blocked' };
        }
        // Non-200 status but didn't throw
        return {
            status: 'check_failed',
            error: new Error(`Domain check returned status ${response.status}`),
        };
    }
    catch (e) {
        logError(e);
        return { status: 'check_failed', error: e };
    }
}
/**
 * Check if a redirect is safe to follow
 * Allows redirects that:
 * - Add or remove "www." in the hostname
 * - Keep the origin the same but change path/query params
 * - Or both of the above
 */
export function isPermittedRedirect(originalUrl, redirectUrl) {
    try {
        const parsedOriginal = new URL(originalUrl);
        const parsedRedirect = new URL(redirectUrl);
        if (parsedRedirect.protocol !== parsedOriginal.protocol) {
            return false;
        }
        if (parsedRedirect.port !== parsedOriginal.port) {
            return false;
        }
        if (parsedRedirect.username || parsedRedirect.password) {
            return false;
        }
        // Now check hostname conditions
        // 1. Adding www. is allowed: example.com -> www.example.com
        // 2. Removing www. is allowed: www.example.com -> example.com
        // 3. Same host (with or without www.) is allowed: paths can change
        const stripWww = (hostname) => hostname.replace(/^www\./, '');
        const originalHostWithoutWww = stripWww(parsedOriginal.hostname);
        const redirectHostWithoutWww = stripWww(parsedRedirect.hostname);
        return originalHostWithoutWww === redirectHostWithoutWww;
    }
    catch (_error) {
        return false;
    }
}
export async function getWithPermittedRedirects(url, signal, redirectChecker, depth = 0) {
    if (depth > MAX_REDIRECTS) {
        throw new Error(`重定向次数过多（超过 ${MAX_REDIRECTS}）`);
    }
    try {
        return await axios.get(url, {
            signal,
            timeout: FETCH_TIMEOUT_MS,
            maxRedirects: 0,
            responseType: 'arraybuffer',
            maxContentLength: MAX_HTTP_CONTENT_LENGTH,
            headers: {
                Accept: 'text/markdown, text/html, */*',
                'User-Agent': getWebFetchUserAgent(),
            },
        });
    }
    catch (error) {
        if (axios.isAxiosError(error) &&
            error.response &&
            [301, 302, 307, 308].includes(error.response.status)) {
            const redirectLocation = error.response.headers.location;
            if (!redirectLocation) {
                throw new Error('重定向缺少 Location 头');
            }
            // Resolve relative URLs against the original URL
            const redirectUrl = new URL(redirectLocation, url).toString();
            if (redirectChecker(url, redirectUrl)) {
                // Recursively follow the permitted redirect
                return getWithPermittedRedirects(redirectUrl, signal, redirectChecker, depth + 1);
            }
            else {
                // Return redirect information to the caller
                return {
                    type: 'redirect',
                    originalUrl: url,
                    redirectUrl,
                    statusCode: error.response.status,
                };
            }
        }
        // Detect egress proxy blocks: the proxy returns 403 with
        // X-Proxy-Error: blocked-by-allowlist when egress is restricted
        if (axios.isAxiosError(error) &&
            error.response?.status === 403 &&
            error.response.headers['x-proxy-error'] === 'blocked-by-allowlist') {
            const hostname = new URL(url).hostname;
            throw new EgressBlockedError(hostname);
        }
        throw error;
    }
}
function isRedirectInfo(response) {
    return 'type' in response && response.type === 'redirect';
}
export async function getURLMarkdownContent(url, abortController) {
    if (!validateURL(url)) {
        throw new Error('无效的 URL');
    }
    // Check cache (LRUCache handles TTL automatically)
    const cachedEntry = URL_CACHE.get(url);
    if (cachedEntry) {
        return {
            bytes: cachedEntry.bytes,
            code: cachedEntry.code,
            codeText: cachedEntry.codeText,
            content: cachedEntry.content,
            contentType: cachedEntry.contentType,
            persistedPath: cachedEntry.persistedPath,
            persistedSize: cachedEntry.persistedSize,
        };
    }
    let parsedUrl;
    let upgradedUrl = url;
    try {
        parsedUrl = new URL(url);
        // Upgrade http to https if needed
        if (parsedUrl.protocol === 'http:') {
            parsedUrl.protocol = 'https:';
            upgradedUrl = parsedUrl.toString();
        }
        const hostname = parsedUrl.hostname;
        // Check if the user has opted to skip the blocklist check
        // This is for enterprise customers with restrictive security policies
        // that prevent outbound connections to claude.ai
        const settings = getSettings_DEPRECATED();
        if (!settings.skipWebFetchPreflight) {
            const checkResult = await checkDomainBlocklist(hostname);
            switch (checkResult.status) {
                case 'allowed':
                    // Continue with the fetch
                    break;
                case 'blocked':
                    throw new DomainBlockedError(hostname);
                case 'check_failed':
                    throw new DomainCheckFailedError(hostname);
            }
        }
        if (process.env.USER_TYPE === 'ant') {
            logEvent('tengu_web_fetch_host', {
                hostname: hostname,
            });
        }
    }
    catch (e) {
        if (e instanceof DomainBlockedError ||
            e instanceof DomainCheckFailedError) {
            // Expected user-facing failures - re-throw without logging as internal error
            throw e;
        }
        logError(e);
    }
    const response = await getWithPermittedRedirects(upgradedUrl, abortController.signal, isPermittedRedirect);
    // Check if we got a redirect response
    if (isRedirectInfo(response)) {
        return response;
    }
    const rawBuffer = Buffer.from(response.data);
    response.data = null;
    const contentType = response.headers['content-type'] ?? '';
    // Binary content: save raw bytes to disk with a proper extension so Claude
    // can inspect the file later. We still fall through to the utf-8 decode +
    // Haiku path below — for PDFs in particular the decoded string has enough
    // ASCII structure (/Title, text streams) that Haiku can summarize it, and
    // the saved file is a supplement rather than a replacement.
    let persistedPath;
    let persistedSize;
    if (isBinaryContentType(contentType)) {
        const persistId = `webfetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await persistBinaryContent(rawBuffer, contentType, persistId);
        if (!('error' in result)) {
            persistedPath = result.filepath;
            persistedSize = result.size;
        }
    }
    const bytes = rawBuffer.length;
    const htmlContent = rawBuffer.toString('utf-8');
    let markdownContent;
    let contentBytes;
    if (contentType.includes('text/html')) {
        markdownContent = (await getTurndownService()).turndown(htmlContent);
        contentBytes = Buffer.byteLength(markdownContent);
    }
    else {
        // It's not HTML - just use it raw. The decoded string's UTF-8 byte
        // length equals rawBuffer.length (modulo U+FFFD replacement on invalid
        // bytes — negligible for cache eviction accounting), so skip the O(n)
        // Buffer.byteLength scan.
        markdownContent = htmlContent;
        contentBytes = bytes;
    }
    // Store the fetched content in cache. Note that it's stored under
    // the original URL, not the upgraded or redirected URL.
    const entry = {
        bytes,
        code: response.status,
        codeText: response.statusText,
        content: markdownContent,
        contentType,
        persistedPath,
        persistedSize,
    };
    // lru-cache requires positive integers; clamp to 1 for empty responses.
    URL_CACHE.set(url, entry, { size: Math.max(1, contentBytes) });
    return entry;
}
export async function applyPromptToMarkdown(prompt, markdownContent, signal, isNonInteractiveSession, isPreapprovedDomain) {
    // Truncate content to avoid "Prompt is too long" errors from the secondary model
    const truncatedContent = markdownContent.length > MAX_MARKDOWN_LENGTH
        ? markdownContent.slice(0, MAX_MARKDOWN_LENGTH) +
            '\n\n[Content truncated due to length...]'
        : markdownContent;
    const modelPrompt = makeSecondaryModelPrompt(truncatedContent, prompt, isPreapprovedDomain);
    const assistantMessage = await queryHaiku({
        systemPrompt: asSystemPrompt([]),
        userPrompt: modelPrompt,
        signal,
        options: {
            querySource: 'web_fetch_apply',
            agents: [],
            isNonInteractiveSession,
            hasAppendSystemPrompt: false,
            mcpTools: [],
        },
    });
    // We need to bubble this up, so that the tool call throws, causing us to return
    // an is_error tool_use block to the server, and render a red dot in the UI.
    if (signal.aborted) {
        throw new AbortError();
    }
    const { content } = assistantMessage.message;
    if (content.length > 0) {
        const contentBlock = content[0];
        if ('text' in contentBlock) {
            return contentBlock.text;
        }
    }
    return '模型无响应';
}
//# sourceMappingURL=utils.js.map