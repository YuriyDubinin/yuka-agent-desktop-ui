// Runs the face's tools for the agent: validates the arguments, asks the user before
// destructive actions, executes, and answers with an MCP-shaped result. Independent of
// Electron (the window side is behind UiController), so it is unit-tested directly.

import type { ScreenCorner } from '../../shared/geometry';
import type { FaceCommand, ThemeMode, ToolCall, ToolDefinition } from '../../shared/protocol';
import { validate } from './schema';
import { UI_INSTRUCTIONS, UI_TOOLS, type UiToolName } from './ui-tools';

export interface UiSnapshot {
  themeMode: ThemeMode;
  panelOpen: boolean;
  pinned: boolean;
  corner: ScreenCorner;
}

/** What the tools act on (implemented by WindowManager). */
export interface UiController {
  snapshot(): UiSnapshot;
  setThemeMode(mode: ThemeMode): void;
  setPinned(pinned: boolean): void;
  dismissPanel(): void;
  moveOrbToCorner(corner: ScreenCorner): void;
  /** Brings the panel up (for a confirmation question). */
  showPanel(): void;
  quit(): void;
}

export interface ToolActivity {
  callId: string;
  title: string;
  phase: 'start' | 'end';
  ok?: boolean;
  summary?: string;
}

export interface UiToolHostOptions {
  controller: UiController;
  /** Asks the user; resolves true only on an explicit "yes". */
  confirm(callId: string, question: string): Promise<boolean>;
  /** Shows what Yuka is doing (a quiet line in the transcript). */
  onActivity?(activity: ToolActivity): void;
}

type ToolResult = Extract<FaceCommand, { type: 'tool_result' }>;

const THEME_LABEL: Record<ThemeMode, string> = {
  auto: 'по времени суток (авто)',
  morning: 'утро',
  day: 'день',
  evening: 'вечер',
  night: 'ночь',
};

const CORNER_LABEL: Record<ScreenCorner, string> = {
  top_left: 'левый верхний угол',
  top_right: 'правый верхний угол',
  bottom_left: 'левый нижний угол',
  bottom_right: 'правый нижний угол',
};

const CONFIRM_QUESTION: Partial<Record<UiToolName, string>> = {
  ui_quit: 'Юка хочет закрыться. Закрыть?',
};

/** After "yes" to ui_quit the result must reach the agent before the app goes away. */
const QUIT_DELAY_MS = 300;

export class UiToolHost {
  private readonly options: UiToolHostOptions;

  constructor(options: UiToolHostOptions) {
    this.options = options;
  }

  definitions(): ToolDefinition[] {
    return UI_TOOLS.map((tool) => ({ ...tool }));
  }

  instructions(): string {
    return UI_INSTRUCTIONS;
  }

  /** Never rejects: every failure becomes an error result the model can read. */
  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = UI_TOOLS.find((candidate) => candidate.name === call.name);
    if (!tool) {
      return error(call.id, `Инструмента «${call.name}» у интерфейса нет.`);
    }

    const problems = validate(tool.inputSchema, call.arguments);
    if (problems.length > 0) {
      return error(call.id, `Неверные аргументы ${tool.name}: ${problems.join('; ')}.`);
    }

    const { onActivity } = this.options;
    onActivity?.({ callId: call.id, title: tool.title, phase: 'start' });
    let result: ToolResult;
    try {
      if (tool.annotations.destructiveHint) {
        const question = CONFIRM_QUESTION[tool.name] ?? `Выполнить «${tool.title}»?`;
        this.options.controller.showPanel();
        if (!(await this.options.confirm(call.id, question))) {
          result = error(call.id, 'Пользователь отказался, действие не выполнено.');
          onActivity?.({
            callId: call.id,
            title: tool.title,
            phase: 'end',
            ok: false,
            summary: 'отменено',
          });
          return result;
        }
      }
      const text = this.run(tool.name, call.arguments);
      result = {
        type: 'tool_result',
        id: call.id,
        content: [{ type: 'text', text }],
        isError: false,
      };
      onActivity?.({ callId: call.id, title: tool.title, phase: 'end', ok: true, summary: text });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      result = error(call.id, `Не получилось: ${message}`);
      onActivity?.({
        callId: call.id,
        title: tool.title,
        phase: 'end',
        ok: false,
        summary: message,
      });
    }
    return result;
  }

  private run(name: UiToolName, args: Record<string, unknown>): string {
    const ui = this.options.controller;
    switch (name) {
      case 'ui_get_state': {
        const state = ui.snapshot();
        return [
          `Тема: ${THEME_LABEL[state.themeMode]}.`,
          `Панель: ${state.panelOpen ? 'открыта' : 'скрыта'}${state.pinned ? ', закреплена' : ''}.`,
          `Сфера: ${CORNER_LABEL[state.corner]} экрана.`,
        ].join(' ');
      }
      case 'ui_set_theme': {
        const mode = args.mode as ThemeMode;
        ui.setThemeMode(mode);
        return `Тема: ${THEME_LABEL[mode]}.`;
      }
      case 'ui_pin_panel': {
        const pinned = args.pinned as boolean;
        ui.setPinned(pinned);
        return pinned ? 'Панель закреплена.' : 'Панель откреплена.';
      }
      case 'ui_hide_panel':
        ui.dismissPanel();
        return 'Панель спрятана.';
      case 'ui_move_orb': {
        const corner = args.corner as ScreenCorner;
        ui.moveOrbToCorner(corner);
        return `Сфера теперь: ${CORNER_LABEL[corner]}.`;
      }
      case 'ui_quit':
        setTimeout(() => ui.quit(), QUIT_DELAY_MS);
        return 'Юка закрывается.';
    }
  }
}

function error(id: string, text: string): ToolResult {
  return { type: 'tool_result', id, content: [{ type: 'text', text }], isError: true };
}
