const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const VALUATION_FILE = path.join(ROOT, "data", "valuation.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36";

const ETF_DEFS = [
  { symbol: "sh513100", code: "513100", title: "纳指ETF国泰" },
  { symbol: "sh513300", code: "513300", title: "纳指ETF华夏" },
  { symbol: "sh513500", code: "513500", title: "标普500ETF博时" },
  { symbol: "sz159655", code: "159655", title: "标普500ETF华夏" },
  { symbol: "sh513650", code: "513650", title: "标普500ETF南方" }
];

const FUTURE_DEFS = [
  { symbol: "hf_NQ", title: "纳指100期货", unit: "USD" },
  { symbol: "hf_ES", title: "标普500期货", unit: "USD" }
];

const INDEX_CLOSE_DEFS = [
  { key: "nasdaq", symbol: "usIXIC", code: ".IXIC", title: "纳指前日收盘" },
  { key: "sp500", symbol: "usINX", code: ".INX", title: "标普前日收盘" }
];

const PE_HISTORY_REFERENCE = {
  average: 28.9,
  source: "GuruFocus Nasdaq-100 PE historical series",
  sourceUrl: "https://www.gurufocus.com/economic_indicators/6778/nasdaq-100-pe-ratio"
};

const MARKET_NEWS_FEEDS = [
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.cnbc.com/id/10000664/device/rss/rss.html"
];

const MARKET_NEWS_TOPICS = [
  { label: "利率与通胀预期", pattern: /\bfed\b|federal reserve|interest rate|inflation|treasury|bond yield/i },
  { label: "大型科技与AI", pattern: /nvidia|apple|microsoft|alphabet|google|amazon|meta|netflix|tesla|semiconductor|chip|\bai\b/i },
  { label: "企业财报", pattern: /earning|revenue|forecast|guidance|profit/i },
  { label: "油价与地缘风险", pattern: /oil|iran|war|hormuz|geopolit|middle east/i },
  { label: "贸易与关税", pattern: /tariff|trade war|export control/i },
  { label: "宏观增长预期", pattern: /recession|jobs|employment|housing|consumer|gdp|economy/i }
];

const FUND_SEARCH_KEYS = [
  "纳斯达克100",
  "华夏纳斯达克100",
  "广发纳斯达克100",
  "华安纳斯达克100",
  "大成纳斯达克100",
  "建信纳斯达克100",
  "摩根纳斯达克100"
];

const LIMIT_SEED_CODES = [
  "160213",
  "015299",
  "015300",
  "270042",
  "006479",
  "040046",
  "014978",
  "000834",
  "008971",
  "016452",
  "016453",
  "021000",
  "018043",
  "018044",
  "022525",
  "019172",
  "019173",
  "539001",
  "012752",
  "023422"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const cache = new Map();

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[$,%\s,]/g, "");
  if (!normalized || normalized === "--" || normalized === "N/A" || normalized === "NaN") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scaleEastmoney(value, decimals = 2) {
  const parsed = toNumber(value);
  const precision = toNumber(decimals);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 10 ** (Number.isFinite(precision) ? precision : 2);
}

function nowIso() {
  return new Date().toISOString();
}

async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, "utf-8");
  return JSON.parse(text);
}

async function readValuationData() {
  const fallback = { source: "manual", current: {} };
  try {
    return await readJsonFile(VALUATION_FILE);
  } catch {
    return fallback;
  }
}

async function withCache(key, ttlMs, getter) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.value;
  const value = await getter();
  cache.set(key, { time: Date.now(), value });
  return value;
}

async function fetchBuffer(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}, encoding = "utf-8") {
  const buffer = await fetchBuffer(url, options);
  return new TextDecoder(encoding).decode(buffer);
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options, "utf-8");
  return JSON.parse(text);
}

function parseSinaVars(text) {
  const result = {};
  for (const match of text.matchAll(/var hq_str_([^=]+)="([^"]*)";/g)) {
    result[match[1]] = match[2].split(",");
  }
  return result;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function classifyPremium(value) {
  if (!Number.isFinite(value)) return { label: "无数据", level: "muted" };
  if (value >= 8) return { label: "超高溢价 | 不建议买入", level: "danger" };
  if (value >= 3) return { label: "高溢价 | 不建议买入", level: "warning" };
  if (value >= -1) return { label: "正常 | 可买入", level: "good" };
  return { label: "折价 | 建议买入", level: "info" };
}

function classifyVix(value) {
  if (!Number.isFinite(value)) return { label: "无数据", level: "muted" };
  if (value < 20) return { label: "平静", level: "good" };
  if (value <= 30) return { label: "紧张", level: "warning" };
  if (value <= 40) return { label: "恐慌", level: "danger" };
  return { label: "极度恐慌", level: "extreme" };
}

function classifyDrawdown(value) {
  if (!Number.isFinite(value)) return { label: "无数据", level: "muted" };
  if (value < 10) return { label: "正常", level: "good" };
  if (value < 20) return { label: "一级", level: "warning" };
  if (value < 30) return { label: "二级", level: "danger" };
  if (value < 40) return { label: "三级", level: "danger" };
  return { label: "极端", level: "extreme" };
}

function interpretPeHistory(value) {
  if (!Number.isFinite(value)) return null;
  const deviationPct = ((value / PE_HISTORY_REFERENCE.average) - 1) * 100;
  let label = "历史中枢";
  let assessment = "正常估值";
  let level = "info";

  if (value < 22) {
    label = "历史低位";
    assessment = "低估值";
    level = "good";
  } else if (value < 26) {
    label = "常态下沿";
    assessment = "偏低估值";
    level = "good";
  } else if (value < 31) {
    label = "历史中枢";
    assessment = "正常估值";
  } else if (value < 35) {
    label = "常态上沿";
    assessment = "偏高估值";
    level = "warning";
  } else {
    label = "历史高位";
    assessment = "高估值";
    level = "danger";
  }

  return {
    label,
    assessment,
    level,
    benchmarkPe: PE_HISTORY_REFERENCE.average,
    deviationPct: round(deviationPct, 1),
    source: PE_HISTORY_REFERENCE.source,
    sourceUrl: PE_HISTORY_REFERENCE.sourceUrl,
    note: "以长期均值作区间锚点，不代表精确历史分位"
  };
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function readXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXmlEntities(match?.[1]);
}

async function getEtfQuotes() {
  return withCache("etfs", 12_000, async () => {
    const list = ETF_DEFS.flatMap((item) => [item.symbol, `${item.symbol}_iopv`]).join(",");
    const [text, fundProfiles] = await Promise.all([
      fetchText(
        `https://hq.sinajs.cn/list=${list}`,
        {
          headers: {
            Referer: "https://finance.sina.com.cn/",
            "User-Agent": UA
          }
        },
        "gb18030"
      ),
      getEtfFundProfiles()
    ]);
    const vars = parseSinaVars(text);
    return ETF_DEFS.map((item) => {
      const quote = vars[item.symbol] || [];
      const iopvQuote = vars[`${item.symbol}_iopv`] || [];
      const profile = fundProfiles.get(item.code) || {};
      const quotedCurrent = toNumber(quote[3]);
      const previousClose = toNumber(quote[2]);
      const current = Number.isFinite(quotedCurrent) && quotedCurrent > 0 ? quotedCurrent : previousClose;
      const rawIopv = toNumber(iopvQuote[2]);
      const iopv = Number.isFinite(rawIopv) && rawIopv > 0 ? rawIopv : null;
      const premium = Number.isFinite(current) && current > 0 && Number.isFinite(iopv)
        ? ((current / iopv) - 1) * 100
        : null;
      return {
        ...item,
        source: "新浪财经 ETF/IOPV",
        exchangeName: item.symbol.startsWith("sh") ? "SH" : "SZ",
        marketName: quote[0] || item.title,
        current: round(current, 4),
        priceIsPreviousClose: !(Number.isFinite(quotedCurrent) && quotedCurrent > 0),
        premiumBasis: Number.isFinite(quotedCurrent) && quotedCurrent > 0 ? "live" : "previousClose",
        previousClose: round(previousClose, 4),
        changePct: round(pctChange(current, previousClose), 2),
        high: round(toNumber(quote[4]), 4),
        low: round(toNumber(quote[5]), 4),
        iopv: round(iopv, 4),
        premiumPct: round(premium, 2),
        premiumState: classifyPremium(premium),
        fundScaleBillion: profile.fundScaleBillion ?? null,
        fundScaleDate: profile.navDate ?? null,
        volume: toNumber(quote[8]),
        amount: round(toNumber(quote[9]) / 100000000, 2),
        quoteTime: [quote[30], quote[31]].filter(Boolean).join(" ")
      };
    });
  });
}

async function getEtfFundProfiles() {
  return withCache("etf-fund-profiles", 10 * 60_000, async () => {
    const tasks = ETF_DEFS.map(async (item) => {
      const url =
        `https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx?FCODE=${item.code}` +
        "&deviceid=dashboard&plat=Iphone&product=EFund&version=6.3.8";
      const json = await fetchJson(url, {
        headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
      });
      const data = json.Datas || {};
      const endNav = toNumber(data.ENDNAV);
      return [
        item.code,
        {
          fundScaleBillion: Number.isFinite(endNav) ? round(endNav / 100000000, 2) : null,
          navDate: data.FSRQ || null
        }
      ];
    });
    const rows = (await Promise.allSettled(tasks))
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value);
    return new Map(rows);
  });
}

async function getFutures() {
  return withCache("futures", 10_000, async () => {
    const list = FUTURE_DEFS.map((item) => item.symbol).join(",");
    const text = await fetchText(
      `https://hq.sinajs.cn/list=${list}`,
      {
        headers: {
          Referer: "https://finance.sina.com.cn/",
          "User-Agent": UA
        }
      },
      "gb18030"
    );
    const vars = parseSinaVars(text);
    return FUTURE_DEFS.map((item) => {
      const quote = vars[item.symbol] || [];
      const current = toNumber(quote[0]);
      const previousClose = toNumber(quote[7]);
      const change = Number.isFinite(current) && Number.isFinite(previousClose)
        ? current - previousClose
        : null;
      return {
        ...item,
        source: "新浪财经全球期货",
        current: round(current, 2),
        previousClose: round(previousClose, 2),
        change: round(change, 2),
        changePct: round(pctChange(current, previousClose), 2),
        bid: round(toNumber(quote[2]), 2),
        ask: round(toNumber(quote[3]), 2),
        high: round(toNumber(quote[4]), 2),
        low: round(toNumber(quote[5]), 2),
        open: round(toNumber(quote[8]), 2),
        quoteTime: [quote[12], quote[6]].filter(Boolean).join(" "),
        marketName: quote[13] || item.title
      };
    });
  });
}

async function getPreviousMarketCloses() {
  return withCache("previous-market-closes", 60_000, async () => {
    const tasks = INDEX_CLOSE_DEFS.map(async (item) => {
      const json = await fetchJson(
        `https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=${item.symbol},day,,,5,qfq`,
        { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" } }
      );
      const node = json.data?.[item.symbol] || {};
      const rows = (Array.isArray(node.day) ? node.day : [])
        .map((row) => ({
          date: row[0],
          open: toNumber(row[1]),
          close: toNumber(row[2]),
          high: toNumber(row[3]),
          low: toNumber(row[4])
        }))
        .filter((row) => row.date && Number.isFinite(row.close));
      const latest = rows.at(-1);
      const previous = rows.at(-2);
      if (!latest || !previous) throw new Error(`${item.symbol} close history unavailable`);
      const change = latest.close - previous.close;
      return {
        ...item,
        source: "腾讯证券美股日线",
        date: latest.date,
        close: round(latest.close, 2),
        previousClose: round(previous.close, 2),
        change: round(change, 2),
        changePct: round(pctChange(latest.close, previous.close), 2),
        open: round(latest.open, 2),
        high: round(latest.high, 2),
        low: round(latest.low, 2)
      };
    });
    return Promise.all(tasks);
  });
}

async function getMarketNews() {
  return withCache("market-news", 20 * 60_000, async () => {
    const results = await Promise.allSettled(MARKET_NEWS_FEEDS.map((url) => fetchText(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml,*/*" }
    })));
    const items = results.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      return Array.from(result.value.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map((match) => {
        const block = match[1];
        return {
          title: readXmlTag(block, "title"),
          description: readXmlTag(block, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          url: readXmlTag(block, "link"),
          publishedAt: readXmlTag(block, "pubDate")
        };
      });
    });
    const deduped = new Map();
    for (const item of items) {
      if (!item.title || !item.url) continue;
      const publishedTime = Date.parse(item.publishedAt);
      if (Number.isFinite(publishedTime) && Date.now() - publishedTime > 4 * 24 * 60 * 60_000) continue;
      if (!deduped.has(item.url)) deduped.set(item.url, item);
    }
    return Array.from(deduped.values()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  });
}

function buildMarketAlert(indexCloses, vix, news) {
  const nasdaq = indexCloses.find((item) => item.key === "nasdaq");
  const sp500 = indexCloses.find((item) => item.key === "sp500");
  if (!nasdaq || !sp500) return null;

  const maxMove = Math.max(Math.abs(nasdaq.changePct || 0), Math.abs(sp500.changePct || 0));
  const spread = (nasdaq.changePct || 0) - (sp500.changePct || 0);
  let state = { label: "常规波动", level: "good" };
  if (maxMove >= 1.5 || Math.abs(sp500.changePct || 0) >= 1.25) {
    state = { label: "显著异动", level: "danger" };
  } else if (maxMove >= 1 || Math.abs(sp500.changePct || 0) >= 0.8) {
    state = { label: "异动关注", level: "warning" };
  }

  const signals = [];
  if (spread >= 0.7) signals.push("纳指明显强于标普，科技成长风格占优");
  else if (spread <= -0.7) signals.push("纳指明显弱于标普，科技成长权重承压");
  else if (nasdaq.changePct > 0 && sp500.changePct > 0) signals.push("主要指数同步上涨，风险偏好改善");
  else if (nasdaq.changePct < 0 && sp500.changePct < 0) signals.push("主要指数同步回落，风险偏好降温");
  else signals.push("纳指与标普走势分化，市场风格切换明显");

  if (Number.isFinite(vix?.changePct) && vix.changePct >= 5) signals.push("VIX同步抬升，避险需求增加");
  else if (Number.isFinite(vix?.changePct) && vix.changePct <= -5) signals.push("VIX回落，波动率压力缓和");

  const sessionStart = Date.parse(`${nasdaq.date}T00:00:00Z`);
  const sessionNews = news.filter((item) => {
    const publishedTime = Date.parse(item.publishedAt);
    return Number.isFinite(publishedTime) && publishedTime >= sessionStart - 6 * 60 * 60_000
      && publishedTime < sessionStart + 36 * 60 * 60_000;
  });
  const analysisNews = sessionNews.length ? sessionNews : news.slice(0, 20);
  const topicScores = MARKET_NEWS_TOPICS.map((topic) => ({
    ...topic,
    score: analysisNews.reduce((count, item) => count + (topic.pattern.test(`${item.title} ${item.description}`) ? 1 : 0), 0)
  })).filter((topic) => topic.score > 0).sort((a, b) => b.score - a.score);
  if (topicScores.length) {
    signals.push(`当日新闻线索集中在${topicScores.slice(0, 2).map((topic) => topic.label).join("、")}`);
  }

  const directionPattern = nasdaq.changePct < 0
    ? /fall|drop|lower|decline|selloff|disappoint|delay|pressure/i
    : /rise|rally|gain|higher|soar|surge|beat|record/i;
  const relevantNews = analysisNews
    .map((item) => ({
      ...item,
      score: MARKET_NEWS_TOPICS.reduce(
        (score, topic) => score + (topic.pattern.test(`${item.title} ${item.description}`) ? 1 : 0),
        0
      ) + (directionPattern.test(item.title) ? 2 : 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] || null;

  return {
    date: nasdaq.date,
    state,
    summary: `纳指 ${nasdaq.changePct > 0 ? "+" : ""}${nasdaq.changePct.toFixed(2)}% · 标普 ${sp500.changePct > 0 ? "+" : ""}${sp500.changePct.toFixed(2)}%`,
    analysis: signals.join("；"),
    note: "原因分析为盘面与新闻线索归纳，不代表已确认因果",
    news: relevantNews ? {
      title: relevantNews.title,
      url: relevantNews.url,
      publishedAt: relevantNews.publishedAt,
      source: "CNBC RSS"
    } : null
  };
}

async function getVix() {
  return withCache("vix", 20_000, async () => {
    const json = await fetchJson("https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json", {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
    });
    const data = json.data || {};
    const current = toNumber(data.current_price);
    return {
      source: "Cboe delayed quotes",
      symbol: data.symbol || "^VIX",
      current: round(current, 2),
      change: round(toNumber(data.price_change), 2),
      changePct: round(toNumber(data.price_change_percent), 2),
      open: round(toNumber(data.open), 2),
      high: round(toNumber(data.high), 2),
      low: round(toNumber(data.low), 2),
      previousClose: round(toNumber(data.prev_day_close), 2),
      quoteTime: data.last_trade_time || null,
      sourceTime: json.timestamp || null,
      state: classifyVix(current)
    };
  });
}

async function getNasdaqDrawdown() {
  return withCache("drawdown", 60_000, async () => {
    const json = await fetchJson("https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=usNDX,day,,,320,qfq", {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
    });
    const node = json.data?.usNDX || {};
    const dayRows = Array.isArray(node.day) ? node.day : [];
    const rows = dayRows
      .map((row) => ({
        date: row[0],
        open: toNumber(row[1]),
        close: toNumber(row[2]),
        high: toNumber(row[3]),
        low: toNumber(row[4])
      }))
      .filter((row) => row.date && Number.isFinite(row.high) && Number.isFinite(row.close));
    const last252 = rows.slice(-252);
    const highRow = last252.reduce((max, row) => (row.high > max.high ? row : max), { high: -Infinity });
    const qt = node.qt?.usNDX || [];
    const latest = toNumber(qt[3]) || rows.at(-1)?.close || null;
    const drawdown = Number.isFinite(latest) && Number.isFinite(highRow.high) && highRow.high > 0
      ? Math.max(0, (1 - latest / highRow.high) * 100)
      : null;
    return {
      source: "腾讯证券美股日线",
      symbol: "NDX",
      current: round(latest, 2),
      high52w: round(highRow.high, 2),
      high52wDate: highRow.date || null,
      drawdownPct: round(drawdown, 2),
      state: classifyDrawdown(drawdown),
      quoteTime: qt[30] || rows.at(-1)?.date || null,
      historyCount: last252.length
    };
  });
}

async function getAlphaVantageValuation() {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null;
  try {
    const json = await fetchJson(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=QQQ&apikey=${encodeURIComponent(key)}`,
      { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" } }
    );
    const pe = toNumber(json.PERatio);
    const peg = toNumber(json.PEGRatio);
    if (!Number.isFinite(pe) && !Number.isFinite(peg)) return null;
    return {
      source: "Alpha Vantage OVERVIEW: QQQ",
      current: { pe, peg },
      updatedAt: nowIso()
    };
  } catch {
    return null;
  }
}

async function getQqqHoldings() {
  return withCache("qqq-holdings", 60 * 60_000, async () => {
    const key = process.env.ALPHAVANTAGE_API_KEY || "demo";
    const json = await fetchJson(
      `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=QQQ&apikey=${encodeURIComponent(key)}`,
      { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" } }
    );
    if (json.Information || json.Note || !Array.isArray(json.holdings)) {
      throw new Error(json.Information || json.Note || "QQQ holdings unavailable");
    }
    return json.holdings
      .map((item) => ({
        symbol: String(item.symbol || "").trim().toUpperCase(),
        name: item.description || "",
        weight: toNumber(item.weight)
      }))
      .filter((item) => /^[A-Z][A-Z0-9.-]*$/.test(item.symbol) && Number.isFinite(item.weight) && item.weight > 0);
  });
}

async function getUsStockPeMap(symbols) {
  const unique = Array.from(new Set(symbols)).slice(0, 120);
  const chunks = [];
  for (let i = 0; i < unique.length; i += 35) chunks.push(unique.slice(i, i + 35));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const secids = chunk.map((symbol) => `105.${symbol}`).join(",");
    const url =
      "https://push2.eastmoney.com/api/qt/ulist.np/get" +
      `?secids=${secids}&fields=f12,f13,f14,f9,f20,f23,f115,f152`;
    const json = await fetchJson(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
    });
    return Array.isArray(json.data?.diff) ? json.data.diff : [];
  }));
  const map = new Map();
  for (const item of results.flat()) {
    const symbol = String(item.f12 || "").toUpperCase();
    const decimals = item.f152 ?? 2;
    const pe = scaleEastmoney(item.f9 ?? item.f115, decimals);
    const pb = scaleEastmoney(item.f23, decimals);
    if (symbol) {
      map.set(symbol, {
        symbol,
        name: item.f14 || symbol,
        pe,
        pb,
        marketCap: toNumber(item.f20)
      });
    }
  }
  return map;
}

async function getEstimatedNasdaqPe() {
  return withCache("estimated-nasdaq-pe", 15 * 60_000, async () => {
    const holdings = await getQqqHoldings();
    const peMap = await getUsStockPeMap(holdings.map((item) => item.symbol));
    let coveredWeight = 0;
    let earningsYield = 0;
    let weightedPe = 0;
    const used = [];

    for (const holding of holdings) {
      const quote = peMap.get(holding.symbol);
      if (!quote || !Number.isFinite(quote.pe) || quote.pe <= 0) continue;
      coveredWeight += holding.weight;
      earningsYield += holding.weight / quote.pe;
      weightedPe += holding.weight * quote.pe;
      used.push({
        symbol: holding.symbol,
        weight: holding.weight,
        pe: round(quote.pe, 2)
      });
    }

    const harmonicPe = coveredWeight > 0 && earningsYield > 0 ? coveredWeight / earningsYield : null;
    return {
      value: round(harmonicPe, 2),
      weightedAveragePe: round(coveredWeight > 0 ? weightedPe / coveredWeight : null, 2),
      coveragePct: round(coveredWeight * 100, 1),
      holdingsCount: holdings.length,
      usedCount: used.length,
      topUsed: used.slice(0, 10),
      source: "Alpha Vantage QQQ holdings + 东方财富美股动态PE",
      method: "按QQQ成分权重的盈利收益率调和估算"
    };
  });
}

async function getPublicNasdaqPeFallback() {
  return withCache("public-nasdaq-pe-fallback", 6 * 60 * 60_000, async () => {
    const sourceUrl = "https://worldperatio.com/index/nasdaq-100/";
    const html = await fetchText(sourceUrl, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }
    });
    const match = html.match(/vs Current P\/E<br>\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/i);
    const value = toNumber(match?.[1]);
    if (!Number.isFinite(value)) throw new Error("Public Nasdaq-100 PE unavailable");
    return {
      value: round(value, 2),
      source: "World PE Ratio Nasdaq-100",
      sourceUrl,
      method: "第三方公开指数估值备用值"
    };
  });
}

async function getValuation() {
  return withCache("valuation", 20_000, async () => {
    const fileData = await readValuationData();

    const [alpha, estimatedPe, publicPe] = await Promise.allSettled([
      getAlphaVantageValuation(),
      getEstimatedNasdaqPe(),
      getPublicNasdaqPeFallback()
    ]);
    const alphaData = alpha.status === "fulfilled" ? alpha.value : null;
    const peEstimate = estimatedPe.status === "fulfilled" ? estimatedPe.value : null;
    const peFallback = publicPe.status === "fulfilled" ? publicPe.value : null;
    const current = fileData.current || {};
    const manualPe = toNumber(current.pe);
    const alphaPe = toNumber(alphaData?.current?.pe);
    const estimatedPeValue = toNumber(peEstimate?.value);
    const fallbackPeValue = toNumber(peFallback?.value);
    const pe = manualPe ?? alphaPe ?? estimatedPeValue ?? fallbackPeValue;
    const peg = toNumber(current.peg) ?? toNumber(alphaData?.current?.peg);
    const peSource = Number.isFinite(manualPe)
      ? fileData.source || "manual"
      : Number.isFinite(alphaPe)
        ? alphaData.source
        : Number.isFinite(estimatedPeValue)
          ? peEstimate.source
          : Number.isFinite(fallbackPeValue)
            ? peFallback.source
            : null;
    const usesEstimatedPe = !Number.isFinite(manualPe) && !Number.isFinite(alphaPe)
      && Number.isFinite(estimatedPeValue);
    const usesFallbackPe = !Number.isFinite(manualPe) && !Number.isFinite(alphaPe)
      && !Number.isFinite(estimatedPeValue) && Number.isFinite(fallbackPeValue);
    const pegSource = Number.isFinite(toNumber(current.peg))
      ? fileData.source || "manual"
      : Number.isFinite(toNumber(alphaData?.current?.peg))
        ? alphaData.source
        : null;
    const valuationSource = [peSource, pegSource].filter(Boolean).join(" / ");

    return {
      source: valuationSource || fileData.source || "manual",
      updatedAt: alphaData?.updatedAt || fileData.updatedAt || nowIso(),
      note: fileData.note || null,
      pe: {
        value: round(pe, 2),
        state: Number.isFinite(pe)
          ? { label: Number.isFinite(toNumber(current.pe)) ? "手动值" : "当前估算", level: "info" }
          : { label: "待接入", level: "muted" },
        source: peSource,
        coveragePct: usesEstimatedPe ? peEstimate.coveragePct ?? null : null,
        method: usesEstimatedPe ? peEstimate.method : usesFallbackPe ? peFallback.method : null,
        usedCount: usesEstimatedPe ? peEstimate.usedCount ?? null : null,
        holdingsCount: usesEstimatedPe ? peEstimate.holdingsCount ?? null : null,
        history: interpretPeHistory(pe)
      },
      peg: {
        value: round(peg, 2),
        state: Number.isFinite(peg)
          ? { label: Number.isFinite(toNumber(current.peg)) ? "手动值" : "当前值", level: "info" }
          : { label: "待接入", level: "muted" },
        source: pegSource
      },
      currentReady: Number.isFinite(pe) || Number.isFinite(peg),
      ready: Number.isFinite(pe) || Number.isFinite(peg)
    };
  });
}

async function searchFundCodes() {
  const tasks = FUND_SEARCH_KEYS.map(async (key) => {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(key)}&type=0`;
    const json = await fetchJson(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
    });
    return Array.isArray(json.Datas) ? json.Datas : [];
  });
  const rows = (await Promise.allSettled(tasks))
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return rows
    .map((row) => row.CODE || row.FundBaseInfo?.FCODE)
    .filter((code) => /^\d{6}$/.test(code))
    .filter((code) => !code.startsWith("159") && !code.startsWith("513"));
}

function parseLimitText(text) {
  if (!text) return { amount: null, text: "--" };
  const match = text.match(/(?:上限|限额|限购|单日投资上限)\s*([0-9]+(?:\.[0-9]+)?)\s*(万)?元?/);
  if (!match) return { amount: null, text };
  const raw = Number(match[1]);
  const amount = match[2] ? raw * 10000 : raw;
  return { amount, text };
}

function classifySubscription(text) {
  if (!text) return { label: "无数据", level: "muted" };
  if (text.includes("暂停")) return { label: "暂停/限购", level: "danger" };
  if (text.includes("限")) return { label: "限购", level: "warning" };
  if (text.includes("开放")) return { label: "开放", level: "good" };
  return { label: text, level: "info" };
}

async function fetchFundLimit(code) {
  const url =
    `https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx?FCODE=${code}` +
    "&deviceid=dashboard&plat=Iphone&product=EFund&version=6.3.8";
  const json = await fetchJson(url, {
    headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }
  });
  const data = json.Datas;
  if (!data || !data.SHORTNAME) return null;
  const limit = parseLimitText(data.SGZT);
  return {
    code,
    name: data.SHORTNAME,
    company: data.JJGS || "--",
    nav: round(toNumber(data.DWJZ), 4),
    navDate: data.FSRQ || null,
    minBuy: toNumber(data.MINSG),
    subscription: data.SGZT || "--",
    limitAmount: limit.amount,
    state: classifySubscription(data.SGZT),
    buyEnabled: Boolean(data.BUY),
    source: "东方财富基金移动接口"
  };
}

async function getFundLimits() {
  return withCache("fund-limits", 10 * 60_000, async () => {
    const discovered = await searchFundCodes();
    const codes = Array.from(new Set([...discovered, ...LIMIT_SEED_CODES]));
    const results = await Promise.allSettled(codes.map(fetchFundLimit));
    const funds = results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter(Boolean)
      .filter((item) => item.name.includes("纳斯达克100"))
      .sort((a, b) => {
        const amountA = Number.isFinite(a.limitAmount) ? a.limitAmount : -1;
        const amountB = Number.isFinite(b.limitAmount) ? b.limitAmount : -1;
        if (amountA !== amountB) return amountB - amountA;
        if (a.company === b.company) return a.name.localeCompare(b.name, "zh-Hans-CN");
        return a.company.localeCompare(b.company, "zh-Hans-CN");
      });
    return {
      source: "东方财富基金移动接口",
      updatedAt: nowIso(),
      count: funds.length,
      funds
    };
  });
}

async function capture(name, getter, fallback) {
  const started = Date.now();
  try {
    const data = await getter();
    return {
      ok: true,
      name,
      latencyMs: Date.now() - started,
      data
    };
  } catch (error) {
    return {
      ok: false,
      name,
      latencyMs: Date.now() - started,
      error: error.message,
      data: fallback
    };
  }
}

async function getSnapshot() {
  const [futures, indexCloses, etfs, vix, drawdown, valuation, fundLimits, marketNews] = await Promise.all([
    capture("纳指/标普期货", getFutures, []),
    capture("美股前收", getPreviousMarketCloses, []),
    capture("ETF IOPV", getEtfQuotes, []),
    capture("VIX", getVix, null),
    capture("纳指回撤", getNasdaqDrawdown, null),
    capture("PE/PEG", getValuation, null),
    capture("场外限额", getFundLimits, { funds: [], count: 0 }),
    capture("异动新闻", getMarketNews, [])
  ]);

  const sources = [futures, indexCloses, etfs, vix, drawdown, valuation, fundLimits, marketNews].map((item) => ({
    name: item.name,
    ok: item.ok,
    latencyMs: item.latencyMs,
    error: item.error || null
  }));

  return {
    generatedAt: nowIso(),
    futures: futures.data,
    indexCloses: indexCloses.data,
    etfs: etfs.data,
    vix: vix.data,
    drawdown: drawdown.data,
    valuation: valuation.data,
    fundLimits: fundLimits.data,
    marketAlert: buildMarketAlert(indexCloses.data, vix.data, marketNews.data),
    sources
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

async function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/snapshot") {
        sendJson(res, 200, await getSnapshot());
        return;
      }
      if (url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, time: nowIso() });
        return;
      }
      await sendStatic(req, res);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });
}

function startServer(port = PORT, host = HOST) {
  const tryPort = (candidate, attemptsLeft) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
        tryPort(candidate + 1, attemptsLeft - 1);
        return;
      }
      throw error;
    });
    server.listen(candidate, host, () => {
      console.log(`Dashboard running at http://${host}:${candidate}`);
    });
    return server;
  };
  return tryPort(port, 10);
}

if (require.main === module) {
  startServer();
}

module.exports = {
  getSnapshot,
  getEtfQuotes,
  getFutures,
  getPreviousMarketCloses,
  getVix,
  getNasdaqDrawdown,
  getFundLimits,
  getValuation,
  getEstimatedNasdaqPe,
  getPublicNasdaqPeFallback,
  startServer
};
