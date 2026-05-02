// 有效字段清单及其默认值
const VALID_FIELDS = [
  'symbol', 'direction', 'entry_price', 'stop_loss', 'risk_amount',
  'position_size', 'notional', 'take_profits', 'long_conditions',
  'short_conditions', 'liquidity_alerts', 'risk_score', 'last_price',
  'vwap', 'atr14', 'depth_ratio', 'spread', 'cvd', 'cvd_price_corr',
  'illiq', 'close', 'adx', 'plus_di', 'minus_di', 'hv_percent',
  'roc_percent', 'slope_dollar_per_hour', 'macd', 'macd_signal',
  'macd_hist', 'rsi14', 'funding_rate_instant', 'funding_rate_1h_avg',
  'funding_rate_prev_settled', 'funding_today_cumulative', 'sentiment',
  'long_score', 'short_score'
];

// 常见别名映射表（键为小写）
const ALIAS_MAP = {
  'price': 'last_price',
  'last': 'last_price',
  '最新价 (last price)': 'last_price',
  'atr': 'atr14',
  'atr(14)': 'atr14',
  'atr_14': 'atr14',
  'cvd_price_correlation': 'cvd_price_corr',
  'cvd-price ρ': 'cvd_price_corr',
  'final_price': 'close',
  'close_price': 'close',
  'adx': 'adx',
  '+di': 'plus_di',
  '-di': 'minus_di',
  'hv %': 'hv_percent',
  'roc %': 'roc_percent',
  'slope $/h': 'slope_dollar_per_hour',
  'macd': 'macd',
  'signal': 'macd_signal',
  'hist': 'macd_hist',
  'rsi(14)': 'rsi14',
  '多头评分': 'long_score',
  '空头评分': 'short_score',
  '深度比 (depth ratio)': 'depth_ratio',
  '价差 (spread)': 'spread',
  'illiq': 'illiq',
  '入场价 (entry)': 'entry_price',
  '止损价 (sl)': 'stop_loss',
  '风险金额 (risk)': 'risk_amount',
  '仓位大小 (size)': 'position_size',
  '名义本金 (notional)': 'notional',
  '综合风险分数': 'risk_score',
  'risk score': 'risk_score',
  '条件评估': 'long_conditions',
  'long conditions': 'long_conditions',
  '[多头 / long]': 'long_conditions',
  '多头': 'long_conditions',
  'short conditions': 'short_conditions',
  '[空头 / short]': 'short_conditions',
  '空头': 'short_conditions',
  '流动性预警': 'liquidity_alerts',
  'liquidity alerts': 'liquidity_alerts'
};

// 扁平化对象
function flattenObject(obj, prefix = '') {
  let flattened = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      // 对于 null, undefined, 数组, 非对象直接赋值
      if (value === null || value === undefined || Array.isArray(value) || typeof value !== 'object') {
        flattened[key] = value;
      } else {
        // 如果是对象，继续扁平化
        const flatObj = flattenObject(value, key + '.');
        flattened = { ...flattened, ...flatObj };
        // 也保留原对象的引用，以便如果长条件/短条件是一个对象也能被直接提取
        flattened[key] = value;
      }
    }
  }
  return flattened;
}

export function extractSignal(rawData) {
  const errors = [];
  const signal = {};
  
  // 如果传入的是字符串，尝试解析为 JSON
  let dataToProcess = rawData;
  if (typeof rawData === 'string') {
    try {
      dataToProcess = JSON.parse(rawData);
    } catch (e) {
      // 无法解析，保留原样，后续流程会捕捉到字段缺失错误
    }
  }

  // 1. 展平对象
  const flatData = flattenObject(dataToProcess);
  
  // 转换为小写键以便不区分大小写匹配
  const lowerCaseKeysData = {};
  for (const key in flatData) {
    lowerCaseKeysData[key.toLowerCase()] = flatData[key];
  }

  // 2. 匹配有效字段（含别名）
  for (const field of VALID_FIELDS) {
    // 检查原字段名
    if (lowerCaseKeysData[field] !== undefined) {
      signal[field] = lowerCaseKeysData[field];
      continue;
    }
    
    // 检查是否有匹配的别名在传入数据中
    let found = false;
    for (const [alias, targetField] of Object.entries(ALIAS_MAP)) {
      if (targetField === field && lowerCaseKeysData[alias] !== undefined) {
        signal[field] = lowerCaseKeysData[alias];
        found = true;
        break;
      }
    }
    
    if (!found) {
      signal[field] = null; // 未提供的字段设为 null
    }
    
    // 特定清理
    if (field === 'risk_score' && typeof signal[field] === 'string') {
      const match = signal[field].match(/(\d+)/);
      if (match) signal[field] = parseInt(match[1], 10);
    }
  }

  // 3. 校验必填字段 (用户要求不再拦截，允许数据不全先入库)
  // 不再将 missing field 推入 errors，也不再在这里赋默认值（由入库处处理）

  return { signal, errors };
}
