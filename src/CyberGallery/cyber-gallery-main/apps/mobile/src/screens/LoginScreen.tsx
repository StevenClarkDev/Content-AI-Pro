import React, { useState } from 'react';
import {
  Button,
  Text,
  TextInput,
  View,
  Alert,
  StyleSheet,
} from 'react-native';
import { login, register } from '../api';

export function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (mode: 'login' | 'register') => {
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim().toLowerCase(), password);
      else await register(email.trim().toLowerCase(), password);
      navigation.replace('Sync');
    } catch (e: any) {
      Alert.alert('Auth failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.c}>
      <Text style={s.h}>Cyber Gallery</Text>
      <TextInput
        style={s.i}
        placeholder="email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.i}
        placeholder="password (min 8)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title={busy ? '…' : 'Login'} onPress={() => submit('login')} disabled={busy} />
      <View style={{ height: 10 }} />
      <Button title="Register" onPress={() => submit('register')} disabled={busy} />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, padding: 24, justifyContent: 'center' },
  h: { fontSize: 28, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
});
