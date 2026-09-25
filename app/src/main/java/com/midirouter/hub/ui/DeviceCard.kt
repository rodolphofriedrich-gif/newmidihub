package com.midirouter.hub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.midirouter.hub.model.MidiDeviceInfoModel
import com.midirouter.hub.model.PortType

/**
 * DeviceCard (Jetpack Compose Material 3)
 * Card visual informativo para cada instrumento MIDI conectado.
 * Apresenta o nome do hardware, apelido amigável configurado pelo usuário,
 * badge visual de USB OTG ou Bluetooth LE, e listagem detalhada de portas IN e OUT.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceCard(
    device: MidiDeviceInfoModel,
    customAlias: String?,
    onRenameClick: (deviceId: Int, currentName: String) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        ),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Cabeçalho do Card: Ícone de Conexão + Nome + Badge USB/BLE
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                // Ícone indicador USB ou Bluetooth
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(
                            if (device.isBluetooth) Color(0xFF1E88E5).copy(alpha = 0.15f)
                            else Color(0xFF10B981).copy(alpha = 0.15f)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (device.isBluetooth) Icons.Default.Bluetooth else Icons.Default.Usb,
                        contentDescription = if (device.isBluetooth) "Bluetooth MIDI" else "USB OTG MIDI",
                        tint = if (device.isBluetooth) Color(0xFF1E88E5) else Color(0xFF10B981),
                        modifier = Modifier.size(22.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = customAlias ?: device.name,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (customAlias != null && customAlias != device.name) {
                        Text(
                            text = "HW: ${device.name}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        text = "${device.manufacturer} • ID: ${device.id}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }

                // Botão de editar apelido
                IconButton(
                    onClick = { onRenameClick(device.id, customAlias ?: device.name) }
                ) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Renomear porta",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            Spacer(modifier = Modifier.height(12.dp))

            // Seção de Portas IN / OUT
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Portas de Entrada (IN)
                PortSummaryBox(
                    title = "ENTRADA (IN)",
                    count = device.inputPortCount,
                    isInput = true,
                    modifier = Modifier.weight(1f)
                )

                // Portas de Saída (OUT)
                PortSummaryBox(
                    title = "SAÍDA (OUT)",
                    count = device.outputPortCount,
                    isInput = false,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
fun PortSummaryBox(
    title: String,
    count: Int,
    isInput: Boolean,
    modifier: Modifier = Modifier
) {
    val accentColor = if (isInput) Color(0xFF6366F1) else Color(0xFFF59E0B)

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = accentColor.copy(alpha = 0.08f),
        border = androidx.compose.foundation.BorderStroke(1.dp, accentColor.copy(alpha = 0.25f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor
                )
            )
            Surface(
                shape = CircleShape,
                color = accentColor
            ) {
                Text(
                    text = "$count",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    ),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }
    }
}