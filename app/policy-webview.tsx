import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View,
} from 'react-native';
import WebView from 'react-native-webview';

import { useTheme } from '@/hooks/use-theme';
import { ScreenHeader } from '@/components/ui/screen-header';

const SITE_URL = 'https://satviksalaad.com';
const SITE_HOSTS = ['satviksalaad.com', 'www.satviksalaad.com', 'satviksalaad.in', 'www.satviksalaad.in'];

// Parsed by hand: React Native's URL takes the host from after an "@" anywhere
// in the string, so https://evil.example/?@satviksalaad.com would pass.
function isSiteUrl(url: string): boolean {
  const host = /^https:\/\/([^/?#@:\\]+)(?:[/?#]|$)/i.exec(url)?.[1];
  return host !== undefined && SITE_HOSTS.includes(host.toLowerCase());
}

function pagePath(url: string): string {
  return (/^https:\/\/[^/?#]+([^?#]*)/i.exec(url)?.[1] ?? '').replace(/\/+$/, '');
}

export default function PolicyWebViewScreen() {
  const rawParams = useLocalSearchParams<{ url: string | string[]; title: string | string[] }>();
  const requestedUrl = Array.isArray(rawParams.url) ? rawParams.url[0] : rawParams.url;
  const url = requestedUrl && isSiteUrl(requestedUrl) ? requestedUrl : SITE_URL;
  const title = Array.isArray(rawParams.title) ? (rawParams.title[0] ?? 'Policy')               : (rawParams.title ?? 'Policy');
  const { colors } = useTheme();
  const router = useRouter();
  // The package types its extra props as `undefined` by default, which TypeScript 6 reduces to never.
  const webViewRef = useRef<WebView<object>>(null);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);

  const handleBack = () => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    } else {
      router.back();
    }
  };

  // The site's header and footer lead to plans and checkout, and its links move
  // between pages without a page load, which onShouldStartLoadWithRequest never sees.
  // So the page stands alone here and every link off it goes to the app instead.
  const STANDALONE_PAGE = `
    (function() {
      var style = document.createElement('style');
      style.textContent = 'body header, body footer { display: none !important; }';
      document.head.appendChild(style);
      document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;
        var to = new URL(link.href, location.href);
        if (to.origin === location.origin && to.pathname === location.pathname) return;
        e.preventDefault();
        e.stopPropagation();
        window.ReactNativeWebView.postMessage(to.href);
      }, true);
    })();
    true;
  `;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} onBack={handleBack} />

      {/* Progress bar */}
      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
      )}

      {/* WebView */}
      <WebView<object>
        ref={webViewRef}
        source={{ uri: url }}
        style={[styles.webview, { backgroundColor: colors.background }]}
        injectedJavaScript={STANDALONE_PAGE}
        onMessage={({ nativeEvent }) => {
          if (/^(https?|mailto|tel|whatsapp):/i.test(nativeEvent.data)) Linking.openURL(nativeEvent.data).catch(() => {});
        }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onShouldStartLoadWithRequest={(req) => {
          if (req.isTopFrame === false) return true;
          if (isSiteUrl(req.url) && pagePath(req.url) === pagePath(url)) return true;
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        startInLoadingState={false}
        renderLoading={() => (
          <View style={[styles.loader, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        allowsBackForwardNavigationGestures
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressBar: {
    height: 2,
  },

  webview: { flex: 1 },

  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
