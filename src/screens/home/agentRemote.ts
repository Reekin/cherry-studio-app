import { t } from 'i18next'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import { agentRemoteService, selectAgentRemoteSession, selectAgentRemoteSessions } from '@/services/agentRemote'
import { loggerService } from '@/services/LoggerService'
import type { AgentRemoteBridgePresence, AgentRemoteSessionState, AgentRemoteState } from '@/types/agentRemote'

const logger = loggerService.withContext('AgentRemoteUI')

export const REMOTE_TOPIC_PREFIX = 'remote:'

export function buildRemoteTopicId(sessionId: string): string {
  return `${REMOTE_TOPIC_PREFIX}${sessionId}`
}

export function getRemoteSessionId(topicId?: string | null): string | null {
  if (!topicId?.startsWith(REMOTE_TOPIC_PREFIX)) {
    return null
  }

  const sessionId = topicId.slice(REMOTE_TOPIC_PREFIX.length)
  return sessionId.length > 0 ? sessionId : null
}

export function isRemoteTopicId(topicId?: string | null): boolean {
  return getRemoteSessionId(topicId) !== null
}

function subscribe(callback: () => void): () => void {
  return agentRemoteService.subscribe(() => callback())
}

function getSnapshot(): AgentRemoteState {
  return agentRemoteService.getState()
}

export function useAgentRemoteState(): AgentRemoteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useAgentRemoteSessions(): {
  state: AgentRemoteState
  sessions: AgentRemoteSessionState[]
} {
  const state = useAgentRemoteState()
  const sessions = useMemo(() => selectAgentRemoteSessions(state), [state])

  return {
    state,
    sessions
  }
}

export function useAgentRemoteSession(sessionId?: string | null): {
  state: AgentRemoteState
  session: AgentRemoteSessionState | undefined
} {
  const state = useAgentRemoteState()
  const session = useMemo(() => {
    if (!sessionId) {
      return undefined
    }

    return selectAgentRemoteSession(state, sessionId)
  }, [sessionId, state])

  return {
    state,
    session
  }
}

export function shouldRequestAgentRemoteSnapshot(session?: AgentRemoteSessionState): boolean {
  if (!session) {
    return false
  }

  if (session.status === 'awaiting_snapshot') {
    return true
  }

  if (session.visibility === 'desktop_pushed' && session.messages.length === 0) {
    return true
  }

  if (typeof session.snapshotVersion === 'number' && session.snapshotVersion < session.version) {
    return session.status !== 'streaming'
  }

  return false
}

export function useEnsureAgentRemoteSnapshot(session?: AgentRemoteSessionState): void {
  const lastRequestedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!session || !shouldRequestAgentRemoteSnapshot(session)) {
      return
    }

    const requestKey = [
      session.sessionId,
      session.status,
      session.version,
      session.snapshotVersion ?? 'none',
      session.messages.length
    ].join(':')

    if (lastRequestedKeyRef.current === requestKey) {
      return
    }

    lastRequestedKeyRef.current = requestKey

    agentRemoteService.requestSnapshot({ sessionId: session.sessionId }).catch(error => {
      logger.warn('Failed to request remote session snapshot', error as Error)
    })
  }, [session])
}

export function getAgentRemoteSessionBadges(
  session: AgentRemoteSessionState,
  bridgePresence: AgentRemoteBridgePresence
): string[] {
  const badges = new Set<string>()

  if (session.visibility === 'desktop_pushed') {
    badges.add(t('agent.remote.badge.pushed'))
  }

  if (bridgePresence === 'online') {
    badges.add(t('agent.remote.badge.online'))
  }

  if (bridgePresence === 'offline') {
    badges.add(t('agent.remote.badge.offline'))
  }

  if (session.status === 'awaiting_snapshot') {
    badges.add(t('agent.remote.badge.awaiting_snapshot'))
  }

  if (session.status === 'streaming') {
    badges.add(t('agent.remote.badge.streaming'))
  }

  if (session.status === 'error') {
    badges.add(t('agent.remote.badge.error'))
  }

  return [...badges]
}

export function getAgentRemoteMessageRoleLabel(role: AgentRemoteSessionState['messages'][number]['role']): string {
  if (role === 'system') {
    return t('agent.remote.message.role.system')
  }

  if (role === 'tool') {
    return t('common.tool')
  }

  return t('agent.remote.message.role.assistant')
}

export function getAgentRemoteMessageStatusLabel(
  status: AgentRemoteSessionState['messages'][number]['status']
): string {
  if (status === 'streaming') {
    return t('agent.remote.badge.streaming')
  }

  if (status === 'cancelled') {
    return t('agent.remote.message.status.cancelled')
  }

  if (status === 'error') {
    return t('agent.remote.badge.error')
  }

  return status
}

export function formatAgentRemoteTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return t('agent.remote.updated_at.waiting')
  }

  return new Date(timestamp).toLocaleString()
}
