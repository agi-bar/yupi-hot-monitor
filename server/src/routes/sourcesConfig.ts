import { Router } from 'express';
import { getAllSources, getEnabledSources, getSourcesByType, SOURCE_TYPE_MAP, getSourceById } from '../config/sources.js';

const router = Router();

router.get('/sources/config', (req, res) => {
  try {
    const { enabled, type } = req.query;

    let sources;

    if (enabled === 'true') {
      sources = getEnabledSources();
    } else if (type && SOURCE_TYPE_MAP[type as string]) {
      sources = getSourcesByType(type as 'social' | 'search' | 'news' | 'video');
    } else {
      sources = getAllSources();
    }

    res.json({
      success: true,
      data: sources,
      meta: {
        total: sources.length,
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

router.get('/sources/:id', (req, res) => {
  try {
    const { id } = req.params;
    const source = getSourceById(id);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    res.json({
      success: true,
      data: source
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
