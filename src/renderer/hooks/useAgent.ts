import { useCallback, useEffect, useReducer } from 'react';

import { chatReducer, initialChatState } from '../state/chat';

/** Connects the chat state to the agent bridge exposed by the preload script. */
export function useAgent() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  useEffect(() => {
    const unsubscribe = window.yuka.onEvent((event) =>
      dispatch({ type: 'face', event, at: Date.now() }),
    );
    window.yuka.ready();
    return unsubscribe;
  }, []);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    dispatch({ type: 'user_sent', text: trimmed, at: Date.now() });
    window.yuka.sendMessage(trimmed);
  }, []);

  return { state, send };
}
