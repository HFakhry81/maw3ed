import React, { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "maw3ed.desk.scanMode";
const HTML5_QR_CDN = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";

function loadHtml5Qrcode() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${HTML5_QR_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Html5Qrcode));
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل مكتبة الماسح")));
      if (window.Html5Qrcode) resolve(window.Html5Qrcode);
      return;
    }
    const script = document.createElement("script");
    script.src = HTML5_QR_CDN;
    script.async = true;
    script.onload = () => resolve(window.Html5Qrcode);
    script.onerror = () => reject(new Error("تعذر تحميل مكتبة الماسح"));
    document.head.appendChild(script);
  });
}

function playScanBeep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, ok ? 120 : 220);
  } catch {
    /* ignore */
  }
}

/**
 * Multi-mode QR scanner for department desk:
 * - camera: html5-qrcode via webcam / tablet
 * - hardware: USB/Bluetooth HID wedge scanners (keyboard emulation)
 * - manual: paste / type token
 */
export function QrCodeScanner({
  busy = false,
  onScan,
  placeholder = "وجّه الماسح هنا أو الصق الرمز…"
}) {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY) || "hardware");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [lastScan, setLastScan] = useState("");
  const [hardwareArmed, setHardwareArmed] = useState(true);

  const readerIdRef = useRef(`desk-qr-reader-${Math.random().toString(36).slice(2, 8)}`);
  const html5Ref = useRef(null);
  const hardwareInputRef = useRef(null);
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const lockRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const emitScan = useCallback(async (raw) => {
    const value = String(raw || "").trim();
    if (!value || busy || lockRef.current) return;
    if (value === lastScan) return;
    lockRef.current = true;
    setLastScan(value);
    setManualValue("");
    bufferRef.current = "";
    try {
      playScanBeep(true);
      setStatus("جاري تسجيل الحضور…");
      await onScan?.(value);
      setStatus("تم المسح");
    } catch {
      playScanBeep(false);
      setStatus("فشل المسح");
    } finally {
      setTimeout(() => {
        lockRef.current = false;
        setLastScan("");
      }, 900);
    }
  }, [busy, lastScan, onScan]);

  const stopCamera = useCallback(async () => {
    setCameraOn(false);
    try {
      if (html5Ref.current) {
        await html5Ref.current.stop();
        html5Ref.current.clear();
        html5Ref.current = null;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => {
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (mode !== "camera") stopCamera();
    if (mode === "hardware") {
      setHardwareArmed(true);
      setTimeout(() => hardwareInputRef.current?.focus(), 50);
    }
  }, [mode, stopCamera]);

  const startCamera = async () => {
    setError("");
    setStatus("جارٍ تشغيل الكاميرا…");
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      await stopCamera();
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices || []);
      const preferred =
        cameraId
        || devices.find((d) => /back|rear|environment/i.test(d.label || ""))?.id
        || devices[0]?.id
        || "";
      if (!preferred) throw new Error("لا توجد كاميرا متاحة على هذا الجهاز");
      setCameraId(preferred);
      setCameraOn(true);
      const scanner = new Html5Qrcode(readerIdRef.current);
      html5Ref.current = scanner;
      await scanner.start(
        preferred,
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decoded) => {
          emitScan(decoded);
        },
        () => {}
      );
      setStatus("وجّه كاميرا الماسح إلى بطاقة الحضور");
    } catch (err) {
      setCameraOn(false);
      setError(err.message || "تعذر تشغيل الكاميرا");
      setStatus("");
    }
  };

  const onHardwareKeyDown = (event) => {
    if (!hardwareArmed || busy) return;
    const now = Date.now();
    // HID scanners type very fast; reset buffer if pause > 80ms between keys
    if (now - lastKeyAtRef.current > 80) bufferRef.current = "";
    lastKeyAtRef.current = now;

    if (event.key === "Enter") {
      event.preventDefault();
      const payload = bufferRef.current || event.currentTarget.value;
      bufferRef.current = "";
      event.currentTarget.value = "";
      emitScan(payload);
      return;
    }
    if (event.key.length === 1) {
      bufferRef.current += event.key;
    }
  };

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-modes" role="tablist" aria-label="وضع المسح">
        <button
          type="button"
          role="tab"
          className={mode === "hardware" ? "chip on" : "chip"}
          aria-selected={mode === "hardware"}
          onClick={() => setMode("hardware")}
        >
          ماسح USB / بلوتوث
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "camera" ? "chip on" : "chip"}
          aria-selected={mode === "camera"}
          onClick={() => setMode("camera")}
        >
          كاميرا QR
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "manual" ? "chip on" : "chip"}
          aria-selected={mode === "manual"}
          onClick={() => setMode("manual")}
        >
          إدخال يدوي
        </button>
      </div>

      {mode === "hardware" ? (
        <div className={`qr-hardware${hardwareArmed ? " is-armed" : ""}`}>
          <div className="qr-hardware-pulse" aria-hidden="true" />
          <p className="qr-hardware-title">
            {hardwareArmed ? "الماسح متصل وجاهز — امسح البطاقة الآن" : "اضغط لتسليح الماسح"}
          </p>
          <p className="muted">
            وصّل ماسح QR يعمل كـ لوحة مفاتيح (HID). أبقِ المؤشر في الحقل أدناه ثم امسح.
          </p>
          <input
            ref={hardwareInputRef}
            className="qr-hardware-input"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            placeholder="في انتظار إشارة الماسح…"
            onFocus={() => setHardwareArmed(true)}
            onBlur={() => setHardwareArmed(false)}
            onKeyDown={onHardwareKeyDown}
            onClick={() => hardwareInputRef.current?.focus()}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setHardwareArmed(true);
              hardwareInputRef.current?.focus();
            }}
          >
            إعادة ربط / تركيز الماسح
          </button>
        </div>
      ) : null}

      {mode === "camera" ? (
        <div className="qr-camera">
          <div className="desk-scan-actions">
            {!cameraOn ? (
              <button type="button" className="primary-button" onClick={startCamera} disabled={busy}>
                تشغيل QR Code Scanner
              </button>
            ) : (
              <button type="button" className="warn-button" onClick={stopCamera}>إيقاف الكاميرا</button>
            )}
            {cameras.length > 1 ? (
              <select
                value={cameraId}
                onChange={async (e) => {
                  setCameraId(e.target.value);
                  if (cameraOn) {
                    await stopCamera();
                    setTimeout(() => startCamera(), 40);
                  }
                }}
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>{cam.label || cam.id}</option>
                ))}
              </select>
            ) : null}
          </div>
          <div id={readerIdRef.current} className={`desk-qr-box${cameraOn ? " is-on" : ""}`} />
        </div>
      ) : null}

      {mode === "manual" ? (
        <form
          className="desk-token-form"
          onSubmit={(event) => {
            event.preventDefault();
            emitScan(manualValue);
          }}
        >
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder={placeholder}
            disabled={busy}
          />
          <button type="submit" className="primary-button" disabled={busy || !manualValue.trim()}>
            تسجيل حضور
          </button>
        </form>
      ) : null}

      {status ? <p className="qr-scanner-status">{status}</p> : null}
      {error ? <p className="plan-warning">{error}</p> : null}
      <p className="muted">
        يدعم رابط البطاقة أو الرمز الخام · الماسح الخارجي يُفضَّل لسرعة الاستقبال
      </p>
    </div>
  );
}
