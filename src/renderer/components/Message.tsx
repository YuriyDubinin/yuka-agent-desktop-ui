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

  if (message.role === 'tool' && message.tool) {
    return <ToolLine title={message.text} {...message.tool} />;
  }

  if (message.role === 'confirm' && message.confirm) {
    return <ConfirmCard question={message.text} {...message.confirm} />;
  }

  if (message.role === 'error') {
    return (
      <div className="msg msg--error" role="alert">
        <span className="msg__error">{message.text}</span>
      </div>
    );
  }

  // A turn made only of actions has no text to show.
  if (!message.text && !message.streaming) return null;

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

/** A quiet line while Yuka runs an action of the interface, then its outcome. */
function ToolLine({
  title,
  status,
  summary,
}: {
  title: string;
  status: 'running' | 'done' | 'failed';
  summary?: string;
}) {
  const text =
    status === 'running'
      ? `${title}…`
      : status === 'done'
        ? (summary ?? title)
        : `${title}: ${summary ?? 'не вышло'}`;
  return (
    <div className={`msg msg--tool is-${status}`} role="status">
      <span className="tool-line__icon" aria-hidden="true">
        {status === 'running' ? null : status === 'done' ? '✓' : '✕'}
      </span>
      <span className="tool-line__text">{text}</span>
    </div>
  );
}

/** Asks before a destructive action; the answer goes back to main. */
function ConfirmCard({
  callId,
  question,
  status,
}: {
  callId: string;
  question: string;
  status: 'pending' | 'accepted' | 'declined';
}) {
  return (
    <div className={`msg msg--confirm is-${status}`} role="alertdialog" aria-label={question}>
      <p className="confirm__question">{question}</p>
      {status === 'pending' ? (
        <div className="confirm__actions">
          <button
            type="button"
            className="confirm__button confirm__button--yes"
            onClick={() => window.yuka.confirmAnswer(callId, true)}
          >
            Да
          </button>
          <button
            type="button"
            className="confirm__button"
            onClick={() => window.yuka.confirmAnswer(callId, false)}
          >
            Нет
          </button>
        </div>
      ) : (
        <p className="confirm__answer">{status === 'accepted' ? 'Да' : 'Отменено'}</p>
      )}
    </div>
  );
}
