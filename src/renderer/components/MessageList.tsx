import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { ChatMessage } from '../state/chat';
import { Message, ThinkingIndicator } from './Message';

interface MessageListProps {
  messages: ChatMessage[];
  awaitingReply: boolean;
}

/** Elements the panel measures to size itself to the conversation. */
export interface MessageListHandle {
  scroller: HTMLDivElement | null;
  content: HTMLDivElement | null;
}

const STICK_THRESHOLD_PX = 80;

/** Scrollable transcript that stays pinned to the bottom while the user is there. */
export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  { messages, awaitingReply },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useImperativeHandle(ref, () => ({ scroller: scrollRef.current, content: contentRef.current }));

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottom.current = distance < STICK_THRESHOLD_PX;
    };
    // Content grows as words stream in (and the window grows with it) – follow it.
    const follow = () => {
      if (stickToBottom.current) scroller.scrollTo({ top: scroller.scrollHeight });
    };
    const observer = new ResizeObserver(follow);

    scroller.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(content);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  // A new message from the user always brings the view back down.
  const lastRole = messages.at(-1)?.role;
  useEffect(() => {
    if (lastRole === 'user') {
      stickToBottom.current = true;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, lastRole]);

  return (
    <div className="messages" ref={scrollRef}>
      <div className="messages__content" ref={contentRef}>
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {awaitingReply && <ThinkingIndicator />}
      </div>
    </div>
  );
});
