import { translate } from "./staff-copy";
import React, { useEffect, useState } from "react";
import { useApp, Icon, Alert, Text } from "./ui";
import { uploadEvidence } from "./api";
import { MetadataTools, UploadMetrics } from "./FeatureReporter";
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);
export function MediaPicker({ files, onChange, disabled = false }) {
  const { bn } = useApp(),
    [error, setError] = useState(""),
    [previews, setPreviews] = useState([]),
    t = (b, e) => translate(bn ? b : e);
  useEffect(() => {
    const entries = files.map((f) => ({
      file: f,
      url: URL.createObjectURL(f),
    }));
    setPreviews(entries);
    return () => entries.forEach((e) => URL.revokeObjectURL(e.url));
  }, [files]);
  function choose(e) {
    setError("");
    const added = [...e.target.files];
    e.target.value = "";
    if (files.length + added.length > 5) {
      setError(
        t("সর্বোচ্চ ৫টি ফাইল দিতে পারবেন।", "Maximum five evidence files."),
      );
      return;
    }
    for (const f of added) {
      if (!allowed.has(f.type)) {
        setError(
          t(
            "অনুমোদিত ছবি, ভিডিও, PDF বা অডিও দিন।",
            "Choose supported images, video, PDF or audio.",
          ),
        );
        return;
      }
      if (f.size > (f.type.startsWith("video/") ? 200 : 10) * 1024 * 1024) {
        setError(
          t(
            "ছবি/ডকুমেন্ট/অডিও সর্বোচ্চ ১০ MB; ভিডিও ২০০ MB।",
            "Images/documents/audio: 10 MB; videos: 200 MB maximum.",
          ),
        );
        return;
      }
    }
    onChange([...files, ...added]);
  }
  return (
    <section className="media-picker">
      <div className="row">
        <div>
          <span className="eyebrow">
            {t("ব্যক্তিগত প্রমাণ · ঐচ্ছিক", "PRIVATE EVIDENCE · OPTIONAL")}
          </span>
          <h3>{t("ছবি বা ভিডিও যুক্ত করুন", "Add photos or video")}</h3>
        </div>
        <span className="badge">
          <Icon.LockKeyhole size={12} />
          {t("পাবলিক হবে না", "PRIVATE")}
        </span>
      </div>
      <label className="upload-drop">
        <Icon.Upload size={27} />
        <strong>{t("ফাইল নির্বাচন করুন", "Choose evidence files")}</strong>
        <span>
          {t(
            "সর্বোচ্চ ৫টি • ছবি ১০ MB • ভিডিও ২০০ MB",
            "Up to 5 files · photos 10 MB · video 200 MB",
          )}
        </span>
        <input
          type="file"
          multiple
          disabled={disabled}
          aria-label={t("প্রমাণ নির্বাচন", "Select evidence files")}
          accept={[...allowed].join(",")}
          onChange={choose}
        />
      </label>
      <p className="fine-print">
        {t(
          "প্রমাণ encrypted storage-এ যাবে। প্রকাশযোগ্য বিবরণের অনুমতি দিলেও এই ফাইলগুলো ব্যক্তিগত থাকবে। নিরাপদ হলে পরিচয় প্রকাশকারী metadata সরিয়ে দিন।",
          "Evidence goes to encrypted private storage. Public-story consent does not publish these files. Remove identifying metadata when safe.",
        )}
      </p>
      {error && <Alert error>{error}</Alert>}
      <div className="media-previews">
        {previews.map(({ file, url }, i) => (
          <article key={url} className="media-preview">
            {file.type.startsWith("image/") ? (
              <img
                src={url}
                alt={t("নির্বাচিত ছবির preview", "Selected evidence preview")}
              />
            ) : file.type.startsWith("video/") ? (
              <video src={url} controls preload="metadata" playsInline />
            ) : (
              <div className="file-preview">
                <Icon.FileText size={32} />
                <span>{file.type.split("/")[1]}</span>
              </div>
            )}
            <div className="media-file-name">
              <span title={file.name}>
                {file.name}
                <small>
                  {(file.size / 1024 / 1024).toFixed(1)} <Text value={"MB"} />
                </small>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={t("ফাইল সরান", "Remove file")}
                disabled={disabled}
                onClick={() =>
                  onChange(files.filter((_, index) => index !== i))
                }
              >
                <Icon.X size={15} />
              </button>
            </div>
            <MetadataTools
              file={file}
              disabled={disabled}
              onReplace={(next) =>
                onChange(files.map((f, index) => (index === i ? next : f)))
              }
            />
          </article>
        ))}
      </div>
    </section>
  );
}
export function IntakeUploadQueue() {
  const { receipt, setReceipt, bn } = useApp(),
    [retrying, setRetrying] = useState(false),
    t = (b, e) => translate(bn ? b : e);
  if (!receipt?.uploads?.length) return null;
  const update = (index, changes) =>
    setReceipt((current) =>
      current?.id === receipt.id
        ? {
            ...current,
            uploads: current.uploads.map((u, i) =>
              i === index
                ? {
                    ...u,
                    ...changes,
                  }
                : u,
            ),
          }
        : current,
    );
  async function retry(index) {
    setRetrying(true);
    update(index, {
      status: "uploading",
      progress: 0,
      error: "",
    });
    try {
      const result = await uploadEvidence(
        receipt,
        receipt.uploads[index].file,
        (p) =>
          update(index, {
            progress: p,
          }),
      );
      update(index, {
        status: "uploaded",
        progress: 100,
        scanStatus: result.malwareScanStatus,
        file: null,
      });
    } catch (e) {
      update(index, {
        status: "failed",
        error: e.message,
      });
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="card mt">
      <h3>{t("আপনার ব্যক্তিগত প্রমাণ", "Your private evidence")}</h3>
      <UploadMetrics />
      <p>
        {t(
          "রিপোর্ট জমা হয়েছে। ফাইল ব্যর্থ হলেও আবার report জমা দেবেন না—Retry ব্যবহার করুন অথবা tracking থেকে ফাইল দিন।",
          "Your report is already saved. If a file fails, use Retry or add it from tracking; do not resubmit the report.",
        )}
      </p>
      {receipt.uploads.map((u, i) => (
        <div className="upload-queue-row" key={i}>
          <Icon.FileText size={18} />
          <div>
            <strong>{u.name}</strong>
            <small>
              {u.status === "uploaded"
                ? t("আপলোড হয়েছে", "Uploaded") +
                  " · " +
                  translate(u.scanStatus, bn)
                : u.status === "failed"
                  ? u.error
                  : u.status === "uploading"
                    ? t("আপলোড হচ্ছে", "Uploading") +
                      " " +
                      u.progress.toLocaleString(bn ? "bn-BD" : "en-GB") +
                      "%"
                    : t("অপেক্ষায়", "Waiting")}
            </small>
            {u.status === "uploading" && (
              <progress max="100" value={u.progress} />
            )}
          </div>
          {u.status === "failed" && (
            <button
              className="button outline small"
              disabled={retrying}
              onClick={() => retry(i)}
            >
              {t("আবার চেষ্টা", "Retry")}
            </button>
          )}
          {u.status === "uploaded" && <Icon.CheckCircle2 size={18} />}
        </div>
      ))}
    </div>
  );
}
