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

export const agentRemoteMessageStatusSchema = z.enum(['pending', 'processing', 'streaming', 'success', 'error', 'paused'])
export type AgentRemoteMessageStatus = z.infer<typeof agentRemoteMessageStatusSchema>

export const agentRemoteBlockStatusSchema = agentRemoteMessageStatusSchema
export type AgentRemoteBlockStatus = z.infer<typeof agentRemoteBlockStatusSchema>

export const agentRemoteSemanticBlockTypeSchema = z.enum([
  'unknown',
  'main_text',
  'thinking',
  'translation',
  'image',
  'code',
  'tool',
  'file',
  'error',
  'citation',
  'video',
  'compact'
])
export type AgentRemoteSemanticBlockType = z.infer<typeof agentRemoteSemanticBlockTypeSchema>

export const agentRemoteEnvelopeTypeSchema = z.enum(['cmd', 'evt', 'ack', 'err'])
export type AgentRemoteEnvelopeType = z.infer<typeof agentRemoteEnvelopeTypeSchema>

export const AGENT_REMOTE_COMMAND_EVENTS = [
  'agent.list',
  'agent.upsert',
  'agent.delete',
  'session.list',
  'session.create',
  'message.send',
  'message.cancel',
  'session.snapshot',
  'run.register'
] as const
export type AgentRemoteCommandEvent = (typeof AGENT_REMOTE_COMMAND_EVENTS)[number]

export const AGENT_REMOTE_SERVER_EVENTS = [
  'agent.listed',
  'agent.upserted',
  'agent.deleted',
  'session.created',
  'session.pushed',
  'message.started',
  'message.block.added',
  'message.block.updated',
  'message.block.completed',
  'message.completed',
  'message.failed',
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

export const agentRemoteProviderSchema = z.enum(['claude-code', 'codex'])
export type AgentRemoteProvider = z.infer<typeof agentRemoteProviderSchema>

export const agentRemotePermissionModeSchema = z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan'])
export type AgentRemotePermissionMode = z.infer<typeof agentRemotePermissionModeSchema>

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

const agentRemoteMetadataSchema = z.record(z.string(), z.unknown())

export const agentRemoteSemanticErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().default(false)
})
export type AgentRemoteSemanticError = z.infer<typeof agentRemoteSemanticErrorSchema>

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

export const agentRemoteAgentSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().default(''),
  directories: z.array(z.string()).default([]),
  provider: agentRemoteProviderSchema,
  permissionMode: agentRemotePermissionModeSchema.default('bypassPermissions'),
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional()
})
export type AgentRemoteAgent = z.infer<typeof agentRemoteAgentSchema>

export const agentRemoteAgentListPayloadSchema = z.object({}).passthrough()
export type AgentRemoteAgentListPayload = z.infer<typeof agentRemoteAgentListPayloadSchema>

export const agentRemoteAgentUpsertPayloadSchema = agentRemoteAgentSchema.extend({
  agentId: z.string().min(1).optional()
})
export type AgentRemoteAgentUpsertPayload = z.infer<typeof agentRemoteAgentUpsertPayloadSchema>

export const agentRemoteAgentDeletePayloadSchema = z.object({
  agentId: z.string().min(1)
})
export type AgentRemoteAgentDeletePayload = z.infer<typeof agentRemoteAgentDeletePayloadSchema>

export const agentRemoteAgentListedPayloadSchema = z.object({
  agents: z.array(agentRemoteAgentSchema).default([])
})
export type AgentRemoteAgentListedPayload = z.infer<typeof agentRemoteAgentListedPayloadSchema>

export const agentRemoteAgentUpsertedPayloadSchema = z.object({
  agent: agentRemoteAgentSchema
})
export type AgentRemoteAgentUpsertedPayload = z.infer<typeof agentRemoteAgentUpsertedPayloadSchema>

export const agentRemoteAgentDeletedPayloadSchema = z.object({
  agentId: z.string().min(1)
})
export type AgentRemoteAgentDeletedPayload = z.infer<typeof agentRemoteAgentDeletedPayloadSchema>

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

export const agentRemoteMessageStartedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  role: agentRemoteMessageRoleSchema,
  status: agentRemoteMessageStatusSchema.default('streaming'),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  metadata: agentRemoteMetadataSchema.optional()
})
export type AgentRemoteMessageStartedPayload = z.infer<typeof agentRemoteMessageStartedPayloadSchema>

export const agentRemoteBlockStateSchema = z.object({
  blockId: z.string(),
  messageId: z.string(),
  type: agentRemoteSemanticBlockTypeSchema,
  status: agentRemoteBlockStatusSchema.default('streaming'),
  order: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  content: z.unknown().optional(),
  metadata: agentRemoteMetadataSchema.optional(),
  error: agentRemoteSemanticErrorSchema.optional()
})
export type AgentRemoteBlockState = z.infer<typeof agentRemoteBlockStateSchema>

export const agentRemoteMessageBlockAddedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  block: agentRemoteBlockStateSchema
})
export type AgentRemoteMessageBlockAddedPayload = z.infer<typeof agentRemoteMessageBlockAddedPayloadSchema>

export const agentRemoteBlockPatchSchema = z
  .object({
    type: agentRemoteSemanticBlockTypeSchema.optional(),
    status: agentRemoteBlockStatusSchema.optional(),
    order: z.number().int().nonnegative().optional(),
    content: z.unknown().optional(),
    metadata: agentRemoteMetadataSchema.optional(),
    error: agentRemoteSemanticErrorSchema.optional()
  })
  .refine(patch => Object.keys(patch).length > 0, {
    message: 'Block patch cannot be empty'
  })
export type AgentRemoteBlockPatch = z.infer<typeof agentRemoteBlockPatchSchema>

export const agentRemoteMessageBlockUpdatedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  blockId: z.string(),
  patch: agentRemoteBlockPatchSchema,
  updatedAt: z.number().int()
})
export type AgentRemoteMessageBlockUpdatedPayload = z.infer<typeof agentRemoteMessageBlockUpdatedPayloadSchema>

export const agentRemoteMessageBlockCompletedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  blockId: z.string(),
  status: z.enum(['success', 'error', 'paused']).default('success'),
  updatedAt: z.number().int()
})
export type AgentRemoteMessageBlockCompletedPayload = z.infer<typeof agentRemoteMessageBlockCompletedPayloadSchema>

export const agentRemoteMessageCompletedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  status: z.enum(['success', 'paused']).default('success'),
  version: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int()
})
export type AgentRemoteMessageCompletedPayload = z.infer<typeof agentRemoteMessageCompletedPayloadSchema>

export const agentRemoteMessageFailedPayloadSchema = z.object({
  sessionId: z.string(),
  runId: z.string().optional(),
  messageId: z.string(),
  status: z.literal('error').default('error'),
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean().default(false),
  version: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int()
})
export type AgentRemoteMessageFailedPayload = z.infer<typeof agentRemoteMessageFailedPayloadSchema>

export const agentRemoteSnapshotMessageSchema = z.object({
  messageId: z.string(),
  runId: z.string().optional(),
  role: agentRemoteMessageRoleSchema,
  status: agentRemoteMessageStatusSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  blockIds: z.array(z.string()).default([]),
  metadata: agentRemoteMetadataSchema.optional(),
  error: agentRemoteSemanticErrorSchema.optional()
})
export type AgentRemoteSnapshotMessage = z.infer<typeof agentRemoteSnapshotMessageSchema>

export const agentRemoteSessionSnapshotPayloadSchema = z.object({
  sessionId: z.string(),
  snapshotVersion: z.number().int().nonnegative(),
  snapshotSeqCeiling: z.number().int().nonnegative(),
  updatedAt: z.number().int().optional(),
  messageOrder: z.array(z.string()).default([]),
  messages: z.array(agentRemoteSnapshotMessageSchema).default([]),
  blocks: z.array(agentRemoteBlockStateSchema).default([])
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
  | AgentRemoteAgentDeletedPayload
  | AgentRemoteAgentListedPayload
  | AgentRemoteAgentUpsertedPayload
  | AgentRemoteBridgePresencePayload
  | AgentRemoteMessageStartedPayload
  | AgentRemoteMessageBlockAddedPayload
  | AgentRemoteMessageBlockUpdatedPayload
  | AgentRemoteMessageBlockCompletedPayload
  | AgentRemoteMessageCompletedPayload
  | AgentRemoteMessageFailedPayload
  | AgentRemoteSessionCreatedPayload
  | AgentRemoteSessionPushedPayload
  | AgentRemoteSessionSnapshotPayload
  | AgentRemoteSessionVersionBumpPayload

export interface AgentRemoteMessageState {
  messageId: string
  runId?: string
  role: AgentRemoteMessageRole
  status: AgentRemoteMessageStatus
  createdAt: number
  updatedAt: number
  blockIds: string[]
  metadata?: Record<string, unknown>
  error?: AgentRemoteSemanticError
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
  messageOrder: string[]
  messages: Record<string, AgentRemoteMessageState>
  blocks: Record<string, AgentRemoteBlockState>
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
  agents: Record<string, AgentRemoteAgent>
  agentOrder: string[]
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

export interface AgentRemoteListAgentsInput extends AgentRemoteAgentListPayload {
  requestId?: string
}

export interface AgentRemoteUpsertAgentInput extends AgentRemoteAgentUpsertPayload {
  requestId?: string
}

export interface AgentRemoteDeleteAgentInput extends AgentRemoteAgentDeletePayload {
  requestId?: string
}

export interface AgentRemoteSendMessageInput extends AgentRemoteMessageSendPayload {
  requestId?: string
}

export interface AgentRemoteSnapshotRequestInput extends AgentRemoteSessionSnapshotRequestPayload {
  requestId?: string
}

export const agentRemoteIncomingPayloadParsers: Record<AgentRemoteServerEvent, z.ZodTypeAny> = {
  'agent.deleted': agentRemoteAgentDeletedPayloadSchema,
  'agent.listed': agentRemoteAgentListedPayloadSchema,
  'agent.upserted': agentRemoteAgentUpsertedPayloadSchema,
  'bridge.offline': agentRemoteBridgePresencePayloadSchema,
  'bridge.online': agentRemoteBridgePresencePayloadSchema,
  'message.block.added': agentRemoteMessageBlockAddedPayloadSchema,
  'message.block.completed': agentRemoteMessageBlockCompletedPayloadSchema,
  'message.block.updated': agentRemoteMessageBlockUpdatedPayloadSchema,
  'message.completed': agentRemoteMessageCompletedPayloadSchema,
  'message.failed': agentRemoteMessageFailedPayloadSchema,
  'message.started': agentRemoteMessageStartedPayloadSchema,
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
