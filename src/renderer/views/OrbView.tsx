import { type PointerEvent, useRef } from 'react';

import { ORB_RADIUS, ORB_WINDOW_SIZE } from '../../shared/geometry';
import { Orb } from '../components/Orb';
import { useAgent } from '../hooks/useAgent';
import { useUiState } from '../hooks/useUiState';
import { selectMood } from '../state/chat';
import { useTimeTheme } from '../theme/useTimeTheme';

/** A press that travels less than this is a click (pin), more is a drag. */
const DRAG_THRESHOLD_PX = 4;

const MOOD_LABEL = {
  idle: 'на связи',
  thinking: 'думает',
  talking: 'отвечает',
  sleeping: 'спит',
  offline: 'нет связи',
} as const;

/**
 * The orb window: only the sphere. Hover is detected by main (cursor vs. circle), which
 * also makes the rest of the window click-through. Here: click = pin, drag = move,
 * right click = menu.
 */
export function OrbView() {
  const { state } = useAgent();
  const ui = useUiState();
  const theme = useTimeTheme(ui.themeMode);
  const mood = selectMood(state);

  // Every streamed chunk nudges the glow; every action Yuka takes flashes it.
  const activity = (state.messages.at(-1)?.text.length ?? 0) + state.toolRuns * 1000;

  const gesture = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.screenX, y: event.screenY, dragging: false };
    window.yuka.orbPress();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.dragging) return;
    if (Math.hypot(event.screenX - current.x, event.screenY - current.y) > DRAG_THRESHOLD_PX) {
      current.dragging = true;
      window.yuka.orbDragStart();
    }
  };

  const finish = (click: boolean) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    window.yuka.orbRelease(click && !current.dragging);
  };

  return (
    <div
      className={`orb${ui.dragging ? ' is-dragging' : ''}`}
      style={{ width: ORB_WINDOW_SIZE, height: ORB_WINDOW_SIZE }}
    >
      <Orb
        mood={mood}
        theme={theme}
        radius={ORB_RADIUS / (ORB_WINDOW_SIZE / 2)}
        hover={ui.orbHover}
        unread={ui.unread}
        activity={activity}
      />
      <div
        className="orb__hit"
        style={{ width: ORB_RADIUS * 2, height: ORB_RADIUS * 2 }}
        role="button"
        tabIndex={-1}
        aria-label={`Юка — ${MOOD_LABEL[mood]}. Наведи, чтобы поговорить`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finish(true)}
        onPointerCancel={() => finish(false)}
        onContextMenu={(event) => {
          event.preventDefault();
          window.yuka.orbContextMenu();
        }}
      />
    </div>
  );
}
