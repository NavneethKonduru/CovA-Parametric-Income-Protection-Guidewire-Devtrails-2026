// CovA Mobile — Production Native Android App
// 
// This is a React Native (Expo) WebView wrapper that provides
// native Android/iOS access to the CovA web dashboard.
//
// ╔══════════════════════════════════════════════╗
// ║  DEPLOYMENT OPTIONS                          ║
// ╠══════════════════════════════════════════════╣
// ║  Option A: Expo Go (Development)             ║
// ║    npx expo start                            ║
// ║    → Scan QR code with Expo Go app           ║
// ║                                              ║
// ║  Option B: Android APK (Production)          ║
// ║    npx eas build --platform android          ║
// ║    → Generates installable .apk              ║
// ║                                              ║
// ║  Option C: Android Studio (Full Native)      ║
// ║    npx expo prebuild --platform android      ║
// ║    → Generates /android folder               ║
// ║    → Open in Android Studio & build          ║
// ╚══════════════════════════════════════════════╝

import React, { useRef, useState } from 'react';
import { 
  StyleSheet, 
  SafeAreaView, 
  StatusBar, 
  Platform, 
  View, 
  Text, 
  ActivityIndicator,
  BackHandler
} from 'react-native';
import { WebView } from 'react-native-webview';

// Production: point to your deployed frontend URL
// Development: use the local dev server
const PRODUCTION_URL = 'https://cova.guidewire.app'; // Replace with actual deployment URL
const DEV_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:3000'   // Android emulator → host machine
  : 'http://localhost:3000';  // iOS simulator

const FRONTEND_URL = __DEV__ ? DEV_URL : PRODUCTION_URL;

export default function App() {
  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Handle Android hardware back button
  React.useEffect(() => {
    const onBack = () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default back behavior
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  // JavaScript to inject into WebView for native bridge
  const injectedJS = `
    (function() {
      // Flag so the web app knows it's running inside native shell
      window.isNativeApp = true;
      window.nativePlatform = '${Platform.OS}';
      
      // Override console.log to bridge to React Native
      const originalLog = console.log;
      console.log = function(...args) {
        originalLog.apply(console, args);
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'LOG', data: args.map(String).join(' ') })
        );
      };

      // Inject meta viewport for proper mobile scaling
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);

      // Add safe area padding for notch devices
      document.body.style.paddingTop = 'env(safe-area-inset-top)';
      document.body.style.paddingBottom = 'env(safe-area-inset-bottom)';
      
      true; // Required for injectedJavaScript
    })();
  `;

  const onMessage = (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'LOG') {
        console.log('[WebView]', msg.data);
      }
    } catch (e) {
      // Non-JSON message, ignore
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorText}>
            Cannot reach CovA server.{'\n'}
            Make sure the backend is running.
          </Text>
          <Text 
            style={styles.retryButton}
            onPress={() => { setError(false); setLoading(true); }}
          >
            Tap to Retry
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" translucent={false} />
      
      {loading && (
        <View style={styles.splashOverlay}>
          <Text style={styles.splashLogo}>CovA</Text>
          <Text style={styles.splashTagline}>Coverage, Automated</Text>
          <ActivityIndicator size="large" color="#06B6D4" style={{ marginTop: 24 }} />
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: FRONTEND_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        bounces={false}
        allowsBackForwardNavigationGestures={true}
        injectedJavaScript={injectedJS}
        onMessage={onMessage}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setError(true);
        }}
        // Performance optimizations
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        mixedContentMode="compatibility"
        allowFileAccess={true}
        // Security
        originWhitelist={['https://*', 'http://*']}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  webview: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  splashLogo: {
    fontSize: 48,
    fontWeight: '800',
    color: '#06B6D4',
    letterSpacing: 4,
  },
  splashTagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
    letterSpacing: 2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#06B6D4',
    borderRadius: 8,
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    overflow: 'hidden',
  },
});
