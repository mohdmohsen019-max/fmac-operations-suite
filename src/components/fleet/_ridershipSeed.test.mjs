import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUJAIRAH_HISTORY, RIDERSHIP_BRANCHES, buildBusRows, ridershipClassId,
  RIDERSHIP_BUS_CAPACITY, RIDERSHIP_SESSION_TIMES, ridershipSessionTime,
} from './ridershipSeed.js';

test('branch rosters match the requested Fujairah, Dibba, Al-Bidya and Swimming split', () => {
  assert.deepEqual(RIDERSHIP_BRANCHES.map(branch => [branch.id, branch.buses.length]), [
    ['fujairah', 8],
    ['dibba', 2],
    ['al-bidya', 2],
    ['swimming', 2],
  ]);
  assert.deepEqual(RIDERSHIP_BRANCHES[1].buses.map(bus => bus.registration), [
    'C37074', 'M85756',
  ]);
  assert.deepEqual(RIDERSHIP_BRANCHES[2].buses.map(bus => bus.registration), [
    'M99270', 'C29769',
  ]);
  assert.equal(RIDERSHIP_BRANCHES[2].nameEn, 'Al-Bidya');
  assert.equal(RIDERSHIP_BRANCHES[2].nameAr, 'البدية');
  assert.deepEqual(RIDERSHIP_BRANCHES[3].buses.map(bus => bus.registration), [
    'C37072', 'A33876',
  ]);
});

test('Word history contains all 22 dates and 432 numeric cells', () => {
  assert.equal(FUJAIRAH_HISTORY.length, 22);
  assert.equal(FUJAIRAH_HISTORY[0][0], '2026-07-08');
  assert.equal(FUJAIRAH_HISTORY.at(-1)[0], '2026-08-05');
  const numericCells = FUJAIRAH_HISTORY
    .flatMap(([, buses]) => buses)
    .flat()
    .filter(value => value != null);
  assert.equal(numericCells.length, 432);
  assert.deepEqual(FUJAIRAH_HISTORY.at(-1)[1][5], [6, 17, 17, 5]);
});

test('bus 8 has one session and Swimming buses have two untimed sessions', () => {
  const rows = buildBusRows([], () => null).flatMap(branch => branch.buses);
  assert.equal(rows.length, 14);
  assert.equal(rows.find(bus => bus.registration === 'A33867').sessions.length, 1);
  assert.equal(rows.find(bus => bus.registration === 'C37072').sessions.length, 2);
  assert.equal(rows.find(bus => bus.registration === 'A33876').sessions.length, 2);
  assert.equal(rows.flatMap(bus => bus.sessions).length, 49);
  const ids = rows.flatMap(bus => bus.sessions.map(session => session.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(rows.flatMap(bus => bus.sessions).every(session => session.capacity === RIDERSHIP_BUS_CAPACITY));
  assert.equal(ridershipClassId('M85750', 1), 'bus_m85750_s1');
  assert.equal(ridershipSessionTime('1', 1), RIDERSHIP_SESSION_TIMES[1]);
  assert.equal(ridershipSessionTime('7', 4), '7:00 PM to 9:00 PM');
  assert.equal(ridershipSessionTime('8', 1), '');
  assert.equal(ridershipSessionTime('11', 1), '10:00 AM to 12:00 PM');
  assert.equal(ridershipSessionTime('14', 4), '7:00 PM to 9:00 PM');
  assert.equal(ridershipSessionTime('10', 2), '');
  assert.ok(rows
    .filter(bus => ['C37072', 'A33876'].includes(bus.registration))
    .flatMap(bus => bus.sessions)
    .every(session => session.time === ''));
});
