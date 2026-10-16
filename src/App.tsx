/**
 * NexusMIDI Pro - Aplicativo Android / Web MIDI Router Hub
 * Versão Profissional limpa e otimizada (Clean Studio Layout).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MidiDestination, MidiLogEntry } from './types/midi';
import {
  midiManager,
  getNoteName,
} from './services/midiService';
import { MidiKeyboard } from './components/MidiKeyboard';
import { MidiRouterScreen } from './components/MidiRouterScreen';
import { MidiMonitorScreen } from './components/MidiMonitorScreen';
import { MidiControlsScreen } from './components/MidiControlsScreen';
import { NativeMidi } from './services/nativeMidi';
import { Music2, GitBranch, Activity, SlidersHorizontal, Settings } from 'lucide-react';

export const KEYBOARD_PALETTES = [
  { id: 'default', name: 'Clássico / Padrão', white: '#ffffff', black: '#1e293b' },
  { id: 'custom-blue', name: 'Azul Personalizado (#D6E6F7 / #0F3D73)', white: '#D6E6F7', black: '#0F3D73' },
  { id: 'silver-sapphire', name: 'Prata Gelo + Azul Safira', white: '#D8DDE3', black: '#0F3D73' },
  { id: 'silver-burgundy-deep', name: 'Prata Escovado + Bordo Profundo', white: '#BFC5CA', black: '#5C0A1D' },
  { id: 'whitegold-navy', name: 'Ouro Branco + Azul-Marinho', white: '#E5E4E2', black: '#1C2C5B' },
  { id: 'champagne-burgundy', name: 'Champagne + Bordo Aveludado', white: '#E8D6A7', black: '#6D071A' },
  { id: 'platinum-amethyst', name: 'Platina + Roxo Ametista', white: '#E5E1DA', black: '#6A0DAD' },
  { id: 'ivory-emerald', name: 'Marfim Acetinado + Verde Esmeralda', white: '#F4EBD0', black: '#008C69' },
  { id: 'wood-vintage', name: 'Vintage / Creme', white: '#fef3c7', black: '#451a03' },
];

export const VELOCITY_OPTIONS = [
  { id: 30, name: 'Suave (30)' },
  { id: 64, name: 'Médio / Padrão (64)' },
  { id: 100, name: 'Forte (100)' },
  { id: 127, name: 'Máximo (127)' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'keyboard' | 'router' | 'monitor' | 'controls' | 'settings'>('keyboard');
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [destinations, setDestinations] = useState<MidiDestination[]>([]);
  const [connectedDestination, setConnectedDestination] = useState<MidiDestination | null>(null);
  
  const [isBleServerActive, setIsBleServerActive] = useState<boolean>(false);
  const [isScanningBle, setIsScanningBle] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null);
  const [lastTxCommand, setLastTxCommand] = useState<MidiLogEntry | null>(null);

  const [isUsbOpen, setIsUsbOpen] = useState<boolean>(false);
  const [isBleOpen, setIsBleOpen] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  const [selectedPaletteId, setSelectedPaletteId] = useState<string>(() => {
    return localStorage.getItem('midi_palette_id') || 'custom-blue';
  });

  const [selectedVelocity, setSelectedVelocity] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('midi_velocity') || '', 10);
    return Number.isFinite(saved) && saved >= 1 && saved <= 127 ? saved : 64;
  });

  useEffect(() => {
    localStorage.setItem('midi_palette_id', selectedPaletteId);
  }, [selectedPaletteId]);

  useEffect(() => {
    localStorage.setItem('midi_velocity', selectedVelocity.toString());
  }, [selectedVelocity]);

  const activePalette = KEYBOARD_PALETTES.find((p) => p.id === selectedPaletteId) || KEYBOARD_PALETTES[1];

  const channelRef = useRef<number>(selectedChannel);
  useEffect(() => {
    channelRef.current = selectedChannel;
  }, [selectedChannel]);

  const velocityRef = useRef<number>(selectedVelocity);
  useEffect(() => {
    velocityRef.current = selectedVelocity;
  }, [selectedVelocity]);

  const showMessage = useCallback((text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info', durationMs = 3500) => {
    setStatusMessage({ text, type });
    const timer = setTimeout(() => {
      setStatusMessage((current) => (current?.text === text ? null : current));
    }, durationMs);
    return () => clearTimeout(timer);
  }, []);

  const refreshDestinations = useCallback(async () => {
    const list = await midiManager.getAvailableDestinations();
    
    const uniqueMap = new Map();
    list.forEach((item) => {
      const cleanName = item.displayName.replace(/\s*\(BLE\)/g, '').trim().toLowerCase();
      // Só dispositivos BLE são deduplicados por nome. Dois dispositivos USB com o
      // mesmo nome (ex.: dois "USB MIDI Interface") são aparelhos diferentes.
      const uniqueKey = item.bleAddress
        ? `ble:${item.bleAddress}`
        : item.type === 'ble'
          ? `dev:${cleanName}`
          : item.id;
      
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, item);
      } else {
        const existing = uniqueMap.get(uniqueKey);
        if (!existing.bleAddress && item.bleAddress) {
          uniqueMap.set(uniqueKey, item);
        }
      }
    });

    setDestinations(Array.from(uniqueMap.values()));
    const active = midiManager.getConnectedDestination();
    setConnectedDestination(active);
  }, []);

  useEffect(() => {
    let isMounted = true;

    midiManager.setCallbacks(
      () => {
        if (isMounted) void refreshDestinations();
      },
      (disconnectedDest) => {
        if (isMounted) {
          setConnectedDestination(null);
          setIsBleServerActive(false);
          void refreshDestinations();
          showMessage(`Destino "${disconnectedDest.displayName}" desconectado.`, 'warn', 4000);
        }
      }
    );

    const init = async () => {
      await midiManager.initWebMidi();

      let serverActive = false;
      try {
        serverActive = await midiManager.isBleServerRunning();
      } catch {
        serverActive = false;
      }

      if (isMounted) {
        setIsBleServerActive(serverActive);
        void refreshDestinations();
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [refreshDestinations, showMessage]);

  const handleConnect = async (dest: MidiDestination) => {
    try {
      await midiManager.connect(dest);
      setConnectedDestination(midiManager.getConnectedDestination() ?? dest);
      setIsBleServerActive(false);
      void refreshDestinations();
      setIsUsbOpen(false);
      setIsBleOpen(false);
      showMessage(`Conectado a: ${dest.displayName}`, 'success', 2500);
    } catch (err: any) {
      showMessage(`Erro ao conectar: ${err?.message || 'Erro desconhecido'}`, 'error', 4000);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (connectedDestination) {
        await midiManager.disconnect(true);
        setConnectedDestination(null);
      }

      if (isBleServerActive) {
        await midiManager.stopBleServer();
        setIsBleServerActive(false);
      }

      showMessage('Desconectado com sucesso.', 'info', 2500);
      void refreshDestinations();
    } catch (err: any) {
      showMessage(`Erro ao desconectar: ${err?.message || 'Erro desconhecido'}`, 'error', 3500);
    } finally {
      setIsUsbOpen(false);
      setIsBleOpen(false);
    }
  };

  const handleScanBle = async () => {
    setIsScanningBle(true);
    try {
      const found = await midiManager.scanBleDevice();
      await refreshDestinations();

      if (found.length === 0) {
        showMessage('Nenhum dispositivo BLE MIDI encontrado.', 'info', 3000);
      } else {
        setIsBleOpen(true);
        showMessage(`${found.length} dispositivo(s) BLE MIDI encontrado(s).`, 'success', 3000);
      }
    } catch (err: any) {
      showMessage(`Erro BLE: ${err?.message || 'Falha na busca'}`, 'error', 3500);
    } finally {
      setIsScanningBle(false);
    }
  };

  const handleStartBleServer = async () => {
    try {
      const active = await midiManager.startBleServer();
      setIsBleServerActive(active);

      if (active) {
        showMessage('📡 Modo BLE MIDI visível ativado.', 'success', 4500);
      }
    } catch (err: any) {
      setIsBleServerActive(false);
      showMessage(`Erro ao ativar BLE MIDI: ${err?.message || 'Falha desconhecida'}`, 'error', 4500);
    }
  };

  const handleNoteOn = useCallback(async (note: number) => {
    if (!connectedDestination && !isBleServerActive) {
      showMessage('Selecione um destino MIDI ou ative a visibilidade.', 'warn', 2500);
      return;
    }
    try {
      const channel = channelRef.current;
      const velocity = velocityRef.current;
      const res = await midiManager.sendKeyboardNote(channel, note, velocity, true);
      setLastTxCommand({
        id: Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toLocaleTimeString(),
        type: 'Note On',
        channel,
        note,
        noteName: getNoteName(note),
        velocity,
        bytesHex: res.hex,
      });
    } catch (err: any) {
      showMessage(`Erro Note On: ${err?.message}`, 'error', 2500);
    }
  }, [connectedDestination, isBleServerActive, showMessage]);

  const handleNoteOff = useCallback(async (note: number) => {
    if (!connectedDestination && !isBleServerActive) return;
    try {
      const channel = channelRef.current;
      const res = await midiManager.sendKeyboardNote(channel, note, 0, false);
      setLastTxCommand({
        id: Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toLocaleTimeString(),
        type: 'Note Off',
        channel,
        note,
        noteName: getNoteName(note),
        velocity: 0,
        bytesHex: res.hex,
      });
    } catch {}
  }, [connectedDestination, isBleServerActive]);

  const handleDisabledPress = useCallback(() => {
    showMessage('Selecione um destino MIDI primeiro.', 'warn', 2500);
  }, [showMessage]);

  const handleConfirmExit = async () => {
    setShowExitConfirm(false);
    try { await (NativeMidi as any).fecharApp(); } catch { try { window.close(); } catch {} }
  };

  const usbAndVirtualDestinations = destinations.filter((d) => d.type === 'usb' || d.type === 'virtual' || d.type === 'local');
  const bleDestinations = destinations.filter((d) => d.type === 'ble');
  const isUsbConnected = connectedDestination && (connectedDestination.type === 'usb' || connectedDestination.type === 'virtual' || connectedDestination.type === 'local');
  const isBleConnected = connectedDestination && connectedDestination.type === 'ble';

  return (
    <div className="h-screen w-screen overflow-hidden fixed inset-0 w-full flex flex-col font-sans select-none overflow-hidden antialiased bg-slate-950 text-slate-100">
      
      {/* HEADER PRINCIPAL CLEAN & PRO */}
      <header className="w-full border-b border-slate-800 px-2 sm:px-3 py-2 shrink-0 relative z-50 shadow-md flex flex-wrap items-center justify-between gap-y-2 bg-slate-900">
        
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-sky-400 flex items-center gap-1.5">
            <span>🎹</span> NexusMIDI Pro
          </span>

          {/* ABAS DE NAVEGAÇÃO — ícones compactos para celular */}
          <nav aria-label="Navegação principal" className="flex shrink-0 items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('keyboard')}
              aria-label="Teclado MIDI"
              aria-pressed={activeTab === 'keyboard'}
              title="Teclado MIDI"
              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-md transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'keyboard' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Music2 size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('router')}
              aria-label="MIDI Router"
              aria-pressed={activeTab === 'router'}
              title="MIDI Router"
              className={`relative h-9 w-9 sm:h-10 sm:w-10 rounded-md transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 ${
                activeTab === 'router' ? 'bg-fuchsia-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <GitBranch size={20} strokeWidth={2.2} aria-hidden="true" />
              <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('controls')}
              aria-label="Controles MIDI"
              aria-pressed={activeTab === 'controls'}
              title="Controles MIDI"
              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-md transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                activeTab === 'controls' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <SlidersHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('monitor')}
              aria-label="Monitor MIDI"
              aria-pressed={activeTab === 'monitor'}
              title="Monitor MIDI"
              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-md transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeTab === 'monitor' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Activity size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              aria-label="Configurações"
              aria-pressed={activeTab === 'settings'}
              title="Configurações"
              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-md transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activeTab === 'settings' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Settings size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </nav>
        </div>

        {/* BOTÕES NO CANTO SUPERIOR DIREITO */}
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          
          {/* Botão USB */}
          <div className="relative">
            <button
              onClick={() => { setIsUsbOpen(!isUsbOpen); setIsBleOpen(false); void refreshDestinations(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                isUsbConnected ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <span>🔌</span>
              <span className="truncate max-w-[90px] sm:max-w-[110px]">
                {isUsbConnected && connectedDestination ? connectedDestination.displayName : 'USB'}
              </span>
              <span className="text-[9px]">▼</span>
            </button>

            {isUsbOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-[100] py-1">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400 bg-slate-950 flex justify-between items-center">
                  <span>Portas USB</span>
                  <button onClick={refreshDestinations} className="text-sky-400 hover:underline">↻</button>
                </div>
                {isUsbConnected && (
                  <button onClick={handleDisconnect} className="w-full text-left px-3 py-1.5 text-xs text-rose-300 bg-rose-950/50 hover:bg-rose-950 border-b border-slate-800">
                    ✕ Desconectar
                  </button>
                )}
                {usbAndVirtualDestinations.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500 italic">Nenhum encontrado.</div>
                ) : (
                  usbAndVirtualDestinations.map((dest) => (
                    <button key={dest.id} onClick={() => handleConnect(dest)} className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 text-slate-200">
                      <span className="truncate">{dest.displayName}</span>
                      <span>{connectedDestination?.id === dest.id ? '🟢' : '⚪'}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Botão Bluetooth BLE */}
          <div className="relative">
            <button
              onClick={() => { setIsBleOpen(!isBleOpen); setIsUsbOpen(false); void refreshDestinations(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                (isBleConnected || isBleServerActive) ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' : 'bg-sky-950/60 hover:bg-sky-900/60 border-sky-800 text-sky-200'
              }`}
            >
              <span>📡</span>
              <span className="truncate max-w-[90px] sm:max-w-[110px]">
                {isBleServerActive ? 'Visível...' : isBleConnected && connectedDestination ? connectedDestination.displayName : 'Bluetooth'}
              </span>
              <span className="text-[9px]">▼</span>
            </button>

            {isBleOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-[100] py-1">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-sky-400 bg-slate-950 flex justify-between items-center">
                  <span>Conexões Bluetooth</span>
                  <button onClick={refreshDestinations} className="text-sky-400 hover:underline">↻</button>
                </div>
                {(connectedDestination || isBleServerActive) && (
                  <button onClick={handleDisconnect} className="w-full text-left px-3 py-1.5 text-xs text-rose-300 bg-rose-950/50 hover:bg-rose-950 border-b border-slate-800">
                    ✕ Desconectar
                  </button>
                )}
                <div className="max-h-[45vh] overflow-y-auto overscroll-contain custom-scrollbar">
                  {bleDestinations.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-slate-500 italic">
                      Nenhum dispositivo BLE MIDI encontrado.
                    </div>
                  ) : (
                    bleDestinations.map((dest) => (
                      <button key={dest.id} onClick={() => handleConnect(dest)} className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 text-slate-200">
                        <span className="truncate pr-2">{dest.displayName}</span>
                        <span>{connectedDestination?.id === dest.id ? '🟢' : '⚪'}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-1.5 bg-slate-950 border-t border-slate-800 flex flex-col gap-1">
                  <button onClick={handleScanBle} disabled={isScanningBle} className="w-full text-center px-3 py-1 text-xs text-sky-300 bg-sky-950 hover:bg-sky-900 border border-sky-800 rounded">
                    {isScanningBle ? 'Buscando...' : '📡 Buscar Novos BLE'}
                  </button>
                  <button
                    onClick={isBleServerActive ? handleDisconnect : handleStartBleServer}
                    className={`w-full text-center px-3 py-1 text-xs rounded border ${
                      isBleServerActive
                        ? 'text-rose-300 bg-rose-950 hover:bg-rose-900 border-rose-800'
                        : 'text-fuchsia-300 bg-fuchsia-950 hover:bg-fuchsia-900 border-fuchsia-800'
                    }`}
                  >
                    {isBleServerActive ? '⏹ Parar BLE MIDI' : '📶 Ficar Visível (Android)'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-lg transition"
            title="Sair"
          >
            🚪
          </button>
        </div>
      </header>

      {/* MODAL DE SAÍDA */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-4 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="text-3xl">⚠️</div>
            <h3 className="text-sm font-bold text-slate-100 uppercase">Deseja fechar o aplicativo?</h3>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setShowExitConfirm(false)} className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold">Cancelar</button>
              <button onClick={handleConfirmExit} className="py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow">Sim, Sair</button>
            </div>
          </div>
        </div>
      )}

      {/* MENSAGENS DE STATUS */}
      {statusMessage && (
        <div className="fixed bottom-6 left-0 right-0 z-40 px-4 pointer-events-none flex justify-center">
          <div className={`pointer-events-auto px-4 py-1.5 rounded-lg text-xs font-bold shadow-xl border flex items-center gap-2 max-w-sm ${
            statusMessage.type === 'warn' ? 'bg-amber-950/95 text-amber-200 border-amber-500' :
            statusMessage.type === 'error' ? 'bg-rose-950/95 text-rose-200 border-rose-500' :
            statusMessage.type === 'success' ? 'bg-emerald-950/95 text-emerald-200 border-emerald-500' :
            'bg-slate-900/95 text-slate-200 border-slate-700'
          }`}>
            <span>{statusMessage.type === 'warn' ? '⚠️' : statusMessage.type === 'error' ? '❌' : statusMessage.type === 'success' ? '✅' : 'ℹ️'}</span>
            <span className="flex-1 truncate">{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL (TECLADO OU MIDI HUB) */}
      <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {activeTab === 'keyboard' ? (
          <div className="flex-1 w-full p-2 flex flex-col gap-1 overflow-hidden">
            <div className="w-full h-full flex flex-col">
              <MidiKeyboard
                isConnected={!!connectedDestination || isBleServerActive}
                selectedChannel={selectedChannel}
                onSelectChannel={(ch) => {
                  setSelectedChannel(ch);
                  showMessage(`Canal alterado para: ${ch}`, 'info', 1500);
                }}
                onNoteOn={handleNoteOn}
                onNoteOff={handleNoteOff}
                onDisabledPress={handleDisabledPress}
                customWhiteKeyColor={activePalette.white}
                customBlackKeyColor={activePalette.black}
              />
            </div>
            
            <div className="shrink-0 flex items-center justify-between px-2 py-0.5 text-[10px] text-slate-500 font-mono">
              <div className="flex items-center gap-1.5">
                <span className={lastTxCommand ? 'text-emerald-400 font-bold' : 'text-slate-600'}>TX MIDI:</span>
                {lastTxCommand ? (
                  <span className="text-slate-300">{lastTxCommand.type} CH {lastTxCommand.channel} • {lastTxCommand.noteName} (Vel {lastTxCommand.velocity})</span>
                ) : (
                  <span className="italic text-slate-600">Aguardando toque</span>
                )}
              </div>
              <div><span>NexusMIDI Pro • Studio Mode</span></div>
            </div>
          </div>
        ) : activeTab === 'router' ? (
          <MidiRouterScreen
            destinations={destinations}
            connectedDestination={connectedDestination}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onRefresh={refreshDestinations}
            isBleServerActive={isBleServerActive}
          />
        ) : activeTab === 'controls' ? (
          <div className="flex-1 min-h-0 p-2 sm:p-3 overflow-hidden">
            <MidiControlsScreen
              channel={selectedChannel}
              isConnected={!!connectedDestination || isBleServerActive}
              onStatus={(message, type = 'info') => showMessage(message, type, 3000)}
            />
          </div>
        ) : activeTab === 'monitor' ? (
          <MidiMonitorScreen />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 custom-scrollbar">
            <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                  <Settings size={24} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">Configurações</h2>
                  <p className="text-xs sm:text-sm text-slate-400">Personalize a resposta e a aparência do teclado.</p>
                </div>
              </div>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Intensidade das notas (Velocity)</h3>
                  <p className="mt-1 text-xs text-slate-400">Define a força enviada ao tocar nas teclas.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {VELOCITY_OPTIONS.map((vel) => (
                    <button
                      key={vel.id}
                      type="button"
                      onClick={() => setSelectedVelocity(vel.id)}
                      aria-pressed={selectedVelocity === vel.id}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        selectedVelocity === vel.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {vel.name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Aparência das teclas</h3>
                  <p className="mt-1 text-xs text-slate-400">Escolha a combinação de cores do piano virtual.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KEYBOARD_PALETTES.map((pal) => (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() => setSelectedPaletteId(pal.id)}
                      aria-pressed={selectedPaletteId === pal.id}
                      className={`min-h-12 w-full rounded-xl border px-3 py-2 text-left flex items-center gap-3 transition ${
                        selectedPaletteId === pal.id ? 'bg-sky-950/70 border-sky-500 text-sky-100' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span className="flex shrink-0 items-center -space-x-1">
                        <span className="h-6 w-5 rounded border border-slate-500 shadow-sm" style={{ backgroundColor: pal.white }} />
                        <span className="h-5 w-4 rounded border border-slate-500 shadow-md" style={{ backgroundColor: pal.black }} />
                      </span>
                      <span className="min-w-0 flex-1 text-xs sm:text-sm font-medium">{pal.name}</span>
                      {selectedPaletteId === pal.id && <span className="text-sky-300 text-xs font-bold">Selecionado</span>}
                    </button>
                  ))}
                </div>
              </section>

              <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">As preferências são salvas automaticamente neste dispositivo.</p>
            </section>
          </div>
        )}
      </main>

    </div>
  );
}
