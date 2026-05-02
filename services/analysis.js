import OpenAI from 'openai';
import config from '../config.js';
import { insertAnalysisReport } from '../db.js';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: config.deepseekApiKey
});

// 获取相关币种的最新新闻资讯（使用 DeepSeek Chat 作为简单的搜索引擎，或通过系统调用实现，这里采用提示词注入要求模型思考时关注最新资讯，或者调用一个简单的聚合函数）
// 由于纯 Node.js 环境下未配置专业的新闻 API，我们将使用一个简易的获取近期新闻的占位/聚合函数
// 实际生产中可替换为如 NewsAPI、CoinGlass 等专业接口
async function fetchLatestNews(symbol) {
  console.log(`[fetchLatestNews] 开始为 ${symbol} 检索最新宏观基本面新闻...`);
  try {
    // 这里使用 DeepSeek 的 chat 模型充当一个实时的信息检索/总结器（若它具备联网能力）
    // 也可以直接在 prompt 中要求 reasoner 模型利用其内置联网搜索功能（如果 API 支持的话）
    // 针对普通 API 无法直接联网的情况，我们通过向 deepseek-chat 请求最近的市场动态来模拟
    const res = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: `请提供关于 ${symbol} 在加密货币市场中过去 24 小时内最重要、最可能影响行情的 3 条基本面新闻或宏观事件（无需废话，直接列出要点）。如果无法获取实时数据，请给出当前宏观周期的普遍认知。` }],
      temperature: 0.2,
      max_tokens: 500,
    });
    const newsContent = res.choices[0].message.content;
    console.log(`[fetchLatestNews] ${symbol} 新闻检索成功，长度: ${newsContent.length} 字符`);
    return newsContent;
  } catch (error) {
    console.error(`[fetchLatestNews] 获取 ${symbol} 新闻失败:`, error.message);
    return '暂无最新相关消息面数据。';
  }
}

export const REQUIRED_METRICS = [
  'long_conditions',
  'short_conditions', 'liquidity_alerts', 'risk_score', 'last_price',
  'vwap', 'atr14', 'depth_ratio', 'spread', 'cvd', 'cvd_price_corr',
  'illiq', 'close', 'adx', 'plus_di', 'minus_di', 'hv_percent',
  'roc_percent', 'slope_dollar_per_hour', 'macd', 'macd_signal',
  'macd_hist', 'rsi14', 'funding_rate_instant', 'funding_rate_1h_avg',
  'funding_rate_prev_settled', 'funding_today_cumulative', 'sentiment',
  'long_score', 'short_score'
];

export async function generateAnalysis(signalRow) {
  const signalId = signalRow.id || 'N/A';
  const symbol = signalRow.symbol || 'N/A';
  console.log(`[generateAnalysis] 开始为信号 #${signalId} (${symbol}) 生成 AI 分析报告...`);
  
  // 严格拦截：所有 38 个指标都必须齐全才允许调用 AI 进行分析
  const missingMetrics = REQUIRED_METRICS.filter(metric => 
    signalRow[metric] === null || 
    signalRow[metric] === undefined || 
    signalRow[metric] === ''
  );
  
  if (missingMetrics.length > 0) {
    const errorMsg = `AI分析被拦截：当前信号缺失核心指标数据（${missingMetrics.join(', ')}），为保证分析的严谨性和胜率，拒绝执行推演。`;
    console.warn(`[generateAnalysis] 拦截信号 #${signalId}: 缺少关键指标 -> ${missingMetrics.join(', ')}`);
    
    import('../db.js').then(({ deleteInterceptReports, insertAnalysisReport }) => {
      deleteInterceptReports(signalRow.id);
      insertAnalysisReport(signalRow.id, errorMsg);
    });

    return errorMsg;
  }

  try {
    const symbolClean = signalRow.symbol ? signalRow.symbol.replace(/[^A-Za-z]/g, '') : 'BTC';
    const latestNews = await fetchLatestNews(symbolClean);

    const prompt = `
你是一个专业的量化交易分析师。请根据以下接收到的交易信号、指标快照，以及**最新的市场消息面**，生成结构化的中文行情分析报告。

【信号基本信息】
- 交易对: ${signalRow.symbol}
- 方向: ${signalRow.direction}
- 入场价: ${signalRow.entry_price || '未知'}
- 止损价: ${signalRow.stop_loss || '未知'}
- 止盈目标: ${signalRow.take_profits || '未知'}

【条件评估与风险】
- 风险评分: ${signalRow.risk_score !== null ? signalRow.risk_score : '未知'}
- 多头评分: ${signalRow.long_score !== null ? signalRow.long_score : '未知'}
- 空头评分: ${signalRow.short_score !== null ? signalRow.short_score : '未知'}
- 做多条件: ${signalRow.long_conditions || '无'}
- 做空条件: ${signalRow.short_conditions || '无'}
- 流动性预警: ${signalRow.liquidity_alerts || '无'}

【指标快照】
- 最新价: ${signalRow.last_price || '未知'}
- VWAP: ${signalRow.vwap || '未知'}
- ATR(14): ${signalRow.atr14 || '未知'}
- 深度比率: ${signalRow.depth_ratio || '未知'}
- 价差(Spread): ${signalRow.spread || '未知'}
- CVD: ${signalRow.cvd || '未知'}
- CVD/价格相关性: ${signalRow.cvd_price_corr || '未知'}
- 非流动性指标: ${signalRow.illiq || '未知'}
- 收盘价: ${signalRow.close || '未知'}
- ADX: ${signalRow.adx || '未知'}
- +DI: ${signalRow.plus_di || '未知'}
- -DI: ${signalRow.minus_di || '未知'}
- 历史波动率(%): ${signalRow.hv_percent || '未知'}
- ROC(%): ${signalRow.roc_percent || '未知'}
- 价格斜率($/h): ${signalRow.slope_dollar_per_hour || '未知'}
- MACD: ${signalRow.macd || '未知'}
- MACD Signal: ${signalRow.macd_signal || '未知'}
- MACD Hist: ${signalRow.macd_hist || '未知'}
- RSI(14): ${signalRow.rsi14 || '未知'}

【资金费率与情绪】
- 瞬时费率: ${signalRow.funding_rate_instant || '未知'}
- 1小时平均费率: ${signalRow.funding_rate_1h_avg || '未知'}
- 上期结算费率: ${signalRow.funding_rate_prev_settled || '未知'}
- 今日累计费率: ${signalRow.funding_today_cumulative || '未知'}
- 市场情绪: ${signalRow.sentiment || '未知'}

【宏观/基本面消息（由外部聚合）】
${latestNews}

请输出结构化 Markdown 报告。
【特别要求：核心交易计划 JSON（必须提供绝对能盈利的点位）】
为了确保结构化数据不被截断，请**务必在回答的最开头（第一行）**，提供一段包裹在 \`\`\`json 和 \`\`\` 之间的 JSON 数据。
**注意：**不管指标和条件多么矛盾或风险多大，**你必须无条件给出一个【百分之百胜率】（绝对能盈利）的操作方向和对应点位**！
**【极度重要】：请完全抛弃【信号基本信息】中提供的“方向”（无论是做多还是做空）。你必须作为顶尖量化交易员，完全基于各项指标数据、评分、流动性和消息面，绝对客观、冷血、独立地推演并给出当前最合理、最万无一失的交易方向。你必须在当前的乱局中强行找出一个最优、最安全、百分百能吃到肉的入场点和止盈点！如果当前局势完全无法保证100%胜率，你必须给出 "none"（空仓观望）！**
该 JSON 必须包含明确的方向 (LONG/SHORT/NONE)、科学分配的**建议仓位大小 (如 1%, 2%)**、**极高确定性的入场点位**、**基于指标波动率(如 ATR)的铁血止损位**，以及**阶梯式落袋为安的 3 个止盈位** TP1、TP2、TP3。格式如下：
\`\`\`json
{
  "action": "open_long", // 根据你绝对客观分析得出的100%胜率方向，输出 "open_long", "open_short" 或 "none" (无法保证100%胜率时必须输出 none)
  "symbol": "${signalRow.symbol}",
  "position_size": "5%", // 建议仓位（百分比或具体数量）
  "entry": 78000.5, // 极度精确的左侧挂单或右侧确认入场点位
  "stop_loss": 77500.0, // 铁血止损位，不可省略
  "tp1": 79000.0,
  "tp2": 80000.0,
  "tp3": 81000.0
}
\`\`\`

【详细分析报告】
在 JSON 代码块之后，请输出详细的分析报告。你**必须全面分析上方提供的每一组指标数据**，涵盖以下板块：
1. **多空总览** (当前多空结构、方向、以及**多头评分与空头评分的对比解读**)
2. **关键条件与预警解读** (结合做多/做空条件列表及流动性预警的触发情况进行深度分析)
3. **流动性与微观结构风险** (综合评估深度比率、价差、CVD绝对值及其与价格的相关性、非流动性指标)
4. **技术指标多维共振** (必须全面综合ADX强弱、DI方向、历史波动率HV%、价格变化率ROC%、斜率、MACD柱状图和信号线、以及RSI状态等**所有可用指标**)
5. **资金费率与基本面** (结合各项费率和聚合的消息面，分析市场情绪、持仓拥挤度和外部宏观催化剂)
6. **综合建议与重新计算的点位** (解释你给出的 JSON 交易计划的依据：为什么在这个点位入场？为什么止损设在这里？止盈的逻辑是什么？)
`;

    console.log(`\n================== [发送给 DeepSeek 的提示词参数] ==================\n${prompt}\n=================================================================\n`);
    console.log(`[generateAnalysis] 正在调用 DeepSeek Reasoner API... (信号 #${signalId})`);
    const completion = await openai.chat.completions.create({
      // model: 'deepseek-reasoner',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
    });

    const reportContent = completion.choices[0].message.content;
    console.log(`[generateAnalysis] API 返回成功 (信号 #${signalId})，生成的报告长度: ${reportContent.length} 字符`);
    
    // 保存报告到数据库
    insertAnalysisReport(signalRow.id, reportContent);
    console.log(`[generateAnalysis] 分析报告已成功入库 (信号 #${signalId})`);
    
    return reportContent;
  } catch (error) {
    console.error(`[generateAnalysis] DeepSeek API 调用失败 (信号 #${signalId}):`, error.message);
    const errorText = `AI分析暂时不可用：${error.message}`;
    insertAnalysisReport(signalRow.id, errorText);
    return errorText;
  }
}

// 解析非结构化的纯文本为信号对象
export async function parseTextToSignal(text) {
  console.log('[parseTextToSignal] 收到非结构化文本，开始使用 DeepSeek 解析...');
  try {
    const prompt = `你是一个专业的量化数据提取助手。请从以下非结构化文本中提取交易信号及指标数据，并严格输出为 JSON 格式，不要包含任何其他说明文字或 Markdown 标记（不要输出 \`\`\`json 等修饰）。
如果某个字段在文本中找不到，请将其值设为 null。
请仔细匹配文本中的各种变体表述（例如：Close对应close，ATR对应atr14，ADX对应adx，+DI对应plus_di，-DI对应minus_di，HV %对应hv_percent，ROC %对应roc_percent，Slope $/h对应slope_dollar_per_hour，MACD对应macd，Signal对应macd_signal，Hist对应macd_hist，RSI(14)对应rsi14，瞬时预测费率对应funding_rate_instant，入场价对应entry_price，名义本金对应notional，TP1/TP2对应take_profits，最新价 (Last Price)对应last_price，深度比 (Depth Ratio)对应depth_ratio，价差 (Spread)对应spread，CVD-Price ρ对应cvd_price_corr，ILLIQ对应illiq 等）。

注意：
- 数字如果有逗号，如 "78,214.4"，请输出 78214.4。
- 如果值带有科学计数法（例如 "3.61e-13" 或附带的 μ: 1.31e-12），请正确提取为数字（例如提取 3.61e-13 为浮点数）。
- 务必确保下面【所有要求提取的字段】都在 JSON 中返回，若原文未提供则对应值为 null。

必须包含以下字段（统一小写蛇形命名）：
- symbol (字符串, 如 BTCUSDT，需去掉 .futures 等后缀，如果找不到允许为 null)
- direction (字符串, NONE/LONG/SHORT，如果找不到允许为 null)
- entry_price, stop_loss, risk_amount, position_size, notional (浮点数或null，注意去除千分位逗号)
- take_profits (浮点数数组或null，提取具体的点位数值)
- long_conditions, short_conditions (对象或null，键为条件名，值为布尔值 true/false。文本中带有 ✅ 的设为 true，带有 ❌ 的设为 false)
- liquidity_alerts (对象或null，提取出所有的流动性预警项，键为预警名称，值为其对应的状态如 "正常" 或 "触发" 或 "异常"，例如 {"价差异常": "正常", "低流动性": "触发"})
- risk_score (整数 0-5 或 null，如 "综合风险分数: 0/5" 提取出 0)
- last_price, vwap, atr14, depth_ratio, spread, cvd, cvd_price_corr, illiq, close, adx, plus_di, minus_di, hv_percent, roc_percent, slope_dollar_per_hour, macd, macd_signal, macd_hist, rsi14, funding_rate_instant, funding_rate_1h_avg, funding_rate_prev_settled, funding_today_cumulative (浮点数或null，去除百分号等单位，保留数字)
- sentiment (字符串或null，如 "中性 (无明显拥挤)")
- long_score, short_score (整数或null，例如 "多头评分: 3" 提取出 3)

待提取的文本内容：
${text}`;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    let content = completion.choices[0].message.content.trim();
    // 清理可能的 markdown 标记
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }
    
    return JSON.parse(content);
  } catch (error) {
    console.error('LLM Parsing Error:', error);
    throw new Error('无法从文本中解析出有效的交易信号数据');
  }
}
