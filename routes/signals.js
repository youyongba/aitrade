import express from 'express';
import { insertSignal, getSignals, getSignalById, updateSignal, getLatestSignal, clearDB } from '../db.js';
import { extractSignal } from '../extractor.js';
import { generateAnalysis, parseTextToSignal, REQUIRED_METRICS } from '../services/analysis.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/signals:
 *   post:
 *     summary: 接收交易信号并异步触发AI分析
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: 成功存储信号
 *       400:
 *         description: 数据校验失败
 */
router.post('/', async (req, res) => {
  // 如果请求体是字符串（例如 text/plain 或是由于某种原因未被 json middleware 捕获）
  // 或者对象里只包含一个长长的字符串（因为有时 urlencoded 会把整个 JSON 当作一个 key）
  let bodyData = req.body;

  // 应对某些情况下前端传来的非标准格式
  if (typeof bodyData === 'object' && Object.keys(bodyData).length === 1) {
      const firstKey = Object.keys(bodyData)[0];
      if (firstKey.startsWith('{') || firstKey.startsWith('【') || bodyData[firstKey] === '') {
          bodyData = firstKey + (bodyData[firstKey] ? '=' + bodyData[firstKey] : '');
      }
  }

  if (typeof bodyData === 'string') {
    try {
      bodyData = JSON.parse(bodyData);
    } catch (e) {
      // 无法解析为 JSON 的情况，调用 AI 解析非结构化文本
      try {
        bodyData = await parseTextToSignal(bodyData);
      } catch (parseErr) {
        return res.status(400).json({ errors: ['无法从文本中解析出有效的交易信号，请检查格式或包含必要的字段（symbol, direction）。'] });
      }
    }
  }

  const { signal, errors } = extractSignal(bodyData);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    // 检查是否有尚未完成补全的最新信号，如果未补全，则复用该信号记录（不新开分析/单）
    const latestSignal = getLatestSignal();
    let isLatestIncomplete = false;
    
    if (latestSignal) {
      const missing = REQUIRED_METRICS.filter(metric => 
        latestSignal[metric] === null || 
        latestSignal[metric] === undefined || 
        latestSignal[metric] === ''
      );
      if (missing.length > 0) {
        isLatestIncomplete = true;
      }
    }

    let savedId;
    if (isLatestIncomplete) {
      // 覆盖更新已有的不完整信号记录
      const updated = updateSignal(latestSignal.id, signal);
      savedId = updated.id;
    } else {
      // 插入全新信号记录
      const saved = insertSignal(signal);
      savedId = saved.id;
    }
    
    // 异步触发 AI 分析，如果仍不完整会继续被拦截，否则会解锁并执行
    const fullSignal = getSignalById(savedId);
    generateAnalysis(fullSignal).catch(err => console.error('Background analysis failed:', err));

    return res.status(201).json({ id: fullSignal.id, created_at: fullSignal.created_at, updated_existing: isLatestIncomplete });
  } catch (error) {
    console.error('Error saving signal:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signals:
 *   get:
 *     summary: 分页查询信号列表
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: 交易对符号
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: 信号列表及最新报告摘要
 */
router.get('/', (req, res) => {
  try {
    const symbol = req.query.symbol;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const signals = getSignals(symbol, limit, offset);
    
    // 处理 JSON 字符串字段供前端使用
    const parsedSignals = signals.map(sig => ({
      ...sig,
      take_profits: sig.take_profits ? JSON.parse(sig.take_profits) : null,
      long_conditions: sig.long_conditions ? JSON.parse(sig.long_conditions) : null,
      short_conditions: sig.short_conditions ? JSON.parse(sig.short_conditions) : null,
      liquidity_alerts: sig.liquidity_alerts ? JSON.parse(sig.liquidity_alerts) : null,
    }));

    return res.json(parsedSignals);
  } catch (error) {
    console.error('Error fetching signals:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signals/clear:
 *   delete:
 *     summary: 一键清空所有数据（包括信号和报告）
 *     responses:
 *       200:
 *         description: 成功清空所有数据
 *       500:
 *         description: 服务器内部错误
 */
router.delete('/clear', (req, res) => {
  try {
    clearDB();
    return res.json({ message: '所有数据已清空' });
  } catch (error) {
    console.error('Error clearing data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signals/{id}:
 *   get:
 *     summary: 根据ID获取完整信号及所有报告
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 完整信号及报告列表
 *       404:
 *         description: 信号未找到
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const signalData = getSignalById(id);

    if (!signalData) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    signalData.take_profits = signalData.take_profits ? JSON.parse(signalData.take_profits) : null;
    signalData.long_conditions = signalData.long_conditions ? JSON.parse(signalData.long_conditions) : null;
    signalData.short_conditions = signalData.short_conditions ? JSON.parse(signalData.short_conditions) : null;
    signalData.liquidity_alerts = signalData.liquidity_alerts ? JSON.parse(signalData.liquidity_alerts) : null;

    return res.json(signalData);
  } catch (error) {
    console.error('Error fetching signal by id:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signals/{id}/analyze:
 *   post:
 *     summary: 手动触发重新分析
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 分析报告已生成并返回
 *       404:
 *         description: 信号未找到
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const signalData = getSignalById(id);

    if (!signalData) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // 等待分析完成
    const reportContent = await generateAnalysis(signalData);

    return res.json({ message: 'Analysis generated', report: reportContent });
  } catch (error) {
    console.error('Error in manual analysis:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signals:
 *   patch:
 *     summary: 增量补充最新信号的数据（未传 ID 则默认操作最新一条）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *         text/plain:
 *           schema:
 *             type: string
 *     responses:
 *       200:
 *         description: 信号更新成功
 */
router.patch('/', async (req, res) => {
  try {
    const latestSignal = getLatestSignal();
    if (!latestSignal) {
      return res.status(404).json({ error: 'No signal found in database' });
    }
    
    return await handlePatchSignal(latestSignal.id, req, res);
  } catch (error) {
    console.error('PATCH /signals Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/signals/{id}:
 *   patch:
 *     summary: 增量补充数据（覆盖更新特定信号的缺失字段）
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *         text/plain:
 *           schema:
 *             type: string
 *     responses:
 *       200:
 *         description: 信号更新成功
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    return await handlePatchSignal(id, req, res);
  } catch (error) {
    console.error('PATCH /signals/:id Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 提取共用的 PATCH 处理逻辑
async function handlePatchSignal(id, req, res) {
  const existingSignal = getSignalById(id);
  if (!existingSignal) {
    return res.status(404).json({ error: 'Signal not found' });
  }

  let bodyData = req.body;
  
  // 应对非标准文本被包装为键的情况
  if (typeof bodyData === 'object' && Object.keys(bodyData).length === 1) {
    const firstKey = Object.keys(bodyData)[0];
    if (firstKey.startsWith('{') || firstKey.startsWith('【') || bodyData[firstKey] === '') {
      bodyData = firstKey + (bodyData[firstKey] ? '=' + bodyData[firstKey] : '');
    }
  }

  let extractedData;
  // 如果是纯文本，交给 LLM 提取补充字段
  if (typeof bodyData === 'string' && !bodyData.trim().startsWith('{')) {
    extractedData = await parseTextToSignal(bodyData);
  } else {
    // JSON 数据直接交给清洗器（此时忽略缺失必填项的错误，因为是局部更新）
    const { signal } = extractSignal(bodyData);
    extractedData = signal;
  }

  // 更新到数据库（自动过滤掉 null 从而不覆盖已有数据）
  const updatedSignal = updateSignal(id, extractedData);

  // 触发重新分析检查
  generateAnalysis(updatedSignal).catch(err => {
    console.error(`[Background Analysis Error after PATCH] Signal ID: ${updatedSignal.id}`, err);
  });

  return res.json({
    message: 'Signal updated',
    signal: updatedSignal
  });
}

export default router;
