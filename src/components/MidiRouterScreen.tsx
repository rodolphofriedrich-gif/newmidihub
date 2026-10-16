import React, { useEffect, useState } from 'react';
import { MidiDestination, MidiRouteConfig } from '../types/midi';
import { midiManager } from '../services/midiService';

interface Props {
  destinations: MidiDestination[];
  connectedDestination: MidiDestination | null;
  onConnect: (destination: MidiDestination) => void;
  onDisconnect: () => void;
  onRefresh: () => Promise<void> | void;
  isBleServerActive: boolean;
}

export function MidiRouterScreen({ destinations, connectedDestination, onConnect, onDisconnect, onRefresh, isBleServerActive }: Props) {
  const [config, setConfig] = useState<MidiRouteConfig>(() => midiManager.getRouteConfig());
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Um destino é um aparelho que RECEBE o MIDI do app, ou seja, tem porta de ENTRADA
  // (no Android, "input port" = porta que recebe dados do app). O filtro anterior usava
  // outputPortCount e escondia módulos de som/sintetizadores que só recebem MIDI.
  const outputs = destinations.filter((destination) => destination.inputPortCount !== 0);

  useEffect(() => {
    midiManager.setRouteConfig(config);
  }, [config]);

  const update = (patch: Partial<MidiRouteConfig>) => setConfig((current) => ({ ...current, ...patch }));

  const panic = async () => {
    try { await midiManager.sendPanic(); } catch { /* UI reports connection state elsewhere */ }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-950 p-4 text-slate-100">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold uppercase tracking-wider text-sky-400">MIDI Router</h2>
            <p className="text-xs text-slate-500">Nesta fase, a rota virtual usa o motor MIDI central e uma saída ativa.</p>
          </div>
          <button onClick={panic} disabled={!connectedDestination && !isBleServerActive} className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-xs font-bold shadow">MIDI PANIC</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-400">Entrada</span>
              <span className="text-[10px] px-2 py-1 rounded border border-emerald-800 bg-emerald-950/50 text-emerald-300">Teclado Virtual</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <div className="font-bold text-slate-200">NexusMIDI Virtual Keyboard</div>
              <div className="text-[10px] text-slate-500 mt-1">As teclas passam pelo MIDI Engine antes da transmissão.</div>
            </div>
            <label className="flex items-center gap-2 mt-4 text-xs">
              <input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
              Roteamento ativo
            </label>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-sky-400">Saída</span>
              {connectedDestination ? <span className="text-[10px] text-emerald-400">● Conectada</span> : <span className="text-[10px] text-slate-500">Nenhuma</span>}
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar">
              {outputs.map((destination) => (
                <button key={destination.id} onClick={() => { update({ destinationId: destination.id }); onConnect(destination); }} className={`w-full text-left p-3 rounded-lg border text-xs transition ${connectedDestination?.id === destination.id ? 'border-emerald-500 bg-emerald-950/30 text-emerald-200' : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-300'}`}>
                  <div className="font-bold truncate">{destination.displayName}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-1">{destination.type}</div>
                </button>
              ))}
              {outputs.length === 0 && <div className="text-xs text-slate-600 text-center p-4">Nenhuma saída MIDI encontrada.</div>}
            </div>
            {connectedDestination && <button onClick={onDisconnect} className="mt-3 text-[10px] px-3 py-1.5 rounded border border-rose-800 bg-rose-950/40 text-rose-300">Desconectar saída</button>}
          </section>
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div><span className="text-xs font-bold uppercase tracking-wide text-fuchsia-400">Transformação MIDI</span><p className="text-[10px] text-slate-500 mt-1">Aplicada pelo motor antes do envio.</p></div>
            <button onClick={() => setShowAdvanced((value) => !value)} className="text-xs px-3 py-1.5 rounded border border-slate-700 bg-slate-950">{showAdvanced ? 'Ocultar' : 'Mostrar'} controles</button>
          </div>
          {showAdvanced && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="text-[10px] text-slate-400">Canal IN<select value={config.inputChannel} onChange={(e) => update({ inputChannel: Number(e.target.value) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-200">{Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Canal OUT<select value={config.outputChannel} onChange={(e) => update({ outputChannel: Number(e.target.value) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-200">{Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Transpose<input type="number" min={-24} max={24} value={config.transpose} onChange={(e) => update({ transpose: Number(e.target.value) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-200" /></label>
              <label className="text-[10px] text-slate-400">Velocity máxima<input type="number" min={1} max={127} value={config.velocityMax} onChange={(e) => update({ velocityMax: Number(e.target.value) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-200" /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.allowNotes} onChange={(e) => update({ allowNotes: e.target.checked })} />Notas</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.allowControlChange} onChange={(e) => update({ allowControlChange: e.target.checked })} />CC</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.allowProgramChange} onChange={(e) => update({ allowProgramChange: e.target.checked })} />Program Change</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.allowPitchBend} onChange={(e) => update({ allowPitchBend: e.target.checked })} />Pitch Bend</label>
            </div>
          )}
        </section>

        <button onClick={() => void onRefresh()} className="text-xs text-sky-400 hover:text-sky-300">↻ Atualizar dispositivos MIDI</button>
      </div>
    </div>
  );
}
