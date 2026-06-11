/**
 * 关键词路由
 * 优化: 使用 asyncHandler 统一异常处理，使用 validators 清洗输入
 */
import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { sanitizeText, isValidUuid } from '../utils/validators.js';

const idOf = (req: { params: Record<string, string | string[] | undefined> }): string => {
  const v = req.params.id;
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
};

const router = Router();

const MAX_KEYWORD_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 50;

router.get('/', asyncHandler(async (_req, res) => {
  const keywords = await prisma.keyword.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { hotspots: true } } }
  });
  res.json(keywords);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  const keyword = await prisma.keyword.findUnique({
    where: { id },
    include: { hotspots: { orderBy: { createdAt: 'desc' }, take: 20 } }
  });
  if (!keyword) throw new HttpError(404, 'Keyword not found');
  res.json(keyword);
}));

router.post('/', asyncHandler(async (req, res) => {
  const text = sanitizeText(req.body?.text, MAX_KEYWORD_LENGTH);
  const category = sanitizeText(req.body?.category, MAX_CATEGORY_LENGTH) || null;

  if (!text) throw new HttpError(400, 'Keyword text is required');

  const keyword = await prisma.keyword.create({
    data: { text, category }
  });
  res.status(201).json(keyword);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  const { text, category, isActive } = req.body;

  const data: any = {};
  if (text !== undefined) {
    const cleanText = sanitizeText(text, MAX_KEYWORD_LENGTH);
    if (!cleanText) throw new HttpError(400, 'Keyword text cannot be empty');
    data.text = cleanText;
  }
  if (category !== undefined) {
    data.category = category === null || category === '' ? null : sanitizeText(category, MAX_CATEGORY_LENGTH);
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be boolean');
    data.isActive = isActive;
  }

  const keyword = await prisma.keyword.update({
    where: { id },
    data
  });
  res.json(keyword);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  await prisma.keyword.delete({ where: { id } });
  res.status(204).send();
}));

router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  const keyword = await prisma.keyword.findUnique({ where: { id } });
  if (!keyword) throw new HttpError(404, 'Keyword not found');
  const updated = await prisma.keyword.update({
    where: { id },
    data: { isActive: !keyword.isActive }
  });
  res.json(updated);
}));

export default router;
