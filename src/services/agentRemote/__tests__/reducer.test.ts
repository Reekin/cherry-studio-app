import type { AgentRemoteEnvelope } from '@/types/agentRemote'

import { createInitialAgentRemoteState, reduceAgentRemoteState, selectAgentRemoteSession } from '../reducer'

const RUN_ID = '11111111-1111-4111-8111-111111111111'

describe('agentRemote reducer', () => {
  it('streams deltas into a session message and marks completion', () => {
    const createdEnvelope: AgentRemoteEnvelope = {
      type: 'evt',
      event: 'session.created',
      seq: 1,
      ts: Date.now(),
      payload: {
        sessionId: 'session-1',
        agentId: 'agent-1',
        version: 1,
        updatedAt: 100
      }
    }

    const deltaEnvelope: AgentRemoteEnvelope = {
      type: 'evt',
      event: 'message.delta',
      runId: RUN_ID,
      seq: 2,
      ts: Date.now(),
      payload: {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        role: 'assistant',
        runId: RUN_ID,
        delta: 'Hello',
        version: 2,
        updatedAt: 200
      }
    }

    const doneEnvelope: AgentRemoteEnvelope = {
      type: 'evt',
      event: 'message.done',
      runId: RUN_ID,
      seq: 3,
      ts: Date.now(),
      payload: {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        runId: RUN_ID,
        version: 3,
        updatedAt: 300,
        status: 'success'
      }
    }

    let state = createInitialAgentRemoteState()
    state = reduceAgentRemoteState(state, { type: 'server/envelope', envelope: createdEnvelope })
    state = reduceAgentRemoteState(state, { type: 'server/envelope', envelope: deltaEnvelope })
    state = reduceAgentRemoteState(state, { type: 'server/envelope', envelope: doneEnvelope })

    const session = selectAgentRemoteSession(state, 'session-1')

    expect(session).toBeDefined()
    expect(session?.status).toBe('ready')
    expect(session?.messages[0]).toMatchObject({
      messageId: 'assistant-1',
      content: 'Hello',
      status: 'done'
    })
  })

  it('marks sessions as awaiting snapshot on recovery errors', () => {
    const state = reduceAgentRemoteState(createInitialAgentRemoteState(), {
      type: 'server/envelope',
      envelope: {
        type: 'err',
        event: 'message.send',
        requestId: 'req-1',
        ts: Date.now(),
        payload: {
          code: 'SNAPSHOT_REQUIRED',
          message: 'Need snapshot',
          retryable: true,
          sessionId: 'session-2'
        }
      }
    })

    expect(selectAgentRemoteSession(state, 'session-2')).toMatchObject({
      status: 'awaiting_snapshot',
      lastError: {
        code: 'SNAPSHOT_REQUIRED'
      }
    })
  })

  it('applies newer snapshots and ignores stale ones', () => {
    const currentState = reduceAgentRemoteState(createInitialAgentRemoteState(), {
      type: 'server/envelope',
      envelope: {
        type: 'evt',
        event: 'session.snapshot',
        seq: 4,
        ts: Date.now(),
        payload: {
          sessionId: 'session-3',
          snapshotVersion: 5,
          snapshotSeqCeiling: 10,
          updatedAt: 500,
          messages: [
            {
              messageId: 'assistant-3',
              role: 'assistant',
              content: 'Latest',
              status: 'done'
            }
          ]
        }
      }
    })

    const staleState = reduceAgentRemoteState(currentState, {
      type: 'server/envelope',
      envelope: {
        type: 'evt',
        event: 'session.snapshot',
        seq: 5,
        ts: Date.now(),
        payload: {
          sessionId: 'session-3',
          snapshotVersion: 4,
          snapshotSeqCeiling: 9,
          updatedAt: 400,
          messages: []
        }
      }
    })

    expect(selectAgentRemoteSession(staleState, 'session-3')).toMatchObject({
      version: 5,
      snapshotSeqCeiling: 10
    })
  })

  it('keeps remote metadata needed for sending and marks pushed sessions as awaiting snapshot', () => {
    const state = reduceAgentRemoteState(createInitialAgentRemoteState(), {
      type: 'server/envelope',
      envelope: {
        type: 'evt',
        event: 'session.pushed',
        seq: 1,
        ts: Date.now(),
        payload: {
          sessionId: 'session-4',
          agentId: 'agent-4',
          pushedAt: 600,
          version: 7,
          updatedAt: 700
        }
      }
    })

    expect(selectAgentRemoteSession(state, 'session-4')).toMatchObject({
      agentId: 'agent-4',
      status: 'awaiting_snapshot',
      version: 7,
      visibility: 'desktop_pushed'
    })
  })
})
