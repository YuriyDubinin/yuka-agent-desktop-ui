import { useEffect, useRef } from 'react';

import type { ChatMessage } from '../state/chat';
import { Message, ThinkingIndicator } from './Message';

interface MessageListProps {
  messages: ChatMessage[];
  awaitingReply: boolean;
}

const STICK_THRESHOLD_PX = 120;

/** Scrollable transcript that stays pinned to the bottom while the user is there. */
export function MessageList({ messages, awaitingReply }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottom.current = distance < STICK_THRESHOLD_PX;
    };
    // Content grows as words stream in – follow it while pinned.
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) scroller.scrollTo({ top: scroller.scrollHeight });
    });

    scroller.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(content);
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
}
