package com.midirouter.hub

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import com.midirouter.hub.receiver.UsbReceiver
import com.midirouter.hub.ui.MidiRouterApp
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
        
        registerReceiver(viewModel.usbReceiver, UsbReceiver.createIntentFilter())
        checkBluetoothPermissions()
        
        setContent {
            val state by viewModel.uiState.collectAsState()
            
            // Define a cor principal com base na escolha do utilizador
            val primaryColor = when (state.colorPaletteIndex) {
                1 -> Color(0xFF1E88E5) // Azul
                2 -> Color(0xFF10B981) // Verde
                else -> Color(0xFF6366F1) // Roxo (Padrão)
            }

            val darkColors = darkColorScheme(
                primary = primaryColor,
                secondary = Color(0xFF10B981),
                background = Color(0xFF09090B),
                surface = Color(0xFF18181B),
                surfaceVariant = Color(0xFF27272A),
                onPrimary = Color.White,
                onBackground = Color(0xFFF4F4F5),
                onSurface = Color(0xFFF4F4F5)
            )

            val lightColors = lightColorScheme(
                primary = primaryColor,
                secondary = Color(0xFF059669),
                background = Color(0xFFF9FAFB),
                surface = Color(0xFFFFFFFF),
                surfaceVariant = Color(0xFFE5E7EB),
                onPrimary = Color.White,
                onBackground = Color(0xFF111827),
                onSurface = Color(0xFF111827)
            )

            val currentColorScheme = if (state.isDarkMode) darkColors else lightColors

            MaterialTheme(colorScheme = currentColorScheme) {
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
        } catch (e: Exception) {}
    }
}
