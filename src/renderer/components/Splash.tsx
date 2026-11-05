import type { ConnectionState } from '../../shared/protocol';
import type { ThemeName } from '../theme/themes';
import { type CoreMood, YukaCore } from './YukaCore';

interface SplashProps {
  connection: ConnectionState;
  mood: CoreMood;
  theme: ThemeName;
}

const COPY: Record<ConnectionState, { title: string; text: string }> = {
  'no-agent': { title: 'Юка спит', text: 'Запусти yuka-agent — и я проснусь.' },
  connecting: { title: 'Просыпаюсь', text: 'Устанавливаю связь с агентом…' },
  connected: { title: 'На связи', text: 'Секунду, собираюсь с мыслями…' },
  disconnected: { title: 'Связь потеряна', text: 'Пробую подключиться снова…' },
};

export function Splash({ connection, mood, theme }: SplashProps) {
  const copy = COPY[connection];
  return (
    <div className="splash">
      <YukaCore mood={mood} theme={theme} size={196} />
      <div className="splash__copy" key={connection}>
        <h2 className="splash__title">{copy.title}</h2>
        <p className="splash__text">{copy.text}</p>
      </div>
    </div>
  );
}

/** Glass notice shown above the transcript when the link drops mid-conversation. */
export function ConnectionToast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`toast glass${visible ? ' is-visible' : ''}`}
      role="status"
      aria-hidden={!visible}
    >
      <span className="toast__dot" aria-hidden="true" />
      Связь с агентом потеряна — пробую восстановить
    </div>
  );
}
