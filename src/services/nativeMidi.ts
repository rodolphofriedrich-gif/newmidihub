import { registerPlugin } from '@capacitor/core';

export interface NativeMidiDevice {
  id: number;
  name: string;
  manufacturer?: string;
  type: 'local' | 'usb' | 'ble' | 'virtual' | 'unknown';
  inputPortCount: number;
  outputPortCount: number;
}

export interface NativeBleDevice {
  address: string;
  name: string;
}

export interface NativeMidiPlugin {
  initialize(): Promise<void>;
  isBluetoothEnabled(): Promise<{ enabled: boolean }>;
  requestEnableBluetooth(): Promise<{ enabled: boolean }>;
  getDevices(): Promise<{ devices: NativeMidiDevice[] }>;
  scanBluetoothMidi(options?: { durationMs?: number }): Promise<{ devices: NativeBleDevice[] }>;
  connect(options: { id: string; port?: number }): Promise<{ id: string; name: string }>;
  connectBluetooth(options: { address: string; port?: number }): Promise<{ id: string; name: string }>;
  disconnect(): Promise<void>;
  startBleServer(): Promise<{ active: boolean; clients?: number }>;
  stopBleServer(): Promise<void>;
  isBleServerRunning(): Promise<{ active: boolean; clients?: number }>;
  fecharApp(): Promise<void>;
  send(options: { data: number[] }): Promise<void>;
  addListener(
    eventName: 'devicesChanged' | 'midiMessage',
    listenerFunc: (data: any) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const NativeMidi = registerPlugin<NativeMidiPlugin>('NativeMidi');
