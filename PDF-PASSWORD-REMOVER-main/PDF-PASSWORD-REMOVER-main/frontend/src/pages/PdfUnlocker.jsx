import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  FileText,
  Upload,
  Lock,
  Unlock,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Archive,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH = 20;

const formatBytes = (b) => {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

// ---------- Header ----------
const Header = () => (
  <header className="border-b border-[#0A0A0A] bg-white">
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3" data-testid="app-logo">
        <div className="w-9 h-9 bg-[#0A0A0A] flex items-center justify-center">
          <Unlock className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg tracking-tight">UNLOCK MY PDF</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-[#525252]">
            Password Removal Tool
          </div>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-6 text-xs tracking-[0.2em] uppercase text-[#525252]">
        <span>v1.0</span>
        <span className="text-[#0A0A0A]">/ Single &amp; Batch</span>
      </div>
    </div>
  </header>
);

// ---------- Hero ----------
const Hero = () => (
  <section className="border-b border-[#E5E5E5] bg-white">
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24 grid md:grid-cols-12 gap-10 items-end">
      <div className="md:col-span-8">
        <div className="text-xs font-bold tracking-[0.3em] uppercase text-[#525252] mb-6">
          / 001 — Tool Suite
        </div>
        <h1
          className="font-display text-4xl sm:text-5xl lg:text-7xl text-[#0A0A0A] leading-[0.95]"
          data-testid="hero-heading"
        >
          Remove PDF<br />passwords.<br />
          <span className="text-[#0000FF]">Fast.</span>
        </h1>
      </div>
      <div className="md:col-span-4 md:border-l md:border-[#0A0A0A] md:pl-8">
        <p className="text-base text-[#171717] leading-relaxed">
          Drop in a protected PDF, enter the password, and get an unlocked copy
          you can read or share. Works for one file — or twenty at once.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#0A0A0A]">
          <ArrowRight className="w-4 h-4" /> Pick a mode below
        </div>
      </div>
    </div>
  </section>
);

// ---------- Reusable bits ----------
const Pill = ({ children, tone = "neutral" }) => {
  const tones = {
    neutral: "bg-[#F5F5F5] text-[#0A0A0A] border-[#0A0A0A]",
    success: "bg-[#00C853]/10 text-[#0A0A0A] border-[#00C853]",
    error: "bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]",
    info: "bg-[#0000FF]/10 text-[#0000FF] border-[#0000FF]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

const PrimaryButton = ({ children, ...props }) => (
  <button
    {...props}
    className={`bg-[#0000FF] text-white px-6 py-3 font-semibold tracking-wide hover:bg-[#0000CC] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ""}`}
  >
    {children}
  </button>
);

const SecondaryButton = ({ children, ...props }) => (
  <button
    {...props}
    className={`bg-transparent text-[#0A0A0A] border border-[#0A0A0A] px-6 py-3 font-semibold hover:bg-[#0A0A0A] hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ""}`}
  >
    {children}
  </button>
);

const TextInput = ({ testId, ...props }) => (
  <input
    {...props}
    data-testid={testId}
    className={`w-full border border-[#0A0A0A] bg-white px-4 py-3 text-base placeholder:text-[#A3A3A3] focus:outline-none focus:ring-2 focus:ring-[#0000FF] focus:border-transparent transition-all ${props.className || ""}`}
  />
);

// ---------- Dropzone ----------
const Dropzone = ({ onFiles, multiple, testId, children }) => {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDrag(false);
      const list = Array.from(e.dataTransfer.files || []).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf"),
      );
      if (list.length === 0) {
        toast.error("Only PDF files are supported");
        return;
      }
      onFiles(multiple ? list : [list[0]]);
    },
    [multiple, onFiles],
  );

  return (
    <div
      data-testid={testId}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed p-10 md:p-14 cursor-pointer min-h-[280px] flex flex-col items-center justify-center gap-4 text-center transition-colors ${
        drag
          ? "border-[#0000FF] bg-[#0000FF]/5"
          : "border-[#0A0A0A] bg-white hover:bg-[#F9F9F9]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          if (list.length) onFiles(multiple ? list : [list[0]]);
          e.target.value = "";
        }}
      />
      {children}
    </div>
  );
};

// ---------- Single Mode ----------
const SingleMode = () => {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  // result: { filename, size, blob, url } — blob lives in the browser only
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Revoke object URL on unmount / state change to free memory.
  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const reset = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setFile(null);
    setPassword("");
    setResult(null);
    setError(null);
    setBusy(false);
  };

  const handleFile = (files) => {
    const f = files[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast.error(`File exceeds 50MB limit`);
      return;
    }
    setFile(f);
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setError(null);
  };

  const unlock = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      const resp = await axios.post(`${API}/pdf/unlock`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        responseType: "blob",
      });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setResult({
        filename: file.name,
        size: blob.size,
        blob,
        url,
      });
      toast.success("PDF unlocked successfully");
    } catch (e) {
      // Error response body is a Blob — read it as text and parse JSON
      let msg = "Failed to unlock PDF";
      try {
        const body = e?.response?.data;
        if (body && typeof body.text === "function") {
          const text = await body.text();
          const json = JSON.parse(text);
          msg = json.detail || msg;
        } else if (typeof body === "string") {
          msg = body;
        }
      } catch (_) {
        // fall through with default msg
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="grid md:grid-cols-12 gap-6">
      <div className="md:col-span-8">
        {!file ? (
          <Dropzone onFiles={handleFile} multiple={false} testId="single-dropzone">
            <Upload className="w-10 h-10 text-[#0A0A0A]" strokeWidth={1.5} />
            <div>
              <div className="font-display text-2xl text-[#0A0A0A]">
                Drop your protected PDF
              </div>
              <div className="text-sm text-[#525252] mt-2">
                or click to browse — max 50MB
              </div>
            </div>
            <Pill tone="neutral">PDF only</Pill>
          </Dropzone>
        ) : (
          <div
            className="border border-[#0A0A0A] bg-white"
            data-testid="single-file-card"
          >
            <div className="flex items-start justify-between p-6 border-b border-[#E5E5E5]">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-12 h-12 bg-[#0A0A0A] flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-white" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div
                    className="font-semibold text-[#0A0A0A] truncate"
                    data-testid="single-file-name"
                  >
                    {file.name}
                  </div>
                  <div className="text-xs text-[#525252] mt-1">
                    {formatBytes(file.size)} · PDF
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result ? (
                      <Pill tone="success">
                        <CheckCircle2 className="w-3 h-3" /> Unlocked
                      </Pill>
                    ) : error ? (
                      <Pill tone="error">
                        <AlertCircle className="w-3 h-3" /> {error}
                      </Pill>
                    ) : busy ? (
                      <Pill tone="info">
                        <Loader2 className="w-3 h-3 animate-spin" /> Working
                      </Pill>
                    ) : (
                      <Pill tone="neutral">
                        <Lock className="w-3 h-3" /> Awaiting password
                      </Pill>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={reset}
                aria-label="Remove file"
                data-testid="single-clear-button"
                className="text-[#525252] hover:text-[#0A0A0A] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!result && (
              <div className="p-6 space-y-4">
                <label className="block">
                  <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#525252] mb-2">
                    PDF Password
                  </div>
                  <div className="relative">
                    <TextInput
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password to unlock"
                      disabled={busy}
                      testId="single-password-input"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) unlock();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#0A0A0A]"
                      data-testid="single-toggle-password-visibility"
                      aria-label="Toggle password visibility"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>

                {busy && <div className="indeterminate-bar" />}

                <div className="flex flex-wrap gap-3 pt-2">
                  <PrimaryButton
                    onClick={unlock}
                    disabled={busy}
                    data-testid="single-unlock-button"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Unlocking
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" /> Unlock PDF
                      </>
                    )}
                  </PrimaryButton>
                  <SecondaryButton onClick={reset} disabled={busy}>
                    Cancel
                  </SecondaryButton>
                </div>
              </div>
            )}

            {result && (
              <div className="p-6 flex flex-wrap gap-3">
                <PrimaryButton
                  onClick={download}
                  data-testid="single-download-button"
                >
                  <Download className="w-4 h-4" /> Download unlocked PDF
                </PrimaryButton>
                <SecondaryButton onClick={reset} data-testid="single-restart-button">
                  Process another file
                </SecondaryButton>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="md:col-span-4 space-y-4">
        <div className="border border-[#0A0A0A] bg-white p-6">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#525252] mb-3">
            How it works
          </div>
          <ol className="space-y-3 text-sm text-[#171717]">
            <li className="flex gap-3">
              <span className="font-display text-2xl text-[#0000FF] leading-none">1</span>
              Upload a password-protected PDF
            </li>
            <li className="flex gap-3">
              <span className="font-display text-2xl text-[#0000FF] leading-none">2</span>
              Enter the correct password
            </li>
            <li className="flex gap-3">
              <span className="font-display text-2xl text-[#0000FF] leading-none">3</span>
              Download the unlocked file
            </li>
          </ol>
        </div>
        <div className="border border-[#E5E5E5] bg-white p-6 text-sm text-[#525252] leading-relaxed">
          Files are processed in temporary storage and auto-deleted after 30 minutes.
          Nothing is stored permanently.
        </div>
      </aside>
    </div>
  );
};

// ---------- Batch Mode ----------
const BatchMode = () => {
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  // results: [{filename, status, size?, error?, blob?, url?}]
  const [results, setResults] = useState([]);

  const successResults = useMemo(
    () => results.filter((r) => r.status === "success"),
    [results],
  );

  // Revoke any object URLs when results change or component unmounts
  const revokeUrls = (rs) => {
    rs.forEach((r) => {
      if (r?.url) {
        try { URL.revokeObjectURL(r.url); } catch (_) {}
      }
    });
  };
  useEffect(() => {
    return () => revokeUrls(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    revokeUrls(results);
    setFiles([]);
    setPassword("");
    setResults([]);
    setBusy(false);
  };

  const addFiles = (incoming) => {
    revokeUrls(results);
    setResults([]);
    setFiles((prev) => {
      const combined = [...prev];
      for (const f of incoming) {
        if (combined.length >= MAX_BATCH) {
          toast.error(`Maximum ${MAX_BATCH} files per batch`);
          break;
        }
        if (f.size > MAX_FILE_SIZE) {
          toast.error(`${f.name} exceeds 50MB`);
          continue;
        }
        if (!combined.find((x) => x.name === f.name && x.size === f.size)) {
          combined.push(f);
        }
      }
      return combined;
    });
  };

  const removeAt = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Decode a base64 string into a Uint8Array (binary safe)
  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const unlockAll = async () => {
    if (files.length === 0) return;
    setBusy(true);
    revokeUrls(results);
    setResults([]);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("password", password);
      const { data } = await axios.post(`${API}/pdf/unlock-batch`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const incoming = (data.results || []).map((r) => {
        if (r.status === "success" && r.data) {
          const bytes = b64ToBytes(r.data);
          const blob = new Blob([bytes], { type: "application/pdf" });
          return {
            filename: r.filename,
            status: "success",
            size: blob.size,
            blob,
            url: URL.createObjectURL(blob),
          };
        }
        return {
          filename: r.filename,
          status: r.status,
          error: r.error,
        };
      });
      setResults(incoming);
      const ok = incoming.filter((r) => r.status === "success").length;
      const bad = incoming.length - ok;
      if (ok > 0) toast.success(`${ok} file${ok > 1 ? "s" : ""} unlocked`);
      if (bad > 0) toast.error(`${bad} file${bad > 1 ? "s" : ""} failed`);
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || "Batch unlock failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (item) => {
    if (!item?.url) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadZip = async () => {
    if (successResults.length === 0) return;
    try {
      const zip = new JSZip();
      const used = {};
      for (const r of successResults) {
        let name = r.filename;
        if (used[name] !== undefined) {
          used[name] += 1;
          const stem = name.replace(/\.pdf$/i, "");
          name = `${stem} (${used[name]}).pdf`;
        } else {
          used[name] = 0;
        }
        zip.file(name, r.blob);
      }
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "unlocked_pdfs.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free immediately — the browser holds the download stream itself
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error("Failed to create ZIP");
    }
  };

  return (
    <div className="grid md:grid-cols-12 gap-6">
      <div className="md:col-span-8 space-y-6">
        {files.length === 0 && results.length === 0 ? (
          <Dropzone onFiles={addFiles} multiple testId="batch-dropzone">
            <Archive className="w-10 h-10 text-[#0A0A0A]" strokeWidth={1.5} />
            <div>
              <div className="font-display text-2xl text-[#0A0A0A]">
                Drop multiple PDFs sharing one password
              </div>
              <div className="text-sm text-[#525252] mt-2">
                or click to browse — up to {MAX_BATCH} files, 50MB each
              </div>
            </div>
            <Pill tone="neutral">Batch mode</Pill>
          </Dropzone>
        ) : (
          <div className="border border-[#0A0A0A] bg-white" data-testid="batch-list">
            <div className="px-6 py-4 border-b border-[#0A0A0A] flex items-center justify-between">
              <div>
                <div className="font-display text-xl text-[#0A0A0A]">
                  {results.length > 0 ? "Results" : "Queue"}
                </div>
                <div className="text-xs text-[#525252] mt-1 tracking-[0.2em] uppercase">
                  {results.length > 0
                    ? `${successResults.length} of ${results.length} unlocked`
                    : `${files.length} file${files.length === 1 ? "" : "s"} ready`}
                </div>
              </div>
              {results.length === 0 && files.length < MAX_BATCH && (
                <label className="cursor-pointer text-xs font-bold tracking-[0.2em] uppercase text-[#0000FF] hover:text-[#0000CC]">
                  + Add more
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,.pdf"
                    className="hidden"
                    data-testid="batch-add-more-input"
                    onChange={(e) => {
                      const list = Array.from(e.target.files || []);
                      if (list.length) addFiles(list);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            {results.length === 0 ? (
              <ul>
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="border-b border-[#E5E5E5] last:border-0 px-6 py-4 flex items-center justify-between gap-4 fade-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                    data-testid={`batch-queue-item-${idx}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-[#0A0A0A] shrink-0" strokeWidth={1.5} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-[#0A0A0A] truncate">
                          {f.name}
                        </div>
                        <div className="text-xs text-[#525252]">
                          {formatBytes(f.size)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAt(idx)}
                      className="text-[#525252] hover:text-[#FF3B30] p-1"
                      aria-label={`Remove ${f.name}`}
                      data-testid={`batch-remove-${idx}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {results.map((r, idx) => (
                  <li
                    key={`${r.filename}-${idx}`}
                    className="border-b border-[#E5E5E5] last:border-0 px-6 py-4 flex items-center justify-between gap-4 fade-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                    data-testid={`batch-result-item-${idx}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText
                        className={`w-5 h-5 shrink-0 ${r.status === "success" ? "text-[#00C853]" : "text-[#FF3B30]"}`}
                        strokeWidth={1.5}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-[#0A0A0A] truncate">
                          {r.filename}
                        </div>
                        <div className="text-xs text-[#525252] mt-0.5">
                          {r.status === "success" ? (
                            <>Unlocked · {formatBytes(r.size)}</>
                          ) : (
                            <span className="text-[#FF3B30]">{r.error}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {r.status === "success" ? (
                      <button
                        onClick={() => downloadOne(r.id, r.filename)}
                        className="text-[#0000FF] hover:text-[#0000CC] flex items-center gap-1.5 text-xs font-bold tracking-[0.18em] uppercase"
                        data-testid={`batch-download-${idx}`}
                      >
                        <Download className="w-4 h-4" /> Download
                      </button>
                    ) : (
                      <Pill tone="error">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </Pill>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {files.length > 0 && results.length === 0 && (
          <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
            <label className="block">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#525252] mb-2">
                Shared Password (applies to all files)
              </div>
              <div className="relative">
                <TextInput
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the password used by all PDFs"
                  disabled={busy}
                  testId="batch-password-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) unlockAll();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#0A0A0A]"
                  data-testid="batch-toggle-password-visibility"
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {busy && <div className="indeterminate-bar" />}

            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton
                onClick={unlockAll}
                disabled={busy || files.length === 0}
                data-testid="batch-unlock-button"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Unlocking {files.length} file{files.length > 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" /> Unlock all ({files.length})
                  </>
                )}
              </PrimaryButton>
              <SecondaryButton onClick={reset} disabled={busy}>
                Clear
              </SecondaryButton>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="border border-[#0A0A0A] bg-white p-6 flex flex-wrap gap-3 items-center">
            {successResults.length > 0 && (
              <PrimaryButton
                onClick={downloadZip}
                data-testid="batch-download-zip-button"
              >
                <Archive className="w-4 h-4" /> Download all as ZIP ({successResults.length})
              </PrimaryButton>
            )}
            <SecondaryButton onClick={reset} data-testid="batch-restart-button">
              Start a new batch
            </SecondaryButton>
          </div>
        )}
      </div>

      <aside className="md:col-span-4 space-y-4">
        <div className="border border-[#0A0A0A] bg-white p-6">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#525252] mb-3">
            Batch rules
          </div>
          <ul className="space-y-2 text-sm text-[#171717]">
            <li>· All files must use the same password</li>
            <li>· Up to {MAX_BATCH} files per batch</li>
            <li>· Max 50MB per file</li>
            <li>· Failed files are listed with reasons</li>
          </ul>
        </div>
        <div className="border border-[#E5E5E5] bg-white p-6 text-sm text-[#525252] leading-relaxed">
          Successful files can be downloaded individually or bundled into a single
          ZIP archive. Files auto-expire after 30 minutes.
        </div>
      </aside>
    </div>
  );
};

// ---------- Main page ----------
export default function PdfUnlocker() {
  return (
    <div className="min-h-screen flex flex-col" data-testid="pdf-unlocker-page">
      <Header />
      <Hero />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16 w-full flex-1">
        <Tabs defaultValue="single" className="w-full">
          <TabsList
            className="flex border-b border-[#0A0A0A] w-full bg-transparent rounded-none p-0 h-auto justify-start gap-0"
            data-testid="mode-tabs"
          >
            <TabsTrigger
              value="single"
              data-testid="tab-single"
              className="px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-[#525252] hover:text-[#0A0A0A] border-b-2 border-transparent data-[state=active]:border-[#0000FF] data-[state=active]:text-[#0A0A0A] data-[state=active]:shadow-none rounded-none bg-transparent"
            >
              Single File
            </TabsTrigger>
            <TabsTrigger
              value="batch"
              data-testid="tab-batch"
              className="px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-[#525252] hover:text-[#0A0A0A] border-b-2 border-transparent data-[state=active]:border-[#0000FF] data-[state=active]:text-[#0A0A0A] data-[state=active]:shadow-none rounded-none bg-transparent"
            >
              Batch Unlock
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="mt-8">
            <SingleMode />
          </TabsContent>
          <TabsContent value="batch" className="mt-8">
            <BatchMode />
          </TabsContent>
        </Tabs>
      </main>
      <footer className="border-t border-[#E5E5E5] bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#525252]">
          <span className="tracking-[0.2em] uppercase">UNLOCK.PDF — Process &amp; Forget</span>
          <span>Files auto-deleted after 30 minutes</span>
        </div>
      </footer>
    </div>
  );
}
