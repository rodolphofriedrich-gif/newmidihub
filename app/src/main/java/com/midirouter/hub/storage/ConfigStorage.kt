package com.midirouter.hub.storage

import android.content.Context
import android.content.SharedPreferences
import com.midirouter.hub.model.MidiRoute
import org.json.JSONArray
import org.json.JSONObject

/**
 * ConfigStorage
 * Responsável pela persistência local offline de:
 * 1. Rotas ativas criadas pelo usuário
 * 2. Apelidos amigáveis atribuídos a portas de instrumentos físicos (ex: "Sintetizador Minilogue")
 */
class ConfigStorage(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("midi_router_hub_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_ROUTES_JSON = "saved_routes_json"
        private const val KEY_ALIASES_JSON = "saved_aliases_json"
    }

    fun saveRoutes(routes: List<MidiRoute>) {
        val jsonArray = JSONArray()
        for (route in routes) {
            val obj = JSONObject().apply {
                put("id", route.id)
                put("name", route.name)
                put("enabled", route.enabled)
                put("sourceDeviceId", route.sourceDeviceId)
                put("sourcePortKey", route.sourcePortKey)
                put("destinationDeviceId", route.destinationDeviceId)
                put("destinationPortKey", route.destinationPortKey)
                put("isOmni", route.rules.isOmni)
                put("transposeSemitones", route.rules.transposeSemitones)
                put("remapTargetChannel", route.rules.remapTargetChannel ?: -1)
                put("allowedChannels", JSONArray(route.rules.allowedChannels))
                put("filterCC", route.rules.filterControlChange)
                put("filterPitchBend", route.rules.filterPitchBend)
                put("filterProgramChange", route.rules.filterProgramChange)
                put("filterClock", route.rules.filterClock)
            }
            jsonArray.put(obj)
        }
        prefs.edit().putString(KEY_ROUTES_JSON, jsonArray.toString()).apply()
    }

    fun loadRoutes(): List<MidiRoute> {
        val raw = prefs.getString(KEY_ROUTES_JSON, null) ?: return emptyList()
        val list = mutableListOf<MidiRoute>()
        try {
            val jsonArray = JSONArray(raw)
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                val allowedJson = obj.optJSONArray("allowedChannels")
                val allowedList = mutableListOf<Int>()
                if (allowedJson != null) {
                    for (j in 0 until allowedJson.length()) {
                        allowedList.add(allowedJson.getInt(j))
                    }
                }

                val remap = obj.optInt("remapTargetChannel", -1)

                val route = MidiRoute(
                    id = obj.getString("id"),
                    name = obj.getString("name"),
                    enabled = obj.getBoolean("enabled"),
                    sourceDeviceId = obj.getString("sourceDeviceId"),
                    sourcePortKey = obj.getString("sourcePortKey"),
                    destinationDeviceId = obj.getString("destinationDeviceId"),
                    destinationPortKey = obj.getString("destinationPortKey"),
                    rules = com.midirouter.hub.model.ChannelRule(
                        isOmni = obj.optBoolean("isOmni", true),
                        allowedChannels = allowedList,
                        remapTargetChannel = if (remap > 0) remap else null,
                        transposeSemitones = obj.optInt("transposeSemitones", 0),
                        filterControlChange = obj.optBoolean("filterCC", false),
                        filterPitchBend = obj.optBoolean("filterPitchBend", false),
                        filterProgramChange = obj.optBoolean("filterProgramChange", false),
                        filterClock = obj.optBoolean("filterClock", false)
                    )
                )
                list.add(route)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    fun saveAliases(aliases: Map<String, String>) {
        val obj = JSONObject(aliases)
        prefs.edit().putString(KEY_ALIASES_JSON, obj.toString()).apply()
    }

    fun loadAliases(): Map<String, String> {
        val raw = prefs.getString(KEY_ALIASES_JSON, null) ?: return emptyMap()
        val map = mutableMapOf<String, String>()
        try {
            val obj = JSONObject(raw)
            val keys = obj.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                map[key] = obj.getString(key)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return map
    }
}