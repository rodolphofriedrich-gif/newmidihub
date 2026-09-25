package com.midirouter.hub.midi

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.midirouter.hub.engine.MidiRouterEngine
import com.midirouter.hub.model.MidiDeviceInfoModel
import com.midirouter.hub.model.MidiPortModel
import com.midirouter.hub.model.MidiRoute
import com.midirouter.hub.model.PortType
import java.util.concurrent.ConcurrentHashMap

class MidiDeviceManager(
    context: Context,
    private val engine: MidiRouterEngine,
    private val onDeviceListChanged: () -> Unit
) {
    companion object { private const val TAG = "MidiDeviceManager" }

    private val midiManager = context.getSystemService(Context.MIDI_SERVICE) as MidiManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val openedDevices = ConcurrentHashMap<Int, MidiDevice>()
    private val sourcePorts = ConcurrentHashMap<String, MidiOutputPort>()
    private val destinationPorts = ConcurrentHashMap<String, android.media.midi.MidiInputPort>()
    @Volatile private var currentRoutes: List<MidiRoute> = emptyList()

    private val deviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) {
            onDeviceListChanged()
        }

        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            closeDevice(device.id)
            onDeviceListChanged()
        }

        override fun onDeviceStatusChanged(status: android.media.midi.MidiDeviceStatus) {
            onDeviceListChanged()
        }
    }

    init {
        midiManager.registerDeviceCallback(deviceCallback, mainHandler)
    }

    fun scanDevices(): List<MidiDeviceInfoModel> =
        midiManager.devices.map { info ->
            val props = info.properties
            val name = props.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: props.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: "Dispositivo MIDI #${info.id}"
            val manufacturer = props.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: "Genérico"
            val ports = buildList {
                repeat(info.inputPortCount) { i ->
                    add(MidiPortModel(i, PortType.IN, "MIDI IN ${i + 1}", "${info.id}_in_$i"))
                }
                repeat(info.outputPortCount) { i ->
                    add(MidiPortModel(i, PortType.OUT, "MIDI OUT ${i + 1}", "${info.id}_out_$i"))
                }
            }
            MidiDeviceInfoModel(
                id = info.id,
                name = name,
                manufacturer = manufacturer,
                isBluetooth = info.type == MidiDeviceInfo.TYPE_BLUETOOTH,
                inputPortCount = info.inputPortCount,
                outputPortCount = info.outputPortCount,
                ports = ports
            )
        }

    fun syncRoutes(routes: List<MidiRoute>) {
        currentRoutes = routes.filter { it.enabled }
        val neededDeviceIds = currentRoutes
            .flatMap { listOf(it.sourceDeviceId.toIntOrNull(), it.destinationDeviceId.toIntOrNull()) }
            .filterNotNull()
            .toSet()

        midiManager.devices.forEach { info ->
            if (info.id in neededDeviceIds) {
                if (openedDevices.containsKey(info.id)) connectRoutesForDevice(info.id)
                else openDevice(info)
            }
        }
    }

    private fun connectRoutesForDevice(deviceId: Int) {
        currentRoutes
            .filter { it.sourceDeviceId.toIntOrNull() == deviceId }
            .forEach { route ->
                route.sourcePortKey.substringAfterLast("_").toIntOrNull()?.let {
                    openSourcePort(deviceId, it)
                }
            }
        currentRoutes
            .filter { it.destinationDeviceId.toIntOrNull() == deviceId }
            .forEach { route ->
                route.destinationPortKey.substringAfterLast("_").toIntOrNull()?.let {
                    openDestinationPort(deviceId, it)
                }
            }
    }

    private fun openDevice(info: MidiDeviceInfo) {
        if (openedDevices.containsKey(info.id)) return
        midiManager.openDevice(info, { device ->
            if (device != null) {
                openedDevices[info.id] = device
                connectRoutesForDevice(info.id)
            }
        }, mainHandler)
    }

    private fun openSourcePort(deviceId: Int?, portIndex: Int) {
        if (deviceId == null) return
        val key = "${deviceId}_out_$portIndex"
        if (sourcePorts.containsKey(key)) return
        val device = openedDevices[deviceId] ?: return
        try {
            val port = device.openOutputPort(portIndex) ?: return
            sourcePorts[key] = port
            val receiver = engine.createReceiverForInput(deviceId.toString(), "${deviceId}_out_$portIndex")
            port.connect(receiver)
            Log.d(TAG, "Origem MIDI conectada: $key")
        } catch (e: Exception) {
            Log.e(TAG, "Erro abrindo origem $key", e)
        }
    }

    private fun openDestinationPort(deviceId: Int?, portIndex: Int) {
        if (deviceId == null) return
        val key = "${deviceId}_in_$portIndex"
        if (destinationPorts.containsKey(key)) return
        val device = openedDevices[deviceId] ?: return
        try {
            val port = device.openInputPort(portIndex) ?: return
            destinationPorts[key] = port
            engine.registerOutputPort(key, port)
            Log.d(TAG, "Destino MIDI conectado: $key")
        } catch (e: Exception) {
            Log.e(TAG, "Erro abrindo destino $key", e)
        }
    }


    private fun closeDevice(id: Int) {
        sourcePorts.entries.removeIf {
            if (it.key.startsWith("${id}_")) {
                runCatching { it.value.close() }
                true
            } else false
        }
        destinationPorts.entries.removeIf {
            if (it.key.startsWith("${id}_")) {
                runCatching { it.value.close() }
                true
            } else false
        }
        engine.unregisterDevicePorts(id.toString())
        runCatching { openedDevices.remove(id)?.close() }
    }

    fun closeAll() {
        midiManager.unregisterDeviceCallback(deviceCallback)
        sourcePorts.values.forEach { runCatching { it.close() } }
        sourcePorts.clear()
        destinationPorts.values.forEach { runCatching { it.close() } }
        destinationPorts.clear()
        openedDevices.values.forEach { runCatching { it.close() } }
        openedDevices.clear()
    }
}
