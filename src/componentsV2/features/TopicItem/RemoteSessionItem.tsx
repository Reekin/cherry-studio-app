import React from 'react'
import { Pressable, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { formatAgentRemoteTimestamp, getAgentRemoteSessionBadges } from '@/screens/home/agentRemote'
import type { AgentRemoteBridgePresence, AgentRemoteSessionState } from '@/types/agentRemote'

interface RemoteSessionItemProps {
  session: AgentRemoteSessionState
  bridgePresence: AgentRemoteBridgePresence
  onPress?: (sessionId: string) => void
  isActive?: boolean
}

export function RemoteSessionItem({ session, bridgePresence, onPress, isActive = false }: RemoteSessionItemProps) {
  const badges = getAgentRemoteSessionBadges(session, bridgePresence)

  return (
    <Pressable onPress={() => onPress?.(session.sessionId)} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      <XStack className={`items-center gap-3 rounded-lg px-1 py-1 ${isActive ? 'secondary-container' : 'bg-transparent'}`}>
        <View className="h-[42px] w-[42px] items-center justify-center rounded-2xl border">
          <Text className="text-xs font-bold">RS</Text>
        </View>
        <YStack className="flex-1 gap-1">
          <XStack className="items-center justify-between gap-2">
            <Text className="flex-1 text-base font-bold" numberOfLines={1} ellipsizeMode="middle">
              {session.sessionId}
            </Text>
            <Text className="text-foreground-secondary shrink-0 text-xs">{`v${session.version}`}</Text>
          </XStack>
          <XStack className="flex-wrap items-center gap-2">
            {badges.map(badge => (
              <View key={badge} className="rounded-full border px-2 py-0.5">
                <Text className="text-[10px] font-medium">{badge}</Text>
              </View>
            ))}
          </XStack>
          <Text className="text-foreground-secondary text-[13px]" numberOfLines={1}>
            {formatAgentRemoteTimestamp(session.updatedAt)}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}
