import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';
import type { DeviceDto } from '@cg/shared';

const DEVICE_UID_KEY = 'cg.deviceUid';
const DEVICE_ID_KEY = 'cg.deviceId';

function uuid() {
  // simple v4-ish; enough for device fingerprint
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function ensureDevice(): Promise<DeviceDto> {
  let uid = await AsyncStorage.getItem(DEVICE_UID_KEY);
  if (!uid) {
    uid = uuid();
    await AsyncStorage.setItem(DEVICE_UID_KEY, uid);
  }
  const device = await api<DeviceDto>('/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceUid: uid,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      name: `${Platform.OS} device`,
    }),
  });
  await AsyncStorage.setItem(DEVICE_ID_KEY, device.id);
  return device;
}

export async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_ID_KEY);
}
