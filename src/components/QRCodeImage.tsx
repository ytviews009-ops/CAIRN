import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeImageProps {
  value: string;
  size?: number;
}

export function QRCodeImage({ value, size = 280 }: QRCodeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'M',
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
        className="flex items-center justify-center text-sm text-gray-400"
        style={{ width: size, height: size }}
      >
        QR too large
      </div>
    );
  }

  return (
    <canvas ref={canvasRef} width={size} height={size} className="block" />
  );
}
