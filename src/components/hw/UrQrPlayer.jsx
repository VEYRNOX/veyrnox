// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { Button } from '@/components/ui/button';

const DEFAULT_INTERVAL_MS = 1200;

export default function UrQrPlayer({ parts, size = 220, autoPlay = true, intervalMs = DEFAULT_INTERVAL_MS, title = 'QR sequence' }) {
  const urParts = useMemo(
    () => (Array.isArray(parts) ? parts.filter((part) => typeof part === 'string' && part.trim()) : []),
    [parts],
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && urParts.length > 1);

  useEffect(() => {
    setIndex(0);
    setPlaying(autoPlay && urParts.length > 1);
  }, [autoPlay, urParts.length]);

  useEffect(() => {
    if (!playing || urParts.length <= 1) return undefined;
    const handle = setInterval(() => {
      setIndex((current) => (current + 1) % urParts.length);
    }, intervalMs);
    return () => clearInterval(handle);
  }, [playing, urParts.length, intervalMs]);

  if (!urParts.length) return null;

  const currentPart = urParts[index];
  const multiple = urParts.length > 1;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-white p-3">
        <QRCodeDisplay address={currentPart} size={size} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">
            {multiple ? `Part ${index + 1} of ${urParts.length}` : 'Single-part QR'}
          </p>
        </div>
        {multiple ? (
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" aria-label="Previous QR part" onClick={() => setIndex((current) => (current - 1 + urParts.length) % urParts.length)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" aria-label={playing ? 'Pause QR playback' : 'Play QR playback'} onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button type="button" size="icon" variant="outline" aria-label="Next QR part" onClick={() => setIndex((current) => (current + 1) % urParts.length)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
