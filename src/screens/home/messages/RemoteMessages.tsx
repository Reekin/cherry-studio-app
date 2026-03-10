import React, { useEffect, useMemo, useRef } from 'react'
import { Keyboard, Pressable, ScrollView, View } from 'react-native'

import { Text, XStack, YStack } from '@/componentsV2'
import type { AgentRemoteBridgePresence, AgentRemoteMessageState, AgentRemoteSessionState } from '@/types/agentRemote'

import { formatAgentRemoteTimestamp, getAgentRemoteSessionBadges } from '../agentRemote'

interface RemoteMessagesProps {
  session: AgentRemoteSessionState
  bridgePresence: AgentRemoteBridgePresence
}

function RemoteStatusBadge({ label }: { label: string }) {
  return (
    <View className="rounded-full border px-2 py-0.5">
      <Text className="text-[10px] font-medium">{label}</Text>
    </View>
  )
}

function RemoteMessageBubble({ message }: { message: AgentRemoteMessageState }) {
  const isUser = message.role === 'user'
  const roleLabel =
    message.role === 'system' ? 'System' : message.role === 'tool' ? 'Tool' : 'Remote assistant'
  const content =
    message.content ||
    (message.status === 'streaming'
      ? 'Receiving response...'
      : message.status === 'cancelled'
        ? 'Response cancelled.'
        : message.error?.message ?? 'No content yet')

  return (
    <View className={isUser ? 'items-end' : 'items-start'}>
      {!isUser && (
        <Text className="text-foreground-secondary mb-1 px-1 text-xs font-medium">
          {roleLabel}
        </Text>
      )}
      <View className={`max-w-[88%] ${isUser ? 'secondary-container rounded-l-2xl rounded-br-md rounded-tr-2xl' : 'rounded-2xl border'} px-4 py-3`}>
        <Text className="text-sm leading-6">{content}</Text>
      </View>
      <XStack className={`mt-1 items-center gap-2 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <Text className="text-foreground-secondary text-[11px]">{formatAgentRemoteTimestamp(message.updatedAt)}</Text>
        {message.status !== 'done' && <RemoteStatusBadge label={message.status} />}
        {message.error?.code && <RemoteStatusBadge label={message.error.code} />}
      </XStack>
    </View>
  )
}

export default function RemoteMessages({ session, bridgePresence }: RemoteMessagesProps) {
  const scrollViewRef = useRef<ScrollView>(null)
  const badges = useMemo(() => getAgentRemoteSessionBadges(session, bridgePresence), [bridgePresence, session])
  const lastMessageKey = useMemo(() => {
    const lastMessage = session.messages[session.messages.length - 1]
    return lastMessage ? `${lastMessage.messageId}:${lastMessage.content.length}:${lastMessage.status}` : 'empty'
  }, [session.messages])

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    })
  }, [lastMessageKey])

  if (session.messages.length === 0) {
    return (
      <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
        <YStack className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-lg font-semibold">Waiting for remote session messages</Text>
          <Text className="text-foreground-secondary text-center text-sm">
            {badges.length > 0 ? badges.join(' · ') : 'Snapshot recovery is standing by.'}
          </Text>
        </YStack>
      </Pressable>
    )
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag">
      <YStack className="gap-4 px-4">
        {session.messages.map(message => (
          <RemoteMessageBubble key={message.messageId} message={message} />
        ))}
      </YStack>
    </ScrollView>
  )
}
