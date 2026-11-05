import { EventEmitter } from 'node:events';

import type { WebContents } from 'electron';

import { type FaceEvent, IPC } from '../shared/protocol';

interface SessionHubEvents {
  /** Yuka started or stopped working on a reply. */
  busy: [boolean];
  /** A reply (or an error) has just finished. */
  replyFinished: [];
}

/**
 * The single transcript of the session. Every event is recorded in order and delivered to
 * all attached windows; a window that (re)loads gets the whole log replayed, so the orb
 * and the panel always agree.
 */
export class SessionHub extends EventEmitter<SessionHubEvents> {
  private readonly log: FaceEvent[] = [];
  private readonly ready = new Set<WebContents>();
  private busy = false;

  record(event: FaceEvent): void {
    this.log.push(event);
    for (const target of this.ready) {
      if (!target.isDestroyed()) target.send(IPC.event, event);
    }
    this.track(event);
  }

  /** The window has mounted its UI: replay the session and keep it updated. */
  attach(target: WebContents): void {
    if (!this.ready.has(target)) {
      this.ready.add(target);
      // A reload unmounts the UI: stop sending until it reports ready again.
      target.once('did-start-loading', () => this.ready.delete(target));
      target.once('destroyed', () => this.ready.delete(target));
    }
    for (const event of this.log) target.send(IPC.event, event);
  }

  isBusy(): boolean {
    return this.busy;
  }

  private track(event: FaceEvent): void {
    if (event.kind === 'user') {
      this.setBusy(true);
      return;
    }
    if (event.kind === 'connection') {
      if (event.state !== 'connected') this.setBusy(false);
      return;
    }
    switch (event.event.type) {
      case 'assistant_start':
        this.setBusy(true);
        break;
      case 'assistant_end':
      case 'error':
        this.setBusy(false);
        this.emit('replyFinished');
        break;
      case 'hello':
      case 'bye':
        this.setBusy(false);
        break;
      case 'assistant_chunk':
        break;
    }
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return;
    this.busy = busy;
    this.emit('busy', busy);
  }
}
