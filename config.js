import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 加载 .env 文件（如果存在）
if (fs.existsSync('.env')) {
  dotenv.config();
}

const config = {
  port: process.env.PORT || 3000,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  databasePath: process.env.DATABASE_PATH || './data/signals.db'
};

// 确保 data 目录存在
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export default config;
