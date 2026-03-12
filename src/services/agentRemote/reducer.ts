import type {
  AgentRemoteAgent,
  AgentRemoteBlockState,
  AgentRemoteEnvelope,
  AgentRemoteMessageState,
  AgentRemotePendingRequest,
  AgentRemoteProtocolErrorPayload,
  AgentRemoteSemanticError,
  AgentRemoteSessionState,
  AgentRemoteState
} from '@/types/agentRemote'
import {
  AGENT_REMOTE_ACK_EVENT,
  agentRemoteAckPayloadSchema,
  agentRemoteAgentDeletedPayloadSchema,
  agentRemoteAgentListedPayloadSchema,
  agentRemoteAgentUpsertedPayloadSchema,
  agentRemoteBridgePresencePayloadSchema,
  agentRemoteMessageBlockAddedPayloadSchema,
  agentRemoteMessageBlockCompletedPayloadSchema,
  agentRemoteMessageBlockUpdatedPayloadSchema,
  agentRemoteMessageCompletedPayloadSchema,
  agentRemoteMessageFailedPayloadSchema,
  agentRemoteMessageStartedPayloadSchema,
  agentRemoteProtocolErrorPayloadSchema,
  agentRemoteSessionCreatedPayloadSchema,
  agentRemoteSessionPushedPayloadSchema,
  agentRemoteSessionSnapshotPayloadSchema,
  agentRemoteSessionVersionBumpPayloadSchema,
  isAgentRemoteServerEvent
} from '@/types/agentRemote'

const now = () => Date.now()

export type AgentRemoteReducerAction =
  | {
      type: 'connection/status'
      status: AgentRemoteState['connection']['status']
      url?: string
      deviceId?: string
      error?: string
      at?: number
    }
  | {
      type: 'storage/hydrated'
      deviceId: string
      lastAckSeq: number
    }
  | {
      type: 'request/sent'
      request: AgentRemotePendingRequest
    }
  | {
      type: 'ack/persisted'
      seq: number
    }
  | {
      type: 'server/envelope'
      envelope: AgentRemoteEnvelope
    }

export function createInitialAgentRemoteState(): AgentRemoteState {
  return {
    connection: {
      status: 'idle',
      lastAckSeq: 0
    },
    bridgePresence: 'unknown',
    agents: {},
    agentOrder: [],
    sessions: {},
    sessionOrder: [],
    pendingRequests: {}
  }
}

function sortAgentOrder(agents: Record<string, AgentRemoteAgent>): string[] {
  return Object.values(agents)
    .sort((left, right) => {
      const rightTimestamp = right.updatedAt ?? right.createdAt ?? 0
      const leftTimestamp = left.updatedAt ?? left.createdAt ?? 0

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp
      }

      return left.name.localeCompare(right.name)
    })
    .map(agent => agent.agentId)
}

function createEmptySession(
  sessionId: string,
  visibility: AgentRemoteSessionState['visibility'] = 'ios_created'
): AgentRemoteSessionState {
  return {
    sessionId,
    visibility,
    status: 'idle',
    version: 0,
    messageOrder: [],
    messages: {},
    blocks: {}
  }
}

function ensureSession(
  state: AgentRemoteState,
  sessionId: string,
  visibility: AgentRemoteSessionState['visibility'] = 'ios_created'
): AgentRemoteSessionState {
  return state.sessions[sessionId] ?? createEmptySession(sessionId, visibility)
}

function upsertSession(state: AgentRemoteState, session: AgentRemoteSessionState): AgentRemoteState {
  const sessionOrder = state.sessionOrder.includes(session.sessionId)
    ? state.sessionOrder
    : [session.sessionId, ...state.sessionOrder]

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [session.sessionId]: session
    },
    sessionOrder
  }
}

function updatePendingRequestStatus(
  state: AgentRemoteState,
  requestId: string | undefined,
  status: AgentRemotePendingRequest['status']
): AgentRemoteState['pendingRequests'] {
  if (!requestId) {
    return state.pendingRequests
  }

  const request = state.pendingRequests[requestId]

  if (!request) {
    return state.pendingRequests
  }

  return {
    ...state.pendingRequests,
    [requestId]: {
      ...request,
      status
    }
  }
}

function createFallbackMessage(
  messageId: string,
  role: AgentRemoteMessageState['role'] = 'assistant',
  overrides: Partial<Omit<AgentRemoteMessageState, 'messageId' | 'role' | 'status' | 'createdAt' | 'updatedAt' | 'blockIds'>> &
    Partial<Pick<AgentRemoteMessageState, 'status' | 'createdAt' | 'updatedAt' | 'blockIds'>> = {}
): AgentRemoteMessageState {
  const timestamp = overrides.updatedAt ?? overrides.createdAt ?? 0

  return {
    messageId,
    role,
    status: overrides.status ?? 'streaming',
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    blockIds: overrides.blockIds ?? [],
    runId: overrides.runId,
    metadata: overrides.metadata,
    error: overrides.error
  }
}

function ensureMessage(
  session: AgentRemoteSessionState,
  messageId: string,
  fallback?: AgentRemoteMessageState
): AgentRemoteMessageState {
  return session.messages[messageId] ?? fallback ?? createFallbackMessage(messageId)
}

function sortBlockIdsForMessage(
  blocks: Record<string, AgentRemoteBlockState>,
  messageId: string,
  existingIds: string[] = []
): string[] {
  const ids = new Set(existingIds)

  Object.values(blocks).forEach(block => {
    if (block.messageId === messageId) {
      ids.add(block.blockId)
    }
  })

  return [...ids]
    .filter(blockId => blocks[blockId]?.messageId === messageId)
    .sort((leftId, rightId) => {
      const left = blocks[leftId]
      const right = blocks[rightId]

      if (!left && !right) {
        return leftId.localeCompare(rightId)
      }

      if (!left) {
        return 1
      }

      if (!right) {
        return -1
      }

      if (left.order !== right.order) {
        return left.order - right.order
      }

      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt
      }

      return left.blockId.localeCompare(right.blockId)
    })
}

function upsertMessageState(
  session: AgentRemoteSessionState,
  nextMessage: AgentRemoteMessageState,
  options?: {
    appendToOrder?: boolean
  }
): AgentRemoteSessionState {
  const appendToOrder = options?.appendToOrder ?? true
  const messageOrder =
    appendToOrder && !session.messageOrder.includes(nextMessage.messageId)
      ? [...session.messageOrder, nextMessage.messageId]
      : session.messageOrder

  return {
    ...session,
    messages: {
      ...session.messages,
      [nextMessage.messageId]: nextMessage
    },
    messageOrder
  }
}

function upsertBlockState(session: AgentRemoteSessionState, nextBlock: AgentRemoteBlockState): AgentRemoteSessionState {
  const blocks = {
    ...session.blocks,
    [nextBlock.blockId]: nextBlock
  }
  const existingMessage = ensureMessage(
    session,
    nextBlock.messageId,
    createFallbackMessage(nextBlock.messageId, 'assistant', {
      createdAt: nextBlock.createdAt,
      updatedAt: nextBlock.updatedAt
    })
  )
  const nextMessage: AgentRemoteMessageState = {
    ...existingMessage,
    updatedAt: Math.max(existingMessage.updatedAt, nextBlock.updatedAt),
    blockIds: sortBlockIdsForMessage(blocks, nextBlock.messageId, existingMessage.blockIds)
  }

  return {
    ...session,
    blocks,
    messages: {
      ...session.messages,
      [nextMessage.messageId]: nextMessage
    },
    messageOrder: session.messageOrder.includes(nextMessage.messageId)
      ? session.messageOrder
      : [...session.messageOrder, nextMessage.messageId]
  }
}

function mapMessageError(error: AgentRemoteSemanticError): AgentRemoteSessionState['lastError'] {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable
  }
}

function hasStreamingActivity(session: AgentRemoteSessionState): boolean {
  return (
    Object.values(session.messages).some(message => message.status === 'pending' || message.status === 'streaming') ||
    Object.values(session.blocks).some(block => block.status === 'pending' || block.status === 'streaming')
  )
}

function reduceServerEvent(state: AgentRemoteState, envelope: AgentRemoteEnvelope): AgentRemoteState {
  if (!isAgentRemoteServerEvent(envelope.event)) {
    return state
  }

  const baseState: AgentRemoteState = {
    ...state,
    pendingRequests: updatePendingRequestStatus(state, envelope.requestId, 'acknowledged')
  }

  switch (envelope.event) {
    case 'agent.listed': {
      const payload = agentRemoteAgentListedPayloadSchema.parse(envelope.payload)
      const agents = payload.agents.reduce<Record<string, AgentRemoteAgent>>((result, agent) => {
        result[agent.agentId] = agent
        return result
      }, {})

      return {
        ...baseState,
        agents,
        agentOrder: sortAgentOrder(agents)
      }
    }

    case 'agent.upserted': {
      const payload = agentRemoteAgentUpsertedPayloadSchema.parse(envelope.payload)
      const agents = {
        ...baseState.agents,
        [payload.agent.agentId]: payload.agent
      }

      return {
        ...baseState,
        agents,
        agentOrder: sortAgentOrder(agents)
      }
    }

    case 'agent.deleted': {
      const payload = agentRemoteAgentDeletedPayloadSchema.parse(envelope.payload)

      if (!baseState.agents[payload.agentId]) {
        return baseState
      }

      const agents = { ...baseState.agents }
      delete agents[payload.agentId]

      return {
        ...baseState,
        agents,
        agentOrder: sortAgentOrder(agents)
      }
    }

    case 'session.created': {
      const payload = agentRemoteSessionCreatedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId, 'ios_created')

      return upsertSession(baseState, {
        ...session,
        agentId: payload.agentId,
        title: payload.title ?? session.title,
        origin: payload.origin ?? session.origin,
        runPushPolicy: payload.runPushPolicy ?? session.runPushPolicy,
        status: hasStreamingActivity(session) ? 'streaming' : 'ready',
        version: payload.version,
        updatedAt: payload.updatedAt ?? session.updatedAt,
        lastEventSeq: envelope.seq ?? session.lastEventSeq
      })
    }

    case 'session.pushed': {
      const payload = agentRemoteSessionPushedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId, 'desktop_pushed')

      return upsertSession(baseState, {
        ...session,
        agentId: payload.agentId,
        visibility: 'desktop_pushed',
        status: session.messageOrder.length > 0 ? 'ready' : 'awaiting_snapshot',
        version: payload.version,
        updatedAt: payload.updatedAt ?? payload.pushedAt,
        lastEventSeq: envelope.seq ?? session.lastEventSeq
      })
    }

    case 'session.version.bump': {
      const payload = agentRemoteSessionVersionBumpPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const nextVersion = Math.max(session.version, payload.version)
      const isSnapshotLagging =
        session.snapshotVersion === undefined || session.snapshotVersion < payload.version

      return upsertSession(baseState, {
        ...session,
        version: nextVersion,
        updatedAt: payload.updatedAt,
        status: isSnapshotLagging && session.status !== 'streaming' ? 'awaiting_snapshot' : session.status,
        lastEventSeq: envelope.seq ?? session.lastEventSeq
      })
    }

    case 'session.snapshot': {
      const payload = agentRemoteSessionSnapshotPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)

      if (payload.snapshotVersion < session.version) {
        return baseState
      }

      const messageIds =
        payload.messageOrder.length > 0 ? payload.messageOrder : payload.messages.map(message => message.messageId)
      const messages = payload.messages.reduce<Record<string, AgentRemoteMessageState>>((result, message) => {
        result[message.messageId] = {
          messageId: message.messageId,
          runId: message.runId,
          role: message.role,
          status: message.status,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          metadata: message.metadata,
          error: message.error,
          blockIds: []
        }
        return result
      }, {})
      const blocks = payload.blocks.reduce<Record<string, AgentRemoteBlockState>>((result, block) => {
        if (!messages[block.messageId]) {
          return result
        }

        result[block.blockId] = block
        return result
      }, {})

      Object.values(messages).forEach(message => {
        const snapshotMessage = payload.messages.find(item => item.messageId === message.messageId)
        message.blockIds = sortBlockIdsForMessage(blocks, message.messageId, snapshotMessage?.blockIds ?? [])
      })

      const filteredMessageOrder = messageIds.filter(messageId => messages[messageId])

      return upsertSession(baseState, {
        ...session,
        status: Object.values(messages).some(message => message.status === 'error') ? 'error' : 'ready',
        version: payload.snapshotVersion,
        snapshotVersion: payload.snapshotVersion,
        snapshotSeqCeiling: payload.snapshotSeqCeiling,
        updatedAt: payload.updatedAt ?? session.updatedAt,
        lastError: undefined,
        lastEventSeq: Math.max(envelope.seq ?? 0, payload.snapshotSeqCeiling, session.lastEventSeq ?? 0),
        activeRunId: undefined,
        messageOrder: filteredMessageOrder,
        messages,
        blocks
      })
    }

    case 'message.started': {
      const payload = agentRemoteMessageStartedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingMessage = session.messages[payload.messageId]
      const nextMessage: AgentRemoteMessageState = {
        messageId: payload.messageId,
        runId: payload.runId ?? existingMessage?.runId,
        role: payload.role,
        status: payload.status,
        createdAt: existingMessage?.createdAt ?? payload.createdAt,
        updatedAt: payload.updatedAt,
        blockIds: existingMessage?.blockIds ?? [],
        metadata: payload.metadata ?? existingMessage?.metadata,
        error: undefined
      }

      const nextSession = upsertMessageState(
        {
          ...session,
          activeRunId: payload.runId ?? session.activeRunId,
          status: 'streaming',
          updatedAt: payload.updatedAt,
          lastError: undefined,
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        nextMessage
      )

      return upsertSession(baseState, nextSession)
    }

    case 'message.block.added': {
      const payload = agentRemoteMessageBlockAddedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const nextSession = upsertBlockState(
        {
          ...session,
          activeRunId: payload.runId ?? session.activeRunId,
          status: 'streaming',
          updatedAt: payload.block.updatedAt,
          lastError: undefined,
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        payload.block
      )

      return upsertSession(baseState, nextSession)
    }

    case 'message.block.updated': {
      const payload = agentRemoteMessageBlockUpdatedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingBlock = session.blocks[payload.blockId]

      if (!existingBlock) {
        return baseState
      }

      const nextSession = upsertBlockState(
        {
          ...session,
          activeRunId: payload.runId ?? session.activeRunId,
          status: 'streaming',
          updatedAt: payload.updatedAt,
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        {
          ...existingBlock,
          ...payload.patch,
          updatedAt: payload.updatedAt
        }
      )

      return upsertSession(baseState, nextSession)
    }

    case 'message.block.completed': {
      const payload = agentRemoteMessageBlockCompletedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingBlock = session.blocks[payload.blockId]

      if (!existingBlock) {
        return baseState
      }

      const nextSession = upsertBlockState(
        {
          ...session,
          activeRunId: payload.runId ?? session.activeRunId,
          updatedAt: payload.updatedAt,
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        {
          ...existingBlock,
          status: payload.status,
          updatedAt: payload.updatedAt
        }
      )

      return upsertSession(baseState, nextSession)
    }

    case 'message.completed': {
      const payload = agentRemoteMessageCompletedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingMessage = ensureMessage(session, payload.messageId)
      const nextMessage: AgentRemoteMessageState = {
        ...existingMessage,
        runId: payload.runId ?? existingMessage.runId,
        status: payload.status,
        updatedAt: payload.updatedAt,
        error: undefined
      }
      const nextSession = upsertMessageState(
        {
          ...session,
          activeRunId: payload.runId && session.activeRunId === payload.runId ? undefined : session.activeRunId,
          status: hasStreamingActivity(session) ? 'streaming' : 'ready',
          version: payload.version ?? session.version,
          updatedAt: payload.updatedAt,
          lastError: undefined,
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        nextMessage,
        { appendToOrder: !session.messageOrder.includes(payload.messageId) }
      )

      return upsertSession(baseState, {
        ...nextSession,
        status: hasStreamingActivity(nextSession) ? 'streaming' : 'ready'
      })
    }

    case 'message.failed': {
      const payload = agentRemoteMessageFailedPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const errorState: AgentRemoteSemanticError = {
        code: payload.code,
        message: payload.message,
        retryable: payload.retryable
      }
      const existingMessage = ensureMessage(session, payload.messageId)
      const nextMessage: AgentRemoteMessageState = {
        ...existingMessage,
        runId: payload.runId ?? existingMessage.runId,
        status: 'error',
        updatedAt: payload.updatedAt,
        error: errorState
      }
      const nextSession = upsertMessageState(
        {
          ...session,
          activeRunId: payload.runId && session.activeRunId === payload.runId ? undefined : session.activeRunId,
          status: 'error',
          version: payload.version ?? session.version,
          updatedAt: payload.updatedAt,
          lastError: mapMessageError(errorState),
          lastEventSeq: envelope.seq ?? session.lastEventSeq
        },
        nextMessage
      )

      return upsertSession(baseState, nextSession)
    }

    case 'bridge.online':
    case 'bridge.offline': {
      const payload = agentRemoteBridgePresencePayloadSchema.parse(envelope.payload)

      return {
        ...baseState,
        bridgePresence: payload.status
      }
    }
  }
}

function reduceErrorEnvelope(state: AgentRemoteState, envelope: AgentRemoteEnvelope): AgentRemoteState {
  const errorPayload = agentRemoteProtocolErrorPayloadSchema.parse(envelope.payload)
  const sessionId = errorPayload.sessionId
  const pendingRequests = updatePendingRequestStatus(state, envelope.requestId, 'failed')

  if (!sessionId) {
    return {
      ...state,
      pendingRequests,
      connection: {
        ...state.connection,
        lastError: errorPayload.message,
        status: state.connection.status === 'connected' ? 'connected' : 'error'
      }
    }
  }

  const session = ensureSession(state, sessionId)
  const nextStatus =
    errorPayload.code === 'SNAPSHOT_REQUIRED' ||
    errorPayload.code === 'ACK_GAP_DETECTED' ||
    errorPayload.code === 'COMMAND_RECOVERY_REQUIRED'
      ? 'awaiting_snapshot'
      : 'error'

  return upsertSession(
    {
      ...state,
      pendingRequests
    },
    {
      ...session,
      status: nextStatus,
      lastError: errorPayload,
      lastEventSeq: envelope.seq ?? session.lastEventSeq
    }
  )
}

function reduceAckEnvelope(state: AgentRemoteState, envelope: AgentRemoteEnvelope): AgentRemoteState {
  const ackSeq =
    envelope.event === AGENT_REMOTE_ACK_EVENT
      ? agentRemoteAckPayloadSchema.parse(envelope.payload).ackSeq
      : state.connection.lastAckSeq

  return {
    ...state,
    connection: {
      ...state.connection,
      lastAckSeq: Math.max(state.connection.lastAckSeq, ackSeq)
    },
    pendingRequests: {
      ...updatePendingRequestStatus(state, envelope.requestId, 'acknowledged')
    }
  }
}

export function reduceAgentRemoteState(state: AgentRemoteState, action: AgentRemoteReducerAction): AgentRemoteState {
  switch (action.type) {
    case 'storage/hydrated':
      return {
        ...state,
        connection: {
          ...state.connection,
          deviceId: action.deviceId,
          lastAckSeq: action.lastAckSeq
        }
      }

    case 'connection/status':
      return {
        ...state,
        connection: {
          ...state.connection,
          status: action.status,
          url: action.url ?? state.connection.url,
          deviceId: action.deviceId ?? state.connection.deviceId,
          lastConnectedAt:
            action.status === 'connected' ? (action.at ?? now()) : state.connection.lastConnectedAt,
          lastDisconnectedAt:
            action.status === 'disconnected' || action.status === 'error'
              ? (action.at ?? now())
              : state.connection.lastDisconnectedAt,
          lastError: action.error ?? state.connection.lastError
        }
      }

    case 'request/sent':
      return {
        ...state,
        pendingRequests: {
          ...state.pendingRequests,
          [action.request.requestId]: action.request
        }
      }

    case 'ack/persisted':
      return {
        ...state,
        connection: {
          ...state.connection,
          lastAckSeq: Math.max(state.connection.lastAckSeq, action.seq)
        }
      }

    case 'server/envelope':
      if (action.envelope.type === 'evt') {
        return reduceServerEvent(state, action.envelope)
      }

      if (action.envelope.type === 'ack') {
        return reduceAckEnvelope(state, action.envelope)
      }

      if (action.envelope.type === 'err') {
        return reduceErrorEnvelope(state, action.envelope)
      }

      return state
  }
}

export function selectAgentRemoteSession(
  state: AgentRemoteState,
  sessionId: string
): AgentRemoteSessionState | undefined {
  return state.sessions[sessionId]
}

export function selectAgentRemoteSessions(state: AgentRemoteState): AgentRemoteSessionState[] {
  return state.sessionOrder.map(sessionId => state.sessions[sessionId]).filter(Boolean)
}

export function selectAgentRemoteAgents(state: AgentRemoteState): AgentRemoteAgent[] {
  return state.agentOrder.map(agentId => state.agents[agentId]).filter(Boolean)
}

export function selectAgentRemoteAgent(state: AgentRemoteState, agentId: string): AgentRemoteAgent | undefined {
  return state.agents[agentId]
}

export function createPendingRequest(
  requestId: string,
  event: AgentRemotePendingRequest['event'],
  sessionId?: string
): AgentRemotePendingRequest {
  return {
    requestId,
    event,
    sessionId,
    createdAt: now(),
    status: 'sent'
  }
}

export function toProtocolError(
  error: Pick<AgentRemoteProtocolErrorPayload, 'code' | 'message' | 'retryable' | 'sessionId'>
): AgentRemoteProtocolErrorPayload {
  return agentRemoteProtocolErrorPayloadSchema.parse(error)
}
