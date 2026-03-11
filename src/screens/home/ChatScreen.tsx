import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { RouteProp } from '@react-navigation/native'
import { DrawerActions, useNavigation, useRoute } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Platform, View } from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { KeyboardAvoidingView, KeyboardController } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HeaderBar, SafeAreaContainer, YStack } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import { ChatScreenHeader } from '@/componentsV2/features/ChatScreen/Header'
import { MessageInputContainer } from '@/componentsV2/features/ChatScreen/MessageInput/MessageInputContainer'
import { CitationSheet } from '@/componentsV2/features/Sheet/CitationSheet'
import { useAssistant } from '@/hooks/useAssistant'
import { useBottom } from '@/hooks/useBottom'
import { usePreference } from '@/hooks/usePreference'
import { useCurrentTopic } from '@/hooks/useTopic'
import type { HomeStackParamList } from '@/navigators/HomeStackNavigator'

import { getRemoteSessionId, useAgentRemoteSession, useEnsureAgentRemoteSnapshot } from './agentRemote'
import ChatContent from './ChatContent'
import RemoteSessionComposer from './RemoteSessionComposer'
import RemoteSessionHeader from './RemoteSessionHeader'

KeyboardController.preload()

type ChatScreenNavigationProp = DrawerNavigationProp<any> & StackNavigationProp<HomeStackParamList>

const ChatScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<ChatScreenNavigationProp>()
  const route = useRoute<RouteProp<HomeStackParamList, 'ChatScreen'>>()
  const [topicId] = usePreference('topic.current_id')
  const { currentTopic } = useCurrentTopic()
  const routeTopicId = route.params?.topicId
  const remoteSessionId = getRemoteSessionId(routeTopicId)
  const isRemoteMode = !!remoteSessionId
  const { state: agentRemoteState, session: remoteSession } = useAgentRemoteSession(remoteSessionId)

  useEnsureAgentRemoteSnapshot(remoteSession)

  const { assistant, isLoading: assistantLoading } = useAssistant(isRemoteMode ? '' : currentTopic?.assistantId || '')
  const specificBottom = useBottom()

  // 处理侧滑手势
  const handleSwipeGesture = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent

    if (state === State.END) {
      // 右滑 → 打开抽屉
      if (translationX > 0) {
        const hasGoodDistance = translationX > 20
        const hasGoodVelocity = velocityX > 100
        const hasExcellentDistance = translationX > 80

        if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
          navigation.dispatch(DrawerActions.openDrawer())
        }
      }
      // 左滑 → 跳转到 TopicScreen
      else if (translationX < 0) {
        const hasGoodDistance = Math.abs(translationX) > 20
        const hasGoodVelocity = Math.abs(velocityX) > 100
        const hasExcellentDistance = Math.abs(translationX) > 80

        if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
          navigation.navigate('TopicScreen', { assistantId: isRemoteMode ? undefined : assistant?.id })
        }
      }
    }
  }

  if (isRemoteMode && remoteSession) {
    return (
      <SafeAreaContainer
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 0
        }}>
        <PanGestureHandler
          onGestureEvent={handleSwipeGesture}
          onHandlerStateChange={handleSwipeGesture}
          activeOffsetX={[-10, 10]}
          failOffsetY={[-20, 20]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : -specificBottom}
            behavior="padding">
            <YStack className="flex-1">
              <RemoteSessionHeader session={remoteSession} bridgePresence={agentRemoteState.bridgePresence} />
              <View
                style={{
                  flex: 1
                }}>
                <ChatContent
                  key={routeTopicId ?? topicId}
                  mode="remote"
                  remoteSession={remoteSession}
                  bridgePresence={agentRemoteState.bridgePresence}
                />
              </View>
              <RemoteSessionComposer session={remoteSession} />
            </YStack>
          </KeyboardAvoidingView>
        </PanGestureHandler>
        <CitationSheet />
      </SafeAreaContainer>
    )
  }

  if (isRemoteMode && !remoteSession) {
    return (
      <SafeAreaContainer
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
        <HeaderBar title={t('agent.remote.title')} />
        <ActivityIndicator />
        <View style={{ marginTop: 12, paddingHorizontal: 24 }}>
          <Text className="text-foreground-secondary text-center text-sm">
            {remoteSessionId
              ? t('agent.remote.loading_with_id', { sessionId: remoteSessionId })
              : t('agent.remote.loading')}
          </Text>
        </View>
      </SafeAreaContainer>
    )
  }

  if (!currentTopic || !assistant || assistantLoading) {
    return (
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 0
      }}>
      <PanGestureHandler
        onGestureEvent={handleSwipeGesture}
        onHandlerStateChange={handleSwipeGesture}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-20, 20]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : -specificBottom}
          behavior="padding">
          <YStack className="flex-1">
            <ChatScreenHeader topic={currentTopic} />

            <View
              style={{
                flex: 1
              }}>
              {/* ChatContent use key to re-render screen content */}
              {/* if remove key, change topic will not re-render */}
              <ChatContent key={routeTopicId ?? topicId} topic={currentTopic} assistant={assistant} />
            </View>
            <MessageInputContainer topic={currentTopic} />
          </YStack>
        </KeyboardAvoidingView>
      </PanGestureHandler>
      <CitationSheet />
    </SafeAreaContainer>
  )
}

export default ChatScreen
