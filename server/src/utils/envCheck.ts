/**
 * 启动时环境变量校验
 * 缺失关键配置时记录警告，但允许继续运行（避免依赖外部服务时开发受阻）
 */
import { getRandomUserAgent } from './rateLimiter.js';

interface CheckResult {
  key: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

export function validateEnvironment(): CheckResult[] {
  const results: CheckResult[] = [];

  // ===== 必要配置（缺失则警告）=====
  if (!process.env.DATABASE_URL) {
    results.push({ key: 'DATABASE_URL', level: 'error', message: '❌ DATABASE_URL 未设置，Prisma 无法连接' });
  }

  // ===== AI 服务（用于查询扩展和内容分析）=====
  if (!process.env.MINIMAX_API_KEY || !process.env.MINIMAX_GROUP_ID) {
    results.push({
      key: 'MINIMAX_API',
      level: 'warning',
      message: '⚠️ MiniMax API 未配置，将使用 fallback（查询扩展降级 + AI 分析默认分）'
    });
  }

  // ===== Twitter 搜索（无 Key 则不抓推文）=====
  if (!process.env.TWITTER_API_KEY) {
    results.push({
      key: 'TWITTER_API_KEY',
      level: 'info',
      message: 'ℹ️ TWITTER_API_KEY 未配置，Twitter 源将跳过'
    });
  }

  // ===== 邮件通知（可选）=====
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    results.push({
      key: 'SMTP',
      level: 'info',
      message: 'ℹ️ 邮件通知未配置（需要 SMTP_HOST/SMTP_USER/SMTP_PASS）'
    });
  } else if (!process.env.NOTIFY_EMAIL) {
    results.push({
      key: 'NOTIFY_EMAIL',
      level: 'info',
      message: 'ℹ️ SMTP 已配置但 NOTIFY_EMAIL 未设置，邮件发送将跳过'
    });
  }

  // ===== 客户端地址（CORS）=====
  if (!process.env.CLIENT_URL) {
    results.push({
      key: 'CLIENT_URL',
      level: 'info',
      message: 'ℹ️ CLIENT_URL 未设置，使用默认 http://localhost:5173'
    });
  }

  return results;
}

export function logEnvironmentCheck(): void {
  const results = validateEnvironment();
  if (results.length === 0) {
    console.log('✅ 环境变量校验通过');
    return;
  }

  console.log('\n📋 环境变量检查结果:');
  for (const r of results) {
    console.log(`  ${r.message}`);
  }
  console.log();

  // 有 error 级别则抛错
  const errors = results.filter(r => r.level === 'error');
  if (errors.length > 0) {
    throw new Error(`环境变量校验失败: ${errors.length} 个错误配置`);
  }
}

// 静默的 UA 池预热，避免第一次请求延迟
export function warmupUserAgents(): void {
  getRandomUserAgent();
}
