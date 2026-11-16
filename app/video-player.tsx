import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { column } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';
import { DEEP_LINK_BASE } from '@/lib/deep-links';
import {
  categoryLabel,
  formatDuration,
  isPortrait,
  useVideos,
  videoPlaybackUrl,
  youtubeWatchUrl,
} from '@/lib/videos';
import type { Video, VideoCategory } from '@/types/api';

/**
 * YouTube refuses to play an embed whose page has no https origin to send as
 * the referrer ("error 153"). The HTML is inline, so this origin is only ever
 * used as that identity; nothing is loaded from it.
 */
const EMBED_ORIGIN = DEEP_LINK_BASE.replace(/\/app$/, '');

const INSTAGRAM_PINK = '#E1306C';

function youtubeEmbedHtml(youtubeId: string): string {
  // Built from the id alone, never the API's URL, as it is pasted into HTML.
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&playsinline=1&rel=0&origin=${encodeURIComponent(EMBED_ORIGIN)}`;
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;
}

/** Links inside an embed (logos, "view on …") open outside the app instead of replacing the player. */
function keepEmbedInPlace(allowedPrefix: string) {
  return (req: ShouldStartLoadRequest) => {
    if (req.isTopFrame === false || req.url === 'about:blank' || req.url.startsWith(allowedPrefix)) {
      return true;
    }
    void Linking.openURL(req.url);
    return false;
  };
}

/** A 9:16 stage for portrait video, capped so the details below stay in reach. */
function usePortraitFrame() {
  const { width, height } = useWindowDimensions();
  const frameHeight = Math.min(width * (16 / 9), height * 0.68);
  return { width: frameHeight * (9 / 16), height: frameHeight };
}

function LoadingOverlay() {
  return (
    <View style={[StyleSheet.absoluteFill, s.center]} pointerEvents="none">
      <ActivityIndicator color="#fff" />
    </View>
  );
}

function YouTubePlayer({ video, youtubeId }: { video: Video; youtubeId: string }) {
  const [loading, setLoading] = useState(true);
  const frame = usePortraitFrame();
  const portrait = isPortrait(video);
  return (
    <View style={portrait ? s.stage : s.player}>
      <View style={portrait ? frame : StyleSheet.absoluteFill}>
        <WebView
          source={{ html: youtubeEmbedHtml(youtubeId), baseUrl: EMBED_ORIGIN }}
          style={s.webview}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          onLoadEnd={() => setLoading(false)}
          onShouldStartLoadWithRequest={keepEmbedInPlace(EMBED_ORIGIN)}
        />
        {loading ? <LoadingOverlay /> : null}
      </View>
    </View>
  );
}

// Instagram's embed page has no viewport tag, so it would lay out 980px wide
// and shrink to fit: tiny text, and sizes that are not in screen points.
const DEVICE_VIEWPORT_JS = `(function () {
  var meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1';
  (document.head || document.documentElement).appendChild(meta);
})();
true;`;

// Shown as a reel viewer: the embed takes the space between the header and
// the details panel and scrolls itself on short screens. A WebView playing
// Instagram's embed keeps vertical drags, so it cannot sit inside a ScrollView.
function InstagramPlayer({ embedUrl }: { embedUrl: string }) {
  const [loading, setLoading] = useState(true);
  return (
    <View style={s.instagram}>
      <WebView
        source={{ uri: embedUrl }}
        style={s.instagramWebview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={DEVICE_VIEWPORT_JS}
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={keepEmbedInPlace(embedUrl)}
      />
      {loading ? <LoadingOverlay /> : null}
    </View>
  );
}

function UploadedPlayer({ uri, portrait }: { uri: string; portrait: boolean }) {
  const frame = usePortraitFrame();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  useFocusEffect(
    useCallback(
      () => () => {
        // On unmount the hook may have released the player before this runs.
        try {
          player.pause();
        } catch {}
      },
      [player],
    ),
  );

  return (
    <View style={portrait ? s.stage : s.player}>
      <VideoView
        player={player}
        style={portrait ? frame : StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
    </View>
  );
}

function Player({ video }: { video: Video }) {
  if (video.source === 'youtube' && video.youtubeId) {
    return <YouTubePlayer video={video} youtubeId={video.youtubeId} />;
  }
  const playbackUrl = videoPlaybackUrl(video);
  return playbackUrl ? <UploadedPlayer uri={playbackUrl} portrait={isPortrait(video)} /> : null;
}

function VideoDetails({
  video,
  categories,
  compact = false,
}: {
  video: Video;
  categories: VideoCategory[];
  compact?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const duration = formatDuration(video.durationSeconds);
  const instagramUrl = video.instagramUrl ?? video.embedUrl?.replace(/embed\/?$/, '') ?? null;

  return (
    <View style={compact ? s.bodyCompact : s.body}>
      <Text
        style={[compact ? s.titleCompact : s.title, { color: colors.text, fontFamily: fonts.display }]}
        numberOfLines={compact ? 2 : undefined}
      >
        {video.title}
      </Text>

      <View style={s.metaRow}>
        <View style={[s.metaChip, { backgroundColor: colors.primaryBg }]}>
          <Text style={[s.metaChipText, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>
            {categoryLabel(categories, video.category)}
          </Text>
        </View>
        {duration ? (
          <View style={s.metaItem}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[s.metaText, { color: colors.textMuted, fontFamily: fonts.bodyMedium }]}>
              {duration}
            </Text>
          </View>
        ) : null}
        {video.source !== 'upload' ? (
          <View style={s.metaItem}>
            <Ionicons
              name={video.source === 'instagram' ? 'logo-instagram' : 'logo-youtube'}
              size={14}
              color={colors.textMuted}
            />
            <Text style={[s.metaText, { color: colors.textMuted, fontFamily: fonts.bodyMedium }]}>
              {video.source === 'instagram' ? 'Instagram' : 'YouTube'}
            </Text>
          </View>
        ) : null}
      </View>

      {video.description && !compact ? (
        <Text style={[s.description, { color: colors.textSecondary, fontFamily: fonts.body }]}>
          {video.description}
        </Text>
      ) : null}

      {video.source === 'youtube' && video.youtubeId ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => void Linking.openURL(youtubeWatchUrl(video.youtubeId!))}
          style={[s.externalBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons name="logo-youtube" size={18} color="#FF0000" />
          <Text style={[s.externalBtnText, { color: colors.text, fontFamily: fonts.bodySemibold }]}>
            Watch on YouTube
          </Text>
        </TouchableOpacity>
      ) : null}

      {video.source === 'instagram' && instagramUrl ? (
        <TouchableOpacity
          activeOpacity={0.85}
          // Opens the Instagram app when it is installed, the browser otherwise.
          onPress={() => void Linking.openURL(instagramUrl)}
          style={[s.externalBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons name="logo-instagram" size={18} color={INSTAGRAM_PINK} />
          <Text style={[s.externalBtnText, { color: colors.text, fontFamily: fonts.bodySemibold }]}>
            Open in Instagram
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function VideoPlayerScreen() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useVideos();

  const categories = data?.data?.categories ?? [];
  const video = data?.data?.videos.find((v) => v.id === id) ?? null;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={video ? categoryLabel(categories, video.category) : 'Video'}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/videos'))}
      />

      {!video ? (
        <View style={[s.center, s.missing]}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="film-outline" size={36} color={colors.primary} />
              <Text style={[s.missingText, { color: colors.textMuted, fontFamily: fonts.body }]}>
                This video is no longer available.
              </Text>
            </>
          )}
        </View>
      ) : video.source === 'instagram' && video.embedUrl ? (
        <View style={s.root}>
          <InstagramPlayer embedUrl={video.embedUrl} />
          <View
            style={[
              s.reelPanel,
              { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + Spacing[3] },
            ]}
          >
            <View style={column()}>
              <VideoDetails video={video} categories={categories} compact />
            </View>
          </View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <Player video={video} />
          <View style={column()}>
            <VideoDetails video={video} categories={categories} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: Spacing[6] },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  stage: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  webview: { flex: 1, backgroundColor: '#000' },
  instagram: { flex: 1, backgroundColor: '#fff' },
  reelPanel: { borderTopWidth: StyleSheet.hairlineWidth },
  instagramWebview: { flex: 1, backgroundColor: '#fff' },
  missing: { flex: 1, gap: Spacing[3], padding: Spacing[8] },
  missingText: { fontSize: FontSize.sm, textAlign: 'center' },
  body: {
    padding: Spacing[5],
    gap: Spacing[3],
  },
  bodyCompact: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    gap: Spacing[2],
  },
  titleCompact: {
    fontSize: FontSize.lg,
  },
  title: {
    fontSize: FontSize.xl,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  metaChipText: { fontSize: FontSize.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.sm },
  description: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  externalBtn: {
    marginTop: Spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  externalBtnText: { fontSize: FontSize.base },
});
