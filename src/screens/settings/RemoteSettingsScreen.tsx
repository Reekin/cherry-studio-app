import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Container, Group, GroupTitle, HeaderBar, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import TextField from '@/componentsV2/base/TextField'
import { usePreference } from '@/hooks/usePreference'
import { useToast } from '@/hooks/useToast'
import { refreshAgentRemoteConnection } from '@/services/AppInitializationService'
import { useAgentRemoteState } from '@/screens/home/agentRemote'

function describeConnectionStatus(status: string): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'disconnected':
      return 'Disconnected'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

export default function RemoteSettingsScreen() {
  const { t } = useTranslation()
  const toast = useToast()
  const [relayUrl, setRelayUrl] = usePreference('remote.relay_url')
  const [sharedKey, setSharedKey] = usePreference('remote.shared_key')
  const agentRemoteState = useAgentRemoteState()
  const [draftRelayUrl, setDraftRelayUrl] = useState(relayUrl)
  const [draftSharedKey, setDraftSharedKey] = useState(sharedKey)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setDraftRelayUrl(relayUrl)
  }, [relayUrl])

  useEffect(() => {
    setDraftSharedKey(sharedKey)
  }, [sharedKey])

  const handleSave = async () => {
    const normalizedRelayUrl = draftRelayUrl.trim()
    const normalizedSharedKey = draftSharedKey.trim()

    setIsSaving(true)

    try {
      await setRelayUrl(normalizedRelayUrl)
      await setSharedKey(normalizedSharedKey)
      await refreshAgentRemoteConnection()
      toast.show(t('agent.remote.settings_saved', { defaultValue: 'Remote settings saved.' }))
    } catch (error) {
      toast.show((error as Error).message || t('agent.remote.settings_save_failed', { defaultValue: 'Failed to save remote settings.' }), {
        color: '$red100',
        duration: 3000
      })
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = !isSaving && (draftRelayUrl !== relayUrl || draftSharedKey !== sharedKey)

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar
        title={t('settings.remote.title', { defaultValue: 'Remote' })}
        rightButton={{
          icon: <Text className={`text-base font-semibold ${canSave ? '' : 'opacity-40'}`}>{t('common.save')}</Text>,
          onPress: () => {
            void handleSave()
          }
        }}
      />
      <Container>
        <YStack className="gap-6">
          <YStack className="gap-2">
            <GroupTitle>{t('settings.remote.title', { defaultValue: 'Remote' })}</GroupTitle>
            <Group>
              <YStack className="gap-4 p-4">
                <TextField className="gap-2">
                  <TextField.Label className="text-foreground-secondary text-sm font-medium">
                    {t('settings.remote.relayUrl', { defaultValue: 'Relay URL' })}
                  </TextField.Label>
                  <TextField.Input
                    className="h-12 rounded-lg px-3 py-0 text-sm"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="wss://relay.example.com/ws/ios"
                    value={draftRelayUrl}
                    onChangeText={setDraftRelayUrl}
                  />
                </TextField>

                <TextField className="gap-2">
                  <TextField.Label className="text-foreground-secondary text-sm font-medium">
                    {t('settings.remote.sharedKey', { defaultValue: 'Shared Key' })}
                  </TextField.Label>
                  <TextField.Input
                    className="h-12 rounded-lg px-3 py-0 text-sm"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    placeholder={t('settings.remote.sharedKey.placeholder', { defaultValue: 'Optional shared secret' })}
                    value={draftSharedKey}
                    onChangeText={setDraftSharedKey}
                  />
                  <TextField.Description className="text-foreground-secondary text-xs">
                    {t('settings.remote.description', {
                      defaultValue: 'The relay URL and shared key are stored in preferences and applied on save.'
                    })}
                  </TextField.Description>
                </TextField>
              </YStack>
            </Group>
          </YStack>

          <YStack className="gap-2">
            <GroupTitle>{t('settings.remote.currentState', { defaultValue: 'Status' })}</GroupTitle>
            <Group>
              <YStack className="gap-3 p-4">
                <XStack className="items-center justify-between gap-3">
                  <Text>{t('settings.remote.status.websocket', { defaultValue: 'WebSocket' })}</Text>
                  <Text className="font-semibold">{describeConnectionStatus(agentRemoteState.connection.status)}</Text>
                </XStack>
                <XStack className="items-center justify-between gap-3">
                  <Text>{t('settings.remote.status.bridge', { defaultValue: 'Desktop bridge' })}</Text>
                  <Text className="font-semibold">{agentRemoteState.bridgePresence}</Text>
                </XStack>
                {agentRemoteState.connection.url ? (
                  <YStack className="gap-1">
                    <Text className="text-sm text-foreground-secondary">
                      {t('settings.remote.activeUrl', { defaultValue: 'Active URL' })}
                    </Text>
                    <Text className="text-sm">{agentRemoteState.connection.url}</Text>
                  </YStack>
                ) : null}
                {agentRemoteState.connection.lastError ? (
                  <YStack className="gap-1">
                    <Text className="text-sm text-foreground-secondary">
                      {t('error.lastError', { defaultValue: 'Last Error' })}
                    </Text>
                    <Text className="text-sm">{agentRemoteState.connection.lastError}</Text>
                  </YStack>
                ) : null}
              </YStack>
            </Group>
          </YStack>
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
