# BL-e Operator

Universal Bluetooth Low Energy (BLE) Hardware Console & Smart Device Controller for Android.

## Key Features
1. **Radar Scanner**: Live BLE peripheral discovery with RSSI signal strength bars, dBm readout, and raw beacon filtering.
2. **Smart Light & Multi-Channel Relay Controller**:
   - Built-in protocol presets for **Generic BLE (HM-10/JDY-08 `FFE0`)**, **ELK-BLEDOM / Lotus Lantern (`FFF0`)**, and **Nordic UART (`6E400001` for ESP32/Arduino)**.
   - 8-Swatch RGB Matrix & 5-Step Brightness Controller.
   - 4-Channel BLE Relay Switchboard (`CH1` - `CH4`).
3. **GATT Explorer & Raw Packet Transmitter**:
   - Automatically enumerates all writable GATT Services & Characteristics upon connecting.
   - Send custom **HEX** or **ASCII** byte payloads with live TX/RX telemetry logging.

## Cloud APK Compilation on GitHub
1. Extract `BL-e-Operator.zip` and upload all files directly to the root of your GitHub repository.
2. Open the **Actions** tab on GitHub and trigger **Build BL-e Operator APK**.
3. Download `BL-e-Operator.apk` from the workflow **Artifacts** or the **Releases** section.
