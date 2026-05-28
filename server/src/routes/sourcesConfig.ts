import { Router } from 'express';
import { prisma } from '../db.js';
import { SOURCE_TYPE_MAP } from '../config/sources.js';

const router = Router();

router.get('/sources/config', async (req, res) => {
  try {
    const { enabled, type } = req.query;

    const where: any = {};
    
    if (enabled === 'true') {
      where.status = 'active';
    }
    
    if (type && SOURCE_TYPE_MAP[type as string]) {
      where.category = type;
    }

    const sources = await prisma.source.findMany({
      where,
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        category: true,
        status: true,
        priority: true,
        description: true,
        isPublic: true
      }
    });

    const formattedSources = sources.map(s => ({
      id: s.type,
      name: s.name,
      type: s.category,
      enabled: s.status === 'active',
      priority: s.priority,
      description: s.description
    }));

    res.json({
      success: true,
      data: formattedSources,
      meta: {
        total: formattedSources.length,
        types: SOURCE_TYPE_MAP
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/sources/types', (req, res) => {
  try {
    res.json({
      success: true,
      data: SOURCE_TYPE_MAP
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const source = await prisma.source.findFirst({
      where: { type: id }
    });

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: source.type,
        name: source.name,
        type: source.category,
        enabled: source.status === 'active',
        priority: source.priority,
        description: source.description
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
