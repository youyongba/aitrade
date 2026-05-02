import Database from 'better-sqlite3';
import config from './config.js';

// 获取东八区当前时间
export function getChinaTimeISO() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
}

const db = new Database(config.databasePath);

// 开启 WAL 模式以提升性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL,
      stop_loss REAL,
      risk_amount REAL,
      position_size REAL,
      notional REAL,
      take_profits TEXT,
      long_conditions TEXT,
      short_conditions TEXT,
      liquidity_alerts TEXT,
      risk_score INTEGER,
      last_price REAL,
      vwap REAL,
      atr14 REAL,
      depth_ratio REAL,
      spread REAL,
      cvd REAL,
      cvd_price_corr REAL,
      illiq REAL,
      close REAL,
      adx REAL,
      plus_di REAL,
      minus_di REAL,
      hv_percent REAL,
      roc_percent REAL,
      slope_dollar_per_hour REAL,
      macd REAL,
      macd_signal REAL,
      macd_hist REAL,
      rsi14 REAL,
      funding_rate_instant REAL,
      funding_rate_1h_avg REAL,
      funding_rate_prev_settled REAL,
      funding_today_cumulative REAL,
      sentiment TEXT,
      long_score INTEGER,
      short_score INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE CASCADE
    )
  `);
}

// 插入新信号
export function insertSignal(signal) {
  try {
    const created_at = getChinaTimeISO();
    const stmt = db.prepare(`
      INSERT INTO signals (
        symbol, direction, entry_price, stop_loss, risk_amount, position_size, notional,
        take_profits, long_conditions, short_conditions, liquidity_alerts, risk_score,
        last_price, vwap, atr14, depth_ratio, spread, cvd, cvd_price_corr, illiq,
        close, adx, plus_di, minus_di, hv_percent, roc_percent, slope_dollar_per_hour,
        macd, macd_signal, macd_hist, rsi14,
        funding_rate_instant, funding_rate_1h_avg, funding_rate_prev_settled, funding_today_cumulative,
        sentiment, long_score, short_score, created_at
      ) VALUES (
        @symbol, @direction, @entry_price, @stop_loss, @risk_amount, @position_size, @notional,
        @take_profits, @long_conditions, @short_conditions, @liquidity_alerts, @risk_score,
        @last_price, @vwap, @atr14, @depth_ratio, @spread, @cvd, @cvd_price_corr, @illiq,
        @close, @adx, @plus_di, @minus_di, @hv_percent, @roc_percent, @slope_dollar_per_hour,
        @macd, @macd_signal, @macd_hist, @rsi14,
        @funding_rate_instant, @funding_rate_1h_avg, @funding_rate_prev_settled, @funding_today_cumulative,
        @sentiment, @long_score, @short_score, @created_at
      )
    `);

    const result = stmt.run({
      ...signal,
      symbol: signal.symbol || 'BTCUSDT',
      direction: signal.direction || 'UNKNOWN',
      take_profits: signal.take_profits ? JSON.stringify(signal.take_profits) : null,
      long_conditions: signal.long_conditions ? JSON.stringify(signal.long_conditions) : null,
      short_conditions: signal.short_conditions ? JSON.stringify(signal.short_conditions) : null,
      liquidity_alerts: signal.liquidity_alerts ? JSON.stringify(signal.liquidity_alerts) : null,
      created_at
    });

    return { id: result.lastInsertRowid, created_at };
  } catch (error) {
    console.error('Insert Signal Error:', error);
    throw error;
  }
}

export function updateSignal(id, updateData) {
  try {
    const setClauses = [];
    const values = { id };
    
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== null && value !== undefined && value !== '' && key !== 'id' && key !== 'created_at') {
        setClauses.push(`${key} = @${key}`);
        // 数组或对象需要序列化
        if (['take_profits', 'long_conditions', 'short_conditions', 'liquidity_alerts'].includes(key) && typeof value === 'object') {
          values[key] = JSON.stringify(value);
        } else {
          values[key] = value;
        }
      }
    }
    
    if (setClauses.length === 0) return null;
    
    const stmt = db.prepare(`UPDATE signals SET ${setClauses.join(', ')} WHERE id = @id`);
    stmt.run(values);
    return getSignalById(id);
  } catch (error) {
    console.error('Update Signal Error:', error);
    throw error;
  }
}

// 插入分析报告
export function insertAnalysisReport(signalId, content) {
  const stmt = db.prepare(`
    INSERT INTO analysis_reports (signal_id, content, created_at)
    VALUES (@signal_id, @content, @created_at)
  `);

  const created_at = getChinaTimeISO();
  const result = stmt.run({ signal_id: signalId, content, created_at });

  return { id: result.lastInsertRowid, created_at };
}

// 分页查询信号（附带最新一条报告摘要）
export function getSignals(symbol, limit = 10, offset = 0) {
  let query = `
    SELECT s.*, 
           r.id as latest_report_id, 
           SUBSTR(r.content, 1, 100) as report_summary
    FROM signals s
    LEFT JOIN (
        SELECT id, signal_id, content
        FROM analysis_reports
        WHERE id IN (
            SELECT MAX(id)
            FROM analysis_reports
            GROUP BY signal_id
        )
    ) r ON s.id = r.signal_id
  `;
  const params = [];

  if (symbol) {
    query += ' WHERE s.symbol = ?';
    params.push(symbol);
  }

  query += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

// 根据 ID 获取完整信号及所有报告
export function getSignalById(id) {
  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(id);
  if (!signal) return null;

  const reports = db.prepare('SELECT * FROM analysis_reports WHERE signal_id = ? ORDER BY id DESC').all(id);
  
  return { ...signal, reports };
}

// 获取最新的单个信号
export function getLatestSignal() {
  const signal = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 1').get();
  return signal || null;
}

// 删除某信号的“AI分析被拦截”类报告，防止堆积
export function deleteInterceptReports(signalId) {
  db.prepare("DELETE FROM analysis_reports WHERE signal_id = ? AND content LIKE 'AI分析被拦截%'").run(signalId);
}

// 一键清除所有数据
export function clearDB() {
  db.exec(`
    DELETE FROM analysis_reports;
    DELETE FROM signals;
    DELETE FROM sqlite_sequence WHERE name='analysis_reports' OR name='signals';
  `);
}

export default db;
