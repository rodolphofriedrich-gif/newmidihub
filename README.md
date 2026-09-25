# MIDI Router Hub — Android Native 1.1.0

Projeto Android nativo em Kotlin + Jetpack Compose para roteamento MIDI entre dispositivos disponíveis pelo `android.media.midi`.

## O que foi corrigido

- Removida a dependência de `libs.versions.toml` inexistente.
- Corrigidas as dependências e versões do Gradle/Android plugin.
- Criados os modelos MIDI que estavam ausentes.
- Criada a tela `MidiRouterApp` que estava referenciada mas ausente.
- Corrigido o mapeamento de portas: a origem de uma rota usa a `MIDI OUT` do dispositivo e o destino usa a `MIDI IN`.
- Implementada a abertura real de `MidiOutputPort` para receber dados e `MidiInputPort` para enviar dados.
- Corrigido o problema assíncrono de `MidiManager.openDevice()`.
- Persistência passou a guardar também o filtro de Program Change.
- Corrigido o registro dinâmico do receiver USB para Android 14.
- Removidas referências a ícones inexistentes e o filtro USB genérico que poderia tratar qualquer dispositivo de áudio USB como MIDI.
- Adicionado workflow do GitHub Actions para gerar `app-debug.apk`.

## Compilação local

Abra a pasta no Android Studio e deixe o Android Studio sincronizar o projeto.

Requisitos:
- JDK 17
- Android SDK 34
- Android Gradle Plugin 8.2.2
- Gradle 8.2
- Android 8.0 / API 26 ou superior

## GitHub Actions

O workflow `.github/workflows/build-apk.yml` instala Gradle 8.2 e executa:

`gradle :app:assembleDebug`

O APK de debug é publicado como artefato `MIDIRouterHub-debug`.

## Observação importante sobre MIDI no Android

No Android MIDI, a direção das portas é do ponto de vista do próprio dispositivo: para receber dados de um teclado, o aplicativo abre o `OutputPort` do teclado; para enviar dados a um sintetizador, o aplicativo abre o `InputPort` do sintetizador.

Fontes oficiais:
- https://developer.android.com/reference/android/media/midi
- https://developer.android.com/reference/android/media/midi/MidiDevice
