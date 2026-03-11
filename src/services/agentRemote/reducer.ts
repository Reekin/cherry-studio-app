import type {
  AgentRemoteAgent,
  AgentRemoteEnvelope,
  AgentRemoteMessageState,
  AgentRemotePendingRequest,
  AgentRemoteProtocolErrorPayload,
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
  agentRemoteMessageDeltaPayloadSchema,
  agentRemoteMessageDonePayloadSchema,
  agentRemoteMessageErrorPayloadSchema,
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

function ensureSession(
  state: AgentRemoteState,
  sessionId: string,
  visibility: AgentRemoteSessionState['visibility'] = 'ios_created'
): AgentRemoteSessionState {
  const existingSession = state.sessions[sessionId]

  if (existingSession) {
    return existingSession
  }

  return {
    sessionId,
    visibility,
    status: 'idle',
    version: 0,
    messages: []
  }
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

function upsertMessage(messages: AgentRemoteMessageState[], nextMessage: AgentRemoteMessageState): AgentRemoteMessageState[] {
  const existingIndex = messages.findIndex(message => message.messageId === nextMessage.messageId)

  if (existingIndex === -1) {
    return [...messages, nextMessage]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    return nextMessage
  })
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
        status: 'ready',
        version: payload.version,
        updatedAt: payload.updatedAt,
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
        status: session.messages.length > 0 ? 'ready' : 'awaiting_snapshot',
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

      return upsertSession(baseState, {
        ...session,
        status: 'ready',
        version: payload.snapshotVersion,
        snapshotVersion: payload.snapshotVersion,
        snapshotSeqCeiling: payload.snapshotSeqCeiling,
        updatedAt: payload.updatedAt,
        lastError: undefined,
        lastEventSeq: Math.max(envelope.seq ?? 0, payload.snapshotSeqCeiling, session.lastEventSeq ?? 0),
        messages: payload.messages.map(message => ({
          content: message.content,
          messageId: message.messageId,
          role: message.role,
          runId: message.runId,
          status: message.status,
          updatedAt: message.updatedAt
        }))
      })
    }

    case 'message.delta': {
      const payload = agentRemoteMessageDeltaPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingMessage =
        session.messages.find(message => message.messageId === payload.messageId) ??
        ({
          content: '',
          messageId: payload.messageId,
          role: payload.role,
          runId: payload.runId,
          status: 'streaming'
        } satisfies AgentRemoteMessageState)

      const nextMessage: AgentRemoteMessageState = {
        ...existingMessage,
        role: payload.role,
        runId: payload.runId ?? existingMessage.runId,
        content: `${existingMessage.content}${payload.delta}`,
        status: 'streaming',
        updatedAt: payload.updatedAt
      }

      return upsertSession(baseState, {
        ...session,
        activeRunId: payload.runId ?? session.activeRunId,
        status: 'streaming',
        version: payload.version ?? session.version,
        updatedAt: payload.updatedAt ?? session.updatedAt,
        lastEventSeq: envelope.seq ?? session.lastEventSeq,
        messages: upsertMessage(session.messages, nextMessage)
      })
    }

    case 'message.done': {
      const payload = agentRemoteMessageDonePayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingMessage =
        session.messages.find(message => message.messageId === payload.messageId) ??
        ({
          content: '',
          messageId: payload.messageId,
          role: 'assistant',
          runId: payload.runId,
          status: 'streaming'
        } satisfies AgentRemoteMessageState)

      const nextMessage: AgentRemoteMessageState = {
        ...existingMessage,
        runId: payload.runId ?? existingMessage.runId,
        status: payload.status === 'cancelled' ? 'cancelled' : 'done',
        updatedAt: payload.updatedAt
      }

      return upsertSession(baseState, {
        ...session,
        activeRunId: payload.runId && session.activeRunId === payload.runId ? undefined : session.activeRunId,
        status: 'ready',
        version: payload.version ?? session.version,
        updatedAt: payload.updatedAt ?? session.updatedAt,
        lastEventSeq: envelope.seq ?? session.lastEventSeq,
        messages: upsertMessage(session.messages, nextMessage)
      })
    }

    case 'message.error': {
      const payload = agentRemoteMessageErrorPayloadSchema.parse(envelope.payload)
      const session = ensureSession(baseState, payload.sessionId)
      const existingMessage =
        session.messages.find(message => message.messageId === payload.messageId) ??
        ({
          content: '',
          messageId: payload.messageId,
          role: 'assistant',
          runId: payload.runId,
          status: 'streaming'
        } satisfies AgentRemoteMessageState)

      const nextMessage: AgentRemoteMessageState = {
        ...existingMessage,
        runId: payload.runId ?? existingMessage.runId,
        status: 'error',
        updatedAt: payload.updatedAt,
        error: {
          code: payload.code,
          message: payload.message,
          retryable: payload.retryable
        }
      }

      return upsertSession(baseState, {
        ...session,
        activeRunId: payload.runId && session.activeRunId === payload.runId ? undefined : session.activeRunId,
        status: 'error',
        version: payload.version ?? session.version,
        updatedAt: payload.updatedAt ?? session.updatedAt,
        lastEventSeq: envelope.seq ?? session.lastEventSeq,
        lastError: {
          code: payload.code,
          message: payload.message,
          retryable: payload.retryable,
          sessionId: payload.sessionId
        },
        messages: upsertMessage(session.messages, nextMessage)
      })
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
