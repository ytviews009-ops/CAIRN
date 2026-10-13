import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeImageProps {
  value: string;
  size?: number;
}

export function QRCodeImage({ value, size = 280 }: QRCodeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [byteSize, setByteSize] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    setError(false);
    setByteSize(new TextEncoder().encode(value).length);
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: {
          dark: '#0d0d0d',
          light: '#ffffff',
        },
      },
      (err) => {
        setError(!!err);
      }
    );
  }, [value, size]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center px-4"
        style={{ width: size, height: size }}
      >
        <p className="text-sm font-medium text-gray-500 mb-1">QR too large</p>
        <p className="text-xs text-gray-400">
          Encoded size: {byteSize.toLocaleString()} bytes
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Try reducing incident history or use paste relay.
        </p>
      </div>
    );
  }

  return (
    <canvas ref={canvasRef} width={size} height={size} className="block" />
  );
}
