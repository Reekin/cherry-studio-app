import { Button } from 'heroui-native'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, View } from 'react-native'

import { XStack, YStack } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { useToast } from '@/hooks/useToast'
import { agentRemoteService } from '@/services/agentRemote'
import type { AgentRemoteSessionState } from '@/types/agentRemote'
import { selectPendingSessionMessageSends } from '@/types/agentRemote'

import { useAgentRemoteState } from './agentRemote'

interface RemoteSessionComposerProps {
  session: AgentRemoteSessionState
}

export default function RemoteSessionComposer({ session }: RemoteSessionComposerProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const remoteState = useAgentRemoteState()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const pendingSendCount = useMemo(
    () => selectPendingSessionMessageSends(remoteState, session.sessionId).length,
    [remoteState, session.sessionId]
  )
  const trimmedText = text.trim()
  const canSend = useMemo(() => {
    return trimmedText.length > 0 && !isSending && !!session.agentId
  }, [isSending, session.agentId, trimmedText.length])

  const helperText = !session.agentId
    ? t('agent.remote.composer.helper.waiting_metadata')
    : pendingSendCount > 0
      ? t('agent.remote.composer.helper.pending')
      : t('agent.remote.composer.helper.ready')

  const handleSend = async () => {
    if (!trimmedText || isSending) {
      return
    }

    if (!session.agentId) {
      toast.show(t('agent.remote.composer.error.missing_metadata'), { color: '$red100', duration: 2500 })
      return
    }

    setIsSending(true)

    try {
      await agentRemoteService.sendMessage({
        agentId: session.agentId,
        sessionId: session.sessionId,
        content: trimmedText,
        origin: 'ios',
        runPushPolicy: session.runPushPolicy
      })

      setText('')
      Keyboard.dismiss()
      toast.show(t('agent.remote.composer.toast.queued'))
    } catch (error) {
      toast.show((error as Error).message || t('agent.remote.composer.error.send_failed'), {
        color: '$red100',
        duration: 3000
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <View style={{ borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
      <YStack className="gap-3">
        <XStack className="items-end gap-3">
          <View style={{ flex: 1 }}>
            <TextField className="w-full">
              <TextField.Input
                className="text-foreground h-auto"
                placeholder={t('agent.remote.composer.placeholder')}
                value={text}
                onChangeText={setText}
                multiline
                editable={!isSending}
                style={{
                  minHeight: 44,
                  maxHeight: 120,
                  paddingVertical: 10,
                  textAlignVertical: 'top'
                }}
              />
            </TextField>
          </View>
          <Button
            className="rounded-2xl"
            isDisabled={!canSend}
            onPress={() => {
              void handleSend()
            }}>
            <Button.Label>
              {isSending || pendingSendCount > 0 ? t('agent.remote.composer.queued') : t('agent.remote.composer.send')}
            </Button.Label>
          </Button>
        </XStack>
        <Text className="text-foreground-secondary text-xs">{helperText}</Text>
      </YStack>
    </View>
  )
}
