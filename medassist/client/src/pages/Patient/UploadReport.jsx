import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const ACCEPTED = '.jpg,.jpeg,.png,.pdf';
const MAX_MB = 10;

// Guide frame proportions — must match the overlay dimensions below
const FRAME_W = 0.78; // fraction of viewfinder width
const FRAME_H = 0.82; // fraction of viewfinder height (portrait, taller than wide)

function StatusBadge({ status }) {
  const map = {
    normal:        'bg-green-100 text-green-700',
    low:           'bg-yellow-100 text-yellow-700',
    high:          'bg-orange-100 text-orange-700',
    critical_low:  'bg-red-100 text-red-700',
    critical_high: 'bg-red-200 text-red-800',
  };
  const label = {
    normal: 'Normal', low: 'Low', high: 'High',
    critical_low: 'Critical Low', critical_high: 'Critical High',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {label[status] || status}
    </span>
  );
}

/** Stop all tracks on a MediaStream and null it out */
function stopStream(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

export default function UploadReport() {
  const { state } = useLocation();
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();

  const sessionId = paramSessionId || state?.sessionId || null;
  const standalone = !sessionId;

  const [disease, setDisease]     = useState(state?.disease || null);
  const [loadingDb, setLoadingDb] = useState(false);

  // ── upload / file state ──
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const fileInputRef = useRef();

  // ── mode: 'file' | 'camera' ──
  const [mode, setMode] = useState('file');

  // ── camera state ──
  const [cameraReady, setCameraReady]     = useState(false);
  const [cameraError, setCameraError]     = useState(null);
  const [facingMode, setFacingMode]       = useState('environment'); // rear cam by default
  const [capturedImage, setCapturedImage] = useState(null); // dataURL of snapshot
  const streamRef  = useRef(null); // holds the live MediaStream
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);

  // ── load disease from DB if resuming ──
  useEffect(() => {
    if (disease || !sessionId) return;
    setLoadingDb(true);
    api.get(`/patient/sessions/${sessionId}`)
      .then((res) => {
        const s = res.data.session;
        if (s?.selected_disease_data)      setDisease(s.selected_disease_data);
        else if (s?.selected_disease)       setDisease({ disease: s.selected_disease });
      })
      .catch(() => toast.error('Failed to load session data.'))
      .finally(() => setLoadingDb(false));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── stop camera stream when leaving camera mode or unmounting ──
  useEffect(() => {
    return () => stopStream(streamRef.current);
  }, []);

  // ── start / restart camera whenever mode=camera or facingMode changes ──
  useEffect(() => {
    if (mode !== 'camera') {
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraReady(false);
      setCameraError(null);
      setCapturedImage(null);
      return;
    }
    startCamera();
  }, [mode, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraReady(false);
    setCameraError(null);
    setCapturedImage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not supported on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
        };
      }
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'  ? 'Camera permission denied. Allow camera access and try again.' :
        err.name === 'NotFoundError'    ? 'No camera found on this device.' :
        err.name === 'NotReadableError' ? 'Camera is in use by another application.' :
                                          `Camera error: ${err.message}`;
      setCameraError(msg);
    }
  }

  function capturePhoto() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    // Display size of the video element (equals container due to w-full h-full)
    const dispW = video.offsetWidth;
    const dispH = video.offsetHeight;

    // Undo object-cover: find the visible crop of the raw video stream
    const scale = Math.max(dispW / vW, dispH / vH);
    const visW  = dispW / scale;
    const visH  = dispH / scale;
    const srcX  = (vW - visW) / 2;
    const srcY  = (vH - visH) / 2;

    // Map the guide-frame overlay percentages into raw video pixels
    const cropX = srcX + ((1 - FRAME_W) / 2) * visW;
    const cropY = srcY + ((1 - FRAME_H) / 2) * visH;
    const cropW = FRAME_W * visW;
    const cropH = FRAME_H * visH;

    // Render at 2× for OCR quality
    canvas.width  = Math.round(cropW * 2);
    canvas.height = Math.round(cropH * 2);
    canvas.getContext('2d').drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) { toast.error('Failed to capture photo'); return; }
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setCapturedImage(dataUrl);
        if (video) video.pause();
        const f = new File([blob], `blood-report-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFile(f, dataUrl);
      },
      'image/jpeg',
      0.92,
    );
  }

  function retakePhoto() {
    setCapturedImage(null);
    setFile(null);
    setPreview(null);
    setResult(null);
    if (videoRef.current) {
      videoRef.current.play();
    }
  }

  function flipCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  // ── file handling (shared by file-picker and camera capture) ──
  const handleFile = (f, overridePreview = null) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large — max ${MAX_MB} MB`);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      toast.error('Only JPG, PNG, and PDF files are accepted');
      return;
    }
    setFile(f);
    setResult(null);

    if (overridePreview) {
      setPreview(overridePreview);
    } else if (f.type !== 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview('pdf');
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('report', file);
    if (sessionId) formData.append('sessionId', sessionId);

    try {
      const res = await api.post('/blood-report/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      setResult(res.data);
      toast.success(`Extracted ${res.data.count} blood parameters`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload or OCR failed');
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = () => {
    navigate(`/patient/analysis/${result.reportId}`, {
      state: { sessionId, disease, reportId: result.reportId, extractedValues: result.extractedValues },
    });
  };

  const switchMode = (m) => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMode(m);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-blue-600 transition-colors">
          Dashboard
        </button>
        {!standalone && (
          <>
            <span>›</span>
            <button onClick={() => navigate(`/patient/results/${sessionId}`)} className="hover:text-blue-600 transition-colors">
              Diagnosis
            </button>
            <span>›</span>
            <button onClick={() => navigate(`/patient/tests/${sessionId}`)} className="hover:text-blue-600 transition-colors">
              Blood Tests
            </button>
          </>
        )}
        <span>›</span>
        <span className="text-slate-600 font-medium">Upload Report</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <h1 className="text-xl font-bold text-slate-800">
          {standalone ? 'Analyze My Blood Report' : 'Upload Blood Report'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {standalone
            ? 'Upload or photograph your lab report — AI will extract all values and provide a full analysis.'
            : 'Upload or photograph your lab report — AI will extract all values for analysis.'}
        </p>
        {loadingDb && <p className="text-xs text-slate-400 mt-1 animate-pulse">Loading session context…</p>}
        {disease && <p className="text-xs text-blue-600 mt-1 font-medium">For: {disease.disease}</p>}
      </div>

      {/* Mode toggle */}
      {!result && (
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => switchMode('file')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'file'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
            Upload File
          </button>
          <button
            onClick={() => switchMode('camera')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'camera'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Use Camera
          </button>
        </div>
      )}

      {/* ── FILE MODE ── */}
      {mode === 'file' && !result && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && fileInputRef.current?.click()}
          className={`bg-white rounded-2xl border-2 border-dashed transition-colors p-10 text-center
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}
            ${!file ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {!file ? (
            <>
              <div className="text-5xl mb-3">📄</div>
              <p className="font-semibold text-slate-700">Drag & drop your blood report here</p>
              <p className="text-sm text-slate-400 mt-1">or click to browse</p>
              <p className="text-xs text-slate-300 mt-3">JPG, PNG, PDF — max {MAX_MB} MB</p>
            </>
          ) : (
            <div className="space-y-4">
              {preview && preview !== 'pdf' ? (
                <img src={preview} alt="Report preview" className="max-h-64 mx-auto rounded-lg border border-slate-200 object-contain" />
              ) : (
                <div className="text-6xl">📑</div>
              )}
              <div>
                <p className="font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Remove file
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CAMERA MODE ── */}
      {mode === 'camera' && !result && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow overflow-hidden">

          {/* Camera error */}
          {cameraError && (
            <div className="p-6 text-center space-y-3">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <p className="font-semibold text-slate-700">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Live viewfinder */}
          {!cameraError && !capturedImage && (
            <>
              {/* Portrait container — aspect-[3/4] keeps it taller than wide on any screen */}
              <div className="relative bg-black w-full aspect-[3/4] overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Alignment guide overlay */}
                {cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Guide frame — FRAME_W × FRAME_H, portrait proportions matching the crop */}
                    <div
                      className="relative border-2 border-white rounded-lg"
                      style={{
                        width:     `${FRAME_W * 100}%`,
                        height:    `${FRAME_H * 100}%`,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                      }}
                    >
                      {/* Corner accents */}
                      <span className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-white rounded-tl-md" />
                      <span className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-white rounded-tr-md" />
                      <span className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-white rounded-bl-md" />
                      <span className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-white rounded-br-md" />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full whitespace-nowrap">
                        Align report inside the frame
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading spinner while camera initialises */}
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <div className="flex flex-col items-center gap-3 text-white">
                      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm">Starting camera…</p>
                    </div>
                  </div>
                )}

                {/* Flip camera button (top-right) */}
                {cameraReady && (
                  <button
                    onClick={flipCamera}
                    title="Flip camera"
                    className="absolute top-3 right-3 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Capture bar */}
              <div className="p-5 flex flex-col items-center gap-3">
                <button
                  onClick={capturePhoto}
                  disabled={!cameraReady}
                  className={`w-16 h-16 rounded-full border-4 border-slate-300 flex items-center justify-center transition-all
                    ${cameraReady
                      ? 'bg-white hover:bg-slate-50 hover:scale-105 active:scale-95 cursor-pointer shadow-md'
                      : 'opacity-40 cursor-not-allowed'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600" />
                </button>
                <p className="text-xs text-slate-400">Tap to capture</p>
              </div>
            </>
          )}

          {/* Captured image review */}
          {capturedImage && !result && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-slate-700">Photo captured</span>
              </div>
              <img
                src={capturedImage}
                alt="Captured report"
                className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50"
              />
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={retakePhoto}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Retake
                </button>
                <p className="text-xs text-slate-400 flex-1">Looks good? Click Analyze below.</p>
              </div>
            </div>
          )}

          {/* Hidden canvas used for capture — never rendered visibly */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="font-medium text-slate-700">
              {progress < 100 ? `Uploading… ${progress}%` : 'AI is extracting values from your report…'}
            </p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {progress === 100 && (
            <p className="text-xs text-slate-400 text-center animate-pulse">
              AI is reading your blood report values…
            </p>
          )}
        </div>
      )}

      {/* Analyze button */}
      {file && !uploading && !result && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            {mode === 'camera' ? 'Camera capture ready for analysis' : `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}
          </p>
          <button
            onClick={handleUpload}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Analyze Report →
          </button>
        </div>
      )}

      {/* Extracted values table */}
      {result && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Extracted Values</h2>
              <p className="text-sm text-slate-500">{result.count} parameters found</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
              OCR Complete
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                  <th className="pb-2 font-medium">Parameter</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Normal Range</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.extractedValues.map((v, i) => (
                  <tr key={i} className={v.status !== 'normal' ? 'bg-red-50/30' : ''}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-800">{v.parameter}</span>
                      {v.abbreviation && (
                        <span className="text-xs text-slate-400 ml-1 font-mono">({v.abbreviation})</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono font-semibold text-slate-700">
                      {v.value} <span className="text-slate-400 font-normal">{v.unit}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{v.normal_range}</td>
                    <td className="py-2"><StatusBadge status={v.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Next step</p>
              <p className="text-xs text-slate-400">Run the AI Blood Report Agent for medication recommendations</p>
            </div>
            <button
              onClick={handleProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Get AI Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
