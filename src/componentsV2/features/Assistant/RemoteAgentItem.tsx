import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ContextMenuListProps } from '@/componentsV2/base/ContextMenu'
import ContextMenu from '@/componentsV2/base/ContextMenu'
import Text from '@/componentsV2/base/Text'
import { Trash2 } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { formatRemoteAgentSubtitle } from '@/services/agentRemote'
import type { AgentRemoteAgent } from '@/types/agentRemote'

interface RemoteAgentItemProps {
  agent: AgentRemoteAgent
  onPress: (agent: AgentRemoteAgent) => void
  onDelete?: (agent: AgentRemoteAgent) => void
}

function formatUpdatedAt(timestamp?: number): string {
  if (!timestamp) {
    return ''
  }

  return new Date(timestamp).toLocaleString()
}

const RemoteAgentItem: FC<RemoteAgentItemProps> = ({ agent, onPress, onDelete }) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const subtitle = formatRemoteAgentSubtitle(agent)
  const updatedAt = formatUpdatedAt(agent.updatedAt ?? agent.createdAt)

  const contextMenuItems: ContextMenuListProps[] = onDelete
    ? [
        {
          title: t('common.delete'),
          iOSIcon: 'trash',
          androidIcon: <Trash2 size={16} className="text-red-600" />,
          destructive: true,
          color: 'red',
          onSelect: () => onDelete(agent)
        }
      ]
    : []

  return (
    <ContextMenu borderRadius={16} list={contextMenuItems} onPress={() => onPress(agent)}>
      <View className="bg-card items-center justify-between rounded-2xl px-2.5 py-2.5">
        <XStack className="gap-3.5">
          <View
            className="items-center justify-center rounded-[18px] border"
            style={{
              width: 46,
              height: 46,
              borderWidth: 3,
              borderColor: isDark ? '#333333' : '#f7f7f7'
            }}>
            <Text className="text-sm font-bold">RA</Text>
          </View>
          <YStack className="flex-1 justify-center gap-1">
            <XStack className="items-center justify-between gap-2">
              <Text className="flex-1 text-sm font-bold" numberOfLines={1} ellipsizeMode="tail">
                {agent.name}
              </Text>
              {updatedAt ? (
                <Text className="text-foreground-secondary shrink-0 text-[11px]" numberOfLines={1}>
                  {updatedAt}
                </Text>
              ) : null}
            </XStack>
            <Text className="text-foreground-secondary text-xs" numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text>
          </YStack>
        </XStack>
      </View>
    </ContextMenu>
  )
}

export default RemoteAgentItem
