import React from 'react'
import { StyleSheet, View } from 'react-native'

import type { AgentRemoteBridgePresence, AgentRemoteSessionState } from '@/types/agentRemote'
import type { Assistant, Topic } from '@/types/assistant'

import Messages from './messages/Messages'

type ChatContentProps =
  | {
      mode?: 'local'
      topic: Topic
      assistant: Assistant
    }
  | {
      mode: 'remote'
      remoteSession: AgentRemoteSessionState
      bridgePresence: AgentRemoteBridgePresence
    }

const ChatContent = (props: ChatContentProps) => {
  return (
    <View style={styles.container}>
      {props.mode === 'remote' ? (
        <Messages mode="remote" remoteSession={props.remoteSession} bridgePresence={props.bridgePresence} />
      ) : (
        <Messages assistant={props.assistant} topic={props.topic} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%'
  }
})

export default ChatContent
