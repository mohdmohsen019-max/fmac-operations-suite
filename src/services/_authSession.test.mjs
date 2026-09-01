import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthSessionRecord,
  isAuthSessionRecordValid,
  REMEMBERED_SESSION_MS,
} from './authSession.js';

test('remembered session remains valid inside the seven-day window', () => {
  const record = createAuthSessionRecord('user-1', true, 1_000);
  assert.equal(isAuthSessionRecordValid(record, 'user-1', 1_000 + REMEMBERED_SESSION_MS - 1), true);
});

test('remembered session expires after seven days', () => {
  const record = createAuthSessionRecord('user-1', true, 1_000);
  assert.equal(isAuthSessionRecordValid(record, 'user-1', 1_000 + REMEMBERED_SESSION_MS), false);
});

test('session-only login rejects another user identity', () => {
  const record = createAuthSessionRecord('user-1', false, 1_000);
  assert.equal(isAuthSessionRecordValid(record, 'user-2', 2_000), false);
  assert.equal(isAuthSessionRecordValid(record, 'user-1', 2_000), true);
});
