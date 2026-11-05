import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  showHint: boolean;
  onSend: (text: string) => void;
}

const MAX_HEIGHT_PX = 160;
const FIRE_MS = 520;

export function Composer({ disabled, busy, showHint, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [firing, setFiring] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a limit.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  // Return focus once Yuka has finished answering.
  useEffect(() => {
    if (!busy && !disabled) inputRef.current?.focus();
  }, [busy, disabled]);

  const hasText = text.trim().length > 0;
  const canSend = !disabled && !busy && hasText;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text);
    setText('');
    setFiring(true);
    window.setTimeout(() => setFiring(false), FIRE_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const sendState = firing ? 'firing' : busy ? 'waiting' : hasText && !disabled ? 'ready' : 'idle';

  return (
    <div className="composer-wrap">
      <form className={`composer glass${disabled ? ' is-disabled' : ''}`} onSubmit={submit}>
        <span className="composer__aura" aria-hidden="true" />
        <textarea
          ref={inputRef}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={disabled ? 'Юка не на связи…' : 'Напиши Юке…'}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Сообщение"
        />
        <button
          type="submit"
          className={`send send--${sendState}`}
          disabled={!canSend}
          aria-label={busy ? 'Юка отвечает' : 'Отправить'}
          title="Отправить (Enter)"
        >
          <span className="send__pulse" aria-hidden="true" />
          <svg
            className="send__arrow"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
          </svg>
          <svg
            className="send__spinner"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
          </svg>
        </button>
      </form>
      <p className={`composer__hint${showHint ? '' : ' is-hidden'}`}>
        <kbd>Enter</kbd> — отправить · <kbd>Shift</kbd>+<kbd>Enter</kbd> — новая строка
      </p>
    </div>
  );
}
