import { useEffect, useRef, useState } from 'react';
import { Radio, Play, Pause, Volume2, VolumeX, Maximize2, AlertCircle } from 'lucide-react';

interface StreamPlayerProps {
  url: string;
  title?: string;
}

function toEmbed(raw: string): { src: string; kind: 'iframe' | 'video' | 'none' } {
  const value = (raw || '').trim();
  if (!value) return { src: '', kind: 'none' };

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = parsed.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') ?? '';
      if (parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/')[2] ?? '';
      if (parsed.pathname.startsWith('/live/')) videoId = parsed.pathname.split('/')[2] ?? '';
      if (parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/')[2] ?? '';
    }

    if (/^[\w-]{6,}$/.test(videoId)) {
      const start = Number(parsed.searchParams.get('t')?.replace(/s$/, '') ?? 0);
      const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
      if (Number.isFinite(start) && start > 0) params.set('start', String(start));
      return { src: `https://www.youtube.com/embed/${videoId}?${params.toString()}`, kind: 'iframe' };
    }

    // Facebook videos, live streams and fb.watch short links use Facebook's embeddable player.
    if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'web.facebook.com' || host === 'fb.watch') {
      const embed = new URL('https://www.facebook.com/plugins/video.php');
      embed.searchParams.set('href', value);
      embed.searchParams.set('show_text', 'false');
      embed.searchParams.set('autoplay', 'true');
      return { src: embed.toString(), kind: 'iframe' };
    }
  } catch {
    return { src: '', kind: 'none' };
  }
  // HLS .m3u8 — we try native <video>, most desktop Chrome won't play HLS
  // without hls.js but Safari will. We still render the <video> tag.
  if (value.endsWith('.m3u8')) return { src: value, kind: 'video' };
  // Direct video files
  if (/\.(mp4|webm|ogg)$/i.test(value)) return { src: value, kind: 'video' };
  // Anything else: treat as iframe embed (e.g. twitch player)
  return { src: value, kind: 'iframe' };
}

export function StreamPlayer({ url, title = 'Live Stream' }: StreamPlayerProps) {
  const { src, kind } = toEmbed(url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  // Try to load hls.js dynamically for m3u8 playback on browsers that
  // don't natively support HLS.
  useEffect(() => {
    if (kind !== 'video' || !src.endsWith('.m3u8')) return;
    const video = videoRef.current;
    if (!video) return;
    // Native HLS (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    // Try hls.js
    let hls: any;
    const loader = new Function('return import("https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js")');
    loader()
      .then((mod: any) => {
        const Hls = mod.default ?? mod;
        if (Hls && Hls.isSupported()) {
          hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      })
      .catch(() => {});
    return () => { try { hls?.destroy?.(); } catch {} };
  }, [src, kind]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  if (kind === 'none') {
    return (
      <div className="aspect-video w-full bg-ink-900 rounded-2xl border border-ink-800 flex flex-col items-center justify-center text-ink-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm font-medium">No stream URL set</p>
        <p className="text-xs text-ink-600">The admin will publish a live stream link shortly.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-ink-800 bg-black group">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <span className="chip bg-rose-600 text-white animate-pulse">
          <Radio className="w-3 h-3" /> LIVE
        </span>
        {title && <span className="text-xs text-white/90 font-semibold drop-shadow">{title}</span>}
      </div>
      {kind === 'iframe' ? (
        <iframe
          src={src}
          title={title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
          allowFullScreen
          className="w-full aspect-video"
          frameBorder={0}
        />
      ) : (
        <>
          <video
            ref={videoRef}
            src={kind === 'video' && !src.endsWith('.m3u8') ? src : undefined}
            autoPlay
            muted={muted}
            playsInline
            controls={false}
            className="w-full aspect-video bg-black"
          />
          <div className="absolute bottom-3 inset-x-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
              }}
              className="w-10 h-10 rounded-full bg-ink-950/80 backdrop-blur flex items-center justify-center text-white"
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
              className="w-10 h-10 rounded-full bg-ink-950/80 backdrop-blur flex items-center justify-center text-white"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => {
                const el = videoRef.current;
                if (!el) return;
                if (document.fullscreenElement) document.exitFullscreen();
                else el.requestFullscreen?.();
              }}
              className="w-10 h-10 rounded-full bg-ink-950/80 backdrop-blur flex items-center justify-center text-white ml-auto"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
