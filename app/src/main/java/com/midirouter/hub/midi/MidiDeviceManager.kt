package com.midirouter.hub.midi

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.midirouter.hub.model.MidiDeviceInfoModel
import com.midirouter.hub.model.MidiPortModel
import com.midirouter.hub.model.PortType
import java.util.concurrent.ConcurrentHashMap

class MidiDeviceManager(
    private val context: Context,
    private val onDeviceListChanged: () -> Unit
) {
    companion object {
        private const val TAG = "MidiDeviceManager"
    }

    private val midiManager = context.getSystemService(Context.MIDI_SERVICE) as MidiManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val openedDevices = ConcurrentHashMap<Int, MidiDevice>()

    private val deviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) {
            Log.d(TAG, "Dispositivo adicionado: ${device.id}")
            onDeviceListChanged()
        }
        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            Log.d(TAG, "Dispositivo removido: ${device.id}")
            openedDevices.remove(device.id)?.close()
            onDeviceListChanged()
        }
        override fun onDeviceStatusChanged(status: android.media.midi.MidiDeviceStatus) {
            onDeviceListChanged()
        }
    }

    init {
        midiManager.registerDeviceCallback(deviceCallback, mainHandler)
    }

    fun scanDevices(): List<MidiDeviceInfoModel> {
        val deviceInfos = midiManager.devices
        val result = mutableListOf<MidiDeviceInfoModel>()

        for (info in deviceInfos) {
            val properties = info.properties
            val name = properties.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: "Dispositivo MIDI #${info.id}"

            val manufacturer = properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: "Genérico"
            val isBluetooth = info.type == MidiDeviceInfo.TYPE_BLUETOOTH
            val ports = mutableListOf<MidiPortModel>()

            for (i in 0 until info.inputPortCount) {
                ports.add(MidiPortModel(portIndex = i, type = PortType.IN, name = "MIDI IN ${i + 1}", portKey = "${info.id}_in_$i"))
            }
            for (i in 0 until info.outputPortCount) {
                ports.add(MidiPortModel(portIndex = i, type = PortType.OUT, name = "MIDI OUT ${i + 1}", portKey = "${info.id}_out_$i"))
            }

            result.add(
                MidiDeviceInfoModel(
                    id = info.id, name = name, manufacturer = manufacturer,
                    isBluetooth = isBluetooth, inputPortCount = info.inputPortCount,
                    outputPortCount = info.outputPortCount, ports = ports
                )
            )
        }
        return result
    }

    fun openDevice(info: MidiDeviceInfo, onOpened: (MidiDevice?) -> Unit) {
        midiManager.openDevice(info, { device ->
            if (device != null) openedDevices[info.id] = device
            onOpened(device)
        }, mainHandler)
    }

    fun closeAll() {
        midiManager.unregisterDeviceCallback(deviceCallback)
        openedDevices.forEach { (_, dev) -> try { dev.close() } catch (e: Exception) {} }
        openedDevices.clear()
    }
}
