import { EventEmitter } from 'node:events';

/**
 * In-process change feed. Every successful write emits 'change' and the SSE route pushes it to open
 * portals, which then refetch. With more than one server instance, swap this for Redis pub/sub or
 * MongoDB change streams.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0);
export const emitChange = (what: string) => bus.emit('change', { what, at: new Date().toISOString() });
