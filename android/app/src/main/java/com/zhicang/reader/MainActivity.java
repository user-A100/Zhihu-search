package com.zhicang.reader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZhihuSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
