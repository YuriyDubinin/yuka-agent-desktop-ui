import {
  app,
  type BrowserWindow,
  globalShortcut,
  Menu,
  type MenuItemConstructorOptions,
  screen,
  type WebContents,
} from 'electron';

import {
  IPC,
  type PanelPlacement,
  type ThemeMode,
  type UiState,
  type ViewName,
} from '../../shared/protocol';
import {
  initialPresence,
  isOpen,
  isVisible,
  type PresenceInput,
  type PresenceState,
  reducePresence,
} from '../presence';
import type { SettingsStore } from '../settings-store';
import {
  clampPanelHeight,
  clampRect,
  defaultOrbBounds,
  isOverOrb,
  ORB_WINDOW_SIZE,
  PANEL_MIN_HEIGHT,
  placePanel,
  type Point,
  type Rect,
  rectContains,
} from '../../shared/geometry';
import { OpacityAnimator } from './opacity-animator';
import { createOrbWindow } from './orb-window';
import { createPanelWindow } from './panel-window';

/** Cursor polling: hover is decided here, from geometry, not from DOM events. */
const POLL_MS = 33;
const DRAG_POLL_MS = 8;
const FADE_IN_MS = 260;
const FADE_OUT_MS = 420;
const TOGGLE_SHORTCUT = 'Alt+Space';

const THEME_MENU: { mode: ThemeMode; label: string }[] = [
  { mode: 'auto', label: 'Авто (по времени суток)' },
  { mode: 'morning', label: 'Утро' },
  { mode: 'day', label: 'День' },
  { mode: 'evening', label: 'Вечер' },
  { mode: 'night', label: 'Ночь' },
];

interface WindowManagerOptions {
  settings: SettingsStore;
  rendererUrl?: string;
}

/**
 * Owns both windows and everything about how they behave:
 *   – polls the cursor and turns it into hover (circle for the orb, rect for the panel);
 *   – makes the orb click-through everywhere except the sphere;
 *   – runs the presence state machine and the fade animations;
 *   – drags the orb, keeps it on screen, places the panel next to it;
 *   – the context menu, the global shortcut, the theme mode.
 */
export class WindowManager {
  private orb!: BrowserWindow;
  private panel!: BrowserWindow;
  private panelFade!: OpacityAnimator;

  private presence: PresenceState = initialPresence;
  private unread = false;
  private placement: PanelPlacement = 'left';
  private panelHeight = PANEL_MIN_HEIGHT;
  private themeMode: ThemeMode;

  private poll: NodeJS.Timeout | null = null;
  private pointer = { orb: false, panel: false };
  private orbInteractive = false;
  /** The mouse button went down on the sphere and has not been released yet. */
  private pressed = false;
  private drag: { offset: Point } | null = null;

  constructor(private readonly options: WindowManagerOptions) {
    this.themeMode = options.settings.get().themeMode;
  }

  start(): void {
    const page = { themeMode: this.themeMode, rendererUrl: this.options.rendererUrl };
    // The panel first: the orb is created later and stays above it.
    this.panel = createPanelWindow(page);
    this.panelFade = new OpacityAnimator(this.panel);
    this.orb = createOrbWindow(page, this.initialOrbBounds());

    // A click anywhere outside Yuka takes focus from the panel: close it at once.
    // (The orb is not focusable, so clicking the sphere does not count as outside.)
    this.panel.on('blur', () => this.dispatch({ type: 'dismiss' }));

    for (const window of [this.orb, this.panel]) {
      window.on('closed', () => app.quit()); // one face, two windows: closing either ends it
    }

    screen.on('display-removed', this.keepOnScreen);
    screen.on('display-added', this.keepOnScreen);
    screen.on('display-metrics-changed', this.keepOnScreen);

    if (!globalShortcut.register(TOGGLE_SHORTCUT, () => this.toggleFromShortcut())) {
      console.warn(`[yuka] ${TOGGLE_SHORTCUT} is taken by another app – shortcut disabled`);
    }

    this.schedulePoll(POLL_MS);
  }

  dispose(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.panelFade?.stop();
    globalShortcut.unregister(TOGGLE_SHORTCUT);
    screen.off('display-removed', this.keepOnScreen);
    screen.off('display-added', this.keepOnScreen);
    screen.off('display-metrics-changed', this.keepOnScreen);
  }

  // ------------------------------------------------------------------ queries

  /** Which view a sender belongs to (IPC is accepted only from our own windows). */
  viewOf(sender: WebContents): ViewName | null {
    if (this.orb && !this.orb.isDestroyed() && sender === this.orb.webContents) return 'orb';
    if (this.panel && !this.panel.isDestroyed() && sender === this.panel.webContents) {
      return 'panel';
    }
    return null;
  }

  uiState(): UiState {
    return {
      presence: this.presence.phase,
      pinned: this.presence.pinned,
      unread: this.unread,
      orbHover: this.pointer.orb,
      dragging: this.drag !== null,
      placement: this.placement,
      themeMode: this.themeMode,
    };
  }

  sendUi(target: WebContents): void {
    if (!target.isDestroyed()) target.send(IPC.ui, this.uiState());
  }

  // ------------------------------------------------------------------ inputs from IPC

  setComposing(composing: boolean): void {
    this.dispatch({ type: 'composer', composing });
  }

  setBusy(busy: boolean): void {
    this.dispatch({ type: 'busy', busy });
  }

  /** A reply finished: if nobody saw it, the orb shows that something is waiting. */
  replyFinished(): void {
    if (!isOpen(this.presence.phase) && !this.unread) {
      this.unread = true;
      this.broadcastUi();
    }
  }

  dismissPanel(): void {
    this.dispatch({ type: 'dismiss' });
  }

  setPanelHeight(height: number): void {
    const next = clampPanelHeight(height);
    if (next === this.panelHeight) return;
    this.panelHeight = next;
    if (isVisible(this.presence.phase)) this.layoutPanel(true);
  }

  orbPress(): void {
    // Keep the orb clickable for the whole gesture, even if the pointer slips off the edge.
    this.pressed = true;
    this.setOrbInteractive(true);
  }

  orbDragStart(): void {
    if (this.drag) return;
    const cursor = screen.getCursorScreenPoint();
    const [x, y] = this.orb.getPosition();
    this.drag = { offset: { x: cursor.x - x, y: cursor.y - y } };
    this.schedulePoll(DRAG_POLL_MS);
    this.broadcastUi();
  }

  orbRelease(click: boolean): void {
    this.pressed = false;
    if (this.drag) {
      this.drag = null;
      this.schedulePoll(POLL_MS);
      this.keepOnScreen();
      const [x, y] = this.orb.getPosition();
      this.options.settings.update({ orb: { x, y } });
      this.broadcastUi();
      return;
    }
    if (click) this.dispatch({ type: 'pin' });
  }

  showContextMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      ...THEME_MENU.map(({ mode, label }): MenuItemConstructorOptions => ({
        label,
        type: 'radio',
        checked: this.themeMode === mode,
        click: () => this.setThemeMode(mode),
      })),
      { type: 'separator' },
      {
        label: 'Закрепить панель',
        type: 'checkbox',
        checked: this.presence.pinned,
        click: () => this.dispatch({ type: 'pin' }),
      },
      { type: 'separator' },
      { label: 'Закрыть Юку', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
    ];
    Menu.buildFromTemplate(template).popup({ window: this.orb });
  }

  // ------------------------------------------------------------------ internals

  private setThemeMode(mode: ThemeMode): void {
    this.themeMode = mode;
    this.options.settings.update({ themeMode: mode });
    this.broadcastUi();
  }

  private toggleFromShortcut(): void {
    if (isOpen(this.presence.phase)) {
      this.dispatch({ type: 'toggle' });
      return;
    }
    this.dispatch({ type: 'show' });
    // Typing needs a key window: bring the (accessory) app forward and focus the panel.
    app.focus({ steal: true });
    this.panel.focus();
    this.panel.webContents.send(IPC.focusComposer);
  }

  private dispatch(input: PresenceInput): void {
    const previous = this.presence;
    this.presence = reducePresence(previous, input, Date.now());
    if (this.presence.phase !== previous.phase) this.applyPhase(previous.phase);
    if (this.presence !== previous) this.broadcastUi();
  }

  private applyPhase(from: PresenceState['phase']): void {
    const to = this.presence.phase;

    if (to === 'hidden') {
      this.panelFade.stop();
      this.panel.setOpacity(0);
      this.panel.hide();
      return;
    }
    if (to === 'fading') {
      this.panelFade.animate(0, FADE_OUT_MS);
      return;
    }
    // shown / lingering
    if (from === 'hidden') {
      this.unread = false;
      this.layoutPanel(false);
      this.panel.setOpacity(0);
      this.panel.showInactive();
      this.panelFade.animate(1, FADE_IN_MS);
    } else if (from === 'fading') {
      this.unread = false;
      this.panelFade.animate(1, FADE_IN_MS);
    }
  }

  private broadcastUi(): void {
    const state = this.uiState();
    for (const window of [this.orb, this.panel]) {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.ui, state);
    }
  }

  private schedulePoll(intervalMs: number): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = setInterval(() => this.tick(), intervalMs);
  }

  private tick(): void {
    if (this.orb.isDestroyed() || this.panel.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();

    if (this.drag) this.followCursor(cursor);

    const orbBounds = this.orb.getBounds();
    const overOrb = this.drag !== null || this.pressed || isOverOrb(orbBounds, cursor);
    const overPanel =
      isVisible(this.presence.phase) && rectContains(this.panel.getBounds(), cursor);

    // Click-through everywhere except the sphere (and while a gesture is in progress).
    this.setOrbInteractive(overOrb);

    if (overOrb !== this.pointer.orb || overPanel !== this.pointer.panel) {
      this.pointer = { orb: overOrb, panel: overPanel };
      this.dispatch({ type: 'pointer', orb: overOrb, panel: overPanel }); // also broadcasts orbHover
    }

    if (this.presence.phase === 'lingering' || this.presence.phase === 'fading') {
      this.dispatch({ type: 'tick' });
    }
  }

  private setOrbInteractive(interactive: boolean): void {
    if (interactive === this.orbInteractive) return;
    this.orbInteractive = interactive;
    // `forward` keeps mouse-move events flowing to the page while clicks pass through.
    this.orb.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  private followCursor(cursor: Point): void {
    if (!this.drag) return;
    const x = Math.round(cursor.x - this.drag.offset.x);
    const y = Math.round(cursor.y - this.drag.offset.y);
    const [cx, cy] = this.orb.getPosition();
    if (x === cx && y === cy) return;
    this.orb.setPosition(x, y);
    if (isVisible(this.presence.phase)) this.layoutPanel(false);
  }

  private workAreaFor(rect: Rect): Rect {
    return screen.getDisplayMatching(rect).workArea;
  }

  private initialOrbBounds(): Rect {
    const saved = this.options.settings.get().orb;
    if (saved) {
      const rect = { ...saved, width: ORB_WINDOW_SIZE, height: ORB_WINDOW_SIZE };
      return clampRect(rect, this.workAreaFor(rect));
    }
    return defaultOrbBounds(screen.getPrimaryDisplay().workArea);
  }

  /** After a drag or a display change: the orb must stay fully on some screen. */
  private readonly keepOnScreen = (): void => {
    if (!this.orb || this.orb.isDestroyed() || this.drag) return;
    const bounds = this.orb.getBounds();
    const clamped = clampRect(bounds, this.workAreaFor(bounds));
    if (clamped.x !== bounds.x || clamped.y !== bounds.y) this.orb.setBounds(clamped);
    if (isVisible(this.presence.phase)) this.layoutPanel(false);
  };

  private layoutPanel(animate: boolean): void {
    const orbBounds = this.orb.getBounds();
    const { bounds, placement } = placePanel(
      orbBounds,
      this.panelHeight,
      this.workAreaFor(orbBounds),
    );
    this.panel.setBounds(bounds, animate);
    if (placement !== this.placement) {
      this.placement = placement;
      this.broadcastUi();
    }
  }
}
