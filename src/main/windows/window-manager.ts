import {
  app,
  type BrowserWindow,
  globalShortcut,
  Menu,
  type MenuItemConstructorOptions,
  powerMonitor,
  screen,
  systemPreferences,
  type WebContents,
} from 'electron';

import {
  clampPanelHeight,
  clampRect,
  defaultOrbBounds,
  isOverOrb,
  nearestCorner,
  ORB_WINDOW_SIZE,
  orbBoundsAtCorner,
  PANEL_MIN_HEIGHT,
  placePanel,
  type Point,
  type Rect,
  rectContains,
  type ScreenCorner,
} from '../../shared/geometry';
import {
  IPC,
  type PanelPlacement,
  type ThemeMode,
  type UiState,
  type ViewName,
} from '../../shared/protocol';
import { eventLog } from '../diagnostics';
import {
  initialPresence,
  isOpen,
  isVisible,
  type PresenceInput,
  type PresenceState,
  reducePresence,
} from '../presence';
import type { SettingsStore } from '../settings-store';
import type { UiController, UiSnapshot } from '../tools/ui-tool-host';
import { floatAboveEverything } from './create-window';
import { OpacityAnimator } from './opacity-animator';
import { createOrbWindow } from './orb-window';
import { createPanelWindow } from './panel-window';
import {
  ActionThrottle,
  desiredPanel,
  isStaleGesture,
  reconcileOrb,
  reconcilePanel,
  visibleShare,
  type WindowAction,
  type WindowActual,
} from './window-reconciler';

/** Cursor polling: hover is decided here, from geometry, not from DOM events. */
const POLL_MS = 33;
const DRAG_POLL_MS = 8;
const FADE_IN_MS = 260;
const FADE_OUT_MS = 420;
const TOGGLE_SHORTCUT = 'Alt+Space';
/** Relative window levels: the orb floats above the panel, so its halo glows over it. */
const ORB_LEVEL = 1;
const PANEL_LEVEL = 0;

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

type WindowKey = 'orb' | 'panel';

/**
 * Owns both windows and everything about how they behave:
 *   – polls the cursor and feeds it to the presence state machine every tick;
 *   – reconciles the real windows with the desired state every tick, so a window that
 *     macOS hid, moved or broke comes back by itself;
 *   – makes the orb click-through everywhere except the sphere;
 *   – drags the orb, keeps it on screen, places the panel next to it;
 *   – recovers after sleep, Space switches, display changes and renderer crashes;
 *   – the context menu, the global shortcut, the theme mode.
 * Every decision worth knowing about goes to the event log (see diagnostics.ts).
 */
export class WindowManager implements UiController {
  private orb!: BrowserWindow;
  private panel!: BrowserWindow;
  private panelFade!: OpacityAnimator;

  private presence: PresenceState = initialPresence;
  private unread = false;
  private placement: PanelPlacement = 'left';
  private panelHeight = PANEL_MIN_HEIGHT;
  private themeMode: ThemeMode;

  private poll: NodeJS.Timeout | null = null;
  private orbInteractive = false;
  /** When the mouse button went down on the sphere (null: not pressed). */
  private pressedAt: number | null = null;
  private drag: { offset: Point; startedAt: number } | null = null;
  /** The orb's own context menu is open (losing focus to it is not a click outside). */
  private menuOpen = false;
  private readonly rendererAlive: Record<WindowKey, boolean> = { orb: true, panel: true };
  private readonly throttle = new ActionThrottle(500);
  private spaceSubscription: number | null = null;

  constructor(private readonly options: WindowManagerOptions) {
    this.themeMode = options.settings.get().themeMode;
  }

  start(): void {
    const page = { themeMode: this.themeMode, rendererUrl: this.options.rendererUrl };
    // The panel first: the orb is created later and stays above it.
    this.panel = createPanelWindow(page);
    this.panelFade = new OpacityAnimator(this.panel);
    this.orb = createOrbWindow(page, this.initialOrbBounds());

    // Losing focus may mean "clicked outside" – the state machine decides (focusLost).
    this.panel.on('blur', () => this.onPanelBlur());

    for (const [key, window] of [
      ['orb', this.orb],
      ['panel', this.panel],
    ] as const) {
      window.on('closed', () => app.quit()); // one face, two windows: closing either ends it
      this.watchRenderer(key, window);
    }

    screen.on('display-removed', this.onDisplayChange);
    screen.on('display-added', this.onDisplayChange);
    screen.on('display-metrics-changed', this.onDisplayChange);
    powerMonitor.on('resume', this.onResume);
    powerMonitor.on('unlock-screen', this.onUnlock);
    app.on('did-become-active', this.onBecomeActive);
    if (process.platform === 'darwin') {
      this.spaceSubscription = systemPreferences.subscribeWorkspaceNotification(
        'NSWorkspaceActiveSpaceDidChangeNotification',
        () => this.recover('смена рабочего стола'),
      );
    }

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
    screen.off('display-removed', this.onDisplayChange);
    screen.off('display-added', this.onDisplayChange);
    screen.off('display-metrics-changed', this.onDisplayChange);
    powerMonitor.off('resume', this.onResume);
    powerMonitor.off('unlock-screen', this.onUnlock);
    app.off('did-become-active', this.onBecomeActive);
    if (this.spaceSubscription !== null) {
      systemPreferences.unsubscribeWorkspaceNotification(this.spaceSubscription);
      this.spaceSubscription = null;
    }
    eventLog.flushRepeats();
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
      orbHover: this.presence.hoverOrb,
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
    if (!this.panelReallyOpen() && !this.unread) {
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
    this.pressedAt = Date.now();
    this.setOrbInteractive(true);
  }

  orbDragStart(): void {
    if (this.drag) return;
    const cursor = screen.getCursorScreenPoint();
    const [x, y] = this.orb.getPosition();
    this.drag = { offset: { x: cursor.x - x, y: cursor.y - y }, startedAt: Date.now() };
    this.schedulePoll(DRAG_POLL_MS);
    this.broadcastUi();
  }

  orbRelease(click: boolean): void {
    this.pressedAt = null;
    if (this.drag) {
      this.drag = null;
      this.schedulePoll(POLL_MS);
      this.keepOnScreen();
      const [x, y] = this.orb.getPosition();
      this.options.settings.update({ orb: { x, y } });
      this.broadcastUi();
      return;
    }
    if (!click) return;
    // A click always brings the panel back if it is not really on screen; only when it is
    // open and visible does it toggle the pin.
    if (this.panelReallyOpen()) {
      this.dispatch({ type: 'pin' }, 'клик по сфере');
    } else {
      this.revealNow('клик по сфере');
    }
  }

  showContextMenu(): void {
    // A Ctrl+click arrives as a press too, and the menu swallows its release.
    this.resetGesture('открыто меню');
    const template: MenuItemConstructorOptions[] = [
      { label: 'Показать диалог', click: () => this.revealNow('меню: показать диалог') },
      { label: 'Вернуть Юку в угол', click: () => this.returnHome() },
      { type: 'separator' },
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
        click: () => this.dispatch({ type: 'pin' }, 'меню'),
      },
      { type: 'separator' },
      { label: 'Закрыть Юку', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
    ];
    this.menuOpen = true;
    Menu.buildFromTemplate(template).popup({
      window: this.orb,
      callback: () => {
        this.menuOpen = false;
      },
    });
  }

  // ------------------------------------------------------------------ UiController (tools)

  snapshot(): UiSnapshot {
    const orbBounds = this.orb.getBounds();
    return {
      themeMode: this.themeMode,
      panelOpen: isOpen(this.presence.phase),
      pinned: this.presence.pinned,
      corner: nearestCorner(orbBounds, this.workAreaFor(orbBounds)),
    };
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode = mode;
    this.options.settings.update({ themeMode: mode });
    this.broadcastUi();
  }

  setPinned(pinned: boolean): void {
    this.dispatch({ type: 'pin', pinned }, 'инструмент');
  }

  showPanel(): void {
    this.revealNow('инструмент');
  }

  moveOrbToCorner(corner: ScreenCorner): void {
    if (this.drag) return; // the user is moving it right now
    const current = this.orb.getBounds();
    const target = orbBoundsAtCorner(this.workAreaFor(current), corner);
    this.orb.setBounds(target, true);
    this.options.settings.update({ orb: { x: target.x, y: target.y } });
    if (isVisible(this.presence.phase)) this.layoutPanel(true);
  }

  quit(): void {
    app.quit();
  }

  // ------------------------------------------------------------------ presence

  /** Guaranteed show: re-assert the windows and open the panel, whatever the state. */
  private revealNow(reason: string): void {
    this.reassert(this.orb, ORB_LEVEL);
    this.reassert(this.panel, PANEL_LEVEL);
    this.dispatch({ type: 'reveal' }, reason);
    this.reconcile(Date.now(), true);
  }

  private returnHome(): void {
    const target = defaultOrbBounds(screen.getPrimaryDisplay().workArea);
    this.orb.setBounds(target, true);
    this.options.settings.update({ orb: { x: target.x, y: target.y } });
    eventLog.log('system', `сфера возвращена в угол (${target.x}, ${target.y})`);
    this.revealNow('меню: вернуть в угол');
  }

  private toggleFromShortcut(): void {
    if (this.panelReallyOpen()) {
      this.dispatch({ type: 'toggle' }, '⌥Space');
      return;
    }
    this.revealNow('⌥Space');
    // Typing needs a key window: bring the (accessory) app forward and focus the panel.
    app.focus({ steal: true });
    this.panel.focus();
    this.panel.webContents.send(IPC.focusComposer);
  }

  private onPanelBlur(): void {
    const before = this.presence;
    this.dispatch(
      {
        type: 'focusLost',
        overYuka: this.presence.hoverOrb || this.presence.hoverPanel,
        menuOpen: this.menuOpen,
      },
      'потеря фокуса',
    );
    if (this.presence === before && isOpen(before.phase)) {
      const why = this.menuOpen
        ? 'открыто меню сферы'
        : before.hoverOrb || before.hoverPanel
          ? 'курсор над Юкой'
          : 'панель только что появилась';
      eventLog.log('focus', `потеря фокуса не закрыла панель: ${why}`);
    }
  }

  private dispatch(input: PresenceInput, reason: string = input.type): void {
    const previous = this.presence;
    this.presence = reducePresence(previous, input, Date.now());
    if (this.presence === previous) return;
    if (this.presence.phase !== previous.phase) {
      eventLog.log(
        'presence',
        `${previous.phase}→${this.presence.phase} причина=${reason}` +
          ` курсор: сфера=${this.presence.hoverOrb} панель=${this.presence.hoverPanel}` +
          (this.presence.hoverSuppressed ? ' (наведение приглушено до ухода курсора)' : ''),
      );
      this.applyPhase(previous.phase);
    }
    this.broadcastUi();
  }

  /** The fade animations of a phase change; the final state is guaranteed by reconcile(). */
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
      this.reassert(this.panel, PANEL_LEVEL);
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

  // ------------------------------------------------------------------ the tick

  private schedulePoll(intervalMs: number): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = setInterval(() => this.tick(), intervalMs);
  }

  private tick(): void {
    if (this.orb.isDestroyed() || this.panel.isDestroyed()) return;
    const now = Date.now();
    const cursor = screen.getCursorScreenPoint();

    if (this.drag) this.followCursor(cursor);

    const orbBounds = this.orb.getBounds();
    const onSphere = isOverOrb(orbBounds, cursor);
    if (isStaleGesture(now, this.pressedAt, this.drag?.startedAt ?? null, onSphere)) {
      this.resetGesture(this.drag ? 'перетаскивание без отпускания' : 'нажатие без отпускания');
    }

    const overOrb = this.drag !== null || this.pressedAt !== null || onSphere;
    const overPanel =
      isVisible(this.presence.phase) &&
      this.panel.isVisible() &&
      rectContains(this.panel.getBounds(), cursor);

    // Click-through everywhere except the sphere (and while a gesture is in progress).
    this.setOrbInteractive(overOrb);

    // Fed every tick (level-triggered); an unchanged pointer costs nothing.
    this.dispatch({ type: 'pointer', orb: overOrb, panel: overPanel }, 'курсор');
    if (this.presence.phase === 'lingering' || this.presence.phase === 'fading') {
      this.dispatch({ type: 'tick' }, 'таймер');
    }

    this.reconcile(now, false);
  }

  // ------------------------------------------------------------------ reconciliation

  private actualOf(key: WindowKey): WindowActual {
    const window = key === 'orb' ? this.orb : this.panel;
    const displays = screen.getAllDisplays().map((d) => d.bounds);
    return {
      visible: window.isVisible(),
      opacity: window.getOpacity(),
      onScreen: visibleShare(window.getBounds(), displays) >= 0.5,
      rendererAlive: this.rendererAlive[key] && !window.webContents.isCrashed(),
      animating: key === 'panel' && this.panelFade.isAnimating(),
    };
  }

  /** Brings both windows to the state they should be in; `force` skips the rate limit. */
  private reconcile(now: number, force: boolean): void {
    const panelActual = this.actualOf('panel');
    this.perform(
      'panel',
      reconcilePanel(desiredPanel(this.presence.phase), panelActual),
      panelActual,
      now,
      force,
    );

    const orbActual = this.actualOf('orb');
    const orbActions = reconcileOrb(orbActual).filter(
      (a) => !(a === 'reposition' && this.drag), // the user is moving it off the edge on purpose
    );
    this.perform('orb', orbActions, orbActual, now, force);
  }

  private perform(
    key: WindowKey,
    actions: WindowAction[],
    actual: WindowActual,
    now: number,
    force: boolean,
  ): void {
    const allowed = actions.filter((a) => force || this.throttle.allow(`${key}:${a}`, now));
    if (allowed.length === 0) return;

    eventLog.log(
      'reconcile',
      `${key}: ${allowed.join(',')} (фаза=${this.presence.phase}; было: видно=${actual.visible}` +
        ` прозрачность=${actual.opacity.toFixed(2)} на экране=${actual.onScreen}` +
        ` страница=${actual.rendererAlive ? 'жива' : 'упала'})`,
    );

    const window = key === 'orb' ? this.orb : this.panel;
    for (const action of allowed) {
      switch (action) {
        case 'show':
          if (process.platform === 'darwin') app.show(); // unhides the app, does not focus
          window.showInactive();
          break;
        case 'hide':
          window.hide();
          break;
        case 'opaque':
          if (key === 'panel') this.panelFade.stop();
          window.setOpacity(1);
          break;
        case 'reposition':
          if (key === 'panel') this.layoutPanel(false);
          else this.keepOnScreen();
          break;
        case 'reassert':
          this.reassert(window, key === 'orb' ? ORB_LEVEL : PANEL_LEVEL);
          break;
        case 'reload':
          this.rendererAlive[key] = true; // until the reloaded page says otherwise
          if (key === 'orb') this.resetGesture('перезагрузка сферы');
          window.webContents.reload();
          break;
      }
    }
  }

  /** "Above everything, on every Space" – macOS may drop it after hide/show or a Space switch. */
  private reassert(window: BrowserWindow, level: number): void {
    if (!window.isDestroyed()) floatAboveEverything(window, level);
  }

  /** Called by system events: everything is re-asserted and checked right away. */
  private recover(reason: string): void {
    if (!this.orb || this.orb.isDestroyed() || this.panel.isDestroyed()) return;
    eventLog.log('system', reason);
    this.reassert(this.orb, ORB_LEVEL);
    this.reassert(this.panel, PANEL_LEVEL);
    this.keepOnScreen();
    this.reconcile(Date.now(), true);
  }

  private readonly onDisplayChange = (): void => this.recover('изменились мониторы');
  private readonly onResume = (): void => this.recover('пробуждение');
  private readonly onUnlock = (): void => this.recover('разблокировка экрана');
  private readonly onBecomeActive = (): void => this.recover('приложение стало активным');

  private watchRenderer(key: WindowKey, window: BrowserWindow): void {
    const contents = window.webContents;
    contents.on('render-process-gone', (_event, details) => {
      this.rendererAlive[key] = false;
      eventLog.log('renderer', `${key}: страница упала (${details.reason}) — перезагружу`);
    });
    contents.on('unresponsive', () => {
      this.rendererAlive[key] = false;
      eventLog.log('renderer', `${key}: страница не отвечает — перезагружу`);
    });
    contents.on('responsive', () => {
      this.rendererAlive[key] = true;
    });
    contents.on('did-finish-load', () => {
      this.rendererAlive[key] = true;
    });
    if (key === 'orb') {
      contents.on('did-start-loading', () => this.resetGesture('перезагрузка сферы'));
    }
  }

  // ------------------------------------------------------------------ gestures & geometry

  private resetGesture(reason: string): void {
    if (this.pressedAt === null && this.drag === null) return;
    eventLog.log('gesture', `сброс жеста: ${reason}`);
    const wasDragging = this.drag !== null;
    this.pressedAt = null;
    this.drag = null;
    if (wasDragging) {
      this.schedulePoll(POLL_MS);
      this.keepOnScreen();
      this.broadcastUi();
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

  /** The panel is open and macOS really shows it. */
  private panelReallyOpen(): boolean {
    return (
      isOpen(this.presence.phase) &&
      !this.panel.isDestroyed() &&
      this.panel.isVisible() &&
      this.panel.getOpacity() > 0.5
    );
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

  /** The orb must stay fully on some screen; the panel follows it. */
  private keepOnScreen(): void {
    if (!this.orb || this.orb.isDestroyed() || this.drag) return;
    const bounds = this.orb.getBounds();
    const clamped = clampRect(bounds, this.workAreaFor(bounds));
    if (clamped.x !== bounds.x || clamped.y !== bounds.y) this.orb.setBounds(clamped);
    if (isVisible(this.presence.phase)) this.layoutPanel(false);
  }

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
