import { useState, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
  mimeType: string;
  fileExtension: string;
}

const NATIVE_AUDIO_MIME_TYPE = "audio/aac";
const NATIVE_AUDIO_EXTENSION = "m4a";

/**
 * Determine the best supported mimeType for MediaRecorder in the current environment.
 */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "video/webm",
  ];
  for (const mime of candidates) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // isTypeSupported may throw in some WebView versions
    }
  }
  return "";
}

const isNative = () => Capacitor.isNativePlatform();

// Track whether a native recording session is active to avoid cancel/start races
let nativeSessionActive = false;

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  /** Stop all tracks on the current stream and clear refs */
  const stopAllTracks = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      streamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setPermissionDenied(false);

    if (isNative()) {
      try {
        const { CapacitorAudioRecorder } = await import("@capgo/capacitor-audio-recorder");

        const currentPermission = await CapacitorAudioRecorder.checkPermissions();
        const permission = currentPermission.recordAudio === "granted"
          ? currentPermission
          : await CapacitorAudioRecorder.requestPermissions();

        if (permission.recordAudio !== "granted") {
          setPermissionDenied(true);
          throw new Error("Microphone permission denied. Please allow microphone access in your device settings and try again.");
        }

        setRecording(null);
        startTimer();

        // Only cancel if a previous session is dangling
        if (nativeSessionActive) {
          try { await CapacitorAudioRecorder.cancelRecording(); } catch { /* ok */ }
          nativeSessionActive = false;
        }

        await CapacitorAudioRecorder.startRecording({
          sampleRate: 44100,
          bitRate: 128000,
        });
        nativeSessionActive = true;
        setIsRecording(true);
        return;
      } catch (err: any) {
        stopTimer();
        if (err?.message?.includes("permission")) {
          setPermissionDenied(true);
        }
        throw new Error(err?.message || "Could not access microphone");
      }
    }

    // --- Web path ---
    stopAllTracks();

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error("Audio recording requires a secure (HTTPS) connection.");
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error("Audio recording is not supported in this browser.");
    }

    let stream: MediaStream;
    const attemptGetUserMedia = () =>
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

    try {
      stream = await attemptGetUserMedia();
    } catch (err: any) {
      if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        await new Promise((r) => setTimeout(r, 500));
        try {
          stream = await attemptGetUserMedia();
        } catch (retryErr: any) {
          throw new Error(retryErr.message || "Could not access microphone");
        }
      } else {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err.name === "SecurityError") {
          setPermissionDenied(true);
        }
        throw new Error(err.message || "Could not access microphone");
      }
    }

    streamRef.current = stream;

    if (stream.getAudioTracks().length === 0) {
      stopAllTracks();
      throw new Error("No audio track available from microphone.");
    }

    let mediaRecorder: MediaRecorder;
    try {
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;
      mediaRecorder = new MediaRecorder(stream, options);
    } catch {
      try {
        mediaRecorder = new MediaRecorder(stream);
      } catch {
        stopAllTracks();
        throw new Error("MediaRecorder is not supported in this browser.");
      }
    }

    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onerror = () => {
      setIsRecording(false);
      stopAllTracks();
    };

    mediaRecorder.onstop = () => {
      stopTimer();
      if (chunksRef.current.length > 0) {
        const finalMime = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        setRecording({
          blob, url, duration, mimeType: finalMime,
          fileExtension: finalMime.includes("ogg") ? "ogg" : finalMime.includes("mp4") ? "m4a" : "webm",
        });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        streamRef.current = null;
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    startTimer();
    mediaRecorder.start(500);
    setIsRecording(true);
  }, [stopAllTracks, startTimer, stopTimer]);

  const stopRecording = useCallback(async () => {
    if (isNative() && nativeSessionActive) {
      setIsRecording(false);
      setIsFinalizing(true);
      try {
        const { CapacitorAudioRecorder } = await import("@capgo/capacitor-audio-recorder");
        const { Filesystem } = await import("@capacitor/filesystem");

        const result = await CapacitorAudioRecorder.stopRecording();
        nativeSessionActive = false;
        stopTimer();

        // Normalize: plugin may return uri, filePath, or path
        const filePath = (result as any).uri || (result as any).filePath || (result as any).path || "";

        if (filePath) {
          const file = await Filesystem.readFile({ path: filePath });
          const base64 = typeof file.data === "string" ? file.data : "";
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: NATIVE_AUDIO_MIME_TYPE });
          const url = URL.createObjectURL(blob);
          const duration = Math.max(1, Math.round(((result as any).duration ?? Date.now() - startTimeRef.current) / 1000));
          setRecording({ blob, url, duration, mimeType: NATIVE_AUDIO_MIME_TYPE, fileExtension: NATIVE_AUDIO_EXTENSION });
        }
      } catch (err) {
        console.error("Native stopRecording failed:", err);
        nativeSessionActive = false;
      } finally {
        setIsFinalizing(false);
      }
      return;
    }

    // Web path
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { stopAllTracks(); }
    }
    setIsRecording(false);
  }, [stopAllTracks, stopTimer]);

  const clearRecording = useCallback(() => {
    // Only release web resources — do NOT call native cancelRecording here
    stopAllTracks();

    if (recording?.url) {
      try { URL.revokeObjectURL(recording.url); } catch { /* ignore */ }
    }
    setRecording(null);
    setElapsed(0);
    setPermissionDenied(false);
  }, [recording, stopAllTracks]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    isFinalizing,
    recording,
    elapsed,
    permissionDenied,
    startRecording,
    stopRecording,
    clearRecording,
    formatDuration,
  };
}
