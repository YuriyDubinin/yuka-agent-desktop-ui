import { memo } from 'react';

import type { ChatMessage } from '../state/chat';
import { MiniCore } from './Orb';
import { RichText } from './RichText';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const Message = memo(function Message({ message }: { message: ChatMessage }) {
  const time = <time className="msg__time">{timeFormat.format(message.at)}</time>;

  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="capsule">{message.text}</div>
        {time}
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="msg msg--error" role="alert">
        <span className="msg__error">{message.text}</span>
      </div>
    );
  }

  // Yuka: plain text on the ice, words materialising as they stream in.
  return (
    <article className={`msg msg--assistant${message.streaming ? ' is-streaming' : ''}`}>
      <div className="msg__text">
        <RichText text={message.text} animate stagger={message.id === 'greeting'} />
      </div>
      {time}
    </article>
  );
});

/** While Yuka is thinking: just the small glass sphere, its ember pulsing. */
export function ThinkingIndicator() {
  return (
    <div className="msg msg--thinking" aria-label="Юка думает">
      <MiniCore mood="thinking" />
    </div>
  );
}
