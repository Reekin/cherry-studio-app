import React from 'react'
import { View } from 'react-native'

import { HeaderBar, XStack, YStack } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import type { AgentRemoteBridgePresence, AgentRemoteSessionState } from '@/types/agentRemote'

import { formatAgentRemoteTimestamp, getAgentRemoteSessionBadges } from './agentRemote'

interface RemoteSessionHeaderProps {
  session: AgentRemoteSessionState
  bridgePresence: AgentRemoteBridgePresence
}

export default function RemoteSessionHeader({ session, bridgePresence }: RemoteSessionHeaderProps) {
  const badges = getAgentRemoteSessionBadges(session, bridgePresence)

  return (
    <View>
      <HeaderBar title="Remote Session" />
      <YStack className="gap-2 px-4 pb-3">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {session.title || session.sessionId}
        </Text>
        {session.title && (
          <Text className="text-foreground-secondary text-xs" numberOfLines={1}>
            {session.sessionId}
          </Text>
        )}
        <XStack className="flex-wrap gap-2">
          {badges.map(badge => (
            <View key={badge} className="rounded-full border px-2.5 py-1">
              <Text className="text-[11px] font-medium">{badge}</Text>
            </View>
          ))}
          <View className="rounded-full border px-2.5 py-1">
            <Text className="text-[11px] font-medium">{`v${session.version}`}</Text>
          </View>
        </XStack>
        <Text className="text-foreground-secondary text-xs">{formatAgentRemoteTimestamp(session.updatedAt)}</Text>
      </YStack>
    </View>
  )
}
