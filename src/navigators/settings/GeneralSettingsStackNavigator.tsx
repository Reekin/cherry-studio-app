import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import GeneralSettingsScreen from '@/screens/settings/general/GeneralSettingsScreen'
import RemoteSettingsScreen from '@/screens/settings/RemoteSettingsScreen'

export type GeneralSettingsStackParamList = {
  GeneralSettingsScreen: undefined
  RemoteSettingsScreen: undefined
}

const Stack = createStackNavigator<GeneralSettingsStackParamList>()

export default function GeneralSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="GeneralSettingsScreen" component={GeneralSettingsScreen} />
      <Stack.Screen name="RemoteSettingsScreen" component={RemoteSettingsScreen} />
    </Stack.Navigator>
  )
}
