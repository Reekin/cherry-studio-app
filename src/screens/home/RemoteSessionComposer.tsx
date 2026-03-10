import { Button } from 'heroui-native'
import React, { useMemo, useState } from 'react'
import { Keyboard, View } from 'react-native'

import { XStack, YStack } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { useToast } from '@/hooks/useToast'
import { agentRemoteService } from '@/services/agentRemote'
import type { AgentRemoteSessionState } from '@/types/agentRemote'

interface RemoteSessionComposerProps {
  session: AgentRemoteSessionState
}

export default function RemoteSessionComposer({ session }: RemoteSessionComposerProps) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const trimmedText = text.trim()
  const canSend = useMemo(() => trimmedText.length > 0 && !isSending && !!session.agentId, [isSending, session.agentId, trimmedText.length])

  const helperText = session.agentId
    ? 'Send a message into this remote session.'
    : 'Waiting for session metadata before sending is available.'

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
      toast.show('Message sent to remote session.')
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
            <Button.Label>{isSending ? 'Sending' : 'Send'}</Button.Label>
          </Button>
        </XStack>
        <Text className="text-foreground-secondary text-xs">{helperText}</Text>
      </YStack>
    </View>
  )
}
