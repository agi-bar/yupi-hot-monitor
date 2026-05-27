import { EventEmitter } from 'events';

export interface SourceCreatedEvent {
  id: string;
  name: string;
  type: string;
  dataSourceId: string;
  status: string;
  config?: unknown;
}

export interface SourceUpdatedEvent {
  id: string;
  name?: string;
  type?: string;
  dataSourceId?: string;
  status?: string;
  config?: unknown;
  changes: Record<string, unknown>;
}

export interface SourceDeletedEvent {
  id: string;
  name: string;
  dataSourceId: string;
}

export interface SourceEventPayload {
  created?: SourceCreatedEvent;
  updated?: SourceUpdatedEvent;
  deleted?: SourceDeletedEvent;
}

class SourceEventEmitter extends EventEmitter {
  private static instance: SourceEventEmitter;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): SourceEventEmitter {
    if (!SourceEventEmitter.instance) {
      SourceEventEmitter.instance = new SourceEventEmitter();
    }
    return SourceEventEmitter.instance;
  }

  emitCreated(source: SourceCreatedEvent): void {
    this.emit('source:created', { created: source } as SourceEventPayload);
  }

  emitUpdated(source: SourceUpdatedEvent): void {
    this.emit('source:updated', { updated: source } as SourceEventPayload);
  }

  emitDeleted(source: SourceDeletedEvent): void {
    this.emit('source:deleted', { deleted: source } as SourceEventPayload);
  }

  onCreated(handler: (payload: SourceEventPayload) => void): void {
    this.on('source:created', handler);
  }

  onUpdated(handler: (payload: SourceEventPayload) => void): void {
    this.on('source:updated', handler);
  }

  onDeleted(handler: (payload: SourceEventPayload) => void): void {
    this.on('source:deleted', handler);
  }

  removeCreatedHandler(handler: (payload: SourceEventPayload) => void): void {
    this.removeListener('source:created', handler);
  }

  removeUpdatedHandler(handler: (payload: SourceEventPayload) => void): void {
    this.removeListener('source:updated', handler);
  }

  removeDeletedHandler(handler: (payload: SourceEventPayload) => void): void {
    this.removeListener('source:deleted', handler);
  }
}

export const sourceEvents = SourceEventEmitter.getInstance();
