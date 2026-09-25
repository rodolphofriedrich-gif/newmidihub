package com.midirouter.hub.viewmodel

import android.app.Application
import android.hardware.usb.UsbDevice
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.midirouter.hub.engine.MidiRouterEngine
import com.midirouter.hub.midi.MidiDeviceManager
import com.midirouter.hub.model.ChannelRule
import com.midirouter.hub.model.MidiDeviceInfoModel
import com.midirouter.hub.model.MidiPacketLog
import com.midirouter.hub.model.MidiRoute
import com.midirouter.hub.receiver.UsbReceiver
import com.midirouter.hub.storage.ConfigStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

data class MidiHubUiState(
    val devices: List<MidiDeviceInfoModel> = emptyList(),
    val routes: List<MidiRoute> = emptyList(),
    val portAliases: Map<String, String> = emptyMap(),
    val recentPackets: List<MidiPacketLog> = emptyList(),
    val isScanning: Boolean = false,
    val totalRoutedPackets: Long = 0,
    val isDarkMode: Boolean = true
)

class MidiViewModel(application: Application) : AndroidViewModel(application) {
    private val storage = ConfigStorage(application)
    val routerEngine = MidiRouterEngine(viewModelScope)
    
    private val _uiState = MutableStateFlow(MidiHubUiState())
    val uiState: StateFlow<MidiHubUiState> = _uiState.asStateFlow()
    
    private val deviceManager = MidiDeviceManager(application) { refreshDevices() }

    val usbReceiver = UsbReceiver(
        onDeviceAttached = { device -> handleUsbAttached(device) },
        onDeviceDetached = { device -> handleUsbDetached(device) }
    )

    init {
        loadSavedConfiguration()
        refreshDevices()
        observeMidiPackets()
    }

    fun toggleTheme() {
        _uiState.update { it.copy(isDarkMode = !it.isDarkMode) }
    }

    private fun loadSavedConfiguration() {
        viewModelScope.launch(Dispatchers.IO) {
            val savedRoutes = storage.loadRoutes()
            val savedAliases = storage.loadAliases()
            _uiState.update { current ->
                current.copy(
                    routes = savedRoutes,
                    portAliases = savedAliases
                )
            }
            routerEngine.updateRoutes(savedRoutes)
        }
    }

    fun refreshDevices() {
        viewModelScope.launch(Dispatchers.Default) {
            _uiState.update { it.copy(isScanning = true) }
            val currentDevices = deviceManager.scanDevices()
            _uiState.update { it.copy(devices = currentDevices, isScanning = false) }
        }
    }

    private fun handleUsbAttached(device: UsbDevice) { refreshDevices() }
    private fun handleUsbDetached(device: UsbDevice) { refreshDevices() }

    private fun observeMidiPackets() {
        viewModelScope.launch {
            routerEngine.packetStream.collect { log ->
                _uiState.update { current ->
                    val updatedList = (listOf(log) + current.recentPackets).take(50)
                    val newCount = if (log.forwarded) current.totalRoutedPackets + 1 else current.totalRoutedPackets
                    current.copy(
                        recentPackets = updatedList,
                        totalRoutedPackets = newCount
                    )
                }
            }
        }
    }

    fun createRoute(
        sourceDeviceId: String, sourcePortKey: String,
        destinationDeviceId: String, destinationPortKey: String,
        channelRule: ChannelRule
    ) {
        val newRoute = MidiRoute(
            id = UUID.randomUUID().toString(),
            name = "Rota ${_uiState.value.routes.size + 1}",
            enabled = true,
            sourceDeviceId = sourceDeviceId, sourcePortKey = sourcePortKey,
            destinationDeviceId = destinationDeviceId, destinationPortKey = destinationPortKey,
            rules = channelRule
        )
        val updated = _uiState.value.routes + newRoute
        _uiState.update { it.copy(routes = updated) }
        routerEngine.updateRoutes(updated)
        storage.saveRoutes(updated)
    }

    fun toggleRoute(routeId: String) {
        val updated = _uiState.value.routes.map {
            if (it.id == routeId) it.copy(enabled = !it.enabled) else it
        }
        _uiState.update { it.copy(routes = updated) }
        routerEngine.updateRoutes(updated)
        storage.saveRoutes(updated)
    }

    fun deleteRoute(routeId: String) {
        val updated = _uiState.value.routes.filterNot { it.id == routeId }
        _uiState.update { it.copy(routes = updated) }
        routerEngine.updateRoutes(updated)
        storage.saveRoutes(updated)
    }

    fun renamePortOrDevice(key: String, alias: String) {
        val updatedAliases = _uiState.value.portAliases + (key to alias)
        _uiState.update { it.copy(portAliases = updatedAliases) }
        storage.saveAliases(updatedAliases)
    }

    override fun onCleared() {
        super.onCleared()
        deviceManager.closeAll()
        routerEngine.release()
    }
}
