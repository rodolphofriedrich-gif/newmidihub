# Registro de correções — Teclado MIDI Bluetooth

## Corrigido

| # | Gravidade | Arquivo | Problema | Correção |
|---|-----------|---------|----------|----------|
| 1 | Alta | `services/midiService.ts` | `sendChannelPressure()` era chamado (tela Controles e Presets) mas **não existia**. O slider de Aftertouch e "aplicar preset" davam `TypeError`; o preset parava no meio. `npm run lint` também falhava. | Método criado. |
| 2 | Alta | `NativeMidiPlugin.java` | Parser BLE MIDI de entrada confundia o byte de **timestamp** com status. Qualquer pacote com 2+ mensagens (acordes, Note On + Note Off) gerava lixo (`A5 80 3C`...). | Parser reescrito conforme a especificação BLE MIDI (testado: 10/10 casos, o original errava 7). |
| 3 | Alta | `NativeMidiPlugin.java` | Saída BLE: o pacote só tinha 1 timestamp; mensagens concatenadas ficavam inválidas. | Encoder gera 1 timestamp por mensagem (e ts antes do F7 em SysEx). |
| 4 | Alta | `NativeMidiPlugin.java` | `startBleServer` tinha vários `return` silenciosos: a Promise **nunca resolvia** (UI travada em "ativando"). | Todos os caminhos agora rejeitam com mensagem clara (`rejectPendingServerCall`). |
| 5 | Média | `NativeMidiPlugin.java` | Publicidade BLE começava após um atraso cego de 300 ms em vez de esperar `onServiceAdded`. | Começa em `onServiceAdded`; o atraso virou apenas rede de segurança (3 s). |
| 6 | Média | `NativeMidiPlugin.java` | `bleClients` (HashSet) acessado por 2 threads → risco de `ConcurrentModificationException`; portas MIDI zeradas por outra thread → NPE no `send`. | Coleções thread-safe, campos `volatile`, métodos de abrir/fechar `synchronized`, cópia local da porta no `send`. |
| 7 | Média | `NativeMidiPlugin.java` | Se a busca BLE falhava, o timer ainda rodava e chamava `resolve` numa chamada já rejeitada. | Guarda `AtomicBoolean` + cancelamento do timer. |
| 8 | Alta | `midiService.ts` | **Nota presa**: o Note Off recalculava canal/transpose no momento de soltar. Trocar canal ou Transpose com tecla pressionada deixava a nota tocando. | Guarda canal+nota enviados no Note On e repete no Note Off. |
| 9 | Alta | `midiService.ts` | Cada mensagem MIDI recebida disparava `onStateChange` → `getDevices()` no Android. Com MIDI Clock (24/beat) = dezenas de chamadas/s. | Removido. |
| 10 | Média | `midiService.ts` | RX só registrava a 1ª mensagem de cada buffer. | `splitMidiMessages()` separa todas. |
| 11 | Média | `midiService.ts` | Dispositivo BLE conectado pela busca nunca recebia `nativeId`: se fosse desligado, o app continuava "conectado". Item da lista também não ficava verde. | Guarda o ID nativo devolvido pelo Android. |
| 12 | Baixa | `midiService.ts`/`App.tsx` | Aviso "desconectado" duplicado (e flag do servidor BLE zerada por engano) ao desconectar pelo próprio app / trocar de destino. | `disconnect(silent)`. |
| 13 | Baixa | `midiService.ts` | `devicesChanged` assíncrono sem `try/catch` (rejeição não tratada). | Tratado. |
| 14 | Média | `App.tsx` | Dedupe por **nome** fundia dois USB de mesmo nome (ex.: 2× "USB MIDI Interface"): só um aparecia. | Dedupe por nome só para BLE; demais por `id`. |
| 15 | Média | `MidiRouterScreen.tsx` | Lista de saídas filtrava por `outputPortCount`, escondendo módulos de som que só **recebem** MIDI. | Filtra por `inputPortCount`. |
| 16 | Média | `MidiKeyboard.tsx` | Se o `pointerup` não chegasse na tecla (WebView sem pointer capture), a nota ficava presa. | Notas rastreadas por `pointerId` + `pointerup/cancel` global de segurança. |
| 17 | Baixa | `MidiKeyboard.tsx` | Classes `overflow-x-auto` e `overflow-x-hidden` aplicadas juntas; função `buildKeyboardStructure` morta. | Classes exclusivas; código morto removido. |
| 18 | Baixa | `App.tsx` | Velocity inválida no `localStorage` virava `NaN` → Note On com velocity 0 (= silêncio). | Validação 1–127. |

## Removido (limpeza)

- `Yaml` (workflow inválido) e `github/workflows/` (sem ponto, nunca executava). Só `.github/workflows/main.yml` permanece.
- `.env.example` e `metadata.json` (restos do template AI Studio / Gemini).
- 8 componentes sem uso: `PWAInstallButton`, `BleButton`, `BleVisibilityControl`, `ChannelDropdown`, `ChannelSelector`, `DestinationDropdown`, `DestinationList`, `MidiHubScreen`.
- Dependências sem uso: `@google/genai`, `dotenv`, `express`, `motion`, `autoprefixer`, `tsx`, `esbuild`, `@types/express`. Script `clean` ajustado (apontava para `server.js`) e nome do pacote corrigido.
- `vite.config.ts`: bloco `server` do AI Studio (`DISABLE_HMR`).
- `index.html`: `apple-touch-icon` apontando para `/icon-192.png`, que não existe.
- `midiService.ts`: `sendNoteOn`, `sendNoteOff`, `sendNoteOnCustomVelocity`, `getAvailableDestinationsSync` e as constantes `MIDI_BLE_*_UUID` (ninguém usava).
- `android/app/src/main/assets/public` (build web antigo, regenerado por `npx cap sync`) e os testes de exemplo do template (`ExampleUnitTest`, `ExampleInstrumentedTest`, com pacote errado).

## NÃO corrigido (recomendações)

- **`bun.lock` está desatualizado** em relação ao `package.json`. O CI usa `npm install` e não é afetado; se usar bun, rode `bun install` para regenerar.
- **BLE server: notificações em rajada.** O Android pede esperar `onNotificationSent` entre notificações; sem fila, rajadas (ex.: MIDI Panic) podem perder mensagens. Mudança maior, testar em aparelho.
- **MTU BLE**: pacotes > 20 bytes (SysEx longo) não são fragmentados; SysEx recebido em vários pacotes é descartado.
- **USB: teclados só com porta de saída** (a maioria dos controladores) não aparecem, pois `getDevices` só lista aparelhos com porta de entrada.
- **Segurança (release)**: `webContentsDebuggingEnabled: true` e `allowMixedContent: true` em `capacitor.config.json`.
- **PWA/Service Worker dentro do APK**: desnecessário no Capacitor e pode servir arquivos antigos. Mantido porque o app também roda como PWA/Web MIDI.
- **Android 15/16**: `setSystemUiVisibility` obsoleto; `sensorLandscape` pode ser ignorado em telas grandes com `targetSdk 36`.
- **Segundo plano**: sem Foreground Service, o Android pode encerrar o servidor BLE com o app minimizado.
- **Monitor MIDI** perde o histórico ao trocar de aba.
- `openBluetoothDevice` sem timeout; `sendPanic` faz 48 chamadas sequenciais à ponte.
- `sendRoutedMessage` e os campos Canal IN/OUT do Router não são usados pelo teclado virtual (reservados para entrada externa); mantidos.
