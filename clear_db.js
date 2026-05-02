import { clearDB } from './db.js';

console.log('开始清空数据库...');
try {
  clearDB();
  console.log('✅ 数据库已成功清空！(所有信号与报告已被删除)');
} catch (error) {
  console.error('❌ 清空数据库失败:', error);
}
