type EventHandler = (payload: unknown) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error(`event bus handler error for "${event}"`, err);
      }
    });
  }
}

export const eventBus = new EventBus();

export const EVENTS = {
  authChanged: 'auth:changed',
  profileUpdated: 'profile:updated',
  languageChanged: 'i18n:languageChanged',
  modulesChanged: 'modules:changed',
} as const;
