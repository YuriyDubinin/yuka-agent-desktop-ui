import { memo } from 'react';

import type { ChatMessage } from '../state/chat';
import { RichText } from './RichText';
import { MiniCore } from './YukaCore';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const Message = memo(function Message({ message }: { message: ChatMessage }) {
  const time = <time className="msg__time">{timeFormat.format(message.at)}</time>;

  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="capsule glass">{message.text}</div>
        {time}
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="msg msg--error" role="alert">
        <div className="error-card glass">
          <span className="error-card__title">Что-то пошло не так</span>
          <span className="error-card__text">{message.text}</span>
        </div>
      </div>
    );
  }

  return (
    <article className={`msg msg--assistant${message.streaming ? ' is-streaming' : ''}`}>
      <MiniCore mood={message.streaming ? 'talking' : 'idle'} />
      <div className="msg__body">
        <div className="msg__text">
          <RichText text={message.text} animate stagger={message.id === 'greeting'} />
        </div>
        {time}
      </div>
    </article>
  );
});

/** While Yuka is thinking: just the small glass sphere, its inner glow pulsing and shifting. */
export function ThinkingIndicator() {
  return (
    <div className="msg msg--assistant msg--thinking" aria-label="Юка думает">
      <MiniCore mood="thinking" />
    </div>
  );
}
