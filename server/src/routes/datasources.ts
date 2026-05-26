import { Router } from 'express';
import { dataSourceManager } from '../datasources/DataSourceManager.js';
import { prisma } from '../db.js';

const router = Router();

router.get('/status', async (req, res) => {
  try {
    const status = dataSourceManager.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error fetching datasource status:', error);
    res.status(500).json({ error: 'Failed to fetch datasource status' });
  }
});

router.get('/', async (req, res) => {
  try {
    const sources = dataSourceManager.listSources();
    const metrics = dataSourceManager.getAllMetrics();
    const health = await dataSourceManager.healthCheck();
    
    const sourcesWithDetails = sources.map(source => {
      const sourceMetrics = metrics.find(m => m.sourceId === source.id);
      const sourceHealth = health.find(h => h.id === source.id);
      
      return {
        ...source,
        metrics: sourceMetrics,
        health: sourceHealth
      };
    });
    
    res.json(sourcesWithDetails);
  } catch (error) {
    console.error('Error fetching data sources:', error);
    res.status(500).json({ error: 'Failed to fetch data sources' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const source = dataSourceManager.getSource(id);
    
    if (!source) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    const config = dataSourceManager.getConfig(id);
    const metrics = dataSourceManager.getMetrics(id);
    const logs = dataSourceManager.getLogs(id, 100);
    const health = await dataSourceManager.healthCheck(id);
    
    res.json({
      id: source.id,
      name: source.name,
      icon: source.icon,
      config,
      metrics,
      logs,
      health: health[0]
    });
  } catch (error) {
    console.error('Error fetching data source:', error);
    res.status(500).json({ error: 'Failed to fetch data source' });
  }
});

router.put('/:id/config', async (req, res) => {
  try {
    const { id } = req.params;
    const config = req.body;
    
    const source = dataSourceManager.getSource(id);
    if (!source) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    await dataSourceManager.updateConfig(id, config);
    
    try {
      await prisma.source.update({
        where: { id },
        data: {
          config: JSON.stringify(config),
          status: config.enabled !== false ? 'active' : 'paused'
        }
      });
    } catch (dbError) {
      console.error(`Failed to sync config to database for source ${id}:`, dbError);
    }
    
    res.json({ message: 'Configuration updated successfully' });
  } catch (error) {
    console.error('Error updating data source config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    await dataSourceManager.toggleSource(id, enabled);
    
    try {
      await prisma.source.update({
        where: { id },
        data: {
          status: enabled ? 'active' : 'paused'
        }
      });
    } catch (dbError) {
      console.error(`Failed to sync status to database for source ${id}:`, dbError);
    }
    
    res.json({ 
      message: `Data source ${enabled ? 'enabled' : 'disabled'}`,
      enabled 
    });
  } catch (error) {
    console.error('Error toggling data source:', error);
    res.status(500).json({ error: 'Failed to toggle data source' });
  }
});

router.get('/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;
    const metrics = dataSourceManager.getMetrics(id);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const logs = dataSourceManager.getLogs(id, limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.post('/:id/health-check', async (req, res) => {
  try {
    const { id } = req.params;
    const health = await dataSourceManager.healthCheck(id);
    
    res.json(health[0] || { status: 'unavailable' });
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(500).json({ error: 'Failed to check health' });
  }
});

export default router;
