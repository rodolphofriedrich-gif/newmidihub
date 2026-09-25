package com.midirouter.hub.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Brightness4
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.midirouter.hub.model.ChannelRule
import com.midirouter.hub.model.MidiDeviceInfoModel
import com.midirouter.hub.model.MidiPortModel
import com.midirouter.hub.model.PortType
import com.midirouter.hub.model.MidiRoute
import com.midirouter.hub.viewmodel.MidiViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MidiRouterApp(viewModel: MidiViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showCreate by remember { mutableStateOf(false) }
    var deviceToRename by remember { mutableStateOf<MidiDeviceInfoModel?>(null) }

    Scaffold(
        topBar = { 
            TopAppBar(
                title = { Text("MIDI Router Hub") },
                actions = {
                    IconButton(onClick = { viewModel.cycleColorPalette() }) {
                        Icon(Icons.Default.Palette, contentDescription = "Mudar Cor")
                    }
                    IconButton(onClick = { viewModel.toggleTheme() }) {
                        Icon(Icons.Default.Brightness4, contentDescription = "Mudar Tema")
                    }
                }
            ) 
        },
        floatingActionButton = {
            androidx.compose.material3.FloatingActionButton(
                onClick = { 
                    viewModel.refreshDevices() // Força atualização ao clicar no botão +
                    showCreate = true 
                }
            ) {
                Icon(Icons.Default.Add, contentDescription = "Criar conexão")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            item {
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Dispositivos MIDI", style = MaterialTheme.typography.titleLarge)
                    TextButton(onClick = viewModel::refreshDevices) { Text("Atualizar") }
                }
                if (state.isScanning) LinearProgressIndicator(Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
            }

            items(state.devices, key = { it.id }) { device ->
                DeviceCard(
                    device = device,
                    customAlias = state.portAliases[device.id.toString()],
                    onRenameClick = { _, _ -> 
                        deviceToRename = device // Abre a janela de renomear
                    }
                )
            }

            item {
                Spacer(Modifier.height(24.dp))
                Text("Conexões", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                if (state.routes.isEmpty()) {
                    Text("Nenhuma conexão criada.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            items(state.routes, key = { it.id }) { route ->
                RouteRow(
                    route = route,
                    onToggle = { viewModel.toggleRoute(route.id) },
                    onDelete = { viewModel.deleteRoute(route.id) } 
                )
            }

            item {
                Spacer(Modifier.height(88.dp)) 
            }
        }
    }

    // Janela de Renomear Dispositivo
    if (deviceToRename != null) {
        val currentAlias = state.portAliases[deviceToRename!!.id.toString()] ?: deviceToRename!!.name
        var newAlias by remember { mutableStateOf(currentAlias) }

        AlertDialog(
            onDismissRequest = { deviceToRename = null },
            title = { Text("Renomear Dispositivo") },
            text = {
                OutlinedTextField(
                    value = newAlias,
                    onValueChange = { newAlias = it },
                    label = { Text("Nome personalizado") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.renamePortOrDevice(deviceToRename!!.id.toString(), newAlias)
                    deviceToRename = null
                }) { Text("Salvar") }
            },
            dismissButton = {
                TextButton(onClick = { deviceToRename = null }) { Text("Cancelar") }
            }
        )
    }

    // Janela de Criar Conexão (Atualizada para reagir a mudanças)
    if (showCreate) {
        CreateRouteDialog(
            devices = state.devices,
            onDismiss = { showCreate = false },
            onCreate = { source, destination ->
                viewModel.createRoute(
                    sourceDeviceId = source.first,
                    sourcePortKey = source.second.portKey,
                    destinationDeviceId = destination.first,
                    destinationPortKey = destination.second.portKey,
                    channelRule = ChannelRule()
                )
                showCreate = false
            }
        )
    }
}

@Composable
private fun RouteRow(route: MidiRoute, onToggle: () -> Unit, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(route.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${route.sourceDeviceId}:${route.sourcePortKey} → ${route.destinationDeviceId}:${route.destinationPortKey}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Switch(
                checked = route.enabled, 
                onCheckedChange = { onToggle() },
                modifier = Modifier.padding(end = 8.dp)
            )
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Default.Delete, 
                    contentDescription = "Excluir conexão",
                    tint = MaterialTheme.colorScheme.error 
                )
            }
        }
    }
}

@Composable
private fun CreateRouteDialog(
    devices: List<MidiDeviceInfoModel>,
    onDismiss: () -> Unit,
    onCreate: (Pair<String, MidiPortModel>, Pair<String, MidiPortModel>) -> Unit
) {
    // A chave "devices" faz a lista se recarregar sempre que a varredura detectar algo novo
    val sources = remember(devices) { devices.flatMap { d -> d.ports.filter { it.type == PortType.OUT }.map { d.id.toString() to it } } }
    val destinations = remember(devices) { devices.flatMap { d -> d.ports.filter { it.type == PortType.IN }.map { d.id.toString() to it } } }
    
    var source by remember(sources) { mutableStateOf(sources.firstOrNull()) }
    var destination by remember(destinations) { mutableStateOf(destinations.firstOrNull()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Criar conexão MIDI") },
        text = {
            Column {
                EndpointPicker("Origem (MIDI OUT)", sources, source) { source = it }
                Spacer(Modifier.height(10.dp))
                EndpointPicker("Destino (MIDI IN)", destinations, destination) { destination = it }
                if (sources.isEmpty() || destinations.isEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Conecte e ligue pelo menos um dispositivo de entrada (OUT) e um de saída (IN).",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = source != null && destination != null,
                onClick = { onCreate(source!!, destination!!) }
            ) { Text("Criar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}

@Composable
private fun EndpointPicker(
    label: String,
    options: List<Pair<String, MidiPortModel>>,
    selected: Pair<String, MidiPortModel>?,
    onSelected: (Pair<String, MidiPortModel>) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Button(onClick = { expanded = true }, enabled = options.isNotEmpty()) {
            Text(selected?.let { "Dispositivo ${it.first} • ${it.second.name}" } ?: "Nenhuma porta disponível")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text("Dispositivo ${option.first} • ${option.second.name}") },
                    onClick = {
                        onSelected(option)
                        expanded = false
                    }
                )
            }
        }
    }
}
