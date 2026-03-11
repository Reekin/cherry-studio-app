import { ActionSheetIOS, Platform, View } from 'react-native'

import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import { SymbolView } from 'expo-symbols'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Container,
  DrawerGestureWrapper,
  HeaderBar,
  ListSkeleton,
  presentDialog,
  SafeAreaContainer,
  SearchInput,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import AssistantItem from '@/componentsV2/features/Assistant/AssistantItem'
import { presentAssistantItemSheet } from '@/componentsV2/features/Assistant/AssistantItemSheet'
import RemoteAgentItem from '@/componentsV2/features/Assistant/RemoteAgentItem'
import { Menu, Plus, Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useExternalAssistants } from '@/hooks/useAssistant'
import { useSkeletonLoading } from '@/hooks/useSkeletonLoading'
import { useToast } from '@/hooks/useToast'
import { getCurrentTopicId } from '@/hooks/useTopic'
import { assistantService, createAssistant, getDefaultAssistant } from '@/services/AssistantService'
import { agentRemoteService, createRemoteSessionFromAgent } from '@/services/agentRemote'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import { buildRemoteTopicId, useAgentRemoteAgents } from '@/screens/home/agentRemote'
import type { AgentRemoteAgent } from '@/types/agentRemote'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'
import { isIOS } from '@/utils/device'

const logger = loggerService.withContext('AssistantScreen')

type AssistantListItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'assistant'; id: string; assistant: Assistant }
  | { type: 'remote-agent'; id: string; agent: AgentRemoteAgent }
  | { type: 'remote-empty'; id: string; message: string }

function matchesKeyword(value: string, keyword: string): boolean {
  return value.toLowerCase().includes(keyword)
}

function mapRemoteAgentToDisplayAssistant(agent: AgentRemoteAgent): Assistant {
  const workspaceCount = agent.directories.length
  const workspaceLabel = workspaceCount === 1 ? 'workspace' : 'workspaces'

  return {
    id: agent.agentId,
    emoji: '🤖',
    name: agent.name,
    prompt: agent.prompt,
    topics: [],
    type: 'agent',
    description:
      workspaceCount > 0
        ? `${agent.provider === 'claude-code' ? 'Claude Code' : 'Codex'} · ${workspaceCount} ${workspaceLabel}`
        : agent.provider === 'claude-code'
          ? 'Claude Code'
          : 'Codex',
    provider: agent.provider,
    directories: agent.directories,
    permissionMode: agent.permissionMode === 'bypassPermissions' ? 'bypassPermissions' : undefined
  }
}

export default function AssistantScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const toast = useToast()

  const { assistants, isLoading } = useExternalAssistants()
  const { state: agentRemoteState, agents: remoteAgents } = useAgentRemoteAgents()
  const [searchText, setSearchText] = useState('')
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const showSkeleton = useSkeletonLoading(isLoading)
  const normalizedSearch = searchText.trim().toLowerCase()

  useFocusEffect(
    useCallback(() => {
      if (agentRemoteState.connection.status !== 'connected') {
        return
      }

      agentRemoteService.listAgents().catch(error => {
        logger.warn('Failed to refresh remote agents on AssistantScreen focus', error as Error)
      })
    }, [agentRemoteState.connection.status])
  )

  const filteredAssistants = useMemo(() => {
    const localAssistants = assistants.filter(assistant => assistant.id !== 'translate' && assistant.id !== 'quick')

    if (!normalizedSearch) {
      return localAssistants
    }

    return localAssistants.filter(assistant =>
      [assistant.name, assistant.description || '', assistant.prompt].some(keyword => matchesKeyword(keyword, normalizedSearch))
    )
  }, [assistants, normalizedSearch])

  const filteredRemoteAgents = useMemo(() => {
    if (!normalizedSearch) {
      return remoteAgents
    }

    return remoteAgents.filter(agent =>
      [agent.name, agent.prompt, agent.provider, ...agent.directories].some(keyword => matchesKeyword(keyword, normalizedSearch))
    )
  }, [normalizedSearch, remoteAgents])

  const remoteSectionVisible =
    !isMultiSelectMode &&
    (filteredRemoteAgents.length > 0 ||
      remoteAgents.length > 0 ||
      agentRemoteState.connection.status !== 'idle' ||
      !!agentRemoteState.connection.url)

  const listData = useMemo<AssistantListItem[]>(() => {
    const data: AssistantListItem[] = filteredAssistants.map(assistant => ({
      type: 'assistant',
      id: assistant.id,
      assistant
    }))

    if (!remoteSectionVisible) {
      return data
    }

    data.push({
      type: 'header',
      id: 'remote-agent-header',
      title: t('agent.remote.agent_list_title', { defaultValue: 'Remote Agents' })
    })

    if (filteredRemoteAgents.length > 0) {
      filteredRemoteAgents.forEach(agent => {
        data.push({
          type: 'remote-agent',
          id: `remote-agent:${agent.agentId}`,
          agent
        })
      })
    } else {
      const isConnected = agentRemoteState.connection.status === 'connected'
      data.push({
        type: 'remote-empty',
        id: 'remote-agent-empty',
        message: isConnected
          ? t('agent.remote.agent_empty.connected', { defaultValue: 'No remote agents have been published from desktop yet.' })
          : t('agent.remote.agent_empty.disconnected', {
              defaultValue: 'Configure Remote Settings and connect to your desktop relay to load agents.'
            })
      })
    }

    return data
  }, [
    agentRemoteState.connection.status,
    filteredAssistants,
    filteredRemoteAgents,
    remoteAgents.length,
    remoteSectionVisible,
    t
  ])

  const selectionCount = selectedAssistantIds.length
  const hasSelection = selectionCount > 0

  const handleEditAssistant = useCallback(
    (assistantId: string) => {
      navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId } })
    },
    [navigation]
  )

  const handleEditRemoteAgent = useCallback(
    (agentId: string) => {
      navigation.navigate('Assistant', { screen: 'RemoteAgentSettingsScreen', params: { agentId } })
    },
    [navigation]
  )

  const onChatNavigation = useCallback(
    async (topicId: string) => {
      navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
    },
    [navigation]
  )

  const handleAssistantItemPress = useCallback(
    (assistant: Assistant) => {
      presentAssistantItemSheet({
        assistant,
        source: 'external',
        onEdit: handleEditAssistant,
        onChatNavigation
      })
    },
    [handleEditAssistant, onChatNavigation]
  )

  const handleCreateRemoteSession = useCallback(
    async (agent: AgentRemoteAgent) => {
      try {
        const session = await createRemoteSessionFromAgent(agent)
        navigation.navigate('Home', {
          screen: 'ChatScreen',
          params: { topicId: buildRemoteTopicId(session.sessionId) }
        })
      } catch (error) {
        logger.error('Failed to create remote session from agent', error as Error, {
          agentId: agent.agentId
        })
        toast.show(
          (error as Error).message ||
            t('agent.remote.session_create_failed', { defaultValue: 'Failed to create remote session.' }),
          {
          color: '$red100',
          duration: 3000
          }
        )
      }
    },
    [navigation, t, toast]
  )

  const handleRemoteAgentItemPress = useCallback(
    (agent: AgentRemoteAgent) => {
      presentAssistantItemSheet({
        assistant: mapRemoteAgentToDisplayAssistant(agent),
        source: 'external',
        onEdit: handleEditRemoteAgent,
        actionButton: {
          text: t('agent.remote.open_chat', { defaultValue: 'Open Chat' }),
          onPress: () => {
            void handleCreateRemoteSession(agent)
          }
        }
      })
    },
    [handleCreateRemoteSession, handleEditRemoteAgent, t]
  )

  const handleDeleteRemoteAgent = useCallback(
    (agent: AgentRemoteAgent) => {
      presentDialog('error', {
        title: t('agent.remote.delete_confirm_title', {
          defaultValue: 'Delete remote agent {{name}}?',
          name: agent.name
        }),
        content: t('agent.remote.delete_confirm_message', {
          defaultValue: 'This deletes the desktop-authored remote agent from the relay.'
        }),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        showCancel: true,
        onConfirm: async () => {
          try {
            const requestId = await agentRemoteService.deleteAgent({ agentId: agent.agentId })
            await agentRemoteService.waitForRequestEvent(requestId, 'agent.deleted')
            toast.show(t('agent.remote.delete_success', { defaultValue: 'Remote agent deleted.' }))
          } catch (error) {
            logger.error('Failed to delete remote agent', error as Error, {
              agentId: agent.agentId
            })
            toast.show(
              (error as Error).message ||
                t('agent.remote.delete_failed', { defaultValue: 'Failed to delete remote agent.' }),
              {
              color: '$red100',
              duration: 3000
              }
            )
          }
        }
      })
    },
    [t, toast]
  )

  const onAddAssistant = useCallback(async () => {
    const newAssistant = await createAssistant()
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId: newAssistant.id } })
  }, [navigation])

  const onAddRemoteAgent = useCallback(() => {
    navigation.navigate('Assistant', { screen: 'RemoteAgentSettingsScreen' })
  }, [navigation])

  const handleAddPress = useCallback(() => {
    if (Platform.OS !== 'ios') {
      void onAddAssistant()
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('assistants.title.create', { defaultValue: 'Create Assistant' }),
          t('agent.remote.form.create_title', { defaultValue: 'New RemoteAgent' }),
          t('common.cancel')
        ],
        cancelButtonIndex: 2
      },
      buttonIndex => {
        if (buttonIndex === 0) {
          void onAddAssistant()
          return
        }

        if (buttonIndex === 1) {
          onAddRemoteAgent()
        }
      }
    )
  }, [onAddAssistant, onAddRemoteAgent, t])

  const handleMenuPress = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer())
  }, [navigation])

  const handleEnterMultiSelectMode = useCallback((assistantId: string) => {
    setIsMultiSelectMode(true)
    setSelectedAssistantIds(prev => {
      if (prev.includes(assistantId)) {
        return prev
      }
      return [...prev, assistantId]
    })
  }, [])

  const handleToggleAssistantSelection = useCallback(
    (assistantId: string) => {
      if (!isMultiSelectMode) {
        return
      }

      setSelectedAssistantIds(prev => {
        if (prev.includes(assistantId)) {
          return prev.filter(id => id !== assistantId)
        }
        return [...prev, assistantId]
      })
    },
    [isMultiSelectMode]
  )

  const handleCancelMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false)
    setSelectedAssistantIds([])
  }, [])

  const performBatchDelete = useCallback(async () => {
    if (!selectedAssistantIds.length) {
      return
    }

    setIsDeleting(true)
    const idsToDelete = [...selectedAssistantIds]

    try {
      const currentTopicId = getCurrentTopicId()
      let needsTopicSwitch = false

      for (const assistantId of idsToDelete) {
        const isOwner = await topicService.isTopicOwnedByAssistant(assistantId, currentTopicId)
        if (isOwner) {
          needsTopicSwitch = true
          break
        }
      }

      if (needsTopicSwitch) {
        const defaultAssistant = await getDefaultAssistant()
        const newTopic = await topicService.createTopic(defaultAssistant)
        await topicService.switchToTopic(newTopic.id)
        navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newTopic.id } })
      }

      for (const assistantId of idsToDelete) {
        await topicService.deleteTopicsByAssistantId(assistantId)
        await assistantService.deleteAssistant(assistantId)
      }

      toast.show(t('assistants.multi_select.delete_success', { count: idsToDelete.length }))
      handleCancelMultiSelect()
    } catch (error) {
      logger.error('Error deleting assistants:', error)
      toast.show(t('message.error_deleting_assistant'))
    } finally {
      setIsDeleting(false)
    }
  }, [handleCancelMultiSelect, navigation, selectedAssistantIds, t, toast])

  const handleBatchDelete = useCallback(() => {
    if (!hasSelection || isDeleting) {
      return
    }

    presentDialog('error', {
      title: t('assistants.multi_select.delete_confirm_title', { count: selectionCount }),
      content: t('assistants.multi_select.delete_confirm_message', { count: selectionCount }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: () => {
        void performBatchDelete()
      }
    })
  }, [hasSelection, isDeleting, performBatchDelete, selectionCount, t])

  return (
    <SafeAreaContainer className="pb-0">
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          {isMultiSelectMode ? (
            <HeaderBar
              title={t('assistants.multi_select.selected_count', { count: selectionCount })}
              showBackButton={false}
              rightButton={{
                icon: <Text className="text-base font-medium">{t('common.cancel')}</Text>,
                onPress: handleCancelMultiSelect
              }}
            />
          ) : (
            <HeaderBar
              title={t('assistants.title.mine')}
              leftButton={{
                icon: <Menu size={24} />,
                onPress: handleMenuPress
              }}
              rightButtons={[
                {
                  icon: <Plus size={24} />,
                  onPress: handleAddPress
                }
              ]}
            />
          )}
          <Container className="p-0">
            <View className="px-4">
              <SearchInput
                placeholder={t('common.search_placeholder')}
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>
            {showSkeleton ? (
              <ListSkeleton variant="card" count={10} />
            ) : (
              <FlashList
                showsVerticalScrollIndicator={false}
                data={listData}
                extraData={{
                  isMultiSelectMode,
                  selectedAssistantIds,
                  remoteConnectionStatus: agentRemoteState.connection.status
                }}
                renderItem={({ item }) => {
                  switch (item.type) {
                    case 'header':
                      return (
                        <Text className="px-1 pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.4px] text-foreground-secondary">
                          {item.title}
                        </Text>
                      )
                    case 'assistant':
                      return (
                        <AssistantItem
                          assistant={item.assistant}
                          onAssistantPress={handleAssistantItemPress}
                          isMultiSelectMode={isMultiSelectMode}
                          isSelected={selectedAssistantIds.includes(item.assistant.id)}
                          onToggleSelection={handleToggleAssistantSelection}
                          onEnterMultiSelectMode={handleEnterMultiSelectMode}
                        />
                      )
                    case 'remote-agent':
                      return (
                        <RemoteAgentItem
                          agent={item.agent}
                          onPress={handleRemoteAgentItemPress}
                          onDelete={handleDeleteRemoteAgent}
                        />
                      )
                    case 'remote-empty':
                      return (
                        <View className="rounded-2xl border border-dashed px-4 py-4">
                          <Text className="text-sm text-foreground-secondary">{item.message}</Text>
                        </View>
                      )
                  }
                }}
                keyExtractor={item => item.id}
                ItemSeparatorComponent={() => <YStack className="h-2" />}
                ListEmptyComponent={
                  <YStack className="flex-1 items-center justify-center">
                    <Text>{t('settings.assistant.empty')}</Text>
                  </YStack>
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              />
            )}
          </Container>
          {isMultiSelectMode ? (
            <View className="absolute bottom-0 left-0 right-0 px-5">
              <XStack className="items-center justify-end gap-2">
                <LiquidGlassButton size={40} onPress={handleBatchDelete}>
                  {isIOS ? <SymbolView name="trash" size={20} tintColor="red" /> : <Trash2 size={20} color="red" />}
                </LiquidGlassButton>
              </XStack>
            </View>
          ) : null}
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
