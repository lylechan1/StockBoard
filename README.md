# 美股数据看板

本地运行：

```bash
npm start
```

默认打开 `http://127.0.0.1:4173`。如果端口被占用，服务会自动尝试后续端口，并在终端输出实际 URL。

## Render 部署

仓库包含 `render.yaml`，可以在 Render 上用 Blueprint 部署：

1. 将代码推送到 GitHub 仓库。
2. 在 Render 选择 New > Blueprint，并连接这个仓库。
3. Render 会读取 `render.yaml`，创建 Node Web Service。
4. 部署完成后访问 Render 分配的公网域名。

部署配置：

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Host: `0.0.0.0`

当前版本不使用 Render persistent disk。所有行情和估值数据都在请求时实时获取，不在云端写入历史文件。

## 数据源

- 纳指100期货、标普500期货：新浪财经全球期货 `hq.sinajs.cn`
- 境内 ETF 价格与 IOPV：新浪财经 ETF/IOPV `hq.sinajs.cn`
- 境内 ETF 基金规模：东方财富基金移动接口 `fundmobapi.eastmoney.com`
- VIX：Cboe delayed quotes `cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json`
- 纳指100回撤：腾讯证券美股日线 `web.ifzq.gtimg.cn`
- 场外基金限购：东方财富基金移动接口 `fundmobapi.eastmoney.com`
- 纳指 PE 估算：Alpha Vantage `ETF_PROFILE` 的 QQQ 成分权重 + 东方财富美股动态 PE `f9`

## PE/PEG

看板会自动估算当前纳指 PE：用 QQQ 成分权重抓取成分股，再用东方财富美股动态 PE 做盈利收益率调和估算。这个值适合做看板参考，不等同于 Nasdaq 官方指数估值。

免费公开源暂未验证到稳定的纳指100 PEG 和 PE/PEG 历史分位接口。当前版本暂时不展示历史分位，也不在本地或云端自动累积历史估值样本。

可选接入方式：

1. 维护 `data/valuation.json`，填入 `current.peg`；如需要覆盖估算 PE，也可以填 `current.pe`。
2. 设置 `ALPHAVANTAGE_API_KEY` 后启动服务，服务端会尝试读取 QQQ `OVERVIEW` 的 PE/PEG。

```json
{
  "current": {
    "pe": null,
    "peg": 1.8
  }
}
```
