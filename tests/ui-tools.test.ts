import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

import type { ScreenCorner } from '../src/shared/geometry.ts';
import type { ThemeMode, ToolCall } from '../src/shared/protocol.ts';
import { validate } from '../src/main/tools/schema.ts';
import {
  type ToolActivity,
  type UiController,
  type UiSnapshot,
  UiToolHost,
} from '../src/main/tools/ui-tool-host.ts';
import { UI_TOOLS } from '../src/main/tools/ui-tools.ts';

// ------------------------------------------------------------------ schema

describe('schema', () => {
  const schema = {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['a', 'b'] },
      on: { type: 'boolean' },
      list: { type: 'array', items: { type: 'integer' } },
    },
    required: ['mode'],
    additionalProperties: false,
  } as const;

  test('accepts valid arguments', () => {
    assert.deepEqual(validate(schema, { mode: 'a', on: true, list: [1, 2] }), []);
  });

  test('reports type, enum, required and extra fields', () => {
    assert.match(validate(schema, 'x')[0], /ожидается object/);
    assert.match(validate(schema, { mode: 'c' })[0], /допустимые значения — "a", "b"/);
    assert.match(validate(schema, {})[0], /arguments\.mode: обязательное поле/);
    assert.match(validate(schema, { mode: 'a', extra: 1 })[0], /arguments\.extra: лишнее поле/);
    assert.match(validate(schema, { mode: 'a', on: 'yes' })[0], /arguments\.on: ожидается boolean/);
    assert.match(validate(schema, { mode: 'a', list: [1, 1.5] })[0], /arguments\.list\[1\]/);
  });

  test('number accepts integers, integer rejects fractions', () => {
    assert.deepEqual(validate({ type: 'number' }, 3), []);
    assert.equal(validate({ type: 'integer' }, 3.5).length, 1);
  });
});

// ------------------------------------------------------------------ catalog

describe('catalog', () => {
  test('six tools with unique snake_case names, descriptions and object schemas', () => {
    assert.equal(UI_TOOLS.length, 6);
    assert.equal(new Set(UI_TOOLS.map((t) => t.name)).size, 6);
    for (const tool of UI_TOOLS) {
      assert.match(tool.name, /^[a-z][a-z0-9_]{0,63}$/);
      assert.ok(tool.description.length > 20, tool.name);
      assert.ok(tool.title.length > 0, tool.name);
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    }
  });

  test('only ui_quit is destructive; only ui_get_state is read-only', () => {
    const destructive = UI_TOOLS.filter((t) => t.annotations.destructiveHint).map((t) => t.name);
    const readOnly = UI_TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    assert.deepEqual(destructive, ['ui_quit']);
    assert.deepEqual(readOnly, ['ui_get_state']);
  });
});

// ------------------------------------------------------------------ host

class FakeUi implements UiController {
  calls: string[] = [];
  state: UiSnapshot = {
    themeMode: 'night',
    panelOpen: true,
    pinned: false,
    corner: 'bottom_right',
  };
  failOn: string | null = null;

  private record(entry: string) {
    if (this.failOn && entry.startsWith(this.failOn)) throw new Error('окно недоступно');
    this.calls.push(entry);
  }
  snapshot() {
    return this.state;
  }
  setThemeMode(mode: ThemeMode) {
    this.record(`theme:${mode}`);
  }
  setPinned(pinned: boolean) {
    this.record(`pin:${pinned}`);
  }
  dismissPanel() {
    this.record('hide');
  }
  moveOrbToCorner(corner: ScreenCorner) {
    this.record(`move:${corner}`);
  }
  showPanel() {
    this.record('show');
  }
  quit() {
    this.record('quit');
  }
}

function setup(answer = true) {
  const ui = new FakeUi();
  const activity: ToolActivity[] = [];
  const questions: string[] = [];
  const host = new UiToolHost({
    controller: ui,
    confirm: async (_id, question) => {
      questions.push(question);
      return answer;
    },
    onActivity: (a) => activity.push(a),
  });
  return { ui, host, activity, questions };
}

const call = (name: string, args: Record<string, unknown> = {}, id = 'call_1'): ToolCall => ({
  type: 'tool_call',
  id,
  name,
  arguments: args,
});

const text = (result: { content: { text: string }[] }) => result.content[0].text;

describe('UiToolHost', () => {
  test('advertises the catalog and instructions', () => {
    const { host } = setup();
    assert.equal(host.definitions().length, 6);
    assert.match(host.instructions(), /ui_get_state/);
  });

  test('sets the theme and reports it', async () => {
    const { host, ui, activity } = setup();
    const result = await host.execute(call('ui_set_theme', { mode: 'evening' }, 'c7'));
    assert.equal(result.id, 'c7');
    assert.equal(result.isError, false);
    assert.equal(text(result), 'Тема: вечер.');
    assert.deepEqual(ui.calls, ['theme:evening']);
    assert.deepEqual(
      activity.map((a) => [a.phase, a.ok]),
      [
        ['start', undefined],
        ['end', true],
      ],
    );
  });

  test('pin, hide, move', async () => {
    const { host, ui } = setup();
    assert.equal(
      text(await host.execute(call('ui_pin_panel', { pinned: true }))),
      'Панель закреплена.',
    );
    assert.equal(text(await host.execute(call('ui_hide_panel'))), 'Панель спрятана.');
    assert.equal(
      text(await host.execute(call('ui_move_orb', { corner: 'top_left' }))),
      'Сфера теперь: левый верхний угол.',
    );
    assert.deepEqual(ui.calls, ['pin:true', 'hide', 'move:top_left']);
  });

  test('describes the current state', async () => {
    const { host } = setup();
    assert.equal(
      text(await host.execute(call('ui_get_state'))),
      'Тема: ночь. Панель: открыта. Сфера: правый нижний угол экрана.',
    );
  });

  test('unknown tools and invalid arguments are errors the model can read', async () => {
    const { host, ui, activity } = setup();
    const unknown = await host.execute(call('ui_fly'));
    assert.equal(unknown.isError, true);
    assert.match(text(unknown), /ui_fly/);

    const invalid = await host.execute(call('ui_set_theme', { mode: 'purple' }));
    assert.equal(invalid.isError, true);
    assert.match(text(invalid), /допустимые значения/);

    const extra = await host.execute(call('ui_hide_panel', { now: true }));
    assert.match(text(extra), /лишнее поле/);

    assert.deepEqual(ui.calls, []);
    assert.deepEqual(activity, [], 'nothing ran, nothing shown');
  });

  test('a failing window action becomes an error result', async () => {
    const { host, ui, activity } = setup();
    ui.failOn = 'theme';
    const result = await host.execute(call('ui_set_theme', { mode: 'day' }));
    assert.equal(result.isError, true);
    assert.match(text(result), /окно недоступно/);
    assert.equal(activity.at(-1)?.ok, false);
  });

  test('ui_quit asks first; "yes" quits shortly after answering', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { host, ui, questions } = setup(true);
      const result = await host.execute(call('ui_quit'));
      assert.equal(result.isError, false);
      assert.equal(text(result), 'Юка закрывается.');
      assert.equal(questions.length, 1);
      assert.deepEqual(ui.calls, ['show'], 'the panel is brought up for the question');
      mock.timers.tick(300);
      assert.deepEqual(ui.calls, ['show', 'quit']);
    } finally {
      mock.timers.reset();
    }
  });

  test('ui_quit declined does nothing', async () => {
    const { host, ui, activity } = setup(false);
    const result = await host.execute(call('ui_quit'));
    assert.equal(result.isError, true);
    assert.match(text(result), /отказался/);
    assert.deepEqual(ui.calls, ['show']);
    assert.equal(activity.at(-1)?.summary, 'отменено');
  });
});
