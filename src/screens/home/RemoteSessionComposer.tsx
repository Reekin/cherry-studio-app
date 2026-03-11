import { Button } from 'heroui-native'
import React, { useMemo, useState } from 'react'
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
    ? 'Waiting for session metadata before sending is available.'
    : pendingSendCount > 0
      ? 'Message queued. Waiting for relay acknowledgement and desktop execution.'
      : 'Send a message into this remote session.'

  const handleSend = async () => {
    if (!trimmedText || isSending) {
      return
    }

    if (!session.agentId) {
      toast.show('Remote session is missing agent metadata.', { color: '$red100', duration: 2500 })
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
      toast.show('Message queued for remote delivery. Waiting for desktop response.')
    } catch (error) {
      toast.show((error as Error).message || 'Failed to send remote message.', {
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
                placeholder="Send a message to this remote session"
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
            <Button.Label>{isSending || pendingSendCount > 0 ? 'Queued' : 'Send'}</Button.Label>
          </Button>
        </XStack>
        <Text className="text-foreground-secondary text-xs">{helperText}</Text>
      </YStack>
    </View>
  )
}
