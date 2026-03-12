import type { AgentRemoteEnvelope } from '@/types/agentRemote'

import { createInitialAgentRemoteState, reduceAgentRemoteState, selectAgentRemoteSession } from '../reducer'

const RUN_ID = '11111111-1111-4111-8111-111111111111'

describe('agentRemote reducer', () => {
  it('projects semantic message and block events into normalized session state', () => {
    const events: AgentRemoteEnvelope[] = [
      {
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
      },
      {
        type: 'evt',
        event: 'message.started',
        seq: 2,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          role: 'assistant',
          status: 'streaming',
          createdAt: 200,
          updatedAt: 200
        }
      },
      {
        type: 'evt',
        event: 'message.block.added',
        seq: 3,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          block: {
            blockId: 'thinking-1',
            messageId: 'assistant-1',
            type: 'thinking',
            status: 'streaming',
            order: 1,
            createdAt: 210,
            updatedAt: 210,
            content: 'Thinking...'
          }
        }
      },
      {
        type: 'evt',
        event: 'message.block.added',
        seq: 4,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          block: {
            blockId: 'text-1',
            messageId: 'assistant-1',
            type: 'main_text',
            status: 'streaming',
            order: 2,
            createdAt: 220,
            updatedAt: 220,
            content: ''
          }
        }
      },
      {
        type: 'evt',
        event: 'message.block.updated',
        seq: 5,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          blockId: 'text-1',
          patch: {
            content: 'Hello from semantic events',
            status: 'streaming'
          },
          updatedAt: 230
        }
      },
      {
        type: 'evt',
        event: 'message.block.completed',
        seq: 6,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          blockId: 'text-1',
          status: 'success',
          updatedAt: 240
        }
      },
      {
        type: 'evt',
        event: 'message.block.completed',
        seq: 7,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          blockId: 'thinking-1',
          status: 'success',
          updatedAt: 245
        }
      },
      {
        type: 'evt',
        event: 'message.completed',
        seq: 8,
        ts: Date.now(),
        payload: {
          sessionId: 'session-1',
          runId: RUN_ID,
          messageId: 'assistant-1',
          status: 'success',
          version: 3,
          updatedAt: 250
        }
      }
    ]

    const state = events.reduce(
      (currentState, envelope) => reduceAgentRemoteState(currentState, { type: 'server/envelope', envelope }),
      createInitialAgentRemoteState()
    )
    const session = selectAgentRemoteSession(state, 'session-1')

    expect(session).toBeDefined()
    expect(session?.status).toBe('ready')
    expect(session?.version).toBe(3)
    expect(session?.messageOrder).toEqual(['assistant-1'])
    expect(session?.messages['assistant-1']).toMatchObject({
      messageId: 'assistant-1',
      status: 'success',
      blockIds: ['thinking-1', 'text-1']
    })
    expect(session?.blocks['text-1']).toMatchObject({
      type: 'main_text',
      content: 'Hello from semantic events',
      status: 'success'
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

  it('applies newer snapshot v2 payloads and ignores stale ones', () => {
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
          messageOrder: ['assistant-3'],
          messages: [
            {
              messageId: 'assistant-3',
              role: 'assistant',
              status: 'success',
              createdAt: 450,
              updatedAt: 500,
              blockIds: ['text-3']
            }
          ],
          blocks: [
            {
              blockId: 'text-3',
              messageId: 'assistant-3',
              type: 'main_text',
              status: 'success',
              order: 1,
              createdAt: 450,
              updatedAt: 500,
              content: 'Latest'
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
          messageOrder: [],
          messages: [],
          blocks: []
        }
      }
    })

    expect(selectAgentRemoteSession(staleState, 'session-3')).toMatchObject({
      version: 5,
      snapshotSeqCeiling: 10,
      messageOrder: ['assistant-3']
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
