import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, SwitchCamera, X, RotateCcw, Check, AlertTriangle } from "lucide-react";
import { compressImage } from "@/utils/imageCompressor";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => void;
  title?: string;
}

export default function CameraCapture({ open, onClose, onCapture, title = "Take a Selfie" }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraReady(false);
    setPermissionDenied(false);
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // On native (Capacitor WebView), try requesting camera permission via native plugin first
      // This triggers the Android-level permission dialog
      try {
        const { Camera: CapCamera } = await import('@capacitor/camera');
        await CapCamera.requestPermissions();
      } catch {
        // Not on native or plugin unavailable — fine, continue with web API
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionDenied(true);
      }
    }
  }, [facingMode]);

  useEffect(() => {
    if (open && !capturedImage) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, startCamera, capturedImage]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror for front camera
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (blob) {
          try {
            const compressed = await compressImage(blob, 480, 0.6);
            setCapturedBlob(compressed);
          } catch {
            setCapturedBlob(blob);
          }
          setCapturedImage(canvas.toDataURL("image/jpeg", 0.6));
          // Stop camera
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        }
      },
      "image/jpeg",
      0.6
    );
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
  };

  const handleConfirm = () => {
    if (capturedBlob) {
      onCapture(capturedBlob);
      handleClose();
    }
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    setCameraReady(false);
    setPermissionDenied(false);
    onClose();
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          {permissionDenied ? (
            <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[300px]">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <p className="text-center text-sm text-muted-foreground">
                Camera permission was denied. Please allow camera access in your browser settings.
              </p>
              <Button onClick={startCamera} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : capturedImage ? (
            <div className="relative">
              <img src={capturedImage} alt="Captured" className="w-full" />
              {/* Face guide overlay on preview */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full border-2 border-dashed border-primary/40" />
              </div>
            </div>
          ) : (
            <div className="relative bg-black min-h-[300px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full"
                style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
              />
              {/* Face guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full border-2 border-dashed border-white/60" />
              </div>
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-white text-sm">Starting camera...</p>
                </div>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="p-4 flex justify-center gap-3">
          {capturedImage ? (
            <>
              <Button variant="outline" onClick={handleRetake} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Retake
              </Button>
              <Button onClick={handleConfirm} className="gap-2">
                <Check className="h-4 w-4" />
                Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" onClick={toggleCamera}>
                <SwitchCamera className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                className="rounded-full w-16 h-16"
                onClick={handleCapture}
                disabled={!cameraReady}
              >
                <Camera className="h-6 w-6" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
