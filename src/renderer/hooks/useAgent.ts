import { useCallback, useEffect, useReducer } from 'react';

import { chatReducer, initialChatState } from '../state/chat';

/**
 * The conversation, as recorded by main. Both windows run this hook; main replays the
 * whole session on `ready()`, so they always show the same transcript.
 */
export function useAgent() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  useEffect(() => {
    const unsubscribe = window.yuka.onEvent((event) =>
      dispatch({ type: 'face', event, at: Date.now() }),
    );
    window.yuka.ready();
    return unsubscribe;
  }, []);

  // Main echoes the message back as a `user` event, which adds it to the transcript.
  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) window.yuka.sendMessage(trimmed);
  }, []);

  return { state, send };
}
