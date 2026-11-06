// The tools this face offers to the agent (protocol v2 `capabilities`). Deliberately few,
// with strict schemas and enums: the model is a local 7B one, and a small, unambiguous set
// is what it calls reliably. Descriptions are written for the model, in Russian.

import { SCREEN_CORNERS } from '../../shared/geometry';
import { THEME_MODES, type ToolDefinition } from '../../shared/protocol';

export type UiToolName =
  | 'ui_get_state'
  | 'ui_set_theme'
  | 'ui_pin_panel'
  | 'ui_hide_panel'
  | 'ui_move_orb'
  | 'ui_quit';

const noArguments = { type: 'object', properties: {}, additionalProperties: false } as const;

export const UI_TOOLS: readonly (ToolDefinition & { name: UiToolName })[] = [
  {
    name: 'ui_get_state',
    title: 'Посмотреть состояние интерфейса',
    description:
      'Сообщает текущее состояние интерфейса: тему, открыта и закреплена ли панель диалога, ' +
      'в каком углу экрана сфера. Вызывай, если это нужно знать перед действием.',
    inputSchema: noArguments,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: 'ui_set_theme',
    title: 'Сменить тему',
    description:
      'Меняет тему интерфейса. auto — по времени суток; morning — утро (персик и сирень); ' +
      'day — день (белое стекло и лазурь); evening — вечер (закат); night — ночь (индиго). ' +
      'Вызывай, когда Юра просит другую тему, цвет, «потемнее» или «посветлее».',
    inputSchema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: THEME_MODES } },
      required: ['mode'],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
  },
  {
    name: 'ui_pin_panel',
    title: 'Закрепить панель',
    description:
      'pinned=true закрепляет панель диалога: она не исчезает, когда курсор уходит. ' +
      'pinned=false открепляет её.',
    inputSchema: {
      type: 'object',
      properties: { pinned: { type: 'boolean' } },
      required: ['pinned'],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
  },
  {
    name: 'ui_hide_panel',
    title: 'Спрятать панель',
    description:
      'Прячет панель диалога, сфера остаётся. Вызывай, только если Юра прямо просит ' +
      'спрятать или убрать окно диалога.',
    inputSchema: noArguments,
    annotations: { idempotentHint: true },
  },
  {
    name: 'ui_move_orb',
    title: 'Переместить сферу',
    description:
      'Перемещает сферу Юки (и панель вместе с ней) в угол экрана: top_left — левый верхний, ' +
      'top_right — правый верхний, bottom_left — левый нижний, bottom_right — правый нижний. ' +
      'Только когда Юра просит переместить тебя; на вопрос «как мне тебя перетащить» не вызывай.',
    inputSchema: {
      type: 'object',
      properties: { corner: { type: 'string', enum: SCREEN_CORNERS } },
      required: ['corner'],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
  },
  {
    name: 'ui_quit',
    title: 'Закрыть Юку',
    description:
      'Полностью закрывает Юку и завершает разговор. Только по прямой просьбе Юры. ' +
      'Интерфейс сам спросит у него подтверждение.',
    inputSchema: noArguments,
    annotations: { destructiveHint: true },
  },
];

/** `capabilities.instructions`: how the model should use these tools. */
export const UI_INSTRUCTIONS = [
  '- Ты живёшь на рабочем столе Юры стеклянной сферой; рядом с ней появляется панель диалога.',
  '- Инструменты ui_* управляют этим интерфейсом: тема, панель, место сферы, закрытие.',
  '- Если не знаешь, какая сейчас тема или где сфера, сначала вызови ui_get_state.',
  '- Вопрос «как мне…» — просьба объяснить, а не сделать: отвечай словами, инструменты не вызывай.',
  '- ui_quit закрывает тебя совсем: вызывай его только по прямой просьбе.',
].join('\n');
