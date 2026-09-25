package com.midirouter.hub.model

data class MidiDeviceInfoModel(
    val id: Int,
    val name: String,
    val manufacturer: String,
    val isBluetooth: Boolean,
    val inputPortCount: Int,
    val outputPortCount: Int,
    val ports: List<MidiPortModel>
)

enum class PortType { IN, OUT }

data class MidiPortModel(
    val portIndex: Int,
    val type: PortType,
    val name: String,
    val portKey: String
)

data class ChannelRule(
    val isOmni: Boolean = true,
    val allowedChannels: List<Int> = (1..16).toList(),
    val remapTargetChannel: Int? = null,
    val transposeSemitones: Int = 0,
    val filterControlChange: Boolean = false,
    val filterPitchBend: Boolean = false,
    val filterProgramChange: Boolean = false,
    val filterClock: Boolean = false
)

data class MidiRoute(
    val id: String,
    val name: String,
    val enabled: Boolean = true,
    val sourceDeviceId: String,
    val sourcePortKey: String,
    val destinationDeviceId: String,
    val destinationPortKey: String,
    val rules: ChannelRule = ChannelRule()
)

data class MidiPacketLog(
    val timestamp: Long,
    val sourceDevice: String,
    val channel: Int?,
    val statusType: String,
    val data1: Int,
    val data2: Int,
    val rawHex: String,
    val forwarded: Boolean
)
