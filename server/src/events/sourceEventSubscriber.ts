import { sourceEvents, type SourceEventPayload } from './sourceEvents.js';
import { dataSourceManager } from '../datasources/DataSourceManager.js';
import { logInfo, logError } from '../utils/logger.js';

export function initializeSourceEventSubscriber(): void {
  const createdHandler = async (payload: SourceEventPayload) => {
    if (!payload.created) return;
    
    const { dataSourceId, name, config } = payload.created;
    
    try {
      if (!dataSourceManager.isValidType(dataSourceId)) {
        logInfo('sourceEventSubscriber', `Skipping sync for unregistered dataSourceId: ${dataSourceId}`);
        return;
      }
      
      const configData = config || {
        id: dataSourceId,
        name,
        enabled: payload.created.status === 'active'
      };
      
      await dataSourceManager.updateConfig(dataSourceId, configData);
      logInfo('sourceEventSubscriber', `Synced new source to DataSourceManager: ${dataSourceId}`);
    } catch (error) {
      logError('sourceEventSubscriber.created', error, { dataSourceId });
    }
  };

  const updatedHandler = async (payload: SourceEventPayload) => {
    if (!payload.updated) return;
    
    const { dataSourceId, changes } = payload.updated;
    if (!dataSourceId || Object.keys(changes).length === 0) return;
    
    try {
      if (!dataSourceManager.isValidType(dataSourceId)) {
        logInfo('sourceEventSubscriber', `Skipping sync for unregistered dataSourceId: ${dataSourceId}`);
        return;
      }
      
      const updateData: Record<string, unknown> = {};
      if (changes.name) updateData.name = changes.name;
      if (changes.config) Object.assign(updateData, changes.config as Record<string, unknown>);
      if (changes.status) updateData.enabled = changes.status === 'active';
      
      if (Object.keys(updateData).length > 0) {
        await dataSourceManager.updateConfig(dataSourceId, updateData);
        logInfo('sourceEventSubscriber', `Synced source update to DataSourceManager: ${dataSourceId}`);
      }
    } catch (error) {
      logError('sourceEventSubscriber.updated', error, { dataSourceId });
    }
  };

  const deletedHandler = async (payload: SourceEventPayload) => {
    if (!payload.deleted) return;
    
    const { dataSourceId } = payload.deleted;
    
    try {
      await dataSourceManager.removeSource(dataSourceId);
      logInfo('sourceEventSubscriber', `Removed source from DataSourceManager: ${dataSourceId}`);
    } catch (error) {
      logError('sourceEventSubscriber.deleted', error, { dataSourceId });
    }
  };

  sourceEvents.onCreated(createdHandler);
  sourceEvents.onUpdated(updatedHandler);
  sourceEvents.onDeleted(deletedHandler);
  
  logInfo('sourceEventSubscriber', 'Source event subscriber initialized');
}
