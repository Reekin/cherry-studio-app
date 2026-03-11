import { loggerService } from '@/services/LoggerService'
import type {
  AgentRemoteAgent,
  AgentRemotePermissionMode,
  AgentRemoteProvider,
  AgentRemoteUpsertAgentInput,
  AgentRemoteSessionCreatedPayload
} from '@/types/agentRemote'
import { agentRemoteSessionCreatedPayloadSchema } from '@/types/agentRemote'

import { agentRemoteService } from './AgentRemoteService'

const logger = loggerService.withContext('RemoteAgents')

export const REMOTE_AGENT_PERMISSION_MODE = 'bypassPermissions' as const satisfies AgentRemotePermissionMode

export type RemoteAgentDraft = {
  agentId?: string
  name: string
  prompt: string
  provider: AgentRemoteProvider
  directories: string[]
  permissionMode?: AgentRemotePermissionMode
}

export function normalizeRemoteAgentDirectories(value: string[]): string[] {
  return Array.from(
    new Set(
      value
        .map(directory => directory.trim())
        .filter(directory => directory.length > 0)
    )
  )
}

export function buildRemoteAgentUpsertInput(draft: RemoteAgentDraft): AgentRemoteUpsertAgentInput {
  return {
    agentId: draft.agentId,
    name: draft.name.trim(),
    prompt: draft.prompt,
    provider: draft.provider,
    directories: normalizeRemoteAgentDirectories(draft.directories),
    permissionMode: draft.permissionMode ?? REMOTE_AGENT_PERMISSION_MODE
  }
}

export function formatRemoteAgentSubtitle(agent: AgentRemoteAgent): string {
  const parts = [agent.provider === 'claude-code' ? 'Claude Code' : 'Codex']
  const directoryCount = agent.directories.length

  if (directoryCount > 0) {
    parts.push(`${directoryCount} ${directoryCount === 1 ? 'workspace' : 'workspaces'}`)
  }

  return parts.join(' · ')
}

export async function createRemoteSessionFromAgent(agent: AgentRemoteAgent): Promise<AgentRemoteSessionCreatedPayload> {
  const requestId = await agentRemoteService.createSession({
    agentId: agent.agentId,
    title: agent.name
  })

  logger.info('Requested remote session creation from desktop-authored remote agent', {
    requestId,
    agentId: agent.agentId,
    provider: agent.provider
  })

  const payload = await agentRemoteService.waitForRequestEvent(requestId, 'session.created')
  return agentRemoteSessionCreatedPayloadSchema.parse(payload)
}
