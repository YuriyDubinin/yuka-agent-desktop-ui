import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

import type { ConnectionState } from '../../shared/protocol';
import { Composer } from '../components/Composer';
import { MessageList, type MessageListHandle } from '../components/MessageList';
import { useAgent } from '../hooks/useAgent';
import { useUiState } from '../hooks/useUiState';
import { isReplying } from '../state/chat';
import { useTimeTheme } from '../theme/useTimeTheme';

const STATUS: Partial<Record<ConnectionState, string>> = {
  connecting: 'Подключаюсь к Юке…',
  disconnected: 'Связь с Юкой потеряна',
  'no-agent': 'Юка спит — запусти yuka-agent',
};

/**
 * The dialog panel: a sheet of ice with the conversation and one input line. Its window
 * grows with the conversation (main clamps the height), and main decides when it is
 * visible; this view only animates its content in and out.
 */
export function PanelView() {
  const { state, send } = useAgent();
  const ui = useUiState();
  const theme = useTimeTheme(ui.themeMode);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<MessageListHandle>(null);

  usePanelHeight(rootRef, listRef);
  useKeyboard();

  const online = state.connection === 'connected';
  const status = STATUS[state.connection];
  const phase = ui.presence === 'lingering' ? 'shown' : ui.presence;

  return (
    <div
      ref={rootRef}
      className="panel"
      data-phase={phase}
      data-placement={ui.placement}
      data-theme-name={theme}
    >
      <div className="ice" aria-hidden="true" />
      <div className="panel__body">
        <MessageList ref={listRef} messages={state.messages} awaitingReply={state.awaitingReply} />
        {status && <p className="panel__status">{status}</p>}
        <Composer disabled={!online} busy={isReplying(state)} onSend={send} />
      </div>
    </div>
  );
}

/**
 * Reports the height the panel would like to have: everything around the transcript plus
 * the transcript's natural height. Main clamps it and resizes the window (animated).
 */
function usePanelHeight(
  rootRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<MessageListHandle | null>,
) {
  const lastSent = useRef(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const { scroller, content } = listRef.current ?? {};
    if (!root || !scroller || !content) return;

    const pending = { frame: 0 };
    const measure = () => {
      pending.frame = 0;
      const style = getComputedStyle(scroller);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const chrome = root.offsetHeight - scroller.offsetHeight;
      const wanted = Math.ceil(chrome + content.offsetHeight + padding);
      if (Math.abs(wanted - lastSent.current) >= 1) {
        lastSent.current = wanted;
        window.yuka.setPanelHeight(wanted);
      }
    };
    const schedule = () => {
      if (!pending.frame) pending.frame = requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(content);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending.frame);
    };
  }, [rootRef, listRef]);
}

/** Esc and ⌘W hide the panel; ⌘Q closes Yuka. */
function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || (event.metaKey && event.key.toLowerCase() === 'w')) {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        window.yuka.hidePanel();
      } else if (event.metaKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        window.yuka.quit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
