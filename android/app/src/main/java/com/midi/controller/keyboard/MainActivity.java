package com.midi.controller.keyboard;



import android.os.Bundle;

import android.view.View;



import com.getcapacitor.BridgeActivity;

import com.midi.controller.keyboard.plugins.NativeMidiPlugin;



public class MainActivity extends BridgeActivity {



    @Override

    public void onCreate(Bundle savedInstanceState) {

        // REGRA DO CAPACITOR: Registrar plugins ANTES do super.onCreate

        registerPlugin(NativeMidiPlugin.class);

        

        super.onCreate(savedInstanceState);

        

        // Aplica o Modo Imersivo logo na inicialização

        hideSystemUI();

    }



    @Override

    public void onResume() {

        super.onResume();

        hideSystemUI();

    }



    @Override

    public void onWindowFocusChanged(boolean hasFocus) {

        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {

            hideSystemUI();

        }

    }



    private void hideSystemUI() {

        // Ativa o Modo Imersivo para tela cheia

        View decorView = getWindow().getDecorView();

        decorView.setSystemUiVisibility(

            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE

            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION

            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN

            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION

            | View.SYSTEM_UI_FLAG_FULLSCREEN

        );

    }

} 

