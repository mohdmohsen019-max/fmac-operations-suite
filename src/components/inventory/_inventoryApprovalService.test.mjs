import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalTransition, INVENTORY_REQUEST_STATUS, inventoryWorkflowRole } from './inventoryApprovalModel.js'

test('specialist approval advances the request to Head of Operations', () => {
  assert.deepEqual(
    approvalTransition(INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, 'specialist'),
    { status: INVENTORY_REQUEST_STATUS.PENDING_HEAD, specialist: 'approved', head: 'pending' },
  )
})

test('Head of Operations can override the specialist step', () => {
  assert.deepEqual(
    approvalTransition(INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, 'head'),
    { status: INVENTORY_REQUEST_STATUS.APPROVED, specialist: 'overridden', head: 'approved' },
  )
})

test('Head of Operations provides final approval after the specialist', () => {
  assert.deepEqual(
    approvalTransition(INVENTORY_REQUEST_STATUS.PENDING_HEAD, 'head'),
    { status: INVENTORY_REQUEST_STATUS.APPROVED, specialist: 'approved', head: 'approved' },
  )
})

test('workflow roles map to the required job titles', () => {
  assert.equal(inventoryWorkflowRole({ jobTitle: 'Warehouse/Store Manager' }), 'requester')
  assert.equal(inventoryWorkflowRole({ jobTitle: 'Sports Activities Specialist' }), 'specialist')
  assert.equal(inventoryWorkflowRole({ jobTitle: 'Head of Operations' }), 'head')
  assert.equal(inventoryWorkflowRole({ jobTitle: 'Logistics Specialist' }), 'viewer')
})
