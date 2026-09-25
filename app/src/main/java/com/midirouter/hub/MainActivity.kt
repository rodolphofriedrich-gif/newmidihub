package com.midirouter.hub

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme // <-- IMPORTANTE: Importar esta função
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme // <-- IMPORTANTE: Importar as cores claras
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import com.midirouter.hub.receiver.UsbReceiver
import com.midirouter.hub.ui.MidiRouterApp
// import com.midirouter.hub.ui.MidiRouterApp
import com.midirouter.hub.viewmodel.MidiViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: MidiViewModel by viewModels()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        viewModel.refreshDevices()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Registrar receptor dinâmico de conexões USB OTG
        ContextCompat.registerReceiver(
            this,
            viewModel.usbReceiver,
            UsbReceiver.createIntentFilter(),
            ContextCompat.RECEIVER_EXPORTED
        )

        // Solicitar permissões de Bluetooth MIDI se necessário no Android 12+ (API 31+)
        checkBluetoothPermissions()

        setContent {
            // 1. Definir as cores do Modo Escuro
            val darkColors = darkColorScheme(
                primary = Color(0xFF6366F1),
                secondary = Color(0xFF10B981),
                background = Color(0xFF09090B),
                surface = Color(0xFF18181B),
                surfaceVariant = Color(0xFF27272A),
                onPrimary = Color.White,
                onBackground = Color(0xFFF4F4F5),
                onSurface = Color(0xFFF4F4F5)
            )

            // 2. Definir as cores do Modo Claro
            val lightColors = lightColorScheme(
                primary = Color(0xFF4F46E5), // Um tom de primary ligeiramente diferente se desejar
                secondary = Color(0xFF059669),
                background = Color(0xFFF9FAFB),
                surface = Color(0xFFFFFFFF),
                surfaceVariant = Color(0xFFE5E7EB),
                onPrimary = Color.White,
                onBackground = Color(0xFF111827),
                onSurface = Color(0xFF111827)
            )

            // 3. Detetar o tema atual do sistema Android
            val isDarkMode = isSystemInDarkTheme()
            val currentColorScheme = if (isDarkMode) darkColors else lightColors

            // 4. Aplicar o esquema de cores correto
            MaterialTheme(colorScheme = darkColors) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MidiRouterApp(viewModel = viewModel)
                }
            }
        }
    }

    private fun checkBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            )
            val needed = permissions.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needed.isNotEmpty()) {
                permissionLauncher.launch(needed.toTypedArray())
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(viewModel.usbReceiver)
        } catch (e: Exception) {
            // Receptor já desregistrado
        }
    }
}