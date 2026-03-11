import type { RouteProp } from '@react-navigation/native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { Button, Spinner } from 'heroui-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Container, Group, GroupTitle, HeaderBar, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import TextField from '@/componentsV2/base/TextField'
import { Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useToast } from '@/hooks/useToast'
import {
  agentRemoteService,
  buildRemoteAgentUpsertInput,
  normalizeRemoteAgentDirectories,
  REMOTE_AGENT_PERMISSION_MODE
} from '@/services/agentRemote'
import { loggerService } from '@/services/LoggerService'
import { useAgentRemoteAgent } from '@/screens/home/agentRemote'
import type { AgentRemoteAgent, AgentRemoteProvider } from '@/types/agentRemote'
import type { AssistantNavigationProps, RemoteAgentSettingsScreenParams } from '@/types/naviagate'

const logger = loggerService.withContext('RemoteAgentSettingsScreen')

type RemoteAgentSettingsRouteProp = RouteProp<
  { RemoteAgentSettingsScreen: RemoteAgentSettingsScreenParams | undefined },
  'RemoteAgentSettingsScreen'
>

type RemoteAgentFormState = {
  name: string
  prompt: string
  directoriesText: string
  provider: AgentRemoteProvider
}

function buildInitialForm(agent?: AgentRemoteAgent | null): RemoteAgentFormState {
  return {
    name: agent?.name ?? '',
    prompt: agent?.prompt ?? '',
    directoriesText: (agent?.directories ?? []).join('\n'),
    provider: agent?.provider ?? 'claude-code'
  }
}

export default function RemoteAgentSettingsScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<AssistantNavigationProps>()
  const route = useRoute<RemoteAgentSettingsRouteProp>()
  const toast = useToast()
  const agentId = route.params?.agentId
  const { state: agentRemoteState, agent } = useAgentRemoteAgent(agentId ?? '')
  const [form, setForm] = useState<RemoteAgentFormState>(() => buildInitialForm())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasSeededForm, setHasSeededForm] = useState(false)
  const isEditing = !!agentId
  const isConnected = agentRemoteState.connection.status === 'connected'

  useEffect(() => {
    if (!agent || hasSeededForm) {
      return
    }

    setForm(buildInitialForm(agent))
    setHasSeededForm(true)
  }, [agent, hasSeededForm])

  useFocusEffect(
    useCallback(() => {
      if (!isEditing || !isConnected) {
        return
      }

      let isActive = true
      setIsRefreshing(true)

      agentRemoteService
        .listAgents()
        .then(requestId => agentRemoteService.waitForRequestEvent(requestId, 'agent.listed'))
        .catch(error => {
          logger.warn('Failed to refresh remote agents before editing', error as Error)
          if (isActive) {
            toast.show(
              (error as Error).message ||
                t('agent.remote.load_failed', { defaultValue: 'Failed to load remote agents.' }),
              {
                color: '$red100',
                duration: 3000
              }
            )
          }
        })
        .finally(() => {
          if (isActive) {
            setIsRefreshing(false)
          }
        })

      return () => {
        isActive = false
      }
    }, [isConnected, isEditing, t, toast])
  )

  const normalizedDirectories = useMemo(() => {
    return normalizeRemoteAgentDirectories(form.directoriesText.split('\n'))
  }, [form.directoriesText])

  const canSave = form.name.trim().length > 0 && !isSaving

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.show(t('agent.remote.form.validation.name_required', { defaultValue: 'Name is required' }), {
        color: '$red100'
      })
      return
    }

    if (!isConnected) {
      toast.show(
        t('agent.remote.connection_required', {
          defaultValue: 'Connect to the relay before editing remote agents.'
        }),
        {
          color: '$red100',
          duration: 3000
        }
      )
      return
    }

    setIsSaving(true)

    try {
      const requestId = await agentRemoteService.upsertAgent(
        buildRemoteAgentUpsertInput({
          agentId,
          name: form.name,
          prompt: form.prompt,
          provider: form.provider,
          directories: normalizedDirectories,
          permissionMode: REMOTE_AGENT_PERMISSION_MODE
        })
      )

      await agentRemoteService.waitForRequestEvent(requestId, 'agent.upserted')
      navigation.goBack()
    } catch (error) {
      logger.error('Failed to save remote agent', error as Error, {
        agentId
      })
      toast.show(
        (error as Error).message ||
          t('agent.remote.form.validation.save_failed', { defaultValue: 'Failed to save remote agent.' }),
        {
          color: '$red100',
          duration: 3000
        }
      )
    } finally {
      setIsSaving(false)
    }
  }, [agentId, form, isConnected, navigation, normalizedDirectories, t, toast])

  const handleDelete = useCallback(() => {
    if (!agentId) {
      return
    }

    presentDialog('error', {
      title: t('agent.remote.delete_confirm_title', {
        defaultValue: 'Delete remote agent {{name}}?',
        name: agent?.name ?? agentId
      }),
      content: t('agent.remote.delete_confirm_message', {
        defaultValue: 'This deletes the desktop-authored remote agent from the relay.'
      }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: async () => {
        if (!isConnected) {
          toast.show(
            t('agent.remote.connection_required', {
              defaultValue: 'Connect to the relay before editing remote agents.'
            }),
            {
              color: '$red100',
              duration: 3000
            }
          )
          return
        }

        try {
          const requestId = await agentRemoteService.deleteAgent({ agentId })
          await agentRemoteService.waitForRequestEvent(requestId, 'agent.deleted')
          navigation.goBack()
        } catch (error) {
          logger.error('Failed to delete remote agent', error as Error, {
            agentId
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
  }, [agent?.name, agentId, isConnected, navigation, t, toast])

  if (isEditing && ((isRefreshing && !agent) || (!agent && isConnected))) {
    return (
      <SafeAreaContainer className="flex-1">
        <HeaderBar title={t('agent.remote.title', { defaultValue: 'Remote Agent' })} />
        <Container className="flex-1 items-center justify-center">
          <Spinner />
        </Container>
      </SafeAreaContainer>
    )
  }

  if (isEditing && !agent) {
    return (
      <SafeAreaContainer className="flex-1">
        <HeaderBar title={t('agent.remote.title', { defaultValue: 'Remote Agent' })} />
        <Container className="flex-1 items-center justify-center">
          <YStack className="items-center gap-2 px-6">
            <Text className="text-center">
              {t('agent.remote.form.validation.not_found', { defaultValue: 'Remote agent not found.' })}
            </Text>
            <Text className="text-center text-sm text-foreground-secondary">
              {t('agent.remote.connection_required_hint', {
                defaultValue: 'Open Remote Settings, reconnect to the relay, then try again.'
              })}
            </Text>
          </YStack>
        </Container>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar
        title={
          isEditing
            ? t('agent.remote.form.edit_title', { defaultValue: 'Edit RemoteAgent' })
            : t('agent.remote.form.create_title', { defaultValue: 'New RemoteAgent' })
        }
        rightButtons={[
          ...(isEditing
            ? [
                {
                  icon: <Trash2 size={20} className="text-red-500" />,
                  onPress: handleDelete
                }
              ]
            : []),
          {
            icon: <Text className={`text-base font-semibold ${canSave ? '' : 'opacity-40'}`}>{t('common.save')}</Text>,
            onPress: () => {
              if (!canSave) {
                return
              }
              void handleSave()
            }
          }
        ]}
      />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}>
        <Container>
          <YStack className="gap-6">
          {!isConnected ? (
            <Group>
              <YStack className="gap-1 p-4">
                <Text className="font-semibold">
                  {t('agent.remote.connection_required', {
                    defaultValue: 'Connect to the relay before editing remote agents.'
                  })}
                </Text>
                <Text className="text-sm text-foreground-secondary">
                  {t('agent.remote.connection_required_hint', {
                    defaultValue: 'Open Remote Settings, reconnect to the relay, then try again.'
                  })}
                </Text>
              </YStack>
            </Group>
          ) : null}

          <YStack className="gap-2">
            <GroupTitle>{t('agent.remote.form.section.basic', { defaultValue: 'Basic' })}</GroupTitle>
            <Group>
              <YStack className="gap-4 p-4">
                <TextField className="gap-2">
                  <TextField.Label className="text-foreground-secondary text-sm font-medium">
                    {t('common.name')}
                  </TextField.Label>
                  <TextField.Input
                    className="h-12 rounded-lg px-3 py-0 text-sm"
                    value={form.name}
                    placeholder={t('agent.remote.default_name', { defaultValue: 'Remote Agent' })}
                    onChangeText={name => setForm(prev => ({ ...prev, name }))}
                  />
                </TextField>

                <YStack className="gap-2">
                  <Text className="text-foreground-secondary text-sm font-medium">
                    {t('agent.remote.form.provider', { defaultValue: 'Provider' })}
                  </Text>
                  <XStack className="gap-2">
                    {(['claude-code', 'codex'] as const).map(provider => {
                      const isSelected = form.provider === provider
                      return (
                        <Pressable
                          key={provider}
                          onPress={() => setForm(prev => ({ ...prev, provider }))}
                          className={`flex-1 rounded-2xl border px-4 py-3 ${
                            isSelected
                              ? 'border-green-500 bg-green-500 shadow-sm'
                              : 'border-border bg-card'
                          }`}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.88 : 1,
                            transform: [{ scale: pressed ? 0.98 : isSelected ? 1.02 : 1 }]
                          })}>
                          <Text
                            className={`text-center font-semibold ${
                              isSelected ? 'text-white' : 'text-foreground'
                            }`}>
                              {provider === 'claude-code' ? 'Claude Code' : 'Codex'}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </XStack>
                  <Text className="text-foreground-secondary text-xs">
                    {t('agent.remote.form.provider_help', {
                      defaultValue: 'Provider is locked once a remote session is created from this agent.'
                    })}
                  </Text>
                </YStack>
              </YStack>
            </Group>
          </YStack>

          <YStack className="gap-2">
            <GroupTitle>{t('agent.remote.form.section.workspace', { defaultValue: 'Workspace' })}</GroupTitle>
            <Group>
              <YStack className="gap-3 p-4">
                <TextField className="gap-2">
                  <TextField.Label className="text-foreground-secondary text-sm font-medium">
                    {t('agent.remote.form.directories', { defaultValue: 'Directories' })}
                  </TextField.Label>
                  <TextField.Input
                    className="min-h-[120px] rounded-lg px-3 py-3 text-sm"
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    value={form.directoriesText}
                    placeholder={t('agent.remote.form.directories_placeholder', {
                      defaultValue: '/workspace/app\n/workspace/shared'
                    })}
                    onChangeText={directoriesText => setForm(prev => ({ ...prev, directoriesText }))}
                  />
                  <TextField.Description className="text-foreground-secondary text-xs">
                    {t('agent.remote.form.directories_help', {
                      defaultValue: 'Enter one absolute path per line.'
                    })}
                  </TextField.Description>
                </TextField>
              </YStack>
            </Group>
          </YStack>

          <YStack className="gap-2">
            <GroupTitle>{t('agent.remote.form.section.prompt', { defaultValue: 'Prompt' })}</GroupTitle>
            <Group>
              <YStack className="gap-3 p-4">
                <TextField className="gap-2">
                  <TextField.Label className="text-foreground-secondary text-sm font-medium">
                    {t('common.prompt')}
                  </TextField.Label>
                  <TextField.Input
                    className="min-h-[180px] rounded-lg px-3 py-3 text-sm"
                    multiline
                    numberOfLines={8}
                    textAlignVertical="top"
                    value={form.prompt}
                    placeholder={t('common.prompt')}
                    onChangeText={prompt => setForm(prev => ({ ...prev, prompt }))}
                  />
                </TextField>
              </YStack>
            </Group>
          </YStack>

          <YStack className="gap-2">
            <GroupTitle>{t('agent.remote.form.section.execution', { defaultValue: 'Execution' })}</GroupTitle>
            <Group>
              <XStack className="items-center justify-between p-4">
                <YStack className="flex-1 gap-1 pr-4">
                  <Text className="text-lg">{t('agent.remote.form.permission_mode', { defaultValue: 'Permission Mode' })}</Text>
                  <Text className="text-foreground-secondary text-sm">
                    {t('agent.remote.form.permission_mode_fixed', { defaultValue: 'Fixed to Full Auto on iOS.' })}
                  </Text>
                </YStack>
                <Text className="font-semibold">
                  {t('agent.remote.form.permission_mode_value', { defaultValue: 'Full Auto' })}
                </Text>
              </XStack>
            </Group>
          </YStack>
          </YStack>
        </Container>
      </KeyboardAwareScrollView>
    </SafeAreaContainer>
  )
}
