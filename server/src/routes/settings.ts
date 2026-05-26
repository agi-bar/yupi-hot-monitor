import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

const ALLOWED_SETTINGS = [
  'theme',
  'language',
  'notifications_enabled',
  'email_notifications',
  'hotspot_threshold',
  'auto_refresh',
  'refresh_interval'
];

// 获取所有设置
router.get('/', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap = settings.reduce((acc: Record<string, string>, item: { key: string; value: string }) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    res.json(settingsMap);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// 更新设置
router.put('/', async (req, res) => {
  try {
    const settings = req.body;

    if (typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings format' });
    }

    // 验证只允许已知设置
    const invalidKeys = Object.keys(settings).filter(
      k => !ALLOWED_SETTINGS.includes(k)
    );

    if (invalidKeys.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid settings',
        invalidKeys,
        allowedKeys: ALLOWED_SETTINGS
      });
    }

    const updates = Object.entries(settings).map(([key, value]) => 
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    );

    await Promise.all(updates);

    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// 获取单个设置
router.get('/:key', async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: req.params.key }
    });

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// 更新单个设置
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // 验证 key 是否在白名单中
    if (!ALLOWED_SETTINGS.includes(req.params.key)) {
      return res.status(400).json({ 
        error: 'Invalid setting key',
        invalidKey: req.params.key,
        allowedKeys: ALLOWED_SETTINGS
      });
    }

    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value: String(value) },
      create: { key: req.params.key, value: String(value) }
    });

    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
