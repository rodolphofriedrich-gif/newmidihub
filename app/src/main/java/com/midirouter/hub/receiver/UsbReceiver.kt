package com.midirouter.hub.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log
import android.os.Build

/**
 * UsbReceiver
 * Escuta eventos do sistema operacional Android para plugar/desplugar físico de dispositivos USB.
 * Dispara callbacks imediatos para a ViewModel atualizar a topologia de dispositivos sem necessidade de refresh manual.
 */
class UsbReceiver(
    private val onDeviceAttached: (UsbDevice) -> Unit,
    private val onDeviceDetached: (UsbDevice) -> Unit
) : BroadcastReceiver() {

    companion object {
        private const val TAG = "UsbReceiver"

        fun createIntentFilter(): IntentFilter {
            return IntentFilter().apply {
                addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
                addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val device: UsbDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            }

        if (device == null) {
            Log.w(TAG, "Evento USB recebido sem objeto UsbDevice.")
            return
        }

        when (action) {
            UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                Log.i(TAG, "Dispositivo USB Conectado: ${device.deviceName} (VID: ${device.vendorId}, PID: ${device.productId})")
                onDeviceAttached(device)
            }

            UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                Log.i(TAG, "Dispositivo USB Desconectado: ${device.deviceName}")
                onDeviceDetached(device)
            }
        }
    }
}