import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Switch,
  SafeAreaView,
  StatusBar,
  Platform,
  PermissionsAndroid,
  ScrollView,
  TextInput
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager();

// Pure JS Base64 Encoder (Hermes-safe without external Buffer dependency)
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes) {
  let result = '';
  let i;
  const l = bytes.length;
  for (i = 2; i < l; i += 3) {
    result += BASE64_CHARS[bytes[i - 2] >> 2];
    result += BASE64_CHARS[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += BASE64_CHARS[((bytes[i - 1] & 0x0f) << 2) | (bytes[i] >> 6)];
    result += BASE64_CHARS[bytes[i] & 0x3f];
  }
  if (i === l + 1) {
    result += BASE64_CHARS[bytes[i - 2] >> 2];
    result += BASE64_CHARS[(bytes[i - 2] & 0x03) << 4];
    result += '==';
  }
  if (i === l) {
    result += BASE64_CHARS[bytes[i - 2] >> 2];
    result += BASE64_CHARS[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += BASE64_CHARS[(bytes[i - 1] & 0x0f) << 2];
    result += '=';
  }
  return result;
}

function hexToBytes(hexStr) {
  const clean = hexStr.replace(/[^0-9A-Fa-f]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substr(i, 2), 16));
  }
  return bytes;
}

function asciiToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// Protocol Presets for Popular BLE Devices
const PROTOCOL_PRESETS = [
  {
    id: 'hm10',
    name: 'Generic BLE / HM-10 / JDY',
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    charUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    powerOn: [0x56, 0xFF, 0xFF, 0xFF, 0x00, 0xF0, 0xAA],
    powerOff: [0x56, 0x00, 0x00, 0x00, 0x00, 0xF0, 0xAA],
    makeRgb: (r, g, b, br) => [
      0x56,
      Math.round((r * br) / 100),
      Math.round((g * br) / 100),
      Math.round((b * br) / 100),
      0x00,
      0xF0,
      0xAA
    ]
  },
  {
    id: 'elkbledom',
    name: 'ELK-BLEDOM / Lotus Lantern',
    serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    charUUID: '0000fff3-0000-1000-8000-00805f9b34fb',
    powerOn: [0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
    powerOff: [0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
    makeRgb: (r, g, b, br) => [
      0x7E,
      0x00,
      0x05,
      0x03,
      Math.round((r * br) / 100),
      Math.round((g * br) / 100),
      Math.round((b * br) / 100),
      0x00,
      0xEF
    ]
  },
  {
    id: 'nus',
    name: 'Nordic UART (ESP32 / Arduino)',
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    charUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    powerOn: asciiToBytes('POWER:ON\n'),
    powerOff: asciiToBytes('POWER:OFF\n'),
    makeRgb: (r, g, b, br) => asciiToBytes(`RGB:${r},${g},${b},${br}\n`)
  }
];

const COLOR_SWATCHES = [
  { label: 'Cyber Cyan', hex: '#00F5D4', r: 0, g: 245, b: 212 },
  { label: 'Hyper Magenta', hex: '#FF2A85', r: 255, g: 42, b: 133 },
  { label: 'Electric Blue', hex: '#3A86FF', r: 58, g: 134, b: 255 },
  { label: 'Matrix Green', hex: '#00F566', r: 0, g: 245, b: 102 },
  { label: 'Solar Amber', hex: '#FFBE0B', r: 255, g: 190, b: 11 },
  { label: 'Ultraviolet', hex: '#8338EC', r: 131, g: 56, b: 236 },
  { label: 'Crimson Pulse', hex: '#FF0033', r: 255, g: 0, b: 51 },
  { label: 'Pure White', hex: '#FFFFFF', r: 255, g: 255, b: 255 }
];

export default function App() {
  // Navigation & Scanner State
  const [activeTab, setActiveTab] = useState('SCANNER'); // SCANNER | CONTROL | GATT
  const [isScanning, setIsScanning] = useState(false);
  const [namedOnly, setNamedOnly] = useState(true);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);

  // Protocol & Discovered GATT State
  const [selectedPreset, setSelectedPreset] = useState(PROTOCOL_PRESETS[0]);
  const [activeServiceUUID, setActiveServiceUUID] = useState(PROTOCOL_PRESETS[0].serviceUUID);
  const [activeCharUUID, setActiveCharUUID] = useState(PROTOCOL_PRESETS[0].charUUID);
  const [discoveredChars, setDiscoveredChars] = useState([]);
  const [writeWithResponse, setWriteWithResponse] = useState(false);

  // Smart Control State
  const [powerState, setPowerState] = useState(false);
  const [brightness, setBrightness] = useState(80);
  const [activeSwatch, setActiveSwatch] = useState(COLOR_SWATCHES[0]);
  const [relays, setRelays] = useState({ 1: false, 2: false, 3: false, 4: false });

  // Custom Terminal State
  const [customPayload, setCustomPayload] = useState('7E 00 04 F0 00 01 FF 00 EF');
  const [payloadFormat, setPayloadFormat] = useState('HEX'); // HEX | ASCII
  const [logs, setLogs] = useState(['[SYSTEM] BL-e Operator v2.0 initialized.']);

  const namedOnlyRef = useRef(namedOnly);
  namedOnlyRef.current = namedOnly;

  const addLog = (msg) => {
    const t = new Date().toLocaleTimeString().split(' ')[0];
    setLogs((prev) => [`[${t}] ${msg}`, ...prev.slice(0, 39)]);
  };

  useEffect(() => {
    requestBlePermissions();
    return () => {
      bleManager.destroy();
    };
  }, []);

  const requestBlePermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        if (Platform.Version >= 31) {
          const result = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ]);
          const granted = Object.values(result).every(
            (status) => status === PermissionsAndroid.RESULTS.GRANTED
          );
          addLog(granted ? 'Android 12+ BLE permissions granted.' : 'Some BLE permissions were denied.');
        } else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          addLog(
            granted === PermissionsAndroid.RESULTS.GRANTED
              ? 'Location permission granted for BLE.'
              : 'Location permission denied.'
          );
        }
      } catch (err) {
        addLog(`Permission error: ${err.message}`);
      }
    }
  };

  const startBleScan = () => {
    bleManager.stopDeviceScan();
    setDevices([]);
    setIsScanning(true);
    addLog('Scanning 2.4GHz BLE spectrum...');

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        addLog(`Scan error: ${error.message}`);
        setIsScanning(false);
        return;
      }
      if (!device) return;
      const displayName = device.name || device.localName;
      if (namedOnlyRef.current && !displayName) return;

      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.id === device.id);
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = device;
          return updated;
        }
        return [...prev, device];
      });
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      addLog('BLE scan cycle finished.');
    }, 8000);
  };

  const stopBleScan = () => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
    addLog('Scan stopped by operator.');
  };

  const connectToPeripheral = async (device) => {
    stopBleScan();
    addLog(`Connecting to ${device.name || device.id}...`);
    try {
      const connected = await bleManager.connectToDevice(device.id, { timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      addLog(`Connected to ${connected.name || connected.id}`);

      // Enumerate all services & writable characteristics
      const services = await connected.services();
      const charList = [];
      for (const s of services) {
        const chars = await connected.characteristicsForService(s.uuid);
        for (const c of chars) {
          if (c.isWritableWithResponse || c.isWritableWithoutResponse || c.isNotifiable) {
            charList.push({
              serviceUUID: s.uuid,
              charUUID: c.uuid,
              writableWithResp: c.isWritableWithResponse,
              writableWithoutResp: c.isWritableWithoutResponse,
              notifiable: c.isNotifiable
            });
          }
        }
      }
      setDiscoveredChars(charList);
      addLog(`Discovered ${charList.length} interactive GATT characteristic(s).`);

      // Automatically select the first writable characteristic if found
      const firstWritable = charList.find((c) => c.writableWithoutResp || c.writableWithResp);
      if (firstWritable) {
        setActiveServiceUUID(firstWritable.serviceUUID);
        setActiveCharUUID(firstWritable.charUUID);
        setWriteWithResponse(!firstWritable.writableWithoutResp && firstWritable.writableWithResp);
        addLog(`Auto-bound TX to characteristic ${firstWritable.charUUID.slice(0, 8)}...`);
      }

      setActiveTab('CONTROL');
    } catch (err) {
      addLog(`Connection failed: ${err.message}`);
    }
  };

  const disconnectPeripheral = async () => {
    if (!connectedDevice) return;
    try {
      await bleManager.cancelDeviceConnection(connectedDevice.id);
      addLog(`Disconnected from ${connectedDevice.name || connectedDevice.id}`);
    } catch (err) {
      addLog(`Disconnect warning: ${err.message}`);
    } finally {
      setConnectedDevice(null);
      setDiscoveredChars([]);
      setActiveTab('SCANNER');
    }
  };

  const transmitBytes = async (byteArray, label) => {
    const hexPreview = bytesToHex(byteArray);
    if (!connectedDevice) {
      addLog(`[SIMULATED TX] ${label} -> ${hexPreview}`);
      return;
    }
    try {
      const base64Payload = bytesToBase64(byteArray);
      if (writeWithResponse) {
        await connectedDevice.writeCharacteristicWithResponseForService(
          activeServiceUUID,
          activeCharUUID,
          base64Payload
        );
      } else {
        await connectedDevice.writeCharacteristicWithoutResponseForService(
          activeServiceUUID,
          activeCharUUID,
          base64Payload
        );
      }
      addLog(`TX (${label}): ${hexPreview}`);
    } catch (err) {
      addLog(`TX Error: ${err.message}`);
    }
  };

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    setActiveServiceUUID(preset.serviceUUID);
    setActiveCharUUID(preset.charUUID);
    addLog(`Switched protocol preset to ${preset.name}`);
  };

  const handleTogglePower = (val) => {
    setPowerState(val);
    const bytes = val ? selectedPreset.powerOn : selectedPreset.powerOff;
    transmitBytes(bytes, val ? 'POWER ON' : 'POWER OFF');
  };

  const handleSelectColor = (swatch) => {
    setActiveSwatch(swatch);
    setPowerState(true);
    const bytes = selectedPreset.makeRgb(swatch.r, swatch.g, swatch.b, brightness);
    transmitBytes(bytes, `COLOR ${swatch.label}`);
  };

  const handleBrightnessStep = (newBr) => {
    const clamped = Math.max(10, Math.min(100, newBr));
    setBrightness(clamped);
    const bytes = selectedPreset.makeRgb(activeSwatch.r, activeSwatch.g, activeSwatch.b, clamped);
    transmitBytes(bytes, `BRIGHTNESS ${clamped}%`);
  };

  const handleToggleRelay = (channel) => {
    const nextState = !relays[channel];
    setRelays((prev) => ({ ...prev, [channel]: nextState }));
    // Standard 4-channel BLE relay byte command: [0xA0, channel, state, checksum]
    const stateByte = nextState ? 0x01 : 0x00;
    const checksum = (0xA0 + channel + stateByte) & 0xFF;
    transmitBytes([0xA0, channel, stateByte, checksum], `RELAY CH${channel} ${nextState ? 'ON' : 'OFF'}`);
  };

  const handleSendCustomPayload = () => {
    if (!customPayload.trim()) return;
    const bytes =
      payloadFormat === 'HEX' ? hexToBytes(customPayload) : asciiToBytes(customPayload);
    if (bytes.length === 0) {
      addLog('Invalid payload format.');
      return;
    }
    transmitBytes(bytes, `CUSTOM ${payloadFormat}`);
  };

  const renderRssiBars = (rssi) => {
    const val = rssi || -90;
    const strength = val > -60 ? 4 : val > -72 ? 3 : val > -84 ? 2 : 1;
    return (
      <View style={styles.rssiBarGroup}>
        {[1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            style={[
              styles.rssiBar,
              { height: bar * 4 + 2 },
              bar <= strength ? styles.rssiBarActive : styles.rssiBarInactive
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070A12" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>BL-e OPERATOR</Text>
          <Text style={styles.brandSubtitle}>UNIVERSAL BLE HARDWARE CONSOLE</Text>
        </View>
        <View
          style={[
            styles.connectionBadge,
            connectedDevice ? styles.badgeOnline : styles.badgeOffline
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connectedDevice ? '#00F5D4' : '#F43F5E' }
            ]}
          />
          <Text style={styles.badgeText}>
            {connectedDevice ? 'LINKED' : 'STANDBY'}
          </Text>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: 'SCANNER', label: '1. RADAR SCAN' },
          { id: 'CONTROL', label: '2. CONTROLLER' },
          { id: 'GATT', label: '3. GATT & HEX' }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.tabLabelActive
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Connected Device Banner */}
      {connectedDevice && (
        <View style={styles.connectedBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.connectedName}>
              {connectedDevice.name || 'Unnamed BLE Peripheral'}
            </Text>
            <Text style={styles.connectedUuid}>MAC/ID: {connectedDevice.id}</Text>
          </View>
          <TouchableOpacity style={styles.disconnectButton} onPress={disconnectPeripheral}>
            <Text style={styles.disconnectText}>DISCONNECT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TAB 1: BLE RADAR SCANNER */}
      {activeTab === 'SCANNER' && (
        <View style={styles.contentArea}>
          <View style={styles.scannerControlsRow}>
            <TouchableOpacity
              style={[styles.primaryScanBtn, isScanning && styles.primaryScanBtnStop]}
              onPress={isScanning ? stopBleScan : startBleScan}
            >
              <Text style={styles.primaryScanBtnText}>
                {isScanning ? 'STOP RADAR SCAN' : 'START BLE RADAR SCAN'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Hide Unnamed Raw Beacons</Text>
            <Switch
              value={namedOnly}
              onValueChange={setNamedOnly}
              trackColor={{ false: '#1E293B', true: '#00F5D4' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.deviceCard}
                onPress={() => connectToPeripheral(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceTitle}>
                    {item.name || item.localName || 'Unnamed BLE Node'}
                  </Text>
                  <Text style={styles.deviceMac}>{item.id}</Text>
                </View>
                <View style={styles.deviceRight}>
                  {renderRssiBars(item.rssi)}
                  <Text style={styles.rssiValue}>{item.rssi || -85} dBm</Text>
                  <View style={styles.connectPill}>
                    <Text style={styles.connectPillText}>CONNECT</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>
                  {isScanning
                    ? 'Sweeping 2.4 GHz Bluetooth Low Energy channels...'
                    : 'No BLE peripherals listed yet.'}
                </Text>
                <Text style={styles.emptySub}>
                  Tap "START BLE RADAR SCAN" above and make sure Bluetooth & Location are turned on.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 2: SMART LIGHT & RELAY CONTROLLER */}
      {activeTab === 'CONTROL' && (
        <ScrollView style={styles.contentArea} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* Protocol Selector */}
          <Text style={styles.sectionHeader}>PROTOCOL PROFILE</Text>
          <View style={styles.presetRow}>
            {PROTOCOL_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetChip,
                  selectedPreset.id === preset.id && styles.presetChipActive
                ]}
                onPress={() => handleSelectPreset(preset)}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    selectedPreset.id === preset.id && styles.presetChipTextActive
                  ]}
                >
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Master Power Card */}
          <View style={styles.panelCard}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.panelTitle}>MASTER POWER</Text>
                <Text style={styles.panelSub}>
                  Target UUID: {activeCharUUID.slice(0, 8)}...
                </Text>
              </View>
              <Switch
                value={powerState}
                onValueChange={handleTogglePower}
                trackColor={{ false: '#1E293B', true: '#00F5D4' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* RGB Color Matrix */}
          <View style={styles.panelCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.panelTitle}>RGB COLOR MATRIX</Text>
              <View style={[styles.colorPreviewDot, { backgroundColor: activeSwatch.hex }]} />
            </View>
            <View style={styles.swatchGrid}>
              {COLOR_SWATCHES.map((swatch) => (
                <TouchableOpacity
                  key={swatch.hex}
                  style={[
                    styles.swatchButton,
                    { backgroundColor: swatch.hex },
                    activeSwatch.hex === swatch.hex && styles.swatchButtonSelected
                  ]}
                  onPress={() => handleSelectColor(swatch)}
                />
              ))}
            </View>

            {/* Brightness Stepper */}
            <View style={[styles.rowBetween, { marginTop: 14 }]}>
              <Text style={styles.panelSub}>INTENSITY / BRIGHTNESS</Text>
              <Text style={styles.brightnessValue}>{brightness}%</Text>
            </View>
            <View style={styles.brightnessRow}>
              {[20, 40, 60, 80, 100].map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  style={[
                    styles.brightnessStepBtn,
                    brightness === lvl && styles.brightnessStepBtnActive
                  ]}
                  onPress={() => handleBrightnessStep(lvl)}
                >
                  <Text
                    style={[
                      styles.brightnessStepText,
                      brightness === lvl && styles.brightnessStepTextActive
                    ]}
                  >
                    {lvl}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Multi-Channel Relay Switchboard */}
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>4-CHANNEL BLE RELAY / IO SWITCHBOARD</Text>
            <View style={styles.relayGrid}>
              {[1, 2, 3, 4].map((ch) => (
                <TouchableOpacity
                  key={ch}
                  style={[
                    styles.relayButton,
                    relays[ch] && styles.relayButtonActive
                  ]}
                  onPress={() => handleToggleRelay(ch)}
                >
                  <Text style={styles.relayLabel}>CH {ch}</Text>
                  <Text
                    style={[
                      styles.relayStatus,
                      relays[ch] && styles.relayStatusActive
                    ]}
                  >
                    {relays[ch] ? 'ACTIVE' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* TAB 3: GATT EXPLORER & RAW PACKET TRANSMITTER */}
      {activeTab === 'GATT' && (
        <ScrollView style={styles.contentArea} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>ACTIVE TARGET CHARACTERISTIC</Text>
            <Text style={styles.inputLabel}>SERVICE UUID</Text>
            <TextInput
              style={styles.textInput}
              value={activeServiceUUID}
              onChangeText={setActiveServiceUUID}
              placeholderTextColor="#475569"
              autoCapitalize="none"
            />
            <Text style={styles.inputLabel}>CHARACTERISTIC UUID</Text>
            <TextInput
              style={styles.textInput}
              value={activeCharUUID}
              onChangeText={setActiveCharUUID}
              placeholderTextColor="#475569"
              autoCapitalize="none"
            />

            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={styles.panelSub}>Write With Response (ACK)</Text>
              <Switch
                value={writeWithResponse}
                onValueChange={setWriteWithResponse}
                trackColor={{ false: '#1E293B', true: '#3A86FF' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Raw Packet Transmitter */}
          <View style={styles.panelCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.panelTitle}>RAW PACKET TRANSMITTER</Text>
              <View style={styles.formatToggle}>
                {['HEX', 'ASCII'].map((fmt) => (
                  <TouchableOpacity
                    key={fmt}
                    style={[
                      styles.formatBtn,
                      payloadFormat === fmt && styles.formatBtnActive
                    ]}
                    onPress={() => setPayloadFormat(fmt)}
                  >
                    <Text
                      style={[
                        styles.formatBtnText,
                        payloadFormat === fmt && styles.formatBtnTextActive
                      ]}
                    >
                      {fmt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TextInput
              style={[styles.textInput, { marginTop: 10 }]}
              value={customPayload}
              onChangeText={setCustomPayload}
              placeholder={
                payloadFormat === 'HEX' ? 'e.g. 7E 00 04 F0 00 01 FF 00 EF' : 'e.g. LED_ON'
              }
              placeholderTextColor="#475569"
              autoCapitalize="characters"
            />

            <TouchableOpacity style={styles.sendPacketBtn} onPress={handleSendCustomPayload}>
              <Text style={styles.sendPacketBtnText}>TRANSMIT GATT PACKET</Text>
            </TouchableOpacity>
          </View>

          {/* Auto-Discovered Characteristics List */}
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>
              AUTO-DISCOVERED CHARACTERISTICS ({discoveredChars.length})
            </Text>
            {discoveredChars.length === 0 ? (
              <Text style={styles.panelSub}>
                Connect to any BLE device in Tab 1 to automatically list all writable UUIDs here.
              </Text>
            ) : (
              discoveredChars.map((item, index) => (
                <TouchableOpacity
                  key={`${item.serviceUUID}-${item.charUUID}-${index}`}
                  style={[
                    styles.gattItem,
                    activeCharUUID === item.charUUID && styles.gattItemSelected
                  ]}
                  onPress={() => {
                    setActiveServiceUUID(item.serviceUUID);
                    setActiveCharUUID(item.charUUID);
                    setWriteWithResponse(!item.writableWithoutResp && item.writableWithResp);
                    addLog(`Selected Characteristic: ${item.charUUID}`);
                  }}
                >
                  <Text style={styles.gattCharText}>CHAR: {item.charUUID}</Text>
                  <Text style={styles.gattSvcText}>SVC: {item.serviceUUID}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* Bottom Live GATT Console Log */}
      <View style={styles.consoleBox}>
        <View style={styles.consoleHeaderRow}>
          <Text style={styles.consoleTitle}>LIVE GATT TELEMETRY LOG</Text>
          <TouchableOpacity onPress={() => setLogs(['[SYSTEM] Console cleared.'])}>
            <Text style={styles.clearConsoleText}>CLEAR</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.consoleScroll}>
          {logs.map((entry, idx) => (
            <Text key={idx} style={styles.consoleLine}>
              {entry}
            </Text>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A12' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#131C31'
  },
  brandTitle: { color: '#00F5D4', fontSize: 20, fontWeight: '900', letterSpacing: 1.5 },
  brandSubtitle: { color: '#64748B', fontSize: 10, letterSpacing: 2, marginTop: 2 },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1
  },
  badgeOnline: { backgroundColor: '#00F5D415', borderColor: '#00F5D4' },
  badgeOffline: { backgroundColor: '#F43F5E15', borderColor: '#F43F5E55' },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  badgeText: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0C1220',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#131C31'
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8
  },
  tabItemActive: { backgroundColor: '#162238' },
  tabLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tabLabelActive: { color: '#00F5D4' },
  connectedBanner: {
    backgroundColor: '#0F1E36',
    borderBottomWidth: 1,
    borderBottomColor: '#00F5D444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  connectedName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  connectedUuid: { color: '#38BDF8', fontSize: 11, marginTop: 1 },
  disconnectButton: {
    backgroundColor: '#F43F5E25',
    borderWidth: 1,
    borderColor: '#F43F5E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  disconnectText: { color: '#F43F5E', fontSize: 10, fontWeight: '800' },
  contentArea: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  scannerControlsRow: { marginBottom: 10 },
  primaryScanBtn: {
    backgroundColor: '#00F5D4',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  primaryScanBtnStop: { backgroundColor: '#F43F5E' },
  primaryScanBtnText: { color: '#070A12', fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  filterLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  deviceCard: {
    backgroundColor: '#0E1526',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  deviceTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  deviceMac: { color: '#64748B', fontSize: 11, marginTop: 3 },
  deviceRight: { alignItems: 'flex-end' },
  rssiBarGroup: { flexDirection: 'row', alignItems: 'flex-end', height: 18, marginBottom: 2 },
  rssiBar: { width: 4, marginLeft: 2, borderRadius: 1 },
  rssiBarActive: { backgroundColor: '#00F5D4' },
  rssiBarInactive: { backgroundColor: '#1E293B' },
  rssiValue: { color: '#94A3B8', fontSize: 10, marginBottom: 6 },
  connectPill: {
    backgroundColor: '#3A86FF22',
    borderWidth: 1,
    borderColor: '#3A86FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  connectPillText: { color: '#3A86FF', fontSize: 10, fontWeight: '800' },
  emptyBox: {
    backgroundColor: '#0E1526',
    borderRadius: 12,
    padding: 24,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  emptyTitle: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 16 },
  sectionHeader: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8
  },
  presetRow: { marginBottom: 12 },
  presetChip: {
    backgroundColor: '#0E1526',
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6
  },
  presetChipActive: { borderColor: '#00F5D4', backgroundColor: '#00F5D415' },
  presetChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  presetChipTextActive: { color: '#00F5D4' },
  panelCard: {
    backgroundColor: '#0E1526',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { color: '#F8FAFC', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  panelSub: { color: '#64748B', fontSize: 11, marginTop: 3 },
  colorPreviewDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFF' },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12
  },
  swatchButton: {
    width: '22%',
    height: 38,
    borderRadius: 8,
    marginBottom: 10
  },
  swatchButtonSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  brightnessValue: { color: '#00F5D4', fontSize: 13, fontWeight: '800' },
  brightnessRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  brightnessStepBtn: {
    flex: 1,
    backgroundColor: '#162238',
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 6,
    alignItems: 'center'
  },
  brightnessStepBtnActive: { backgroundColor: '#00F5D4' },
  brightnessStepText: { color: '#94A3B8', fontSize: 11, fontWeight: '800' },
  brightnessStepTextActive: { color: '#070A12' },
  relayGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  relayButton: {
    flex: 1,
    backgroundColor: '#131C31',
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingVertical: 12,
    marginHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center'
  },
  relayButtonActive: { backgroundColor: '#00F5D420', borderColor: '#00F5D4' },
  relayLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: '800' },
  relayStatus: { color: '#64748B', fontSize: 10, fontWeight: '700', marginTop: 4 },
  relayStatusActive: { color: '#00F5D4' },
  inputLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  textInput: {
    backgroundColor: '#070A12',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 12,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier'
  },
  formatToggle: { flexDirection: 'row', backgroundColor: '#070A12', borderRadius: 6, padding: 2 },
  formatBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  formatBtnActive: { backgroundColor: '#3A86FF' },
  formatBtnText: { color: '#64748B', fontSize: 10, fontWeight: '800' },
  formatBtnTextActive: { color: '#FFFFFF' },
  sendPacketBtn: {
    backgroundColor: '#3A86FF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12
  },
  sendPacketBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  gattItem: {
    backgroundColor: '#070A12',
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    marginTop: 8
  },
  gattItemSelected: { borderColor: '#00F5D4' },
  gattCharText: { color: '#00F5D4', fontSize: 11, fontWeight: '700' },
  gattSvcText: { color: '#64748B', fontSize: 10, marginTop: 2 },
  consoleBox: {
    height: 115,
    backgroundColor: '#04060B',
    borderTopWidth: 1,
    borderTopColor: '#131C31',
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  consoleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  consoleTitle: { color: '#475569', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  clearConsoleText: { color: '#3A86FF', fontSize: 10, fontWeight: '800' },
  consoleScroll: { flex: 1 },
  consoleLine: {
    color: '#00F5D4',
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 2
  }
});
