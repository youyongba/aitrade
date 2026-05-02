import express from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import config from './config.js';
import { initDB } from './db.js';
import signalRoutes from './routes/signals.js';

// 初始化数据库
initDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 支持 urlencoded
app.use(express.text({ type: '*/*' })); // 兜底支持所有纯文本格式
app.use(express.static('public')); // 提供静态页面支持

// Swagger 设置
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DeepSeek API 行情分析系统',
      version: '1.0.0',
      description: '接收交易信号并异步调用DeepSeek进行分析的后端服务',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
      },
    ],
  },
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 路由
app.use('/api/v1/signals', signalRoutes);

// 启动服务器
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
  console.log(`Swagger docs available at http://localhost:${config.port}/api-docs`);
});
