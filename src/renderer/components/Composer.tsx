import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  onSend: (text: string) => void;
}

/** Up to four lines, then it scrolls. */
const MAX_HEIGHT_PX = 4 * 22 + 12;

/** One quiet line on the ice: Enter sends, Shift+Enter breaks the line. */
export function Composer({ disabled, busy, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to the limit.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  // While the user types, main keeps the panel on screen.
  const hasDraft = text.trim().length > 0;
  useEffect(() => {
    window.yuka.setComposerState({ focused, hasDraft });
  }, [focused, hasDraft]);

  // ⌥Space: main brings the panel forward and asks for the caret.
  useEffect(() => window.yuka.onFocusComposer(() => inputRef.current?.focus()), []);

  const canSend = !disabled && !busy && hasDraft;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text);
    setText('');
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className={`composer${disabled ? ' is-disabled' : ''}${focused ? ' is-focused' : ''}`}
      onSubmit={submit}
    >
      <textarea
        ref={inputRef}
        className="composer__input"
        rows={1}
        value={text}
        placeholder={disabled ? 'Юка не на связи…' : 'Напиши Юке…'}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Сообщение"
      />
      <button
        type="submit"
        className={`send${busy ? ' is-busy' : canSend ? ' is-ready' : ''}`}
        disabled={!canSend}
        aria-label={busy ? 'Юка отвечает' : 'Отправить'}
        title="Отправить (Enter)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 18.5V5.5M6 11.5 12 5.5l6 6" />
        </svg>
      </button>
    </form>
  );
}
