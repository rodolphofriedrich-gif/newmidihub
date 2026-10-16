import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Play, Save, SlidersHorizontal, Trash2, RotateCcw } from 'lucide-react';
import { midiManager } from '../services/midiService';

type MidiPreset = {
  id: string;
  name: string;
  modWheel: number;
  volume: number;
  expression: number;
  pan: number;
  sustain: boolean;
  program: number;
  pitchBend: number;
  pressure: number;
};

const PRESETS_KEY = 'nexusmidi_controls_presets_v1';
const DEFAULT_CONTROLS = {
  modWheel: 0,
  volume: 100,
  expression: 127,
  pan: 64,
  sustain: false,
  program: 1,
  pitchBend: 8192,
  pressure: 0,
};

interface Props {
  channel: number;
  isConnected: boolean;
  onStatus: (message: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

function loadPresets(): MidiPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string') : [];
  } catch {
    return [];
  }
}

export function MidiControlsScreen({ channel, isConnected, onStatus }: Props) {
  const [modWheel, setModWheel] = useState(DEFAULT_CONTROLS.modWheel);
  const [volume, setVolume] = useState(DEFAULT_CONTROLS.volume);
  const [expression, setExpression] = useState(DEFAULT_CONTROLS.expression);
  const [pan, setPan] = useState(DEFAULT_CONTROLS.pan);
  const [sustain, setSustain] = useState(DEFAULT_CONTROLS.sustain);
  const [program, setProgram] = useState(DEFAULT_CONTROLS.program);
  const [pitchBend, setPitchBend] = useState(DEFAULT_CONTROLS.pitchBend);
  const [pressure, setPressure] = useState(DEFAULT_CONTROLS.pressure);
  const [presetName, setPresetName] = useState('Meu preset');
  const [presets, setPresets] = useState<MidiPreset[]>(loadPresets);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* armazenamento opcional */ }
  }, [presets]);

  const controls = useMemo(() => ({ modWheel, volume, expression, pan, sustain, program, pitchBend, pressure }), [modWheel, volume, expression, pan, sustain, program, pitchBend, pressure]);

  const sendAction = async (action: () => Promise<unknown>, successMessage: string) => {
    if (!isConnected) {
      onStatus('Conecte um destino MIDI antes de enviar controles.', 'warn');
      return;
    }
    try {
      await action();
      onStatus(successMessage, 'success');
    } catch (error: any) {
      onStatus(`Falha ao enviar MIDI: ${error?.message || 'erro desconhecido'}`, 'error');
    }
  };

  const sendCC = (controller: number, value: number, label: string) =>
    sendAction(() => midiManager.sendControlChange(channel, controller, value), `${label}: ${value} • Canal ${channel}`);

  const applyPreset = async (preset: MidiPreset) => {
    if (!isConnected) {
      onStatus('Conecte um destino MIDI antes de aplicar um preset.', 'warn');
      return;
    }
    setBusy(true);
    try {
      setModWheel(preset.modWheel); setVolume(preset.volume); setExpression(preset.expression); setPan(preset.pan);
      setSustain(preset.sustain); setProgram(preset.program); setPitchBend(preset.pitchBend); setPressure(preset.pressure);
      await midiManager.sendControlChange(channel, 1, preset.modWheel);
      await midiManager.sendControlChange(channel, 7, preset.volume);
      await midiManager.sendControlChange(channel, 11, preset.expression);
      await midiManager.sendControlChange(channel, 10, preset.pan);
      await midiManager.sendControlChange(channel, 64, preset.sustain ? 127 : 0);
      await midiManager.sendProgramChange(channel, preset.program - 1);
      await midiManager.sendPitchBend(channel, preset.pitchBend);
      await midiManager.sendChannelPressure(channel, preset.pressure);
      onStatus(`Preset “${preset.name}” aplicado no canal ${channel}.`, 'success');
    } catch (error: any) {
      onStatus(`Não foi possível aplicar o preset: ${error?.message || 'erro desconhecido'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) { onStatus('Digite um nome para o preset.', 'warn'); return; }
    const preset: MidiPreset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, ...controls };
    setPresets((current) => [preset, ...current]);
    onStatus(`Preset “${name}” salvo neste dispositivo.`, 'success');
  };

  const resetControls = () => {
    setModWheel(DEFAULT_CONTROLS.modWheel); setVolume(DEFAULT_CONTROLS.volume); setExpression(DEFAULT_CONTROLS.expression);
    setPan(DEFAULT_CONTROLS.pan); setSustain(false); setProgram(1); setPitchBend(8192); setPressure(0);
  };

  const panic = async () => {
    if (!isConnected) { onStatus('Conecte um destino MIDI antes de executar o MIDI Panic.', 'warn'); return; }
    setBusy(true);
    try {
      await midiManager.sendPanic([channel]);
      setSustain(false);
      onStatus(`MIDI Panic enviado ao canal ${channel}.`, 'success');
    } catch (error: any) {
      onStatus(`Falha no MIDI Panic: ${error?.message || 'erro desconhecido'}`, 'error');
    } finally { setBusy(false); }
  };

  const slider = (label: string, value: number, setValue: (value: number) => void, onCommit: (value: number) => void, description?: string) => (
    <label className="block rounded-lg border border-slate-800 bg-slate-900/80 p-3">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
        <span>{label}</span><span className="font-mono text-sky-300">{value}</span>
      </span>
      {description && <span className="mt-1 block text-[10px] text-slate-500">{description}</span>}
      <input className="mt-3 w-full accent-sky-500" type="range" min="0" max="127" value={value} onChange={(event) => setValue(Number(event.target.value))} onPointerUp={() => onCommit(value)} onKeyUp={() => onCommit(value)} />
    </label>
  );

  return (
    <section className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-xl border border-slate-800 bg-slate-950 p-3 sm:p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="text-sky-400" size={20} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-sky-300">Controles MIDI</h2>
            <p className="text-[10px] text-slate-500">Mensagens de controle para o canal {channel}</p>
          </div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${isConnected ? 'border-emerald-700 bg-emerald-950 text-emerald-300' : 'border-amber-700 bg-amber-950 text-amber-200'}`}>
          {isConnected ? 'MIDI conectado' : 'Sem conexão MIDI'}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {slider('Modulação • CC1', modWheel, setModWheel, (value) => void sendCC(1, value, 'Modulação'))}
        {slider('Volume • CC7', volume, setVolume, (value) => void sendCC(7, value, 'Volume'))}
        {slider('Expressão • CC11', expression, setExpression, (value) => void sendCC(11, value, 'Expressão'))}
        {slider('Panorama • CC10', pan, setPan, (value) => void sendCC(10, value, 'Panorama'), '0 = esquerda • 64 = centro • 127 = direita')}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Performance</h3>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950 p-3">
            <div><div className="text-xs font-semibold text-slate-200">Sustain • CC64</div><div className="text-[10px] text-slate-500">Mantém as notas enquanto estiver ligado.</div></div>
            <button disabled={busy || !isConnected} onClick={() => { const next = !sustain; setSustain(next); void sendCC(64, next ? 127 : 0, next ? 'Sustain ligado' : 'Sustain desligado'); }} className={`rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-40 ${sustain ? 'border-emerald-500 bg-emerald-700 text-white' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>{sustain ? 'Ligado' : 'Desligado'}</button>
          </div>
          <label className="block text-xs text-slate-300">Program Change <span className="text-slate-500">(1–128)</span>
            <div className="mt-2 flex gap-2">
              <input type="number" min="1" max="128" value={program} onChange={(event) => setProgram(Math.max(1, Math.min(128, Number(event.target.value) || 1)))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-sky-300" />
              <button disabled={busy || !isConnected} onClick={() => void sendAction(() => midiManager.sendProgramChange(channel, program - 1), `Program ${program} enviado • Canal ${channel}`)} className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Enviar</button>
            </div>
          </label>
          {slider('Channel Pressure • Aftertouch', pressure, setPressure, (value) => void sendAction(() => midiManager.sendChannelPressure(channel, value), `Channel Pressure: ${value} • Canal ${channel}`))}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Pitch Bend</h3>
          <div className="rounded-lg bg-slate-950 p-3">
            <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Grave</span><span className="font-mono font-bold text-sky-300">{pitchBend - 8192 > 0 ? '+' : ''}{pitchBend - 8192}</span><span className="text-slate-400">Agudo</span></div>
            <input aria-label="Pitch Bend" className="mt-4 w-full accent-fuchsia-500" type="range" min="0" max="16383" value={pitchBend} onChange={(event) => setPitchBend(Number(event.target.value))} onPointerUp={() => void sendAction(() => midiManager.sendPitchBend(channel, pitchBend), `Pitch Bend enviado • Canal ${channel}`)} onKeyUp={() => void sendAction(() => midiManager.sendPitchBend(channel, pitchBend), `Pitch Bend enviado • Canal ${channel}`)} />
            <button disabled={busy || !isConnected} onClick={() => { setPitchBend(8192); void sendAction(() => midiManager.sendPitchBend(channel, 8192), `Pitch Bend centralizado • Canal ${channel}`); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"><RotateCcw size={14} /> Centralizar Pitch Bend</button>
          </div>
          <button disabled={busy || !isConnected} onClick={() => void panic()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-700 bg-rose-950/80 px-3 py-3 text-xs font-extrabold uppercase tracking-wide text-rose-200 hover:bg-rose-900 disabled:opacity-40"><AlertTriangle size={16} /> MIDI Panic — canal {channel}</button>
          <p className="text-[10px] leading-relaxed text-slate-500">Envia All Notes Off, All Sound Off e Reset All Controllers para o canal selecionado.</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex items-center gap-2"><Save size={16} className="text-emerald-400" /><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Presets de controles</h3></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Nome do preset" value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={40} placeholder="Nome do preset" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100" />
          <button onClick={savePreset} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"><Save size={14} /> Salvar preset</button>
        </div>
        {presets.length === 0 ? <p className="text-[10px] text-slate-500">Nenhum preset salvo neste dispositivo ainda.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => (
              <div key={preset.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">{preset.name}</div><div className="text-[10px] text-slate-500">Program {preset.program} • Mod {preset.modWheel} • Vol {preset.volume}</div></div>
                <button title={`Aplicar ${preset.name}`} disabled={busy || !isConnected} onClick={() => void applyPreset(preset)} className="rounded-md bg-sky-800 p-2 text-sky-100 disabled:opacity-40"><Play size={14} /></button>
                <button title={`Excluir ${preset.name}`} onClick={() => setPresets((current) => current.filter((item) => item.id !== preset.id))} className="rounded-md border border-slate-800 p-2 text-rose-300 hover:bg-rose-950"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
