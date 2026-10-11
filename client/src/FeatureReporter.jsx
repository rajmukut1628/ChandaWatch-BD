import { translate } from "./staff-copy";
import React, { useState, useEffect } from "react";
import { useApp, Alert, Text } from "./ui";
import { api } from "./api";
const safeFields = [
  "incidentType",
  "district",
  "upazila",
  "union",
  "area",
  "incidentDate",
  "description",
  "demandedAmount",
];
export function DraftTools({ formRef, snapshot, onRestore }) {
  const { bn } = useApp(),
    [enabled, setEnabled] = useState(false),
    [draft, setDraft] = useState(() => {
      try {
        const d = JSON.parse(localStorage.getItem("cw_report_draft"));
        if (d && d.expiresAt > Date.now()) return d;
        localStorage.removeItem("cw_report_draft");
      } catch {}
      return null;
    }),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled || !snapshot) return;
    const timer = setTimeout(() => {
      const data = Object.fromEntries(
          safeFields.map((k) => [k, snapshot[k] || ""]),
        ),
        entry = {
          data,
          expiresAt: Date.now() + 86400000,
        };
      try {
        localStorage.setItem("cw_report_draft", JSON.stringify(entry));
        setDraft(entry);
        setMessage(
          bn ? "এই device-এ draft সংরক্ষিত" : "Draft saved on this device",
        );
      } catch {
        setMessage(
          bn
            ? "Browser storage-এ সংরক্ষণ সম্ভব হয়নি"
            : "Browser storage is unavailable",
        );
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [snapshot, enabled, bn]);
  return (
    <div className="draft-tools no-print">
      <label className="check-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) {
              localStorage.removeItem("cw_report_draft");
              setDraft(null);
              setMessage("");
            }
          }}
        />
        <Text
          value={
            bn
              ? "এই device-এ draft রাখুন (ঐচ্ছিক)"
              : "Save a draft on this device (optional)"
          }
        />
      </label>
      <small>
        <Text
          value={
            bn
              ? "বিবরণ এই browser-এ ২৪ ঘণ্টা থাকবে। Shared device-এ ব্যবহার করবেন না। Contact, secret ও media সংরক্ষিত হবে না।"
              : "Your narrative remains in this browser for 24 hours. Avoid this on shared devices. Contacts, secrets and media are excluded."
          }
        />
      </small>
      {draft && (
        <div className="actions">
          <button
            type="button"
            className="button outline small"
            onClick={() => {
              onRestore(draft.data);
              setMessage(
                bn
                  ? "Draft ফিরেছে; তথ্য যাচাই করুন"
                  : "Draft restored; check its information",
              );
            }}
          >
            <Text value={bn ? "Draft ফেরত আনুন" : "Restore draft"} />
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => {
              localStorage.removeItem("cw_report_draft");
              setDraft(null);
              setEnabled(false);
              setMessage(
                bn ? "Local draft সরানো হয়েছে" : "Local draft removed",
              );
            }}
          >
            <Text value={bn ? "Draft মুছুন" : "Clear draft"} />
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
export async function submissionFingerprint(body) {
  const stable = JSON.stringify([
    body.incidentType,
    body.district,
    body.incidentDate,
    body.description.trim().toLowerCase().replace(/\s+/g, " "),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stable),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function recentlySubmitted(fingerprint) {
  try {
    return JSON.parse(sessionStorage.getItem("cw_submitted") || "[]").some(
      (x) => x.hash === fingerprint && Date.now() - x.time < 2 * 3600000,
    );
  } catch {
    return false;
  }
}
export function rememberSubmission(fingerprint) {
  try {
    const previous = JSON.parse(sessionStorage.getItem("cw_submitted") || "[]");
    sessionStorage.setItem(
      "cw_submitted",
      JSON.stringify(
        [
          ...previous.filter((x) => Date.now() - x.time < 2 * 3600000),
          {
            hash: fingerprint,
            time: Date.now(),
          },
        ].slice(-20),
      ),
    );
    localStorage.removeItem("cw_report_draft");
  } catch {}
}
export function SubmissionPreview({
  body,
  files,
  districts,
  upazilas,
  unions,
  duplicate,
  onConfirm,
  onCancel,
  busy,
}) {
  const { bn } = useApp();
  return (
    <section
      className="submission-preview card"
      role="region"
      aria-label={translate(bn ? "জমার আগে preview" : "Submission preview")}
    >
      <h2>
        <Text
          value={bn ? "জমা দেওয়ার আগে মিলিয়ে দেখুন" : "Check before submitting"}
        />
      </h2>
      {duplicate && (
        <Alert error>
          <Text
            value={
              bn
                ? "এই browser থেকে একই তথ্য সম্প্রতি জমা হয়েছে। আগের Tracking দিয়ে দেখুন। আবার জমা দেওয়া প্রয়োজন হলে নিশ্চিত করুন।"
                : "The same information was submitted recently in this browser. Check the previous tracking receipt. Confirm only if another submission is needed."
            }
          />
        </Alert>
      )}
      <dl className="detail-grid">
        <div>
          <dt>
            <Text value={bn ? "এলাকা" : "Location"} />
          </dt>
          <dd>
            {
              districts.find((d) => d.code === body.district)?.[
                bn ? "bn" : "name"
              ]
            }{" "}
            ·{" "}
            {
              upazilas.find((u) => u.code === body.upazila)?.[
                bn ? "bn" : "name"
              ]
            }{" "}
            · {unions.find((u) => u.code === body.union)?.[bn ? "bn" : "name"]}{" "}
            · {body.area}
          </dd>
        </div>
        <div>
          <dt>
            <Text value={bn ? "তারিখ" : "Date"} />
          </dt>
          <dd>{body.incidentDate}</dd>
        </div>
        <div>
          <dt>
            <Text value={bn ? "টাকা" : "Amount"} />
          </dt>
          <dd>
            {body.demandedAmount ?? "—"} <Text value={"BDT"} />
          </dd>
        </div>
      </dl>
      <p className="description-text">{body.description}</p>
      <p>
        <Text value={bn ? "নির্বাচিত ফাইল" : "Selected files"} />:{" "}
        {files.map((f) => f.name).join(", ") || "—"}
      </p>
      <p>
        <Text
          value={
            body.contactRequested
              ? bn
                ? "যোগাযোগের তথ্য দেওয়া হবে"
                : "Contact information included"
              : bn
                ? "যোগাযোগের তথ্য নেই"
                : "No contact information"
          }
        />{" "}
        ·{" "}
        <Text
          value={
            body.publicConsent
              ? bn
                ? "পরিচয়মুক্ত Public গল্পে সম্মতি"
                : "Consent to a redacted public story"
              : bn
                ? "Public গল্পে সম্মতি নেই"
                : "No public-story consent"
          }
        />
      </p>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onConfirm}
        >
          <Text
            value={
              busy
                ? bn
                  ? "জমা হচ্ছে…"
                  : "Submitting…"
                : bn
                  ? "নিশ্চিত করে জমা দিন"
                  : "Confirm and submit"
            }
          />
        </button>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={onCancel}
        >
          <Text value={bn ? "সম্পাদনায় ফিরুন" : "Back to editing"} />
        </button>
      </div>
    </section>
  );
}
export async function inspectImageMetadata(file) {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer(),
  );
  if (file.type === "image/jpeg") {
    for (let i = 2; i + 4 < bytes.length;) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const size = (bytes[i + 2] << 8) | bytes[i + 3];
      if (size < 2) break;
      if (marker === 0xe1 || marker === 0xed) return true;
      i += 2 + size;
    }
  }
  if (file.type === "image/png") {
    for (let i = 8; i + 12 < bytes.length;) {
      const view = new DataView(bytes.buffer),
        len = view.getUint32(i),
        type = String.fromCharCode(...bytes.slice(i + 4, i + 8));
      if (["eXIf", "tEXt", "iTXt", "zTXt"].includes(type)) return true;
      i += 12 + len;
      if (type === "IDAT") break;
    }
  }
  if (file.type === "image/webp") {
    for (let i = 12; i + 8 < bytes.length;) {
      const tag = String.fromCharCode(...bytes.slice(i, i + 4));
      if (["EXIF", "XMP "].includes(tag)) return true;
      const len = new DataView(bytes.buffer).getUint32(i + 4, true);
      i += 8 + len + (len % 2);
    }
  }
  return false;
}
export async function stripImageMetadata(file) {
  if (!file.type.startsWith("image/")) throw Error("Choose an image.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw Error(
        "Image dimensions are too large for safe browser conversion.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(
        resolve,
        file.type === "image/jpeg" ? "image/jpeg" : "image/png",
        0.95,
      ),
    );
    if (!blob) throw Error("Could not re-encode image.");
    if (blob.size > 10 * 1024 * 1024)
      throw Error("Re-encoded image exceeds 10 MB.");
    return new File(
      [blob],
      "metadata-removed." + (blob.type === "image/jpeg" ? "jpg" : "png"),
      {
        type: blob.type,
        lastModified: Date.now(),
      },
    );
  } finally {
    bitmap.close();
  }
}
export function MetadataTools({ file, onReplace, disabled }) {
  const { bn } = useApp(),
    [found, setFound] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (file.type.startsWith("image/"))
      inspectImageMetadata(file)
        .then((v) => alive && setFound(v))
        .catch(() => alive && setFound(null));
    return () => {
      alive = false;
    };
  }, [file]);
  if (!file.type.startsWith("image/")) return null;
  return (
    <div className="metadata-tools">
      <small>
        <Text
          value={
            found === true
              ? bn
                ? "Metadata পাওয়া গেছে; GPS/device পরিচয় থাকতে পারে।"
                : "Metadata detected; it may contain GPS/device identity."
              : found === false
                ? bn
                  ? "পরীক্ষা করা অংশে metadata পাওয়া যায়নি; এটি পূর্ণ privacy audit নয়।"
                  : "No metadata found in the inspected portion; this is not a complete privacy audit."
                : bn
                  ? "Metadata পরীক্ষা চলছে"
                  : "Inspecting metadata"
          }
        />
      </small>
      <button
        type="button"
        className="button outline small"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            onReplace(await stripImageMetadata(file));
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text
          value={
            bn ? "Re-encode করে metadata সরান" : "Re-encode to remove metadata"
          }
        />
      </button>
      <small>
        <Text
          value={
            bn
              ? "নতুন copy হবে; original বদলাবে না। ছবির quality পরিবর্তিত হতে পারে।"
              : "Creates a new copy and preserves your original. Image quality may change."
          }
        />
      </small>
      {error && <Alert error>{error}</Alert>}
    </div>
  );
}
export function UploadMetrics() {
  const { bn } = useApp(),
    [metrics, setMetrics] = useState(null);
  useEffect(() => {
    const listen = (e) => setMetrics(e.detail);
    window.addEventListener("cw-upload-metrics", listen);
    return () => window.removeEventListener("cw-upload-metrics", listen);
  }, []);
  if (!metrics) return null;
  return (
    <p className="upload-metrics" role="status">
      {metrics.name} · {(metrics.bytesPerSecond / 1024 / 1024).toFixed(2)}{" "}
      <Text value={"MB/s \xB7"} />{" "}
      <Text
        value={
          metrics.remainingSeconds === null
            ? bn
              ? "প্রসেস হচ্ছে"
              : "Processing"
            : `${Math.ceil(metrics.remainingSeconds).toLocaleString(bn ? "bn-BD" : "en-GB")} ${bn ? "সেকেন্ড বাকি (আনুমানিক)" : "seconds remaining (estimate)"}`
        }
      />{" "}
      · {metrics.progress}%
    </p>
  );
}
export function PendingUploads({ credentials, busy = false, admin = false }) {
  const { bn } = useApp();
  const [items, setItems] = useState([]),
    [error, setError] = useState("");
  const prefix = admin
    ? `/features/admin/reports/${credentials.id}`
    : `/features/reporter/${credentials.id}`;
  const headers = admin
    ? {}
    : {
        "x-tracking-id": credentials.trackingId,
        "x-tracking-secret": credentials.secret,
      };
  async function refresh() {
    try {
      setItems(
        (
          await api(prefix + "/uploads", {
            headers,
          })
        ).items,
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (!busy) refresh();
  }, [busy, credentials.id, credentials.trackingId, credentials.secret]);
  return (
    <div className="pending-uploads">
      {items.length > 0 && (
        <>
          <p>
            <Text
              value={
                bn
                  ? "একই ফাইল আবার বেছে নিলে অসমাপ্ত upload চলবে। প্রয়োজন না হলে বাতিল করুন।"
                  : "Choose the original file to resume an unfinished upload, or cancel it."
              }
            />
          </p>
          {items.map((u) => (
            <div key={u._id}>
              <span>
                {(u.size / 1024 / 1024).toFixed(1)} <Text value={"MB \xB7"} />{" "}
                {u.received.length}/{u.chunkCount}
              </span>{" "}
              <button
                type="button"
                className="button outline small"
                disabled={busy || u.state === "assembling"}
                onClick={async () => {
                  try {
                    await api(prefix + `/uploads/${u._id}`, {
                      method: "DELETE",
                      headers,
                    });
                    await refresh();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <Text
                  value={
                    bn ? "অসমাপ্ত upload বাতিল" : "Cancel unfinished upload"
                  }
                />
              </button>
            </div>
          ))}
        </>
      )}
      {error && <Alert error>{error}</Alert>}
    </div>
  );
}
