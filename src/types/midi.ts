/** Tipos usados pelo controlador MIDI. */

export type DestinationType = 'local' | 'ble' | 'usb' | 'virtual';

export interface MidiDestination {
  id: string;
  name: string;
  type: DestinationType;
  displayName: string;
  manufacturer?: string;
  portCount?: number;
  inputPortCount?: number;
  outputPortCount?: number;
  nativeId?: number;
  bleAddress?: string;
}

export type MidiMessageType =
  | 'Note On'
  | 'Note Off'
  | 'Control Change'
  | 'Program Change'
  | 'Pitch Bend'
  | 'Channel Pressure'
  | 'Poly Aftertouch'
  | 'System'
  | 'Unknown';

export interface MidiLogEntry {
  id: string;
  timestamp: string;
  type: MidiMessageType;
  channel: number;
  note: number;
  noteName: string;
  velocity: number;
  bytesHex: string;
  direction?: 'RX' | 'TX';
  source?: string;
}

export interface MidiRouteConfig {
  enabled: boolean;
  source: 'virtual';
  destinationId: string | null;
  inputChannel: number;
  outputChannel: number;
  transpose: number;
  velocityMin: number;
  velocityMax: number;
  allowNotes: boolean;
  allowControlChange: boolean;
  allowProgramChange: boolean;
  allowPitchBend: boolean;
}
