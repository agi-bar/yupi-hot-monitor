/**
 * 设置路由
 * 优化: 批量 upsert 替代逐条 update（之前是 N+1 反模式）
 */
import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { sanitizeText } from '../utils/validators.js';

const router = Router();
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 1000;

router.get('/', asyncHandler(async (_req, res) => {
  const settings = await prisma.setting.findMany();
  const map = settings.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
  res.json(map);
}));

router.put('/', asyncHandler(async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    throw new HttpError(400, 'Invalid settings format');
  }

  const entries = Object.entries(req.body as Record<string, unknown>);
  if (entries.length === 0) return res.json({ message: 'No settings to update' });
  if (entries.length > 50) throw new HttpError(400, 'Too many settings (max 50)');

  // 预处理：清洗所有 key/value。空 key 直接跳过。
  const sanitized = entries
    .map(([k, v]) => ({
      key: sanitizeText(k, MAX_KEY_LENGTH),
      value: sanitizeText(v, MAX_VALUE_LENGTH)
    }))
    .filter(e => e.key.length > 0);

  if (sanitized.length === 0) {
    return res.json({ message: 'No valid settings to update' });
  }

  // 批量 upsert：一次查询找出已存在 key，再并行 create/update
  // 修复点：之前对同一个 key 调用了两次 sanitizeText() 拼接代码，
  // 如果 key 在 sanitize 后被改变会导致判断错位。这里统一使用清洗后的 key。
  const keys = sanitized.map(e => e.key);
  const existing = await prisma.setting.findMany({
    where: { key: { in: keys } },
    select: { key: true }
  });
  const existingKeys = new Set(existing.map(s => s.key));
  const toCreate = sanitized.filter(e => !existingKeys.has(e.key));
  const toUpdate = sanitized.filter(e => existingKeys.has(e.key));

  await Promise.all([
    ...toCreate.map(({ key, value }) => prisma.setting.create({ data: { key, value } })),
    ...toUpdate.map(({ key, value }) => prisma.setting.update({ where: { key }, data: { value } }))
  ]);

  res.json({ message: 'Settings updated' });
}));

router.get('/:key', asyncHandler(async (req, res) => {
  const key = sanitizeText(req.params.key, MAX_KEY_LENGTH);
  if (!key) throw new HttpError(400, 'Invalid key');
  const setting = await prisma.setting.findUnique({ where: { key } });
  if (!setting) throw new HttpError(404, 'Setting not found');
  res.json({ key: setting.key, value: setting.value });
}));

router.put('/:key', asyncHandler(async (req, res) => {
  const key = sanitizeText(req.params.key, MAX_KEY_LENGTH);
  if (!key) throw new HttpError(400, 'Invalid key');
  if (req.body?.value === undefined) throw new HttpError(400, 'Value is required');

  const value = sanitizeText(req.body.value, MAX_VALUE_LENGTH);
  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
  res.json(setting);
}));

export default router;
