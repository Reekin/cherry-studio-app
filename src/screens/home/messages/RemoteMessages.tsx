import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Pressable, ScrollView, View } from 'react-native'

import { Text, XStack, YStack } from '@/componentsV2'
import { MarkdownRenderer } from '@/screens/home/markdown/MarkdownRenderer'
import ThinkingBlock from '@/screens/home/messages/blocks/ThinkingBlock'
import type {
  AgentRemoteBlockState,
  AgentRemoteBridgePresence,
  AgentRemoteSessionState
} from '@/types/agentRemote'
import type { ThinkingMessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'

import {
  formatAgentRemoteTimestamp,
  getAgentRemoteBlockLabel,
  getAgentRemoteMessageRoleLabel,
  getAgentRemoteMessageStatusLabel,
  getAgentRemoteSessionBadges,
  getRenderableAgentRemoteMessages,
  isAgentRemoteToolLikeBlock
} from '../agentRemote'

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

function stringifyRemoteBlockContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (content && typeof content === 'object') {
    if ('text' in content && typeof content.text === 'string') {
      return content.text
    }

    if ('content' in content && typeof content.content === 'string') {
      return content.content
    }

    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }

  if (content === null || content === undefined) {
    return ''
  }

  return String(content)
}

function mapRemoteBlockStatusToLocal(status: AgentRemoteBlockState['status']): MessageBlockStatus {
  switch (status) {
    case 'pending':
      return MessageBlockStatus.PENDING
    case 'processing':
      return MessageBlockStatus.PROCESSING
    case 'streaming':
      return MessageBlockStatus.STREAMING
    case 'success':
      return MessageBlockStatus.SUCCESS
    case 'paused':
      return MessageBlockStatus.PAUSED
    case 'error':
      return MessageBlockStatus.ERROR
  }
}

function RemoteReasoningBlock({ block }: { block: AgentRemoteBlockState }) {
  const thinkingBlock: ThinkingMessageBlock = {
    id: block.blockId,
    messageId: block.messageId,
    type: MessageBlockType.THINKING,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status: mapRemoteBlockStatusToLocal(block.status),
    content: stringifyRemoteBlockContent(block.content),
    thinking_millsec:
      typeof block.content === 'object' &&
      block.content !== null &&
      'thinking_millsec' in block.content &&
      typeof block.content.thinking_millsec === 'number'
        ? block.content.thinking_millsec
        : 0
  }

  return <ThinkingBlock block={thinkingBlock} />
}

function RemoteTextBlock({ block }: { block: AgentRemoteBlockState }) {
  const content = stringifyRemoteBlockContent(block.content)

  if (!content) {
    return null
  }

  return (
    <View>
      <MarkdownRenderer content={content} />
    </View>
  )
}

function RemoteStructuredBlock({ block }: { block: AgentRemoteBlockState }) {
  const content = stringifyRemoteBlockContent(block.content)

  return (
    <YStack className="gap-2 rounded-2xl border px-4 py-3">
      <XStack className="items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase">{getAgentRemoteBlockLabel(block.type)}</Text>
        {block.status !== 'success' && <RemoteStatusBadge label={getAgentRemoteMessageStatusLabel(block.status)} />}
      </XStack>
      {content ? (
        <Text className="text-foreground-secondary font-mono text-xs leading-5">{content}</Text>
      ) : (
        <Text className="text-foreground-secondary text-xs">{getAgentRemoteMessageStatusLabel(block.status)}</Text>
      )}
    </YStack>
  )
}

function RemoteErrorBlock({ block }: { block: AgentRemoteBlockState }) {
  const fallbackMessage =
    typeof block.content === 'object' &&
    block.content !== null &&
    'message' in block.content &&
    typeof block.content.message === 'string'
      ? block.content.message
      : stringifyRemoteBlockContent(block.content)

  return (
    <YStack className="gap-2 rounded-2xl border border-red-400/40 bg-red-500/5 px-4 py-3">
      <XStack className="items-center justify-between gap-2">
        <Text className="text-sm font-semibold">{getAgentRemoteBlockLabel('error')}</Text>
        <RemoteStatusBadge label={getAgentRemoteMessageStatusLabel('error')} />
      </XStack>
      <Text className="text-sm leading-6">{fallbackMessage || block.error?.message || 'Unknown error'}</Text>
      {block.error?.code && <Text className="text-foreground-secondary text-xs">{block.error.code}</Text>}
    </YStack>
  )
}

function RemoteSemanticBlock({ block }: { block: AgentRemoteBlockState }) {
  if (block.type === 'main_text') {
    return <RemoteTextBlock block={block} />
  }

  if (block.type === 'thinking') {
    return <RemoteReasoningBlock block={block} />
  }

  if (block.type === 'error') {
    return <RemoteErrorBlock block={block} />
  }

  if (isAgentRemoteToolLikeBlock(block.type)) {
    return <RemoteStructuredBlock block={block} />
  }

  return <RemoteStructuredBlock block={block} />
}

function RemoteMessageCard({
  entry
}: {
  entry: ReturnType<typeof getRenderableAgentRemoteMessages>[number]
}) {
  const { t } = useTranslation()
  const { message, blocks } = entry
  const isUser = message.role === 'user'
  const roleLabel = getAgentRemoteMessageRoleLabel(message.role)
  const hasBlocks = blocks.length > 0

  return (
    <View className={isUser ? 'items-end' : 'items-start'}>
      {!isUser && <Text className="text-foreground-secondary mb-1 px-1 text-xs font-medium">{roleLabel}</Text>}
      <View
        className={`max-w-[92%] gap-2 ${isUser ? 'secondary-container rounded-l-2xl rounded-br-md rounded-tr-2xl px-4 py-3' : ''}`}>
        {hasBlocks ? (
          blocks.map(block => <RemoteSemanticBlock key={block.blockId} block={block} />)
        ) : (
          <View className={`${isUser ? '' : 'rounded-2xl border px-4 py-3'}`}>
            <Text className="text-foreground-secondary text-sm">
              {message.status === 'streaming'
                ? t('agent.remote.message.content.receiving')
                : message.error?.message ?? t('agent.remote.message.content.empty')}
            </Text>
          </View>
        )}
      </View>
      <XStack className={`mt-1 items-center gap-2 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <Text className="text-foreground-secondary text-[11px]">{formatAgentRemoteTimestamp(message.updatedAt)}</Text>
        {message.status !== 'success' && <RemoteStatusBadge label={getAgentRemoteMessageStatusLabel(message.status)} />}
        {message.error?.code && <RemoteStatusBadge label={message.error.code} />}
      </XStack>
    </View>
  )
}

export default function RemoteMessages({ session, bridgePresence }: RemoteMessagesProps) {
  const { t } = useTranslation()
  const scrollViewRef = useRef<ScrollView>(null)
  const badges = useMemo(() => getAgentRemoteSessionBadges(session, bridgePresence), [bridgePresence, session])
  const renderableMessages = useMemo(() => getRenderableAgentRemoteMessages(session), [session])
  const lastMessageKey = useMemo(() => {
    const lastMessage = renderableMessages[renderableMessages.length - 1]

    if (!lastMessage) {
      return 'empty'
    }

    return [
      lastMessage.message.messageId,
      lastMessage.message.updatedAt,
      lastMessage.message.status,
      lastMessage.blocks.length,
      lastMessage.blocks[lastMessage.blocks.length - 1]?.updatedAt ?? 0
    ].join(':')
  }, [renderableMessages])

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    })
  }, [lastMessageKey])

  if (renderableMessages.length === 0) {
    return (
      <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
        <YStack className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-lg font-semibold">{t('agent.remote.empty.title')}</Text>
          <Text className="text-foreground-secondary text-center text-sm">
            {badges.length > 0 ? badges.join(' · ') : t('agent.remote.empty.subtitle')}
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
        {renderableMessages.map(entry => (
          <RemoteMessageCard key={entry.message.messageId} entry={entry} />
        ))}
      </YStack>
    </ScrollView>
  )
}
