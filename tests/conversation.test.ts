import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Confirmations } from '../src/main/confirmations.ts';
import { SessionHub } from '../src/main/session-hub.ts';
import { chatReducer, initialChatState, type ChatState } from '../src/renderer/state/chat.ts';
import type { FaceEvent } from '../src/shared/protocol.ts';

const apply = (events: FaceEvent[], from: ChatState = initialChatState) =>
  events.reduce((state, event, i) => chatReducer(state, { type: 'face', event, at: i }), from);

const agent = (event: Extract<FaceEvent, { kind: 'agent' }>['event']): FaceEvent => ({
  kind: 'agent',
  event,
});

describe('transcript with tools', () => {
  const start: FaceEvent[] = [
    { kind: 'connection', state: 'connected' },
    agent({ type: 'hello', agent: { name: 'Юка', model: 'm' }, greeting: 'Привет', protocol: 2 }),
    { kind: 'user', text: 'включи ночь' },
    agent({ type: 'assistant_start', id: 1 }),
  ];

  test('the action line goes before the reply it belongs to', () => {
    const state = apply([
      ...start,
      { kind: 'tool', callId: 'c1', title: 'Сменить тему', phase: 'start' },
      {
        kind: 'tool',
        callId: 'c1',
        title: 'Сменить тему',
        phase: 'end',
        ok: true,
        summary: 'Тема: ночь.',
      },
      agent({ type: 'assistant_chunk', id: 1, text: 'Готово!' }),
      agent({ type: 'assistant_end', id: 1 }),
    ]);
    assert.deepEqual(
      state.messages.map((m) => m.role),
      ['assistant', 'user', 'tool', 'assistant'],
    );
    assert.deepEqual(state.messages[2].tool, {
      callId: 'c1',
      status: 'done',
      summary: 'Тема: ночь.',
    });
    assert.equal(state.messages[3].text, 'Готово!');
    assert.equal(state.toolRuns, 1);
  });

  test('a failed action is marked failed', () => {
    const state = apply([
      ...start,
      { kind: 'tool', callId: 'c2', title: 'Закрыть Юку', phase: 'start' },
      {
        kind: 'tool',
        callId: 'c2',
        title: 'Закрыть Юку',
        phase: 'end',
        ok: false,
        summary: 'отменено',
      },
    ]);
    assert.equal(state.messages.find((m) => m.role === 'tool')?.tool?.status, 'failed');
  });

  test('a confirmation card is asked, then answered', () => {
    const asked = apply([
      ...start,
      { kind: 'confirm', callId: 'c3', question: 'Закрыть?', phase: 'ask' },
    ]);
    const card = asked.messages.find((m) => m.role === 'confirm');
    assert.equal(card?.text, 'Закрыть?');
    assert.equal(card?.confirm?.status, 'pending');

    const answered = apply(
      [{ kind: 'confirm', callId: 'c3', question: '', phase: 'answered', accepted: false }],
      asked,
    );
    assert.equal(answered.messages.find((m) => m.role === 'confirm')?.confirm?.status, 'declined');
  });
});

describe('Confirmations', () => {
  test('"yes" resolves true and is recorded in the session', async () => {
    const session = new SessionHub();
    const recorded: FaceEvent[] = [];
    const original = session.record.bind(session);
    session.record = (event) => {
      recorded.push(event);
      original(event);
    };

    const confirmations = new Confirmations(session, 1000);
    const answer = confirmations.ask('c1', 'Закрыть?');
    confirmations.answer('c1', true);
    assert.equal(await answer, true);
    assert.deepEqual(
      recorded.map((e) => (e.kind === 'confirm' ? e.phase : e.kind)),
      ['ask', 'answered'],
    );

    confirmations.answer('c1', false); // already settled: ignored
    assert.equal(recorded.length, 2);
  });

  test('no answer in time counts as "no"', async () => {
    const confirmations = new Confirmations(new SessionHub(), 10);
    assert.equal(await confirmations.ask('c2', 'Закрыть?'), false);
  });

  test('cancelAll declines everything open', async () => {
    const confirmations = new Confirmations(new SessionHub(), 10_000);
    const a = confirmations.ask('a', '?');
    const b = confirmations.ask('b', '?');
    confirmations.cancelAll();
    assert.deepEqual(await Promise.all([a, b]), [false, false]);
  });
});
