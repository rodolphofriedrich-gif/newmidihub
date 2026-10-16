/**
 * Camada MIDI do aplicativo.
 *
 * Android: usa a API nativa android.media.midi através do plugin Capacitor NativeMidi.
 * Web/PWA: mantém Web MIDI quando o navegador oferecer a API.
 * Não gera áudio.
 */

import { Capacitor } from '@capacitor/core';
import { MidiDestination, DestinationType, MidiLogEntry, MidiMessageType, MidiRouteConfig } from '../types/midi';
import { NativeMidi, NativeMidiDevice, NativeBleDevice } from './nativeMidi';


export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export function getNoteName(noteNumber: number): string {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;

  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Divide um buffer MIDI em mensagens individuais.
 * O Android pode entregar várias mensagens de uma só vez no mesmo buffer.
 */
export function splitMidiMessages(data: number[]): number[][] {
  const messages: number[][] = [];
  let i = 0;

  while (i < data.length) {
    const status = data[i] & 0xff;
    let length: number;

    if (status >= 0x80 && status <= 0xef) {
      const high = status & 0xf0;
      length = high === 0xc0 || high === 0xd0 ? 2 : 3;
    } else if (status === 0xf1 || status === 0xf3) {
      length = 2;
    } else if (status === 0xf2) {
      length = 3;
    } else if (status === 0xf0) {
      const end = data.indexOf(0xf7, i);
      length = end === -1 ? data.length - i : end - i + 1;
    } else {
      length = 1;
    }

    messages.push(data.slice(i, i + length));
    i += length;
  }

  return messages;
}

function nativeTypeToDestinationType(
  type: NativeMidiDevice['type']
): DestinationType {
  if (type === 'usb') return 'usb';
  if (type === 'ble') return 'ble';
  if (type === 'virtual') return 'virtual';

  return 'local';
}

function nativeDeviceToDestination(
  device: NativeMidiDevice
): MidiDestination {
  const type = nativeTypeToDestinationType(device.type);

  return {
    id: `native:${device.id}`,
    name: device.name || 'Dispositivo MIDI',
    displayName: device.name || 'Dispositivo MIDI',
    type,
    manufacturer: device.manufacturer,
    nativeId: device.id,
    inputPortCount: device.inputPortCount,
    outputPortCount: device.outputPortCount,
    portCount: Math.max(
      device.inputPortCount,
      device.outputPortCount
    ),
  };
}

export class MidiControllerManager {
  private midiAccess: MIDIAccess | null = null;

  private onStateChangeCallback: (() => void) | null = null;

  private onDisconnectCallback:
    ((destination: MidiDestination) => void) | null = null;

  private midiMessageListeners = new Set<(entry: MidiLogEntry) => void>();

  private routeConfig: MidiRouteConfig = {
    enabled: true,
    source: 'virtual',
    destinationId: null,
    inputChannel: 1,
    outputChannel: 1,
    transpose: 0,
    velocityMin: 1,
    velocityMax: 127,
    allowNotes: true,
    allowControlChange: true,
    allowProgramChange: true,
    allowPitchBend: true,
  };

  private connectedDestination: MidiDestination | null = null;

  private bleServerActive = false;

  private nativeDevices: NativeMidiDevice[] = [];

  /*
   * Dispositivos encontrados pelo scanner BLE.
   *
   * Estes dispositivos são temporários.
   * Quando o Android passar a disponibilizar o mesmo dispositivo
   * através da API MIDI nativa, a entrada temporária será ocultada.
   */
  private scannedBleDevices: NativeBleDevice[] = [];

  private nativeListeners: Array<{
    remove: () => Promise<void>;
  }> = [];

  public setCallbacks(
    onStateChange: () => void,
    onDisconnect: (destination: MidiDestination) => void,
  ) {
    this.onStateChangeCallback = onStateChange;
    this.onDisconnectCallback = onDisconnect;
  }

  public async initWebMidi(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await NativeMidi.initialize();

        await this.refreshNativeDevices();

        this.nativeListeners.forEach((listener) =>
          listener.remove().catch(() => undefined)
        );

        this.nativeListeners = [];

        this.nativeListeners.push(
          await NativeMidi.addListener(
            'devicesChanged',
            async () => {
              try {
                await this.refreshNativeDevices();
              } catch {
                // Mantém a última lista conhecida se a consulta falhar.
              }

              /*
               * Quando o Android atualiza a lista MIDI,
               * verificamos novamente quais dispositivos BLE
               * já foram assumidos pela API MIDI nativa.
               */
              this.cleanScannedBleDevices();

              try {
                this.bleServerActive =
                  await this.isBleServerRunning();
              } catch {
                // Mantém o último estado conhecido.
              }

              /*
               * Se a saída nativa atualmente conectada desapareceu
               * do Android, a conexão deixou de existir.
               */
              if (this.connectedDestination?.nativeId !== undefined) {
                const stillConnected = this.nativeDevices.some(
                  (device) =>
                    device.id === this.connectedDestination?.nativeId &&
                    device.inputPortCount > 0
                );

                if (!stillConnected) {
                  const disconnected = this.connectedDestination;
                  this.connectedDestination = null;
                  this.onDisconnectCallback?.(disconnected);
                }
              }

              this.onStateChangeCallback?.();
            }
          )
        );

        this.nativeListeners.push(
          await NativeMidi.addListener(
            'midiMessage',
            (event) => {
              if (event?.data) {
                const source =
                  this.connectedDestination?.displayName || 'MIDI';

                for (const message of splitMidiMessages(
                  Array.from(event.data as number[])
                )) {
                  const entry = this.createLogEntry(message, 'RX', source);
                  if (entry) {
                    this.midiMessageListeners.forEach((listener) =>
                      listener(entry)
                    );
                  }
                }
              }
              // Não chamamos onStateChange aqui: isso disparava getDevices()
              // no Android a cada mensagem MIDI recebida (ex.: MIDI Clock).
            }
          )
        );

        return true;
      } catch {
        return false;
      }
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.requestMIDIAccess
    ) {
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({
        sysex: false,
        software: true,
      });

      this.midiAccess.onstatechange = () =>
        this.onStateChangeCallback?.();

      return true;
    } catch {
      return false;
    }
  }

  private async refreshNativeDevices(): Promise<void> {
    const result = await NativeMidi.getDevices();

    this.nativeDevices = result.devices || [];

    this.cleanScannedBleDevices();
  }

  /**
   * Normaliza um nome para permitir comparação entre:
   *
   * "Meu Teclado"
   * "Meu Teclado (BLE)"
   *
   * e pequenas diferenças de capitalização/espaçamento.
   */
  private normalizeDeviceName(
    name: string | undefined | null
  ): string {
    return (name || '')
      .replace(/\s*\(BLE\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Verifica se um dispositivo encontrado pelo scanner BLE
   * já apareceu na lista MIDI nativa do Android.
   *
   * O endereço BLE seria a identificação ideal, mas o objeto
   * NativeMidiDevice disponível neste projeto não expõe o endereço.
   *
   * Por isso:
   *
   * 1. tentamos comparar identificadores quando disponíveis;
   * 2. usamos o nome normalizado como segunda proteção.
   */
  private isScannedBleDeviceAlreadyNative(
    scanned: NativeBleDevice,
    nativeDevices: NativeMidiDevice[] = this.nativeDevices
  ): boolean {
    const scannedAddress = String(
      scanned.address || ''
    ).trim().toLowerCase();

    const scannedName = this.normalizeDeviceName(
      scanned.name
    );

    return nativeDevices.some((nativeDevice: any) => {
      if (nativeDevice.type !== 'ble') {
        return false;
      }

      const nativeAddress = String(
        nativeDevice.address ||
        nativeDevice.bleAddress ||
        nativeDevice.macAddress ||
        ''
      )
        .trim()
        .toLowerCase();

      /*
       * Se o NativeMidiDevice fornecer endereço BLE,
       * esta é a comparação mais confiável.
       */
      if (
        scannedAddress &&
        nativeAddress &&
        scannedAddress === nativeAddress
      ) {
        return true;
      }

      /*
       * Como proteção adicional, compara pelo nome.
       */
      const nativeName = this.normalizeDeviceName(
        nativeDevice.name
      );

      if (
        scannedName &&
        nativeName &&
        scannedName === nativeName
      ) {
        return true;
      }

      return false;
    });
  }

  /**
   * Remove da lista temporária BLE os dispositivos que
   * já passaram a existir como dispositivos MIDI nativos.
   */
  private cleanScannedBleDevices(): void {
    if (this.scannedBleDevices.length === 0) {
      return;
    }

    this.scannedBleDevices = this.scannedBleDevices.filter(
      (scanned) =>
        !this.isScannedBleDeviceAlreadyNative(scanned)
    );
  }

  public addMidiMessageListener(listener: (entry: MidiLogEntry) => void): () => void {
    this.midiMessageListeners.add(listener);
    return () => this.midiMessageListeners.delete(listener);
  }

  public getRouteConfig(): MidiRouteConfig {
    return { ...this.routeConfig };
  }

  public setRouteConfig(config: Partial<MidiRouteConfig>): void {
    this.routeConfig = { ...this.routeConfig, ...config };
  }

  public async sendBytes(data: number[], source = 'NexusMIDI'): Promise<{ bytes: number[]; hex: string }> {
    const bytes = data.map((value) => value & 0xff);
    await this.transmitBytes(bytes);
    const entry = this.createLogEntry(bytes, 'TX', source);
    if (entry) this.midiMessageListeners.forEach((listener) => listener(entry));
    return { bytes, hex: this.bytesToHex(bytes) };
  }

  public async sendRoutedMessage(data: number[]): Promise<{ bytes: number[]; hex: string } | null> {
    const bytes = [...data];
    if (bytes.length === 0 || !this.routeConfig.enabled) return null;

    const status = bytes[0] & 0xff;
    const type = status & 0xf0;
    const inputChannel = (status & 0x0f) + 1;

    if (type === 0xf0) {
      return this.sendBytes(bytes, 'Router');
    }

    if (inputChannel !== this.routeConfig.inputChannel) return null;

    const allowed =
      ((type === 0x80 || type === 0x90) && this.routeConfig.allowNotes) ||
      (type === 0xb0 && this.routeConfig.allowControlChange) ||
      (type === 0xc0 && this.routeConfig.allowProgramChange) ||
      (type === 0xe0 && this.routeConfig.allowPitchBend);

    if (!allowed) return null;

    bytes[0] = type | ((this.routeConfig.outputChannel - 1) & 0x0f);

    if ((type === 0x80 || type === 0x90) && bytes.length >= 3) {
      const note = Math.max(0, Math.min(127, (bytes[1] & 0x7f) + this.routeConfig.transpose));
      bytes[1] = note;
      const velocity = bytes[2] & 0x7f;
      if (type === 0x80 || velocity === 0) {
        bytes[2] = 0;
      } else {
        const mapped = this.routeConfig.velocityMin +
          Math.round((velocity / 127) * (this.routeConfig.velocityMax - this.routeConfig.velocityMin));
        bytes[2] = Math.max(1, Math.min(127, mapped));
      }
    }

    return this.sendBytes(bytes, 'Router');
  }

  /*
   * Notas do teclado virtual atualmente pressionadas:
   * nota da tecla -> canal e nota REALMENTE enviados no Note On.
   *
   * O Note Off precisa repetir exatamente o canal e a nota do Note On.
   * Sem isso, trocar o canal ou o Transpose com uma tecla pressionada
   * deixava a nota presa no instrumento.
   */
  private heldKeyboardNotes = new Map<number, { channel: number; note: number }>();

  public async sendKeyboardNote(channel: number, note: number, velocity: number, on: boolean): Promise<{ bytes: number[]; hex: string }> {
    const config = this.routeConfig;
    const isNoteOn = on && velocity > 0;
    const held = isNoteOn ? undefined : this.heldKeyboardNotes.get(note);

    // O seletor do teclado virtual determina o canal realmente enviado.
    // O canal OUT do Router é reservado às mensagens recebidas de uma entrada externa.
    const outputChannel = held
      ? held.channel
      : Math.max(1, Math.min(16, Math.trunc(channel)));

    let outputNote: number;
    let outputVelocity: number;

    if (held) {
      outputNote = held.note;
      outputVelocity = 0;
    } else if (config.enabled) {
      outputNote = Math.max(0, Math.min(127, note + config.transpose));
      outputVelocity = isNoteOn
        ? Math.max(1, Math.min(127, config.velocityMin + Math.round((velocity / 127) * (config.velocityMax - config.velocityMin))))
        : 0;
    } else {
      // Router desligado: envia nota e velocidade sem transformação.
      outputNote = note & 0x7f;
      outputVelocity = isNoteOn ? velocity & 0x7f : 0;
    }

    if (isNoteOn) {
      this.heldKeyboardNotes.set(note, { channel: outputChannel, note: outputNote });
    } else {
      this.heldKeyboardNotes.delete(note);
    }

    const bytes = [
      (isNoteOn ? 0x90 : 0x80) | ((outputChannel - 1) & 0x0f),
      outputNote,
      outputVelocity,
    ];
    return this.sendBytes(bytes, 'Keyboard/Router');
  }

  public async sendControlChange(channel: number, controller: number, value: number): Promise<{ bytes: number[]; hex: string }> {
    return this.sendBytes([0xb0 | ((channel - 1) & 0x0f), controller & 0x7f, value & 0x7f]);
  }

  public async sendProgramChange(channel: number, program: number): Promise<{ bytes: number[]; hex: string }> {
    return this.sendBytes([0xc0 | ((channel - 1) & 0x0f), program & 0x7f]);
  }

  public async sendChannelPressure(channel: number, pressure: number): Promise<{ bytes: number[]; hex: string }> {
    const value = Math.max(0, Math.min(127, Math.trunc(pressure)));
    return this.sendBytes([0xd0 | ((channel - 1) & 0x0f), value & 0x7f]);
  }

  public async sendPitchBend(channel: number, value14: number): Promise<{ bytes: number[]; hex: string }> {
    const value = Math.max(0, Math.min(16383, value14));
    return this.sendBytes([0xe0 | ((channel - 1) & 0x0f), value & 0x7f, (value >> 7) & 0x7f]);
  }

  public async sendPanic(channels: number[] = Array.from({ length: 16 }, (_, i) => i + 1)): Promise<void> {
    for (const channel of channels) {
      await this.sendControlChange(channel, 123, 0); // All Notes Off
      await this.sendControlChange(channel, 120, 0); // All Sound Off
      await this.sendControlChange(channel, 121, 0); // Reset All Controllers
    }
  }

  private bytesToHex(bytes: number[]): string {
    return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  }

  private createLogEntry(data: number[], direction: 'RX' | 'TX', source: string): MidiLogEntry | null {
    if (!data.length) return null;
    const status = data[0] & 0xff;
    const high = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    let type: MidiMessageType = 'Unknown';
    let note = 0;
    let velocity = 0;

    if (high === 0x80) { type = 'Note Off'; note = data[1] ?? 0; velocity = data[2] ?? 0; }
    else if (high === 0x90) { type = (data[2] ?? 0) === 0 ? 'Note Off' : 'Note On'; note = data[1] ?? 0; velocity = data[2] ?? 0; }
    else if (high === 0xa0) { type = 'Poly Aftertouch'; note = data[1] ?? 0; velocity = data[2] ?? 0; }
    else if (high === 0xb0) { type = 'Control Change'; note = data[1] ?? 0; velocity = data[2] ?? 0; }
    else if (high === 0xc0) { type = 'Program Change'; note = data[1] ?? 0; }
    else if (high === 0xd0) { type = 'Channel Pressure'; velocity = data[1] ?? 0; }
    else if (high === 0xe0) { type = 'Pitch Bend'; note = ((data[2] ?? 0) << 7) | (data[1] ?? 0); }
    else if (status >= 0xf0) { type = 'System'; }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      channel,
      note,
      noteName: (high === 0x80 || high === 0x90 || high === 0xa0) ? getNoteName(note) : '—',
      velocity,
      bytesHex: this.bytesToHex(data),
      direction,
      source,
    };
  }

  public async getBluetoothState(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'android') {
      const result = await NativeMidi.isBluetoothEnabled();

      return result.enabled;
    }

    const bluetooth = (navigator as any)?.bluetooth;

    if (bluetooth?.getAvailability) {
      return bluetooth.getAvailability();
    }

    return false;
  }

  public async requestEnableBluetooth(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return this.getBluetoothState();
    }

    const result =
      await NativeMidi.requestEnableBluetooth();

    return result.enabled;
  }

  public async getAvailableDestinations(): Promise<MidiDestination[]> {
    if (Capacitor.getPlatform() === 'android') {
      await this.refreshNativeDevices();

      /*
       * Primeiro entram os dispositivos MIDI reconhecidos
       * oficialmente pelo Android.
       */
      const destinations = this.nativeDevices
        .filter(
          (device) => device.inputPortCount > 0
        )
        .map(nativeDeviceToDestination);

      /*
       * Remove os dispositivos temporários que já foram
       * incorporados à lista nativa.
       */
      this.cleanScannedBleDevices();

      /*
       * Depois adicionamos somente os BLE ainda temporários.
       */
      const scanned = this.scannedBleDevices.map(
        (device) => ({
          id: `ble:${device.address}`,
          name:
            device.name ||
            'Dispositivo BLE MIDI',
          displayName:
            `${device.name || 'Dispositivo BLE MIDI'} (BLE)`,
          type: 'ble' as const,
          bleAddress: device.address,
          inputPortCount: 1,
          outputPortCount: 1,
          portCount: 1,
        })
      );

      /*
       * Última proteção contra duplicação:
       * endereço BLE é a identidade principal.
       */
      const result: MidiDestination[] = [];
      const seenAddresses = new Set<string>();
      const seenNames = new Set<string>();

      destinations.forEach((item) => {
        if (item.bleAddress) {
          seenAddresses.add(
            item.bleAddress.toLowerCase()
          );
        }

        if (item.type === 'ble') {
          seenNames.add(
            this.normalizeDeviceName(
              item.displayName
            )
          );
        }

        result.push(item);
      });

      scanned.forEach((item) => {
        const address = (
          item.bleAddress || ''
        ).toLowerCase();

        const name = this.normalizeDeviceName(
          item.displayName
        );

        /*
         * Se o endereço já existe, não adiciona.
         */
        if (
          address &&
          seenAddresses.has(address)
        ) {
          return;
        }

        /*
         * Se já existe um BLE com o mesmo nome,
         * também não adicionamos uma segunda entrada.
         */
        if (
          name &&
          seenNames.has(name)
        ) {
          return;
        }

        if (address) {
          seenAddresses.add(address);
        }

        if (name) {
          seenNames.add(name);
        }

        result.push(item);
      });

      return result;
    }

    /*
     * Web MIDI / PWA
     */
    const list: MidiDestination[] = [];

    if (this.midiAccess) {
      for (
        const output of this.midiAccess.outputs.values()
      ) {
        list.push({
          id: output.id,
          name:
            output.name || 'Dispositivo MIDI',
          displayName:
            output.name || 'Dispositivo MIDI',
          type: 'local',
          manufacturer:
            output.manufacturer || undefined,
          portCount: 1,
        });
      }
    }

    return list;
  }

  public getConnectedDestination(): MidiDestination | null {
    return this.connectedDestination;
  }

  /**
   * Depois de conectar, o Android devolve o ID nativo do dispositivo.
   * Guardá-lo é necessário para detectar a desconexão (devicesChanged) e
   * para a lista marcar como conectado o item correto. Sem isso, um
   * dispositivo BLE conectado a partir da busca nunca era visto como
   * desconectado se fosse desligado.
   */
  private withNativeIdentity(
    destination: MidiDestination,
    result: { id?: string } | undefined
  ): MidiDestination {
    const nativeId = Number(result?.id);

    if (result?.id === undefined || !Number.isFinite(nativeId)) {
      return destination;
    }

    return { ...destination, id: `native:${nativeId}`, nativeId };
  }

  public async connect(
    destination: MidiDestination
  ): Promise<boolean> {
    if (
      this.connectedDestination?.id ===
      destination.id
    ) {
      return true;
    }

    if (this.connectedDestination) {
      await this.disconnect(true);
    }

    if (this.bleServerActive) {
      await this.stopBleServer();
    }

    try {
      let connected: MidiDestination = destination;

      if (Capacitor.getPlatform() === 'android') {
        if (
          destination.id.startsWith('ble:') &&
          destination.bleAddress
        ) {
          const result = await NativeMidi.connectBluetooth({
            address: destination.bleAddress,
            port: 0,
          });
          connected = this.withNativeIdentity(destination, result);
        } else if (
          destination.nativeId !== undefined
        ) {
          const result = await NativeMidi.connect({
            id: String(destination.nativeId),
            port: 0,
          });
          connected = this.withNativeIdentity(destination, result);
        } else {
          throw new Error(
            'Destino MIDI Android inválido. Atualize a lista de dispositivos.'
          );
        }
      } else {
        const output =
          this.midiAccess?.outputs.get(
            destination.id
          );

        if (!output) {
          throw new Error(
            'Saída MIDI não encontrada.'
          );
        }

        await output.open();
      }

      /*
       * A conexão foi aceita.
       *
       * O objeto passado para connect() pode ter vindo do
       * scanner temporário. Por isso mantemos a conexão,
       * mas depois atualizamos a lista real do Android.
       */
      this.connectedDestination = connected;
      this.heldKeyboardNotes.clear();

      if (
        Capacitor.getPlatform() === 'android'
      ) {
        /*
         * O Android pode precisar de um pequeno intervalo
         * para publicar o dispositivo na lista MIDI.
         *
         * Fazemos uma atualização imediata sem bloquear
         * a conexão caso ela ainda não tenha aparecido.
         */
        try {
          await this.refreshNativeDevices();
          this.cleanScannedBleDevices();
        } catch {
          // A conexão continua válida mesmo se a atualização falhar.
        }
      }

      return true;
    } catch (error) {
      this.connectedDestination = null;
      throw error;
    }
  }

  /**
   * @param silent true quando a desconexão foi pedida pelo próprio app
   * (usuário ou troca de destino); evita avisar "desconectado" ao usuário
   * e mexer no estado do servidor BLE por engano.
   */
  public async disconnect(silent = false): Promise<void> {
    const current =
      this.connectedDestination;

    if (!current) return;

    this.connectedDestination = null;
    this.heldKeyboardNotes.clear();

    try {
      if (
        Capacitor.getPlatform() === 'android'
      ) {
        await NativeMidi.disconnect();
      } else {
        const output =
          this.midiAccess?.outputs.get(
            current.id
          );

        await output?.close();
      }
    } finally {
      if (!silent) {
        this.onDisconnectCallback?.(current);
      }
    }
  }

  public async startBleServer(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      throw new Error(
        'O servidor BLE MIDI nativo está disponível no Android.'
      );
    }

    const result = await NativeMidi.startBleServer();
    this.bleServerActive = result.active;
    return result.active;
  }

  public async stopBleServer(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }

    await NativeMidi.stopBleServer();
    this.bleServerActive = false;
  }

  public async isBleServerRunning(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return false;
    }

    const result = await NativeMidi.isBleServerRunning();
    return result.active;
  }

  /**
   * Procura dispositivos BLE MIDI.
   *
   * IMPORTANTE:
   * Esta função NÃO conecta automaticamente nenhum
   * dispositivo.
   *
   * Ela apenas atualiza a lista temporária de dispositivos
   * encontrados e devolve todos os dispositivos encontrados.
   */
  public async scanBleDevice(): Promise<MidiDestination[]> {
    if (
      Capacitor.getPlatform() !== 'android'
    ) {
      throw new Error(
        'A busca BLE MIDI nativa está disponível no Android.'
      );
    }

    const result =
      await NativeMidi.scanBluetoothMidi({
        durationMs: 15000,
      });

    /*
     * Substituímos a lista temporária pelo resultado
     * mais recente da busca.
     */
    const unique = new Map<string, NativeBleDevice>();

    for (const device of result.devices || []) {
      const address = String(device.address || '').trim().toLowerCase();
      if (!address) continue;

      if (!unique.has(address)) {
        unique.set(address, {
          address: String(device.address).trim(),
          name: device.name || 'Dispositivo BLE MIDI',
        });
      }
    }

    this.scannedBleDevices = Array.from(unique.values());

    /*
     * Antes de apresentar os resultados, removemos
     * aqueles que o Android já reconhece como MIDI.
     */
    this.cleanScannedBleDevices();

    this.onStateChangeCallback?.();

    /*
     * Retorna TODOS os dispositivos encontrados.
     */
    return this.scannedBleDevices.map(
      (device) => ({
        id: `ble:${device.address}`,
        name:
          device.name ||
          'Dispositivo BLE MIDI',
        displayName:
          `${device.name || 'Dispositivo BLE MIDI'} (BLE)`,
        type: 'ble' as const,
        bleAddress: device.address,
        inputPortCount: 1,
        outputPortCount: 1,
        portCount: 1,
      })
    );
  }

  /**
   * Fila única de transmissão MIDI.
   *
   * O bridge Capacitor/Android é assíncrono. Sem serialização, um toque
   * muito rápido pode iniciar Note On e Note Off quase simultaneamente e
   * o Android receber as chamadas fora da ordem esperada. Isso é uma causa
   * clássica de nota presa.
   */
  private transmitQueue: Promise<void> = Promise.resolve();

  private transmitBytes(
    midiBytes: number[]
  ): Promise<void> {
    const bytes = [...midiBytes];

    const operation = this.transmitQueue.then(
      () => this.transmitBytesNow(bytes)
    );

    // Uma falha não pode bloquear as próximas mensagens da fila.
    this.transmitQueue = operation.catch(() => undefined);

    return operation;
  }

  private async transmitBytesNow(
    midiBytes: number[]
  ): Promise<void> {
    if (!this.connectedDestination && !this.bleServerActive) {
      throw new Error(
        'Nenhum destino MIDI conectado ou servidor BLE MIDI ativo.'
      );
    }

    if (Capacitor.getPlatform() === 'android') {
      await NativeMidi.send({
        data: midiBytes,
      });
      return;
    }

    if (!this.connectedDestination) {
      throw new Error(
        'Servidor BLE MIDI ativo, mas não há saída Web MIDI disponível.'
      );
    }

    const output = this.midiAccess?.outputs.get(
      this.connectedDestination.id
    );

    if (!output) {
      throw new Error(
        'Saída MIDI não encontrada.'
      );
    }

    output.send(midiBytes);
  }
}

export const midiManager =
  new MidiControllerManager();
