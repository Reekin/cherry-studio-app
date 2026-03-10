import type { AgentRemoteStorage } from '@/services/agentRemote'
import { AgentRemoteService } from '@/services/agentRemote'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const RUN_ID = '11111111-1111-4111-8111-111111111111'

function createStorage(lastAckSeq = 0): AgentRemoteStorage & { setLastAckSeq: jest.Mock<Promise<void>, [number]> } {
  return {
    getDeviceId: jest.fn().mockResolvedValue('device-1'),
    getLastAckSeq: jest.fn().mockResolvedValue(lastAckSeq),
    setLastAckSeq: jest.fn().mockResolvedValue(undefined),
    hydrate: jest.fn().mockResolvedValue({
      deviceId: 'device-1',
      lastAckSeq
    })
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('AgentRemoteService', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('persists consumed seq values and sends throttled ack.commit payloads', async () => {
    const storage = createStorage()
    const service = new AgentRemoteService(storage)
    const send = jest.fn()

    await service.hydrate()
    ;(service as any).client = {
      disconnect: jest.fn(),
      isConnected: () => true,
      send
    }

    service.handleIncomingEnvelope({
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
    })

    service.handleIncomingEnvelope({
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
    })

    await flushMicrotasks()

    expect(storage.setLastAckSeq).toHaveBeenLastCalledWith(2)
    expect(send).not.toHaveBeenCalled()

    jest.advanceTimersByTime(250)
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ack',
        event: 'ack.commit',
        payload: {
          deviceId: 'device-1',
          ackSeq: 2
        }
      })
    )
  })

  it('ignores duplicate sequenced envelopes that were already acknowledged', async () => {
    const storage = createStorage(3)
    const service = new AgentRemoteService(storage)
    const send = jest.fn()

    await service.hydrate()
    ;(service as any).client = {
      disconnect: jest.fn(),
      isConnected: () => true,
      send
    }

    service.handleIncomingEnvelope({
      type: 'evt',
      event: 'session.created',
      seq: 3,
      ts: Date.now(),
      payload: {
        sessionId: 'session-dup',
        agentId: 'agent-dup',
        version: 1,
        updatedAt: 100
      }
    })

    await flushMicrotasks()

    expect(service.getState().sessions).toEqual({})
    expect(storage.setLastAckSeq).not.toHaveBeenCalled()

    jest.advanceTimersByTime(250)
    await flushMicrotasks()

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          deviceId: 'device-1',
          ackSeq: 3
        }
      })
    )
  })

  it('requests snapshots for pushed sessions, lagging version bumps, and recovery errors', async () => {
    const storage = createStorage()
    const service = new AgentRemoteService(storage)
    const requestSnapshotSpy = jest.spyOn(service, 'requestSnapshot').mockResolvedValue('snapshot-request')

    await service.hydrate()
    ;(service as any).client = {
      disconnect: jest.fn(),
      isConnected: () => true,
      send: jest.fn()
    }

    service.handleIncomingEnvelope({
      type: 'evt',
      event: 'session.pushed',
      seq: 1,
      ts: Date.now(),
      payload: {
        sessionId: 'session-2',
        agentId: 'agent-2',
        pushedAt: 100,
        version: 4,
        updatedAt: 120
      }
    })

    await flushMicrotasks()

    expect(requestSnapshotSpy).toHaveBeenCalledWith({
      sessionId: 'session-2',
      snapshotVersion: 4
    })

    requestSnapshotSpy.mockClear()

    service.handleIncomingEnvelope({
      type: 'evt',
      event: 'session.version.bump',
      seq: 2,
      ts: Date.now(),
      payload: {
        sessionId: 'session-2',
        version: 5,
        updatedAt: 140
      }
    })

    await flushMicrotasks()

    expect(requestSnapshotSpy).toHaveBeenCalledWith({
      sessionId: 'session-2',
      snapshotVersion: 5
    })

    requestSnapshotSpy.mockClear()

    service.handleIncomingEnvelope({
      type: 'err',
      event: 'error',
      seq: 3,
      ts: Date.now(),
      payload: {
        code: 'SNAPSHOT_REQUIRED',
        message: 'Need snapshot',
        retryable: true,
        sessionId: 'session-2'
      }
    })

    await flushMicrotasks()

    expect(requestSnapshotSpy).toHaveBeenCalledWith({
      sessionId: 'session-2',
      snapshotVersion: undefined
    })
  })
})
