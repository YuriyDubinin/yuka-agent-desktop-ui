import type { AgentInfo } from '../../shared/protocol';
import type { Telemetry } from '../state/chat';
import { ThemeSwitcher } from '../theme/ThemeSwitcher';
import type { ThemeMode, ThemeName } from '../theme/themes';
import { RollingNumber } from './RollingNumber';
import { type CoreMood, YukaCore } from './YukaCore';

export type StatusTone = 'online' | 'busy' | 'offline' | 'sleep';

interface HeaderProps {
  agent: AgentInfo | null;
  mood: CoreMood;
  statusLabel: string;
  statusTone: StatusTone;
  telemetry: Telemetry;
  theme: ThemeName;
  themeMode: ThemeMode;
  themeModes: ThemeMode[];
  onThemeModeChange: (mode: ThemeMode) => void;
  /** Clicking the sphere cycles through the themes. */
  onCycleTheme: () => void;
}

const formatRate = (value: number | null) => (value === null ? '—' : value.toFixed(1));
const formatLatency = (value: number | null) => (value === null ? '—' : value.toFixed(2));

export function Header({
  agent,
  mood,
  statusLabel,
  statusTone,
  telemetry,
  theme,
  themeMode,
  themeModes,
  onThemeModeChange,
  onCycleTheme,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header__bar glass">
        <button
          type="button"
          className="header__core"
          onClick={onCycleTheme}
          title="Сменить тему"
          aria-label="Сменить тему"
        >
          <YukaCore mood={mood} theme={theme} size={52} activity={telemetry.activity} />
        </button>
        <div className="header__identity">
          <h1 className="wordmark">{agent?.name ?? 'Юка'}</h1>
          <span className={`status status--${statusTone}`} aria-live="polite">
            <span className="status__dot" aria-hidden="true" />
            <span key={statusLabel} className="status__label">
              {statusLabel}
            </span>
          </span>
        </div>
        <ThemeSwitcher mode={themeMode} modes={themeModes} onChange={onThemeModeChange} />
      </div>

      <div className={`telemetry${telemetry.live ? ' is-live' : ''}`} aria-label="Телеметрия">
        <span className="telemetry__item">
          <span className="telemetry__key">модель</span>
          <span className="telemetry__value">{agent?.model ?? '—'}</span>
        </span>
        <span className="telemetry__sep" aria-hidden="true" />
        <span className="telemetry__item" title="Скорость генерации последнего ответа">
          <span className="telemetry__value">
            <RollingNumber value={formatRate(telemetry.tokensPerSecond)} />
          </span>
          <span className="telemetry__key">ток/с</span>
        </span>
        <span className="telemetry__sep" aria-hidden="true" />
        <span className="telemetry__item" title="Время до первого слова ответа">
          <span className="telemetry__value">
            <RollingNumber value={formatLatency(telemetry.latencySeconds)} />
          </span>
          <span className="telemetry__key">с до ответа</span>
        </span>
      </div>
    </header>
  );
}
