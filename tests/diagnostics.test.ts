import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventLog } from '../src/main/diagnostics.ts';

test('event log folds repeats within a second', () => {
  const lines: string[] = [];
  let now = Date.UTC(2026, 10, 6, 12, 0, 0);
  const log = new EventLog(
    (l) => lines.push(l),
    () => now,
  );

  log.log('reconcile', 'panel: show');
  now += 100;
  log.log('reconcile', 'panel: show');
  now += 100;
  log.log('reconcile', 'panel: show');
  now += 100;
  log.log('presence', 'shown→fading reason=dismiss');

  assert.equal(lines.length, 3);
  assert.equal(lines[0], '2026-11-06T12:00:00.000Z [reconcile] panel: show');
  assert.equal(lines[1], '2026-11-06T12:00:00.200Z [reconcile] panel: show …повторилось 2 раз');
  assert.equal(lines[2], '2026-11-06T12:00:00.300Z [presence] shown→fading reason=dismiss');
});

test('the same line after a pause is written again', () => {
  const lines: string[] = [];
  let now = 0;
  const log = new EventLog(
    (l) => lines.push(l),
    () => now,
  );
  log.log('system', 'resume');
  now += 5_000;
  log.log('system', 'resume');
  assert.equal(lines.length, 2);
});
