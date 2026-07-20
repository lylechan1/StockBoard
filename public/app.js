const REFRESH_MS = 30_000;

const tooltipBubble = document.createElement("div");
tooltipBubble.id = "dataTooltipBubble";
tooltipBubble.className = "data-tooltip-bubble";
tooltipBubble.setAttribute("role", "tooltip");
document.body.appendChild(tooltipBubble);

let activeTooltipTarget = null;

function positionDataTooltip(target) {
  const targetRect = target.getBoundingClientRect();
  const bubbleRect = tooltipBubble.getBoundingClientRect();
  const edgeGap = 8;
  let left = targetRect.left + targetRect.width / 2 - bubbleRect.width / 2;
  left = Math.max(edgeGap, Math.min(left, window.innerWidth - bubbleRect.width - edgeGap));
  let top = targetRect.top - bubbleRect.height - 8;
  if (top < edgeGap) top = targetRect.bottom + 8;
  tooltipBubble.style.left = `${Math.round(left)}px`;
  tooltipBubble.style.top = `${Math.round(top)}px`;
}

function showDataTooltip(target) {
  const text = target?.dataset?.tooltip;
  if (!text) return;
  activeTooltipTarget = target;
  tooltipBubble.textContent = text;
  tooltipBubble.classList.add("is-visible");
  positionDataTooltip(target);
}

function hideDataTooltip() {
  activeTooltipTarget = null;
  tooltipBubble.classList.remove("is-visible");
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest?.("[data-tooltip]");
  if (!target || target === activeTooltipTarget) return;
  showDataTooltip(target);
});

document.addEventListener("mouseout", (event) => {
  if (!activeTooltipTarget) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget && activeTooltipTarget.contains(nextTarget)) return;
  hideDataTooltip();
});

document.addEventListener("focusin", (event) => {
  const target = event.target.closest?.("[data-tooltip]");
  if (target) showDataTooltip(target);
});

document.addEventListener("focusout", hideDataTooltip);
window.addEventListener("scroll", hideDataTooltip, true);
window.addEventListener("resize", hideDataTooltip);

const refs = {
  metricCards: document.getElementById("metricCards"),
  lastUpdated: document.getElementById("lastUpdated"),
  marketPulse: document.getElementById("marketPulse"),
  marketAlert: document.getElementById("marketAlert"),
  marketAlertDate: document.getElementById("marketAlertDate"),
  marketAlertAnalysis: document.getElementById("marketAlertAnalysis"),
  marketAlertLink: document.getElementById("marketAlertLink"),
  refreshBtn: document.getElementById("refreshBtn"),
  valuationStatus: document.getElementById("valuationStatus"),
  peValue: document.getElementById("peValue"),
  peMeta: document.getElementById("peMeta"),
  peHistory: document.getElementById("peHistory"),
  peState: document.getElementById("peState"),
  pegValue: document.getElementById("pegValue"),
  pegMeta: document.getElementById("pegMeta"),
  pegState: document.getElementById("pegState"),
  drawdownValue: document.getElementById("drawdownValue"),
  drawdownMeta: document.getElementById("drawdownMeta"),
  drawdownState: document.getElementById("drawdownState"),
  vixState: document.getElementById("vixState"),
  vixValue: document.getElementById("vixValue"),
  vixChange: document.getElementById("vixChange"),
  vixTime: document.getElementById("vixTime"),
  limitCount: document.getElementById("limitCount"),
  limitRows: document.getElementById("limitRows"),
  sourceStatus: document.getElementById("sourceStatus")
};

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}%`;
}

function formatDrawdownPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  if (value === 0) return `${formatNumber(0, digits)}%`;
  return `-${formatNumber(Math.abs(value), digits)}%`;
}

function formatSignedNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return "--";
  if (value >= 10000) return `${formatNumber(value / 10000, 1)}万元`;
  return `${formatNumber(value, 0)}元`;
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function classForChange(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "change-up" : "change-down";
}

function setPill(el, text, level = "muted") {
  el.textContent = text;
  el.className = `${el.classList.contains("badge") ? "badge" : "state-pill"} ${level || "muted"}`;
}

function toneFromState(state, fallback = "blue") {
  if (!state?.level) return fallback;
  if (state.level === "danger" || state.level === "extreme") return "red";
  if (state.level === "warning") return "amber";
  if (state.level === "good") return "green";
  return fallback;
}

function metricCard({ title, code, value, state, metaLeft, metaRight, changePct, small, tone, variant, secondaryValue }) {
  const changeClass = classForChange(changePct);
  const cardClass = ["metric-card", `tone-${tone || "blue"}`];
  if (variant) cardClass.push(`metric-card-${variant}`);
  if (variant === "future") {
    return `
      <article class="${cardClass.join(" ")}">
        <div class="metric-title">
          <h3 title="${title}">${title}</h3>
          <span class="metric-code" data-tooltip="期货合约代码">${code || ""}</span>
        </div>
        <div class="future-focus">
          <div class="future-change ${changeClass}" data-tooltip="当前期货价格相对上一结算价的涨跌幅" tabindex="0">${state?.label || "--"}</div>
          <div class="future-price" data-tooltip="当前期货点位 / 相对上一结算价的点数变化">${secondaryValue || value}</div>
        </div>
        <div class="metric-sub">
          <span data-tooltip="当前交易日最低点 / 最高点">${metaLeft || "--"}</span>
          <span data-tooltip="期货行情更新时间">${metaRight || "--"}</span>
        </div>
      </article>
    `;
  }

  if (variant === "market") {
    return `
      <article class="${cardClass.join(" ")}">
        <div class="metric-title">
          <h3 title="${title}">${title}</h3>
          <span class="metric-code" data-tooltip="指数行情代码">${code || ""}</span>
        </div>
        <div class="market-close-focus">
          <div class="market-close-change ${changeClass}" data-tooltip="上一交易日收盘相对前一交易日收盘的涨跌幅" tabindex="0">${value}</div>
          <span class="badge muted" data-tooltip="该数值来自最近一个完整交易日">已收盘</span>
        </div>
        <div class="market-close-price" data-tooltip="上一交易日收盘点位 / 点数变化">${secondaryValue || "--"}</div>
        <div class="metric-sub">
          <span data-tooltip="上一交易日最低点 / 最高点">${metaLeft || "--"}</span>
          <span data-tooltip="对应的美股交易日期">${metaRight || "--"}</span>
        </div>
      </article>
    `;
  }

  return `
    <article class="${cardClass.join(" ")}">
      <div class="metric-title">
        <h3 title="${title}">${title}</h3>
        <span class="metric-code" data-tooltip="境内交易所基金代码">${code || ""}</span>
      </div>
      <div class="metric-main">
        <div class="metric-value-stack">
          <div class="metric-value-row">
            <div class="metric-value ${small ? "small" : ""}" data-tooltip="ETF市场价格相对IOPV的溢价率；正数为溢价，负数为折价" tabindex="0">${value}</div>
            ${state ? `<span class="badge ${state.level || "muted"}" data-tooltip="根据当前溢价率区间生成的状态">${state.label}</span>` : ""}
          </div>
          ${secondaryValue ? `<div class="metric-detail" data-tooltip="基金最近披露的资产净值规模">${secondaryValue}</div>` : ""}
        </div>
      </div>
      <div class="metric-sub">
        <span class="${changeClass}" data-tooltip="ETF实时价格或昨收 / 盘中参考净值IOPV">${metaLeft || "--"}</span>
        <span data-tooltip="ETF当日成交额">${metaRight || "--"}</span>
      </div>
    </article>
  `;
}

function renderMetricCards(snapshot) {
  hideDataTooltip();
  const futures = (snapshot.futures || []).map((item) => metricCard({
    title: item.title,
    code: item.symbol.replace("hf_", ""),
    value: formatNumber(item.current, 2),
    secondaryValue: `${formatNumber(item.current, 2)} / ${formatSignedNumber(item.change, 2)}`,
    state: {
      label: formatPercent(item.changePct, 2),
      level: item.changePct >= 0 ? "good" : "danger"
    },
    metaLeft: `${formatNumber(item.low, 0)} / ${formatNumber(item.high, 0)}`,
    metaRight: item.quoteTime,
    changePct: item.changePct,
    tone: item.changePct >= 0 ? "green" : "red",
    variant: "future"
  }));

  const indexCloses = (snapshot.indexCloses || []).map((item) => metricCard({
    title: item.title,
    code: item.code,
    value: formatPercent(item.changePct, 2),
    secondaryValue: `收盘 ${formatNumber(item.close, 2)} / ${formatSignedNumber(item.change, 2)}`,
    metaLeft: `${formatNumber(item.low, 0)} / ${formatNumber(item.high, 0)}`,
    metaRight: item.date,
    changePct: item.changePct,
    tone: item.changePct >= 0 ? "green" : "red",
    variant: "market"
  }));

  const etfs = (snapshot.etfs || []).map((item) => metricCard({
    title: item.title,
    code: item.code,
    value: formatPercent(item.premiumPct, 2),
    secondaryValue: Number.isFinite(item.fundScaleBillion)
      ? `规模 ${formatNumber(item.fundScaleBillion, 2)}亿`
      : "规模 --",
    state: item.premiumState,
    metaLeft: `${item.priceIsPreviousClose ? "昨收" : "价"} ${formatNumber(item.current, 3)} / IOPV ${formatNumber(item.iopv, 3)}`,
    metaRight: `${formatNumber(item.amount, 2)}亿`,
    changePct: item.premiumPct,
    small: true,
    tone: toneFromState(item.premiumState, "blue")
  }));

  refs.metricCards.innerHTML = [...futures, ...indexCloses, ...etfs].join("");
}

function renderValuation(snapshot) {
  const valuation = snapshot.valuation || {};
  const pe = valuation.pe || {};
  const peg = valuation.peg || {};
  refs.peValue.textContent = formatNumber(pe.value, 2);
  const peParts = [];
  if (Number.isFinite(pe.coveragePct)) peParts.push(`覆盖 ${formatNumber(pe.coveragePct, 1)}%`);
  if (pe.method) peParts.push(pe.method.includes("备用") ? "公开指数备用" : "QQQ成分估算");
  refs.peMeta.textContent = peParts.length ? peParts.join(" | ") : "--";
  if (pe.history) {
    const direction = pe.history.deviationPct >= 0 ? "高" : "低";
    refs.peHistory.textContent = `${pe.history.assessment} | 较长期均值 ${formatNumber(pe.history.benchmarkPe, 1)}x ${direction}${formatNumber(Math.abs(pe.history.deviationPct), 1)}%`;
    refs.peHistory.dataset.tooltip = `当前PE相对长期均值的粗略位置。${pe.history.note}；参考：${pe.history.source}`;
  } else {
    refs.peHistory.textContent = "历史位置待评估";
    refs.peHistory.dataset.tooltip = "需要有效PE后才能判断其相对长期均值的位置";
  }
  refs.pegValue.textContent = formatNumber(peg.value, 2);
  refs.pegMeta.textContent = peg.source ? "当前值已接入" : "PEG待接入";
  setPill(
    refs.peState,
    pe.history?.label || pe.state?.label || "待接入",
    pe.history?.level || pe.state?.level || "muted"
  );
  setPill(refs.pegState, peg.state?.label || "待接入", peg.state?.level || "muted");
  setPill(
    refs.valuationStatus,
    valuation.currentReady ? "当前值已接入" : "估值待接入",
    valuation.currentReady ? "info" : "warning"
  );

  const drawdown = snapshot.drawdown || {};
  refs.drawdownValue.textContent = formatDrawdownPercent(drawdown.drawdownPct, 2);
  refs.drawdownMeta.textContent = drawdown.high52w
    ? `高点 ${formatNumber(drawdown.high52w, 0)} | ${drawdown.high52wDate || "--"}`
    : "--";
  setPill(refs.drawdownState, drawdown.state?.label || "--", drawdown.state?.level || "muted");
}

function renderMarketAlert(snapshot) {
  const alert = snapshot.marketAlert;
  if (!alert) {
    refs.marketAlertDate.textContent = "--";
    refs.marketAlertAnalysis.textContent = "原因线索待更新";
    refs.marketAlertAnalysis.dataset.tooltip = "前一交易日的原因线索暂不可用";
    refs.marketAlertLink.hidden = true;
    return;
  }

  refs.marketAlertDate.textContent = alert.date || "--";
  refs.marketAlertAnalysis.textContent = alert.analysis || "暂无原因线索";
  refs.marketAlertAnalysis.dataset.tooltip = `${alert.analysis || ""}。${alert.note || ""}`;

  const url = alert.news?.url;
  if (url && /^https:\/\//i.test(url)) {
    refs.marketAlertLink.href = url;
    refs.marketAlertLink.title = alert.news.title || "查看相关财经新闻";
    refs.marketAlertLink.hidden = false;
  } else {
    refs.marketAlertLink.removeAttribute("href");
    refs.marketAlertLink.hidden = true;
  }
}

function renderVix(snapshot) {
  const vix = snapshot.vix || {};
  refs.vixValue.textContent = formatNumber(vix.current, 2);
  refs.vixChange.textContent = `${formatPercent(vix.changePct, 2)} / ${formatNumber(vix.change, 2)}`;
  refs.vixChange.className = classForChange(vix.changePct);
  refs.vixTime.textContent = vix.quoteTime ? formatTime(vix.quoteTime) : "--";
  setPill(refs.vixState, vix.state?.label || "--", vix.state?.level || "muted");
}

function renderLimits(snapshot) {
  const limitData = snapshot.fundLimits || {};
  const rows = limitData.funds || [];
  setPill(refs.limitCount, `${rows.length}只`, rows.length ? "good" : "muted");
  if (!rows.length) {
    refs.limitRows.innerHTML = `<tr><td colspan="3">暂无限额数据</td></tr>`;
    return;
  }
  refs.limitRows.innerHTML = rows.map((item) => `
    <tr>
      <td>
        <div class="fund-name">
          <strong>${item.name}</strong>
          <span data-tooltip="基金代码 / 基金管理人">${item.code} · ${item.company}</span>
        </div>
      </td>
      <td>
        <span class="badge ${item.state?.level || "muted"}" data-tooltip="该基金当前披露的单日申购限额或申购状态">${item.limitAmount ? formatAmount(item.limitAmount) : item.state?.label || "--"}</span>
        <small data-tooltip="基金公司披露的当前申购规则">${item.subscription || "--"}</small>
      </td>
      <td data-tooltip="基金最新单位净值对应的日期">${item.navDate || "--"}</td>
    </tr>
  `).join("");
}

function renderSources(snapshot) {
  const sources = snapshot.sources || [];
  const okCount = sources.filter((item) => item.ok).length;
  const allOk = okCount === sources.length;
  refs.marketPulse.textContent = allOk ? "接口正常" : `${okCount}/${sources.length}可用`;
  refs.marketPulse.className = `pulse ${allOk ? "good" : "warning"}`;
  refs.sourceStatus.textContent = sources.map((item) => {
    const status = item.ok ? `正常 ${item.latencyMs}ms` : `异常 ${item.error || ""}`;
    return `${item.name}: ${status}`;
  }).join(" | ");
}

function render(snapshot) {
  refs.lastUpdated.textContent = `更新时间 ${formatTime(snapshot.generatedAt)}`;
  renderMetricCards(snapshot);
  renderMarketAlert(snapshot);
  renderValuation(snapshot);
  renderVix(snapshot);
  renderLimits(snapshot);
  renderSources(snapshot);
}

async function loadSnapshot() {
  refs.refreshBtn.classList.add("loading");
  try {
    const res = await fetch("/api/snapshot", { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const snapshot = await res.json();
    render(snapshot);
  } catch (error) {
    refs.marketPulse.textContent = "接口异常";
    refs.marketPulse.className = "pulse danger";
    refs.sourceStatus.textContent = error.message;
  } finally {
    refs.refreshBtn.classList.remove("loading");
  }
}

refs.refreshBtn.addEventListener("click", loadSnapshot);
loadSnapshot();
setInterval(loadSnapshot, REFRESH_MS);
