import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BackgroundFetch from 'react-native-background-fetch';

import { LoginScreen } from './src/screens/LoginScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { getAccess } from './src/api';
import { SyncEngine } from './src/sync';

const Stack = createNativeStackNavigator();
const qc = new QueryClient();

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getAccess().then((t) => setAuthed(!!t));
  }, []);

  useEffect(() => {
    BackgroundFetch.configure(
      { minimumFetchInterval: 30, stopOnTerminate: false, startOnBoot: true },
      async (taskId) => {
        const access = await getAccess();
        if (access) await new SyncEngine().run(() => {});
        BackgroundFetch.finish(taskId);
      },
      () => {},
    );
  }, []);

  if (authed === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <QueryClientProvider client={qc}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName={authed ? 'Sync' : 'Login'}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Sync" component={SyncScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
