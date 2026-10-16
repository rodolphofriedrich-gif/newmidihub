import React, { useState, useRef, useEffect } from 'react';

interface MidiKeyboardProps {
  isConnected: boolean;
  selectedChannel: number;
  onSelectChannel: (channel: number) => void;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
  onDisabledPress: () => void;
  customWhiteKeyColor: string;
  customBlackKeyColor: string;
}

export function MidiKeyboard({
  isConnected,
  selectedChannel,
  onSelectChannel,
  onNoteOn,
  onNoteOff,
  onDisabledPress,
  customWhiteKeyColor,
  customBlackKeyColor,
}: MidiKeyboardProps) {
  const [startOctave, setStartOctave] = useState<number>(3);
  const [keyWidth, setKeyWidth] = useState<number>(60);
  const [minKeyWidth, setMinKeyWidth] = useState<number>(45);
  const [isScrollLocked, setIsScrollLocked] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mantém o controle das notas realmente pressionadas.
  // Usamos Pointer Events para que mouse, toque e caneta
  // sigam exatamente o mesmo caminho e para garantir que
  // cada Note On tenha um Note Off correspondente.
  // Mapeia nota -> pointerId do dedo/mouse que a pressionou.
  const activeNotesRef = useRef<Map<number, number>>(new Map());

  // Total de teclas brancas exibidas (2 oitavas = 14 teclas brancas)
  const totalWhiteKeys = 14;

  // Calcula dinamicamente a largura mínima para que as teclas ocupem sempre 100% do espaço visível
  useEffect(() => {
    const updateMinSize = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - 10;
        const calculatedMin = Math.floor(availableWidth / totalWhiteKeys);
        setMinKeyWidth(Math.max(35, calculatedMin));
        if (keyWidth < calculatedMin) {
          setKeyWidth(calculatedMin);
        }
      }
    };

    updateMinSize();
    window.addEventListener('resize', updateMinSize);
    return () => window.removeEventListener('resize', updateMinSize);
  }, [keyWidth]);

  // Definição exata das notas por oitava
  const octaveNotes = [
    { semitone: 0, name: 'C', type: 'white', offsetMultiplier: 0 },
    { semitone: 1, name: 'C#', type: 'black', offsetMultiplier: 0.7 },
    { semitone: 2, name: 'D', type: 'white', offsetMultiplier: 1 },
    { semitone: 3, name: 'D#', type: 'black', offsetMultiplier: 1.7 },
    { semitone: 4, name: 'E', type: 'white', offsetMultiplier: 2 },
    { semitone: 5, name: 'F', type: 'white', offsetMultiplier: 3 },
    { semitone: 6, name: 'F#', type: 'black', offsetMultiplier: 3.7 },
    { semitone: 7, name: 'G', type: 'white', offsetMultiplier: 4 },
    { semitone: 8, name: 'G#', type: 'black', offsetMultiplier: 4.7 },
    { semitone: 9, name: 'A', type: 'white', offsetMultiplier: 5 },
    { semitone: 10, name: 'A#', type: 'black', offsetMultiplier: 5.7 },
    { semitone: 11, name: 'B', type: 'white', offsetMultiplier: 6 },
  ];

  // Abordagem simplificada e robusta para renderização em grelha / flex unificado
  const renderKeys = () => {
    let whiteIndex = 0;
    let list = [];

    for (let octave = startOctave; octave <= startOctave + 1; octave++) {
      for (let i = 0; i < octaveNotes.length; i++) {
        const noteDef = octaveNotes[i];
        const midiNote = (octave + 1) * 12 + noteDef.semitone;
        if (midiNote > 127) continue;

        const isWhite = noteDef.type === 'white';

        if (isWhite) {
          const currentWIndex = whiteIndex;
          list.push(
            <div
              key={midiNote}
              onPointerDown={(e) => pressNote(midiNote, e)}
              onPointerUp={(e) => releaseNote(midiNote, e)}
              onPointerCancel={(e) => releaseNote(midiNote, e)}
              className="h-full border border-slate-400 rounded-b-md flex flex-col justify-end pb-2 items-center cursor-pointer transition-[transform,filter,background-color,box-shadow] duration-75 ease-out active:translate-y-[3px] active:brightness-95 active:shadow-inner relative shadow-[0_4px_0_rgba(0,0,0,0.22)] z-10 shrink-0"
              style={{
                width: `${keyWidth}px`,
                backgroundColor: customWhiteKeyColor,
              }}
            >
              <span className="text-[9px] font-bold text-slate-700 select-none">{noteDef.name}{octave}</span>
            </div>
          );
          whiteIndex++;
        } else {
          // Tecla preta sobreposta com largura proporcional (58% da branca) e posicionamento absoluto perfeito
          const blackWidth = keyWidth * 0.58;
          const prevWhiteLeft = (whiteIndex - 1) * keyWidth;
          const absoluteLeft = prevWhiteLeft + (keyWidth - (blackWidth / 2));

          list.push(
            <div
              key={midiNote}
              onPointerDown={(e) => pressNote(midiNote, e)}
              onPointerUp={(e) => releaseNote(midiNote, e)}
              onPointerCancel={(e) => releaseNote(midiNote, e)}
              className="absolute h-[60%] z-30 border border-slate-950 rounded-b-md flex flex-col justify-end pb-1 items-center cursor-pointer transition-[transform,filter,box-shadow] duration-75 ease-out active:translate-y-[2px] active:brightness-125 active:shadow-lg shadow-2xl"
              style={{
                width: `${blackWidth}px`,
                left: `${absoluteLeft}px`,
                backgroundColor: customBlackKeyColor,
              }}
            />
          );
        }
      }
    }
    return list;
  };

  const pressNote = (
    note: number,
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (!isConnected) {
      onDisabledPress();
      return;
    }

    // Impede Note On duplicado para o mesmo ponteiro/nota.
    if (activeNotesRef.current.has(note)) {
      return;
    }

    activeNotesRef.current.set(note, event.pointerId);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Alguns WebViews podem não disponibilizar pointer capture.
    }

    // Não aguardamos aqui: a fila do midiService garante a ordem
    // Note On -> Note Off mesmo em toques muito rápidos.
    void onNoteOn(note);
  };

  const releaseNote = (
    note: number,
    event?: React.PointerEvent<HTMLDivElement>
  ) => {
    event?.preventDefault();

    if (!activeNotesRef.current.has(note)) {
      return;
    }

    activeNotesRef.current.delete(note);

    if (event) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignora diferenças de suporte do WebView.
      }
    }

    void onNoteOff(note);
  };

  // Se o aplicativo perder foco, libera imediatamente todas as notas
  // que ainda estiverem marcadas como pressionadas. Isso evita notas
  // presas ao abrir uma notificação, trocar de aplicativo ou bloquear a tela.
  useEffect(() => {
    const releaseAllNotes = () => {
      const notes = Array.from(activeNotesRef.current.keys());
      activeNotesRef.current.clear();

      for (const note of notes) {
        void onNoteOff(note);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        releaseAllNotes();
      }
    };

    const releaseByPointer = (event: PointerEvent) => {
      for (const [note, pointerId] of Array.from(activeNotesRef.current.entries())) {
        if (pointerId === event.pointerId) {
          activeNotesRef.current.delete(note);
          void onNoteOff(note);
        }
      }
    };

    window.addEventListener('blur', releaseAllNotes);
    window.addEventListener('pointerup', releaseByPointer);
    window.addEventListener('pointercancel', releaseByPointer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', releaseAllNotes);
      window.removeEventListener('pointerup', releaseByPointer);
      window.removeEventListener('pointercancel', releaseByPointer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Garante que nenhuma nota permaneça presa ao desmontar o teclado.
      releaseAllNotes();
    };
  }, [onNoteOff]);

  return (
    <div className="flex-1 w-full flex flex-col bg-slate-900 rounded-xl border border-slate-800 p-2 gap-2 select-none overflow-hidden shadow-xl">
      
      {/* BARRA SUPERIOR DO TECLADO */}
      <div className="flex flex-wrap items-center justify-between bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Oitavas:</span>
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-md overflow-hidden">
              <button
                onClick={() => setStartOctave(Math.max(1, startOctave - 1))}
                className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 font-bold transition"
              >
                -
              </button>
              <span className="px-2 text-xs font-mono text-sky-400 font-bold">
                C{startOctave} - C{startOctave + 2}
              </span>
              <button
                onClick={() => setStartOctave(Math.min(6, startOctave + 1))}
                className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 font-bold transition"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Canal:</span>
            <select
              value={selectedChannel}
              onChange={(e) => onSelectChannel(Number(e.target.value))}
              className="bg-transparent text-xs text-sky-300 font-bold outline-none cursor-pointer"
            >
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Zoom:</span>
            <input
              type="range"
              min={minKeyWidth}
              max="95"
              value={keyWidth}
              onChange={(e) => setKeyWidth(Number(e.target.value))}
              className="w-20 accent-sky-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          <button
            onClick={() => setIsScrollLocked(!isScrollLocked)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition flex items-center gap-1 ${
              isScrollLocked
                ? 'bg-amber-950/80 border-amber-600 text-amber-200'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {isScrollLocked ? '🔒 Bloqueado' : '🔓 Rolagem Livre'}
          </button>
        </div>
      </div>

      {/* ÁREA DO TECLADO COM PREENCHIMENTO TOTAL E TECLAS PRETAS PROPORCIONAIS */}
      <div 
        ref={containerRef}
        className={`flex-1 w-full bg-slate-950 rounded-lg border border-slate-800 relative flex custom-scrollbar p-1 ${
          isScrollLocked ? 'overflow-x-hidden justify-center' : 'overflow-x-auto'
        }`}
      >
        <div className="relative flex h-full items-start w-full">
          {renderKeys()}
        </div>
      </div>

    </div>
  );
}
