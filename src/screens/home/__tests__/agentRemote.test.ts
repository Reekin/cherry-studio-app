jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import type { AgentRemoteSessionState } from '@/types/agentRemote'

import {
  getRenderableAgentRemoteMessages,
  shouldRequestAgentRemoteSnapshot
} from '../agentRemote'

function createSession(overrides: Partial<AgentRemoteSessionState> = {}): AgentRemoteSessionState {
  return {
    sessionId: 'session-1',
    visibility: 'desktop_pushed',
    status: 'ready',
    version: 2,
    updatedAt: 300,
    snapshotVersion: 2,
    snapshotSeqCeiling: 9,
    messageOrder: [],
    messages: {},
    blocks: {},
    ...overrides
  }
}

describe('agentRemote screen helpers', () => {
  it('renders only the semantic blocks recorded for the message', () => {
    const session = createSession({
      messageOrder: ['assistant-1'],
      messages: {
        'assistant-1': {
          messageId: 'assistant-1',
          role: 'assistant',
          status: 'error',
          createdAt: 100,
          updatedAt: 200,
          blockIds: ['thinking-1'],
          error: {
            code: 'PROVIDER_STREAM_FAILED',
            message: 'Provider crashed',
            retryable: true
          }
        }
      },
      blocks: {
        'thinking-1': {
          blockId: 'thinking-1',
          messageId: 'assistant-1',
          type: 'thinking',
          status: 'success',
          order: 1,
          createdAt: 120,
          updatedAt: 180,
          content: 'Thinking'
        }
      }
    })

    const renderableMessages = getRenderableAgentRemoteMessages(session)

    expect(renderableMessages).toHaveLength(1)
    expect(renderableMessages[0]?.blocks.map(block => block.blockId)).toEqual(['thinking-1'])
  })

  it('requests snapshot recovery for pushed sessions with no messages', () => {
    const session = createSession({
      status: 'awaiting_snapshot',
      snapshotVersion: undefined,
      version: 5
    })

    expect(shouldRequestAgentRemoteSnapshot(session)).toBe(true)
  })
})
