import { loggerService } from '@/services/LoggerService'
import type {
  AgentRemoteConnectOptions,
  AgentRemoteCreateSessionInput,
  AgentRemoteEnvelope,
  AgentRemoteProtocolErrorPayload,
  AgentRemoteSendMessageInput,
  AgentRemoteSnapshotRequestInput,
  AgentRemoteState} from '@/types/agentRemote'
import {
  AGENT_REMOTE_ACK_EVENT,
  agentRemoteAckPayloadSchema,
  agentRemoteMessageSendPayloadSchema,
  agentRemoteProtocolErrorPayloadSchema,
  agentRemoteSessionCreatePayloadSchema,
  agentRemoteSessionPushedPayloadSchema,
  agentRemoteSessionSnapshotPayloadSchema,
  agentRemoteSessionSnapshotRequestPayloadSchema,
  agentRemoteSessionVersionBumpPayloadSchema} from '@/types/agentRemote'
import { uuid } from '@/utils'

import { AgentRemoteWebSocketClient } from './AgentRemoteWebSocketClient'
import { createInitialAgentRemoteState, createPendingRequest, reduceAgentRemoteState } from './reducer'
import type { AgentRemoteStorage } from './storage'
import { AsyncStorageAgentRemoteStorage } from './storage'

const ACK_COMMIT_THROTTLE_MS = 250
const SNAPSHOT_REQUEST_COOLDOWN_MS = 1_500

const logger = loggerService.withContext('Agent Remote Service')

type AgentRemoteStateListener = (state: AgentRemoteState) => void
type SequencedInboundEnvelope = AgentRemoteEnvelope & { type: 'evt' | 'err'; seq: number }
type SnapshotRecoveryRequest = {
  requestedAt: number
  targetVersion?: number
  dispatched: boolean
}

export class AgentRemoteService {
  private readonly listeners = new Set<AgentRemoteStateListener>()
  private readonly storage: AgentRemoteStorage
  private readonly snapshotRecoveryRequests = new Map<string, SnapshotRecoveryRequest>()
  private client: AgentRemoteWebSocketClient | null = null
  private connectOptions: AgentRemoteConnectOptions | null = null
  private state: AgentRemoteState = createInitialAgentRemoteState()
  private ackCommitTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAckCommitSeq = 0
  private lastConsumedSeq = 0
  private lastPersistedAckSeq = 0
  private persistTargetAckSeq = 0
  private persistAckPromise: Promise<void> | null = null

  constructor(storage: AgentRemoteStorage = new AsyncStorageAgentRemoteStorage()) {
    this.storage = storage
  }

  async hydrate(): Promise<AgentRemoteState> {
    const snapshot = await this.storage.hydrate()

    this.lastConsumedSeq = snapshot.lastAckSeq
    this.lastPersistedAckSeq = snapshot.lastAckSeq
    this.persistTargetAckSeq = snapshot.lastAckSeq

    this.dispatch({
      type: 'storage/hydrated',
      deviceId: snapshot.deviceId,
      lastAckSeq: snapshot.lastAckSeq
    })

    return this.state
  }

  getState(): AgentRemoteState {
    return this.state
  }

  subscribe(listener: AgentRemoteStateListener): () => void {
    this.listeners.add(listener)
    listener(this.state)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async connect(options: AgentRemoteConnectOptions): Promise<void> {
    this.connectOptions = options

    if (!this.state.connection.deviceId) {
      await this.hydrate()
    }

    this.client?.disconnect(1000, 'replaced')
    this.client = new AgentRemoteWebSocketClient(
      {
        onConnecting: () => {
          this.dispatch({
            type: 'connection/status',
            status: this.state.connection.status === 'connected' ? 'reconnecting' : 'connecting',
            url: options.url
          })
        },
        onConnected: () => {
          this.dispatch({
            type: 'connection/status',
            status: 'connected',
            url: options.url
          })

          void this.flushPendingAckCommit()
          void this.recoverSessionsNeedingSnapshot('connected')
        },
        onDisconnected: () => {
          this.clearAckCommitTimer()
          this.dispatch({
            type: 'connection/status',
            status: 'disconnected'
          })
        },
        onEnvelope: envelope => {
          this.handleIncomingEnvelope(envelope)
        },
        onError: error => {
          logger.warn('Agent remote websocket error', error)
          this.dispatch({
            type: 'connection/status',
            status: 'error',
            error: error.message
          })
        },
        onReconnectScheduled: (delayMs, attempt) => {
          logger.info('Scheduled agent remote reconnect', { attempt, delayMs })
          this.dispatch({
            type: 'connection/status',
            status: 'reconnecting'
          })
        }
      },
      () => ({
        deviceId: this.state.connection.deviceId,
        lastAckSeq: this.getCurrentAckSeq()
      })
    )

    await this.client.connect(options)
  }

  disconnect(code?: number, reason?: string): void {
    this.clearAckCommitTimer()
    this.client?.disconnect(code, reason)
    this.client = null
    this.dispatch({
      type: 'connection/status',
      status: 'disconnected'
    })
  }

  async reconnect(): Promise<void> {
    if (!this.connectOptions) {
      throw new Error('Agent remote service has not been configured')
    }

    await this.connect(this.connectOptions)
  }

  async createSession(input: AgentRemoteCreateSessionInput): Promise<string> {
    const requestId = uuid()
    const payload = agentRemoteSessionCreatePayloadSchema.parse(input)

    this.dispatch({
      type: 'request/sent',
      request: createPendingRequest(requestId, 'session.create')
    })

    this.sendEnvelope({
      type: 'cmd',
      event: 'session.create',
      requestId,
      ts: Date.now(),
      payload
    })

    return requestId
  }

  async sendMessage(input: AgentRemoteSendMessageInput): Promise<string> {
    const requestId = input.requestId ?? uuid()
    const payload = agentRemoteMessageSendPayloadSchema.parse(input)

    this.dispatch({
      type: 'request/sent',
      request: createPendingRequest(requestId, 'message.send', payload.sessionId)
    })

    this.sendEnvelope({
      type: 'cmd',
      event: 'message.send',
      requestId,
      ts: Date.now(),
      payload
    })

    return requestId
  }

  async requestSnapshot(input: AgentRemoteSnapshotRequestInput): Promise<string> {
    const requestId = input.requestId ?? uuid()
    const payload = agentRemoteSessionSnapshotRequestPayloadSchema.parse(input)

    this.dispatch({
      type: 'request/sent',
      request: createPendingRequest(requestId, 'session.snapshot', payload.sessionId)
    })

    this.sendEnvelope({
      type: 'cmd',
      event: 'session.snapshot',
      requestId,
      ts: Date.now(),
      payload
    })

    return requestId
  }

  async persistAck(seq: number): Promise<void> {
    this.lastConsumedSeq = Math.max(this.lastConsumedSeq, seq)
    this.persistTargetAckSeq = Math.max(this.persistTargetAckSeq, seq)
    await this.flushAckPersistence()
  }

  async acknowledge(seq = this.getCurrentAckSeq()): Promise<void> {
    const deviceId = this.state.connection.deviceId

    if (!deviceId) {
      throw new Error('Agent remote device id is not available')
    }

    const payload = agentRemoteAckPayloadSchema.parse({
      deviceId,
      ackSeq: seq
    })

    this.sendEnvelope({
      type: 'ack',
      event: AGENT_REMOTE_ACK_EVENT,
      ts: Date.now(),
      payload
    })
  }

  handleIncomingEnvelope(envelope: AgentRemoteEnvelope): void {
    try {
      if (this.isSequencedInboundEnvelope(envelope)) {
        this.handleSequencedEnvelope(envelope)
        return
      }

      this.applyIncomingEnvelope(envelope)
    } catch (error) {
      logger.warn('Failed to consume agent remote envelope', error as Error)
    }
  }

  private isSequencedInboundEnvelope(envelope: AgentRemoteEnvelope): envelope is SequencedInboundEnvelope {
    return (envelope.type === 'evt' || envelope.type === 'err') && typeof envelope.seq === 'number'
  }

  private handleSequencedEnvelope(envelope: SequencedInboundEnvelope): void {
    const currentAckSeq = this.getCurrentAckSeq()

    if (envelope.seq <= currentAckSeq) {
      logger.info('Ignoring duplicate agent remote envelope', {
        currentAckSeq,
        event: envelope.event,
        seq: envelope.seq,
        type: envelope.type
      })
      this.scheduleAckCommit(currentAckSeq)
      return
    }

    if (envelope.seq > currentAckSeq + 1) {
      logger.warn('Detected agent remote sequence gap', {
        currentAckSeq,
        event: envelope.event,
        seq: envelope.seq,
        type: envelope.type
      })
      void this.handleSequenceGap(envelope, currentAckSeq)
      return
    }

    this.applyIncomingEnvelope(envelope)
    this.markSeqConsumed(envelope.seq)
  }

  private async handleSequenceGap(envelope: SequencedInboundEnvelope, currentAckSeq: number): Promise<void> {
    const sessionId = this.getEnvelopeSessionId(envelope)

    if (sessionId) {
      this.dispatch({
        type: 'server/envelope',
        envelope: {
          type: 'err',
          event: 'error',
          ts: Date.now(),
          payload: {
            code: 'ACK_GAP_DETECTED',
            message: `Expected seq ${currentAckSeq + 1} but received ${envelope.seq}`,
            retryable: true,
            sessionId
          } satisfies AgentRemoteProtocolErrorPayload
        }
      })

      await this.requestSnapshotRecovery(sessionId, 'sequence_gap', undefined, true)
    } else {
      await this.recoverSessionsNeedingSnapshot('sequence_gap')
    }

    this.scheduleAckCommit(currentAckSeq)
  }

  private applyIncomingEnvelope(envelope: AgentRemoteEnvelope): void {
    this.dispatch({
      type: 'server/envelope',
      envelope
    })

    void this.orchestrateRecoveryAfterEnvelope(envelope)
  }

  private async orchestrateRecoveryAfterEnvelope(envelope: AgentRemoteEnvelope): Promise<void> {
    if (envelope.type === 'err') {
      const payload = agentRemoteProtocolErrorPayloadSchema.parse(envelope.payload)

      if (
        payload.sessionId &&
        (payload.code === 'SNAPSHOT_REQUIRED' || payload.code === 'ACK_GAP_DETECTED')
      ) {
        await this.requestSnapshotRecovery(payload.sessionId, payload.code, undefined, true)
      }

      return
    }

    if (envelope.type !== 'evt') {
      return
    }

    switch (envelope.event) {
      case 'session.pushed': {
        const payload = agentRemoteSessionPushedPayloadSchema.parse(envelope.payload)
        await this.requestSnapshotRecovery(payload.sessionId, 'session.pushed', payload.version)
        return
      }

      case 'session.version.bump': {
        const payload = agentRemoteSessionVersionBumpPayloadSchema.parse(envelope.payload)
        const session = this.state.sessions[payload.sessionId]
        const snapshotVersion = session?.snapshotVersion ?? -1

        if (snapshotVersion < payload.version) {
          await this.requestSnapshotRecovery(payload.sessionId, 'version.bump', payload.version)
        }

        return
      }

      case 'session.snapshot': {
        const payload = agentRemoteSessionSnapshotPayloadSchema.parse(envelope.payload)
        this.snapshotRecoveryRequests.delete(payload.sessionId)
        return
      }
    }
  }

  private markSeqConsumed(seq: number): void {
    this.lastConsumedSeq = Math.max(this.lastConsumedSeq, seq)
    this.persistTargetAckSeq = Math.max(this.persistTargetAckSeq, seq)
    this.scheduleAckPersistence()
    this.scheduleAckCommit(seq)
  }

  private scheduleAckPersistence(): void {
    if (this.persistAckPromise) {
      return
    }

    this.persistAckPromise = this.flushAckPersistence().finally(() => {
      this.persistAckPromise = null

      if (this.persistTargetAckSeq > this.lastPersistedAckSeq) {
        this.scheduleAckPersistence()
      }
    })
  }

  private async flushAckPersistence(): Promise<void> {
    const targetSeq = this.persistTargetAckSeq

    if (targetSeq <= this.lastPersistedAckSeq) {
      return
    }

    await this.storage.setLastAckSeq(targetSeq)
    this.lastPersistedAckSeq = targetSeq
    this.dispatch({
      type: 'ack/persisted',
      seq: targetSeq
    })
  }

  private scheduleAckCommit(seq: number): void {
    this.pendingAckCommitSeq = Math.max(this.pendingAckCommitSeq, seq)

    if (this.ackCommitTimer) {
      return
    }

    this.ackCommitTimer = setTimeout(() => {
      this.ackCommitTimer = null
      void this.flushPendingAckCommit()
    }, ACK_COMMIT_THROTTLE_MS)
  }

  private async flushPendingAckCommit(): Promise<void> {
    const ackSeq = this.pendingAckCommitSeq

    if (ackSeq <= 0) {
      return
    }

    if (!this.client || !this.client.isConnected()) {
      return
    }

    try {
      await this.acknowledge(ackSeq)
      this.pendingAckCommitSeq = 0
    } catch (error) {
      logger.warn('Failed to flush agent remote ack.commit', error as Error)
      this.scheduleAckCommit(ackSeq)
    }
  }

  private clearAckCommitTimer(): void {
    if (!this.ackCommitTimer) {
      return
    }

    clearTimeout(this.ackCommitTimer)
    this.ackCommitTimer = null
  }

  private async recoverSessionsNeedingSnapshot(reason: string): Promise<void> {
    const sessions = Object.values(this.state.sessions)

    for (const session of sessions) {
      const needsSnapshot =
        session.status === 'awaiting_snapshot' ||
        (session.visibility === 'desktop_pushed' && session.messages.length === 0) ||
        (typeof session.snapshotVersion === 'number' && session.snapshotVersion < session.version)

      if (!needsSnapshot) {
        continue
      }

      await this.requestSnapshotRecovery(session.sessionId, reason, session.version || undefined)
    }
  }

  private async requestSnapshotRecovery(
    sessionId: string,
    reason: string,
    targetVersion?: number,
    force = false
  ): Promise<void> {
    const now = Date.now()
    const existing = this.snapshotRecoveryRequests.get(sessionId)
    const existingVersion = existing?.targetVersion ?? -1

    if (
      !force &&
      existing?.dispatched &&
      now - existing.requestedAt < SNAPSHOT_REQUEST_COOLDOWN_MS &&
      (targetVersion === undefined || existingVersion >= targetVersion)
    ) {
      return
    }

    const nextRequest: SnapshotRecoveryRequest = {
      requestedAt: now,
      targetVersion,
      dispatched: false
    }
    this.snapshotRecoveryRequests.set(sessionId, nextRequest)

    if (!this.client || !this.client.isConnected()) {
      logger.info('Queued snapshot recovery until websocket reconnects', {
        reason,
        sessionId,
        targetVersion
      })
      return
    }

    try {
      await this.requestSnapshot({
        sessionId,
        snapshotVersion: targetVersion
      })
      this.snapshotRecoveryRequests.set(sessionId, {
        ...nextRequest,
        dispatched: true,
        requestedAt: Date.now()
      })
    } catch (error) {
      logger.warn('Failed to request remote session snapshot recovery', error as Error, {
        reason,
        sessionId,
        targetVersion
      })
    }
  }

  private getEnvelopeSessionId(envelope: AgentRemoteEnvelope): string | undefined {
    if (envelope.type === 'err') {
      return agentRemoteProtocolErrorPayloadSchema.safeParse(envelope.payload).data?.sessionId
    }

    if (envelope.type !== 'evt') {
      return undefined
    }

    switch (envelope.event) {
      case 'session.pushed':
        return agentRemoteSessionPushedPayloadSchema.safeParse(envelope.payload).data?.sessionId
      case 'session.version.bump':
        return agentRemoteSessionVersionBumpPayloadSchema.safeParse(envelope.payload).data?.sessionId
      case 'session.snapshot':
        return agentRemoteSessionSnapshotPayloadSchema.safeParse(envelope.payload).data?.sessionId
      default: {
        const payload = envelope.payload as { sessionId?: unknown }
        return typeof payload.sessionId === 'string' ? payload.sessionId : undefined
      }
    }
  }

  private getCurrentAckSeq(): number {
    return Math.max(this.lastConsumedSeq, this.state.connection.lastAckSeq)
  }

  private sendEnvelope(envelope: AgentRemoteEnvelope): void {
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Agent remote service is not connected')
    }

    this.client.send(envelope)
  }

  private dispatch(action: Parameters<typeof reduceAgentRemoteState>[1]): void {
    this.state = reduceAgentRemoteState(this.state, action)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

export const agentRemoteService = new AgentRemoteService()
