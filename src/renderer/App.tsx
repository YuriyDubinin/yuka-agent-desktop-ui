import { AuroraBackground } from './components/AuroraBackground';
import { Composer } from './components/Composer';
import { Header, type StatusTone } from './components/Header';
import { MessageList } from './components/MessageList';
import { ConnectionToast, Splash } from './components/Splash';
import type { CoreMood } from './components/YukaCore';
import { useAgent } from './hooks/useAgent';
import { usePointerLight } from './hooks/usePointerLight';
import { isReplying, selectTelemetry } from './state/chat';
import { useTimeTheme } from './theme/useTimeTheme';

export function App() {
  const { state, send } = useAgent();
  const { mode, theme, setMode, cycle, modes } = useTimeTheme();
  usePointerLight();

  const { connection, agent, messages, awaitingReply } = state;
  const streaming = messages.some((m) => m.streaming);
  const busy = isReplying(state);
  const online = connection === 'connected';
  const telemetry = selectTelemetry(state);

  const mood: CoreMood =
    connection === 'no-agent'
      ? 'sleeping'
      : connection !== 'connected'
        ? 'offline'
        : awaitingReply
          ? 'thinking'
          : streaming
            ? 'talking'
            : 'idle';

  const statusLabel = !online
    ? connection === 'no-agent'
      ? 'спит'
      : connection === 'connecting'
        ? 'подключаюсь'
        : 'нет связи'
    : awaitingReply
      ? 'думает'
      : streaming
        ? 'отвечает'
        : 'на связи';
  const statusTone: StatusTone =
    connection === 'no-agent' ? 'sleep' : !online ? 'offline' : busy ? 'busy' : 'online';

  const showSplash = connection === 'no-agent' || (messages.length === 0 && !online);
  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <div className="app">
      <AuroraBackground theme={theme} />

      <div className="shell">
        <Header
          agent={agent}
          mood={mood}
          statusLabel={statusLabel}
          statusTone={statusTone}
          telemetry={telemetry}
          theme={theme}
          themeMode={mode}
          themeModes={modes}
          onThemeModeChange={setMode}
          onCycleTheme={cycle}
        />

        <main className="stage">
          <ConnectionToast visible={!showSplash && !online} />
          {showSplash ? (
            <Splash connection={connection} mood={mood} theme={theme} />
          ) : (
            <MessageList messages={messages} awaitingReply={awaitingReply} />
          )}
        </main>

        <Composer
          disabled={!online}
          busy={busy}
          showHint={online && !hasUserMessages}
          onSend={send}
        />
      </div>
    </div>
  );
}
