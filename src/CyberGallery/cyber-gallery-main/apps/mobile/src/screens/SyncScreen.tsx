import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SyncEngine, SyncProgress } from '../sync';
import { clearTokens } from '../api';

export function SyncScreen({ navigation }: any) {
  const [p, setP] = useState<SyncProgress>({
    phase: 'idle', scanned: 0, toUpload: 0, uploaded: 0, failed: 0,
  });
  const engine = useRef<SyncEngine | null>(null);
  const running = useRef(false);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    try {
      engine.current = new SyncEngine();
      await engine.current.run(setP);
    } finally {
      running.current = false;
    }
  };

  const cancel = () => engine.current?.cancel();

  // Auto-start sync as soon as the screen mounts (i.e. user is logged in &
  // permission was granted at install time). No manual button press required.
  useEffect(() => {
    start();
  }, []);

  // Re-trigger sync when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !running.current) start();
    });
    return () => sub.remove();
  }, []);

  const logout = async () => {
    cancel();
    await clearTokens();
    navigation.replace('Login');
  };

  return (
    <ScrollView contentContainerStyle={s.c}>
      <Text style={s.h}>Gallery Sync</Text>
      <Text style={s.sub}>Sync runs automatically. You can close the app — it will continue in the background.</Text>
      <Row k="Phase" v={p.phase} />
      <Row k="Scanned" v={p.scanned} />
      <Row k="To upload" v={p.toUpload} />
      <Row k="Uploaded" v={p.uploaded} />
      <Row k="Failed" v={p.failed} />
      {p.message ? <Text style={s.err}>{p.message}</Text> : null}
      <View style={{ height: 24 }} />
      <Button title="Logout" onPress={logout} />
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{String(v)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  c: { padding: 24 },
  h: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { color: '#666', marginBottom: 16, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#ddd' },
  k: { color: '#555' },
  v: { fontWeight: '600' },
  err: { color: '#c00', marginTop: 8 },
});
