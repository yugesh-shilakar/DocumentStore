import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { PreviewScreen } from '../screens/PreviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { VaultScreen } from '../screens/VaultScreen';
import { useVaultStore } from '../store/useVaultStore';
import { useTheme } from '../theme/useTheme';
import { buildNavigationTheme } from './theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const session = useVaultStore((state) => state.session);
  const { scheme } = useTheme();
  const navigationTheme = buildNavigationTheme(scheme);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="Vault" component={VaultScreen} />
            <Stack.Screen name="Preview" component={PreviewScreen} />
            <Stack.Screen name="Sync" component={SyncScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
