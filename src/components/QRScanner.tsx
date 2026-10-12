import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Keyboard } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError: (error: string) => void;
}

type ScannerMode = 'camera' | 'paste';

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [mode, setMode] = useState<ScannerMode>('camera');
  const [status, setStatus] = useState<'idle' | 'requesting' | 'scanning' | 'denied' | 'unavailable'>('idle');
  const [pasteValue, setPasteValue] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data) {
      stopCamera();
      onScan(code.data);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onScan, stopCamera]);

  const startCamera = useCallback(async () => {
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      const e = err as DOMError;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        setStatus('denied');
        onError('Camera permission denied');
      } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
        setStatus('unavailable');
        onError('No camera found on this device');
      } else {
        setStatus('unavailable');
        onError('Camera unavailable');
      }
    }
  }, [onError, tick]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaste = () => {
    if (pasteValue.trim()) {
      onScan(pasteValue.trim());
    }
  };

  if (mode === 'paste' || status === 'denied' || status === 'unavailable') {
    return (
      <div className="space-y-4">
        {(status === 'denied' || status === 'unavailable') && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
            <CameraOff size={18} className="text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900">
                {status === 'denied' ? 'Camera permission denied' : 'Camera unavailable'}
              </p>
              <p className="text-xs text-orange-700 mt-1">
                You can still import a relay by pasting the payload below.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Paste relay payload
          </label>
          <textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="Paste the relay JSON here…"
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handlePaste}
            disabled={!pasteValue.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            Import Payload
          </button>
          {status === 'idle' && (
            <button
              onClick={() => {
                setMode('camera');
                setStatus('idle');
                startCamera();
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              <Camera size={16} />
              Try Camera
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full max-w-xs mx-auto rounded-2xl overflow-hidden bg-gray-900">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />
        {/* Scan overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 border-[40px] border-black/40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/5 h-3/5 border-2 border-white/80 rounded-lg" />
        </div>
        {status === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="w-8 h-8 rounded-full border-2 border-gray-600 border-t-white animate-spin" />
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {status === 'scanning' && (
        <p className="text-center text-sm text-gray-400">
          Point the camera at a relay QR code…
        </p>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => {
            stopCamera();
            setMode('paste');
          }}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
        >
          <Keyboard size={15} />
          Paste payload instead
        </button>
      </div>
    </div>
  );
}

interface DOMError {
  name: string;
}
