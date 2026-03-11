import { z } from 'zod'

export const agentRemoteOriginSchema = z.enum(['ios', 'desktop'])
export type AgentRemoteOrigin = z.infer<typeof agentRemoteOriginSchema>

export const agentRemoteRunPushPolicySchema = z.enum(['full', 'meta_only'])
export type AgentRemoteRunPushPolicy = z.infer<typeof agentRemoteRunPushPolicySchema>

export const agentRemoteConnectionStatusSchema = z.enum([
  'idle',
  'connecting',
  'connected',
  'reconnecting',
  'disconnected',
  'error'
])
export type AgentRemoteConnectionStatus = z.infer<typeof agentRemoteConnectionStatusSchema>

export const agentRemoteBridgePresenceSchema = z.enum(['unknown', 'online', 'offline'])
export type AgentRemoteBridgePresence = z.infer<typeof agentRemoteBridgePresenceSchema>

export const agentRemoteSessionVisibilitySchema = z.enum(['ios_created', 'desktop_pushed'])
export type AgentRemoteSessionVisibility = z.infer<typeof agentRemoteSessionVisibilitySchema>

export const agentRemoteSessionStatusSchema = z.enum([
  'idle',
  'ready',
  'streaming',
  'awaiting_snapshot',
  'error'
])
export type AgentRemoteSessionStatus = z.infer<typeof agentRemoteSessionStatusSchema>

export const agentRemoteMessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])
export type AgentRemoteMessageRole = z.infer<typeof agentRemoteMessageRoleSchema>

export const agentRemoteMessageStatusSchema = z.enum(['streaming', 'done', 'error', 'cancelled'])
export type AgentRemoteMessageStatus = z.infer<typeof agentRemoteMessageStatusSchema>

export const agentRemoteEnvelopeTypeSchema = z.enum(['cmd', 'evt', 'ack', 'err'])
export type AgentRemoteEnvelopeType = z.infer<typeof agentRemoteEnvelopeTypeSchema>

export const AGENT_REMOTE_COMMAND_EVENTS = [
  'agent.list',
  'session.list',
  'session.create',
  'message.send',
  'message.cancel',
  'session.snapshot',
  'run.register'
] as const
export type AgentRemoteCommandEvent = (typeof AGENT_REMOTE_COMMAND_EVENTS)[number]

export const AGENT_REMOTE_SERVER_EVENTS = [
  'session.created',
  'session.pushed',
  'message.delta',
  'message.done',
  'message.error',
  'session.version.bump',
  'session.snapshot',
  'bridge.online',
  'bridge.offline'
] as const
export type AgentRemoteServerEvent = (typeof AGENT_REMOTE_SERVER_EVENTS)[number]

export const AGENT_REMOTE_ACK_EVENT = 'ack.commit' as const
export type AgentRemoteAckEvent = typeof AGENT_REMOTE_ACK_EVENT

export const agentRemoteErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'BRIDGE_OFFLINE',
  'SNAPSHOT_REQUIRED',
  'ACK_GAP_DETECTED',
  'IDEMPOTENCY_KEY_REUSED',
  'COMMAND_RECOVERY_REQUIRED'
])
export type AgentRemoteErrorCode = z.infer<typeof agentRemoteErrorCodeSchema>

export const agentRemoteEnvelopeSchema = z.object({
  type: agentRemoteEnvelopeTypeSchema,
  event: z.string(),
  runId: z.string().optional(),
  requestId: z.string().optional(),
  seq: z.number().int().nonnegative().optional(),
  ts: z.number().int().optional(),
  payload: z.unknown().default({})
})
export type AgentRemoteEnvelope = z.infer<typeof agentRemoteEnvelopeSchema>

export const agentRemoteAckPayloadSchema = z.object({
  deviceId: z.string(),
  ackSeq: z.number().int().nonnegative()
})
export type AgentRemoteAckPayload = z.infer<typeof agentRemoteAckPayloadSchema>

export const agentRemoteProtocolErrorPayloadSchema = z.object({
  code: agentRemoteErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean().default(false),
  sessionId: z.string().optional()
})
export type AgentRemoteProtocolErrorPayload = z.infer<typeof agentRemoteProtocolErrorPayloadSchema>

export const agentRemoteSessionCreatedPayloadSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  title: z.string().optional(),
  version: z.number().int().nonnegative().default(0),
  updatedAt: z.number().int().optional(),
  origin: agentRemoteOriginSchema.optional(),
  runPushPolicy: agentRemoteRunPushPolicySchema.optional()
})
export type AgentRemoteSessionCreatedPayload = z.infer<typeof agentRemoteSessionCreatedPayloadSchema>

export const agentRemoteSessionPushedPayloadSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  pushedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative().default(0),
  updatedAt: z.number().int().optional()
})
export type AgentRemoteSessionPushedPayload = z.infer<typeof agentRemoteSessionPushedPayloadSchema>

export const agentRemoteSessionVersionBumpPayloadSchema = z.object({
  sessionId: z.string(),
  version: z.number().int().nonnegative(),
  updatedAt: z.number().int()
})
export type AgentRemoteSessionVersionBumpPayload = z.infer<typeof agentRemoteSessionVersionBumpPayloadSchema>

export const agentRemoteMessageDeltaPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string().default('assistant'),
  role: agentRemoteMessageRoleSchema.default('assistant'),
  delta: z.string().default(''),
  version: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().optional()
})
export type AgentRemoteMessageDeltaPayload = z.infer<typeof agentRemoteMessageDeltaPayloadSchema>

export const agentRemoteMessageDonePayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string().default('assistant'),
  version: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().optional(),
  status: z.enum(['success', 'cancelled']).default('success')
})
export type AgentRemoteMessageDonePayload = z.infer<typeof agentRemoteMessageDonePayloadSchema>

export const agentRemoteMessageErrorPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string().default('assistant'),
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean().default(false),
  version: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().optional()
})
export type AgentRemoteMessageErrorPayload = z.infer<typeof agentRemoteMessageErrorPayloadSchema>

export const agentRemoteSnapshotMessageSchema = z.object({
  messageId: z.string(),
  runId: z.string().optional(),
  role: agentRemoteMessageRoleSchema.default('assistant'),
  content: z.string().default(''),
  status: agentRemoteMessageStatusSchema.default('done'),
  updatedAt: z.number().int().optional()
})
export type AgentRemoteSnapshotMessage = z.infer<typeof agentRemoteSnapshotMessageSchema>

export const agentRemoteSessionSnapshotPayloadSchema = z.object({
  sessionId: z.string(),
  snapshotVersion: z.number().int().nonnegative(),
  snapshotSeqCeiling: z.number().int().nonnegative(),
  updatedAt: z.number().int().optional(),
  messages: z.array(agentRemoteSnapshotMessageSchema).default([])
})
export type AgentRemoteSessionSnapshotPayload = z.infer<typeof agentRemoteSessionSnapshotPayloadSchema>

export const agentRemoteBridgePresencePayloadSchema = z.object({
  deviceId: z.string(),
  status: z.enum(['online', 'offline'])
})
export type AgentRemoteBridgePresencePayload = z.infer<typeof agentRemoteBridgePresencePayloadSchema>

export const agentRemoteSessionCreatePayloadSchema = z.object({
  agentId: z.string(),
  title: z.string().optional(),
  clientSessionId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})
export type AgentRemoteSessionCreatePayload = z.infer<typeof agentRemoteSessionCreatePayloadSchema>

export const agentRemoteMessageSendPayloadSchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  content: z.string(),
  messageId: z.string().optional(),
  origin: agentRemoteOriginSchema,
  runPushPolicy: agentRemoteRunPushPolicySchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})
export type AgentRemoteMessageSendPayload = z.infer<typeof agentRemoteMessageSendPayloadSchema>

export const agentRemoteSessionSnapshotRequestPayloadSchema = z.object({
  sessionId: z.string(),
  snapshotVersion: z.number().int().nonnegative().optional()
})
export type AgentRemoteSessionSnapshotRequestPayload = z.infer<typeof agentRemoteSessionSnapshotRequestPayloadSchema>

export type AgentRemoteIncomingPayload =
  | AgentRemoteBridgePresencePayload
  | AgentRemoteMessageDeltaPayload
  | AgentRemoteMessageDonePayload
  | AgentRemoteMessageErrorPayload
  | AgentRemoteSessionCreatedPayload
  | AgentRemoteSessionPushedPayload
  | AgentRemoteSessionSnapshotPayload
  | AgentRemoteSessionVersionBumpPayload

export interface AgentRemoteMessageState {
  messageId: string
  runId?: string
  role: AgentRemoteMessageRole
  content: string
  status: AgentRemoteMessageStatus
  updatedAt?: number
  error?: Pick<AgentRemoteMessageErrorPayload, 'code' | 'message' | 'retryable'>
}

export interface AgentRemoteSessionErrorState {
  code: string
  message: string
  retryable: boolean
  sessionId?: string
}

export interface AgentRemoteSessionState {
  sessionId: string
  agentId?: string
  title?: string
  origin?: AgentRemoteOrigin
  runPushPolicy?: AgentRemoteRunPushPolicy
  visibility: AgentRemoteSessionVisibility
  status: AgentRemoteSessionStatus
  version: number
  updatedAt?: number
  snapshotVersion?: number
  snapshotSeqCeiling?: number
  lastEventSeq?: number
  activeRunId?: string
  lastError?: AgentRemoteSessionErrorState
  messages: AgentRemoteMessageState[]
}

export interface AgentRemotePendingRequest {
  requestId: string
  event: AgentRemoteCommandEvent
  sessionId?: string
  createdAt: number
  status: 'sent' | 'acknowledged' | 'failed'
}

export interface AgentRemoteConnectionState {
  status: AgentRemoteConnectionStatus
  deviceId?: string
  url?: string
  lastAckSeq: number
  lastConnectedAt?: number
  lastDisconnectedAt?: number
  lastError?: string
}

export interface AgentRemoteState {
  connection: AgentRemoteConnectionState
  bridgePresence: AgentRemoteBridgePresence
  sessions: Record<string, AgentRemoteSessionState>
  sessionOrder: string[]
  pendingRequests: Record<string, AgentRemotePendingRequest>
}

export interface AgentRemoteConnectOptions {
  url: string
  headers?: Record<string, string>
  protocols?: string[]
  sharedKey?: string
  reconnect?: {
    enabled?: boolean
    initialDelayMs?: number
    maxDelayMs?: number
  }
}

export interface AgentRemoteCreateSessionInput extends AgentRemoteSessionCreatePayload {}

export interface AgentRemoteSendMessageInput extends AgentRemoteMessageSendPayload {
  requestId?: string
}

export interface AgentRemoteSnapshotRequestInput extends AgentRemoteSessionSnapshotRequestPayload {
  requestId?: string
}

export const agentRemoteIncomingPayloadParsers: Record<AgentRemoteServerEvent, z.ZodTypeAny> = {
  'bridge.offline': agentRemoteBridgePresencePayloadSchema,
  'bridge.online': agentRemoteBridgePresencePayloadSchema,
  'message.delta': agentRemoteMessageDeltaPayloadSchema,
  'message.done': agentRemoteMessageDonePayloadSchema,
  'message.error': agentRemoteMessageErrorPayloadSchema,
  'session.created': agentRemoteSessionCreatedPayloadSchema,
  'session.pushed': agentRemoteSessionPushedPayloadSchema,
  'session.snapshot': agentRemoteSessionSnapshotPayloadSchema,
  'session.version.bump': agentRemoteSessionVersionBumpPayloadSchema
}

export function isAgentRemoteServerEvent(event: string): event is AgentRemoteServerEvent {
  return (AGENT_REMOTE_SERVER_EVENTS as readonly string[]).includes(event)
}

export function parseAgentRemoteEnvelope(input: unknown): AgentRemoteEnvelope {
  return agentRemoteEnvelopeSchema.parse(input)
}

export function parseAgentRemoteIncomingPayload(
  event: AgentRemoteServerEvent,
  payload: unknown
): AgentRemoteIncomingPayload {
  return agentRemoteIncomingPayloadParsers[event].parse(payload) as AgentRemoteIncomingPayload
}

export function selectPendingSessionMessageSends(
  state: AgentRemoteState,
  sessionId: string
): AgentRemotePendingRequest[] {
  return Object.values(state.pendingRequests).filter(
    request => request.event === 'message.send' && request.sessionId === sessionId && request.status === 'sent'
  )
}
