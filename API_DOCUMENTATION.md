# DeepSeek 行情分析系统 API 文档

本文档提供了“DeepSeek 行情分析系统”的 API 接口说明，包括信号的接收、查询以及手动触发分析等功能。

---

## 1. 接收交易信号 (POST /api/v1/signals)

接收来自量化脚本或客户端推送的交易信号和行情指标数据。该接口支持增量数据，但系统内部会进行校验，**只有当 38 个核心指标全部集齐后**，才会触发后端的 DeepSeek AI 分析引擎生成报告。

### 请求信息
- **URL**: `/api/v1/signals`
- **Method**: `POST`
- **Content-Type**: `application/json` 或 `text/plain`

### 请求参数 (Body)

以下所有字段均为非必填（除 `symbol` 和 `direction` 强烈建议优先提供外）。缺失的字段将会在系统中被标记为空，待后续增量补充。

| 字段名称 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `symbol` | String | 交易对符号 (必填/首要) | "BTCUSDT" |
| `direction` | String | 初始信号方向 ("LONG", "SHORT")（注意：AI 分析时会**完全抛弃此字段的主观判断**，仅作为参考数据录入） | "LONG" |
| `entry_price` | Number | 初始入场价 | 68000.5 |
| `stop_loss` | Number | 初始止损价 | 67000.0 |
| `take_profits` | Array/String | 初始止盈目标 (可为 JSON 字符串) | "[69000, 70000]" |
| `risk_amount` | Number | 风险金额 | 100.0 |
| `position_size` | Number | 仓位大小 | 0.5 |
| `notional` | Number | 名义价值 | 34000.25 |
| `long_conditions` | Array/String | 触发的多头条件列表 | "[\"RSI超卖\", \"MACD金叉\"]" |
| `short_conditions`| Array/String | 触发的空头条件列表 | "[]" |
| `liquidity_alerts`| Array/String | 流动性预警信息 | "[\"买盘深度骤减\"]" |
| `risk_score` | Number | 系统评估的初始风险评分(1-5) | 3 |
| `long_score` | Number | 多头形态评分 | 8 |
| `short_score` | Number | 空头形态评分 | 2 |
| `last_price` | Number | 最新成交价 | 68050.0 |
| `vwap` | Number | 成交量加权平均价 | 67900.5 |
| `atr14` | Number | 14周期真实波幅 | 450.5 |
| `depth_ratio` | Number | 买卖盘深度比率 | 1.2 |
| `spread` | Number | 买一卖一价差 | 0.1 |
| `cvd` | Number | 累计成交量差 | 1500.5 |
| `cvd_price_corr` | Number | CVD与价格相关性系数 | 0.85 |
| `illiq` | Number | 非流动性指标 | 0.05 |
| `close` | Number | K线收盘价 | 68000.0 |
| `adx` | Number | 平均趋向指数 | 35.5 |
| `plus_di` | Number | +DI 指标 | 28.0 |
| `minus_di` | Number | -DI 指标 | 15.0 |
| `hv_percent` | Number | 历史波动率百分比 | 45.5 |
| `roc_percent` | Number | 价格变化率 | 2.5 |
| `slope_dollar_per_hour`| Number | 价格每小时斜率 | 150.0 |
| `macd` | Number | MACD 值 | 120.5 |
| `macd_signal` | Number | MACD 信号线 | 80.2 |
| `macd_hist` | Number | MACD 柱状图 | 40.3 |
| `rsi14` | Number | 14周期RSI | 65.5 |
| `funding_rate_instant`| Number | 实时资金费率 | 0.0001 |
| `funding_rate_1h_avg` | Number | 1小时平均资金费率 | 0.00015 |
| `funding_rate_prev_settled`| Number | 上期结算资金费率 | 0.0001 |
| `funding_today_cumulative`| Number | 今日累计资金费率 | 0.0003 |
| `sentiment` | String | 市场情绪指标 | "GREED" |

### 响应示例

**成功接收 (201 Created)**
```json
{
  "id": 12,
  "created_at": "2026-05-02 14:30:00",
  "updated_existing": false
}
```
*(注：`updated_existing` 为 true 表示当前提交合并到了上一个不完整的信号中)*

---

## 2. 增量补充数据 (PATCH /api/v1/signals 或 PATCH /api/v1/signals/:id)

当上一条信号因为缺少指标被 AI 拦截时，可以使用此接口补充缺失的数据。一旦所有数据补充完整，系统将自动触发解锁并开始 AI 分析。

### 请求信息
- **URL**: `/api/v1/signals` (默认更新数据库中最新的一条记录) 或 `/api/v1/signals/{id}` (更新指定 ID 的记录)
- **Method**: `PATCH`
- **Content-Type**: `text/plain` 或 `application/json`

### 请求参数
可以直接传递包含缺失指标的 JSON，或者直接传递纯文本（例如：`"ADX: 40.30\nMACD: 344.941"`），系统会自动尝试提取。

### 响应示例
**成功 (200 OK)**
```json
{
  "message": "数据已补充",
  "signal": {
    "id": 12,
    "symbol": "BTCUSDT",
    "adx": 40.3,
    ...
  }
}
```

---

## 3. 获取信号列表 (GET /api/v1/signals)

分页获取历史信号列表。

### 请求信息
- **URL**: `/api/v1/signals`
- **Method**: `GET`

### Query 参数
| 参数名 | 类型 | 说明 | 默认值 |
| :--- | :--- | :--- | :--- |
| `symbol` | String | 过滤特定交易对 (可选) | 无 |
| `limit` | Integer | 返回数量 | 10 |
| `offset` | Integer | 偏移量 | 0 |

### 响应示例
```json
[
  {
    "id": 12,
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "last_price": 68050.0,
    "risk_score": 3,
    "created_at": "2026-05-02 14:30:00",
    "report_summary": "基于当前的多空结构和资金费率..."
  }
]
```

---

## 4. 获取信号详情与分析报告 (GET /api/v1/signals/:id)

获取单个信号的完整指标数据以及其对应的所有 AI 分析报告。

### 请求信息
- **URL**: `/api/v1/signals/{id}`
- **Method**: `GET`

### 响应示例
```json
{
  "id": 12,
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "adx": 40.3,
  "macd": 120.5,
  "...": "...",
  "reports": [
    {
      "id": 5,
      "signal_id": 12,
      "content": "```json\n{\n  \"action\": \"open_long\",\n  \"symbol\": \"BTCUSDT\",\n  \"position_size\": \"5%\",\n  \"entry\": 68000.0,\n  \"stop_loss\": 67500.0,\n  \"tp1\": 69000.0,\n  \"tp2\": 70000.0,\n  \"tp3\": 71000.0\n}\n```\n\n### 详细分析报告\n1. **多空总览**\n...",
      "created_at": "2026-05-02 14:30:05"
    }
  ]
}
```

#### AI 报告 JSON 字段说明 (存在于 `reports[0].content` 头部)
AI 返回的报告正文头部必定包含一个核心交易计划的 JSON 块，字段规范如下：
- `action`: 操作建议 (`"open_long"`, `"open_short"`, `"none"`)。**注：AI 已被配置为绝对客观分析，只有在推演胜率接近 100% 时才会给出 long/short，否则会强制返回 "none"（空仓观望），并完全抛弃初始的 `direction` 信号。**
- `symbol`: 交易对符号 (如 `"BTCUSDT"`)
- `position_size`: 建议仓位大小 (如 `"5%"`)
- `entry`: 建议入场点位 (Number)，极度精确的左侧挂单或右侧确认点位
- `stop_loss`: 建议止损点位 (Number)，基于指标波动率的铁血止损位
- `tp1`, `tp2`, `tp3`: 阶梯止盈点位 1~3 (Number)

---

## 5. 手动重新分析 (POST /api/v1/signals/:id/analyze)

针对已存在的完整信号，手动强制触发一次新的 DeepSeek AI 分析（例如在消息面发生突变时）。

### 请求信息
- **URL**: `/api/v1/signals/{id}/analyze`
- **Method**: `POST`

### 响应示例
```json
{
  "message": "分析完成",
  "report": {
    "id": 6,
    "signal_id": 12,
    "content": "...",
    "created_at": "2026-05-02 15:00:00"
  }
}
```

---

## 6. 一键清空数据库 (DELETE /api/v1/signals/clear)

【危险操作】清空系统中所有的交易信号记录和分析报告记录。

### 请求信息
- **URL**: `/api/v1/signals/clear`
- **Method**: `DELETE`

### 响应示例
```json
{
  "message": "所有数据已清空"
}
```