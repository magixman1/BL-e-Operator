import React, { useState, useEffect } from 'react';
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
  ScrollView
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager();

// Standard BLE RGB Light Service & Characteristic
const DEFAULT_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const DEFAULT_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [power, setPower] = useState(false);
  const [activeColor, setActiveColor] = useState('#00f0ff');
  const [logs, setLogs] = useState(['App initialized. Ready to scan.']);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 20)]);
  };

  useEffect(() => {
    requestPermissions();
    return () => {
      bleManager.destroy();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        const allApproved = Object.values(granted).every(
          (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );
        addLog(allApproved ? 'Bluetooth permissions granted' : 'Permissions denied');
      } else {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
      }
    }
  };

  const startScan = () => {
    setDevices([]);
    setIsScanning(true);
    addLog('Scanning for BLE devices...');

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        addLog(`Scan Error: ${error.message}`);
        setIsScanning(false);
        return;
      }
      if (device && (device.name || device.localName)) {
        setDevices((prev) => {
          if (!prev.some((d) => d.id === device.id)) {
            return [...prev, device];
          }
          return prev;
        });
      }
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      addLog('Scan completed.');
    }, 7000);
  };

  const connectDevice = async (device) => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
    addLog(`Connecting to ${device.name || device.id}...`);

    try {
      const connected = await bleManager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      addLog(`Connected: ${connected.name || connected.id}`);
    } catch (err) {
      addLog(`Connection Failed: ${err.message}`);
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice) return;
    try {
      await bleManager.cancelDeviceConnection(connectedDevice.id);
      addLog(`Disconnected from ${connectedDevice.name || connectedDevice.id}`);
    } catch (err) {
      addLog(`Disconnect error: ${err.message}`);
    } finally {
      setConnectedDevice(null);
    }
  };

  const sendGattCommand = async (base64Payload, description) => {
    if (!connectedDevice) {
      addLog('Error: No device connected');
      return;
    }
    try {
      await connectedDevice.writeCharacteristicWithoutResponseForService(
        DEFAULT_SERVICE_UUID,
        DEFAULT_CHAR_UUID,
        base64Payload
      );
      addLog(`TX: ${description}`);
    } catch (err) {
      addLog(`TX Error: ${err.message}`);
    }
  };

  const togglePower = (state) => {
    setPower(state);
    // Payload: 0xCC 0x23 0x33 for ON, 0xCC 0x24 0x33 for OFF
    const payload = state ? 'zCMz' : 'zCQz';
    sendGattCommand(payload, `Power ${state ? 'ON' : 'OFF'}`);
  };

  const sendColor = (hex, base64) => {
    setActiveColor(hex);
    sendGattCommand(base64, `Set RGB Color ${hex}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>bl-operator</Text>
        <Text style={styles.headerSub}>BLE DEVICE CONTROLLER</Text>
      </View>

      {/* Control View vs Scan View */}
      {connectedDevice ? (
        <View style={styles.mainContainer}>
          <View style={styles.deviceStatusCard}>
            <View>
              <Text style={styles.deviceConnectedTitle}>{connectedDevice.name || 'Unknown Peripheral'}</Text>
              <Text style={styles.deviceConnectedId}>{connectedDevice.id}</Text>
            </View>
            <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectDevice}>
              <Text style={styles.disconnectBtnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          {/* Controls Card */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.cardHeading}>Device Power</Text>
              <Switch
                value={power}
                onValueChange={togglePower}
                trackColor={{ false: '#1e293b', true: '#00f0ff' }}
                thumbColor={power ? '#ffffff' : '#64748b'}
              />
            </View>

            <Text style={[styles.cardHeading, { marginTop: 20, marginBottom: 12 }]}>RGB Color Modes</Text>
            <View style={styles.colorPalette}>
              {[
                { hex: '#ff0055', label: 'Neon Red', b64: 'VwD/AAAP' },
                { hex: '#00f0ff', label: 'Cyan', b64: 'VwAA//8P' },
                { hex: '#00ff66', label: 'Matrix', b64: 'VwAA/wAP' },
                { hex: '#ffe600', label: 'Warm Glow', b64: 'VwD//wAP' },
                { hex: '#b000ff', label: 'Purple', b64: 'VwD/AAD/' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.hex}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: item.hex },
                    activeColor === item.hex && styles.activeCircle,
                  ]}
                  onPress={() => sendColor(item.hex, item.b64)}
                />
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.mainContainer}>
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonActive]}
            onPress={startScan}
            disabled={isScanning}
          >
            <Text style={styles.scanButtonText}>
              {isScanning ? 'SCANNING PERIPHERALS...' : 'SCAN FOR BLE DEVICES'}
            </Text>
          </TouchableOpacity>

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceItem} onPress={() => connectDevice(item)}>
                <View>
                  <Text style={styles.deviceName}>{item.name || item.localName}</Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                </View>
                <View style={styles.rssiBadge}>
                  <Text style={styles.rssiText}>{item.rssi || -60} dBm</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isScanning ? 'Listening on 2.4GHz...' : 'No devices found. Tap scan above.'}
              </Text>
            }
          />
        </View>
      )}

      {/* Terminal / Activity Log */}
      <View style={styles.consoleContainer}>
        <Text style={styles.consoleHeader}>GATT TRANSACTION LOG</Text>
        <ScrollView style={styles.logScroll}>
          {logs.map((log, idx) => (
            <Text key={idx} style={styles.logText}>{log}</Text>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16', paddingHorizontal: 16 },
  header: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#161f30', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#00f0ff', letterSpacing: 2 },
  headerSub: { fontSize: 10, color: '#64748b', letterSpacing: 3, marginTop: 4 },
  mainContainer: { flex: 1, paddingTop: 16 },
  scanButton: { backgroundColor: '#00f0ff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  scanButtonActive: { backgroundColor: '#1e293b' },
  scanButtonText: { color: '#090d16', fontWeight: '800', letterSpacing: 1 },
  deviceItem: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', padding: 14, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  deviceName: { color: '#f3f4f6', fontSize: 15, fontWeight: '700' },
  deviceId: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  rssiBadge: { backgroundColor: '#1f2937', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  rssiText: { color: '#00f0ff', fontSize: 11, fontWeight: '600' },
  emptyText: { color: '#475569', textAlign: 'center', marginTop: 30, fontSize: 13 },
  deviceStatusCard: { backgroundColor: '#111827', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#00f0ff33', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  deviceConnectedTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  deviceConnectedId: { color: '#6b7280', fontSize: 11 },
  disconnectBtn: { backgroundColor: '#ef444420', borderColor: '#ef4444', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  disconnectBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#111827', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1f2937' },
  cardHeading: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  colorPalette: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
  colorCircle: { width: 44, height: 44, borderRadius: 22 },
  activeCircle: { borderWidth: 3, borderColor: '#ffffff' },
  consoleContainer: { height: 130, backgroundColor: '#05070c', borderTopWidth: 1, borderColor: '#161f30', padding: 10, marginBottom: 10, borderRadius: 8 },
  consoleHeader: { color: '#475569', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  logScroll: { flex: 1 },
  logText: { color: '#00f0ff', fontSize: 10, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier', marginBottom: 2 },
});
