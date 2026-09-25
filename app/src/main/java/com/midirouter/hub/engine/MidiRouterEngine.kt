package com.midirouter.hub.engine

import android.media.midi.MidiInputPort
import android.media.midi.MidiReceiver
import android.util.Log
import com.midirouter.hub.model.ChannelRule
import com.midirouter.hub.model.MidiPacketLog
import com.midirouter.hub.model.MidiRoute
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class MidiRouterEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default)
) {
    companion object { private const val TAG = "MidiRouterEngine" }

    private val activeRoutes = CopyOnWriteArrayList<MidiRoute>()
    private val openOutputPorts = ConcurrentHashMap<String, MidiInputPort>()

    private val _packetStream = MutableSharedFlow<MidiPacketLog>(
        replay = 0, extraBufferCapacity = 128
    )
    val packetStream: SharedFlow<MidiPacketLog> = _packetStream.asSharedFlow()

    fun updateRoutes(routes: List<MidiRoute>) {
        activeRoutes.clear()
        activeRoutes.addAll(routes.filter { it.enabled })
        Log.d(TAG, "Rotas ativas: ${activeRoutes.size}")
    }

    fun registerOutputPort(portKey: String, outputPort: MidiInputPort) {
        openOutputPorts.put(portKey, outputPort)?.close()
        Log.d(TAG, "Destino MIDI aberto: $portKey")
    }

    fun unregisterOutputPort(portKey: String) {
        try { openOutputPorts.remove(portKey)?.close() }
        catch (e: IOException) { Log.e(TAG, "Erro ao fechar $portKey", e) }
    }

    fun createReceiverForInput(sourceDeviceId: String, sourcePortKey: String): MidiReceiver =
        object : MidiReceiver() {
            override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
                if (count <= 0 || offset < 0 || offset + count > msg.size) return
                processPacket(
                    sourceDeviceId,
                    sourcePortKey,
                    msg.copyOfRange(offset, offset + count),
                    timestamp
                )
            }
        }

    private fun processPacket(
        sourceDeviceId: String,
        inputPortKey: String,
        bytes: ByteArray,
        timestamp: Long
    ) {
        if (bytes.isEmpty()) return

        val statusByte = bytes[0].toInt() and 0xFF
        val isChannelMessage = statusByte in 0x80..0xEF
        val command = statusByte and 0xF0
        val channel = if (isChannelMessage) (statusByte and 0x0F) + 1 else null
        val data1 = if (bytes.size > 1) bytes[1].toInt() and 0x7F else 0
        val data2 = if (bytes.size > 2) bytes[2].toInt() and 0x7F else 0

        var forwarded = false
        activeRoutes.asSequence()
            .filter { it.sourceDeviceId == sourceDeviceId && it.sourcePortKey == inputPortKey }
            .forEach { route ->
                val processed = applyRouteRules(bytes, route.rules, command, channel, data1)
                val destination = processed?.let { openOutputPorts[route.destinationPortKey] }
                if (processed != null && destination != null) {
                    try {
                        destination.send(processed, 0, processed.size, timestamp)
                        forwarded = true
                    } catch (e: IOException) {
                        Log.e(TAG, "Falha no envio para ${route.destinationPortKey}", e)
                    }
                }
            }

        val hex = bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
        scope.launch {
            _packetStream.tryEmit(
                MidiPacketLog(
                    timestamp = System.currentTimeMillis(),
                    sourceDevice = sourceDeviceId,
                    channel = channel,
                    statusType = getStatusDescription(command, statusByte),
                    data1 = data1,
                    data2 = data2,
                    rawHex = hex,
                    forwarded = forwarded
                )
            )
        }
    }

    private fun applyRouteRules(
        original: ByteArray,
        rules: ChannelRule,
        command: Int,
        channel: Int?,
        data1: Int
    ): ByteArray? {
        if (command == 0xB0 && rules.filterControlChange) return null
        if (command == 0xE0 && rules.filterPitchBend) return null
        if (command == 0xC0 && rules.filterProgramChange) return null
        if ((original[0].toInt() and 0xFF) == 0xF8 && rules.filterClock) return null

        if (channel != null && !rules.isOmni && channel !in rules.allowedChannels) return null

        val output = original.clone()
        if (channel != null && rules.remapTargetChannel != null) {
            val target = (rules.remapTargetChannel - 1).coerceIn(0, 15)
            output[0] = ((command and 0xF0) or target).toByte()
        }
        if ((command == 0x90 || command == 0x80) && output.size > 1 && rules.transposeSemitones != 0) {
            output[1] = (data1 + rules.transposeSemitones).coerceIn(0, 127).toByte()
        }
        return output
    }

    private fun getStatusDescription(command: Int, status: Int): String = when (command) {
        0x80 -> "Note Off"
        0x90 -> "Note On"
        0xA0 -> "Poly Aftertouch"
        0xB0 -> "Control Change"
        0xC0 -> "Program Change"
        0xD0 -> "Channel Aftertouch"
        0xE0 -> "Pitch Bend"
        else -> when (status) {
            0xF8 -> "Clock Pulse"
            0xF0 -> "SysEx Start"
            0xF7 -> "SysEx End"
            else -> "Status 0x%02X".format(status)
        }
    }

    fun unregisterDevicePorts(deviceId: String) {
        openOutputPorts.keys
            .filter { it.startsWith("${deviceId}_") }
            .forEach { unregisterOutputPort(it) }
    }

    fun release() {
        openOutputPorts.values.forEach { runCatching { it.close() } }
        openOutputPorts.clear()
        activeRoutes.clear()
    }
}
