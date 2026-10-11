import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useApp, Icon, Alert } from "./ui";

export const newsCategories = {
  important: ["গুরুত্বপূর্ণ সংবাদ", "Important news"],
  alert: ["সতর্কতা", "Alerts"],
  local: ["স্থানীয় খবর", "Local news"],
  awareness: ["সচেতনতা", "Awareness"],
};
export const newsMediaUrl = (id, preview = false) =>
  `/api/v1/features/${preview ? "admin" : "public"}/news-media/${id}`;
export const storyText = (item, bn, field) =>
  item[field + (bn ? "Bn" : "")] ||
  (bn ? "এই ভাষায় লেখা বাকি আছে।" : "This translation is missing.");
export const homepageNews = (items) => items.slice(0, 8);
export function NewsCard({ item, bn, preview = false }) {
  const [failed, setFailed] = useState(false);
  const title = storyText(item, bn, "title");
  const text = storyText(item, bn, "body");
  const category = newsCategories[item.newsCategory || "important"];
  return (
    <article className="news-card">
      <div className="news-art">
        {item.coverMediaId && !failed ? (
          <img
            src={newsMediaUrl(item.coverMediaId, preview)}
            alt=""
            loading="lazy"
            decoding="async"
            width="480"
            height="270"
            onError={() => setFailed(true)}
          />
        ) : (
          <Icon.ScrollText size={32} />
        )}
        {item.videoMediaId && (
          <span className="news-video-badge">
            <Icon.Play size={14} />
            {bn ? "ভিডিও" : "Video"}
          </span>
        )}
      </div>
      <div className="news-card-body">
        <div className="news-meta">
          <span>{category?.[bn ? 0 : 1]}</span>
          <time dateTime={item.publishAt || item.updatedAt}>
            {new Date(
              item.publishAt || item.updatedAt || Date.now(),
            ).toLocaleDateString(bn ? "bn-BD" : "en-GB")}
          </time>
        </div>
        <h2>
          {preview ? title : <Link to={`/news/${item.slug}`}>{title}</Link>}
        </h2>
        <p>
          {text.slice(0, 120)}
          {text.length > 120 ? "…" : ""}
        </p>
        {!preview && (
          <Link className="news-read" to={`/news/${item.slug}`}>
            {bn ? "বিস্তারিত পড়ুন" : "Read the story"}
            <Icon.ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
export function NewsFilters({ onApply }) {
  const { bn, districts = [] } = useApp();
  return (
    <form
      className="news-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <label>
        {bn ? "সংবাদ খুঁজুন" : "Search news"}
        <input
          name="q"
          type="search"
          maxLength={100}
          placeholder={bn ? "শিরোনাম লিখুন" : "Enter a title"}
        />
      </label>
      <label>
        {bn ? "বিভাগ" : "Category"}
        <select name="category">
          <option value="">{bn ? "সব বিভাগ" : "All categories"}</option>
          {Object.entries(newsCategories).map(([k, v]) => (
            <option key={k} value={k}>
              {v[bn ? 0 : 1]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {bn ? "জেলা" : "District"}
        <select name="district">
          <option value="">{bn ? "সব জেলা" : "All districts"}</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {bn ? d.bn : d.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {bn ? "শুরুর তারিখ" : "From date"}
        <input name="from" type="date" />
      </label>
      <label>
        {bn ? "শেষ তারিখ" : "To date"}
        <input name="to" type="date" />
      </label>
      <div className="actions">
        <button className="button">{bn ? "খুঁজুন" : "Search"}</button>
        <button
          type="reset"
          className="button outline"
          onClick={() => onApply({})}
        >
          {bn ? "সব মুছুন" : "Clear filters"}
        </button>
      </div>
    </form>
  );
}
export function NewsEditorTools({
  current,
  setCurrent,
  onBusyChange = () => {},
}) {
  const { bn, districts = [] } = useApp();
  const [preview, setPreview] = useState(false),
    [previewBn, setPreviewBn] = useState(true),
    [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const complete =
    [current.title, current.body].every((v) => /[A-Za-z]/.test(v || "")) &&
    [current.titleBn, current.bodyBn].every((v) =>
      /[\u0980-\u09ff]/.test(v || ""),
    );
  async function upload(file, field) {
    if (!file) return;
    setError("");
    setBusy(true);
    onBusyChange(true);
    try {
      if (
        file.type.startsWith("video/")
          ? file.size > 200 * 1024 * 1024
          : file.size > 10 * 1024 * 1024
      )
        throw Error(
          bn
            ? "ছবি সর্বোচ্চ ১০ মেগাবাইট; ভিডিও ২০০ মেগাবাইট।"
            : "Photos: 10 MB; video: 200 MB maximum.",
        );
      const body = new FormData();
      if (field === "coverMediaId") {
        const bitmap = await createImageBitmap(file);
        try {
          if (bitmap.width * bitmap.height > 40000000)
            throw Error(
              bn ? "ছবির মাপ অত্যন্ত বড়।" : "Image dimensions are too large.",
            );
          const scale = Math.min(
            1,
            960 / Math.max(bitmap.width, bitmap.height),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas
            .getContext("2d")
            .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/webp", 0.85),
          );
          if (!blob)
            throw Error(
              bn ? "ছবি প্রস্তুত করা যায়নি।" : "Could not prepare cover photo.",
            );
          file = new File([blob], "news-cover.webp", { type: blob.type });
        } finally {
          bitmap.close();
        }
      }
      body.append("file", file);
      const data = await api("/features/admin/news-media", {
        method: "POST",
        body,
      });
      setCurrent((c) => ({ ...c, [field]: data.id }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <fieldset className="news-editor-tools" disabled={busy}>
      <legend>
        {bn ? "সংবাদ সাজানো ও পূর্বরূপ" : "News presentation and preview"}
      </legend>
      <div className="form-grid">
        <label>
          {bn ? "সংবাদের বিভাগ" : "News category"}
          <select
            value={current.newsCategory || "important"}
            onChange={(e) =>
              setCurrent({ ...current, newsCategory: e.target.value })
            }
          >
            {Object.entries(newsCategories).map(([k, v]) => (
              <option key={k} value={k}>
                {v[bn ? 0 : 1]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {bn ? "সংবাদের জেলা" : "News district"}
          <select
            value={current.district || ""}
            onChange={(e) =>
              setCurrent({ ...current, district: e.target.value })
            }
          >
            <option value="">{bn ? "সারা বাংলাদেশ" : "Nationwide"}</option>
            {districts.map((d) => (
              <option key={d.code} value={d.code}>
                {bn ? d.bn : d.name}
              </option>
            ))}
          </select>
        </label>
        {[
          [
            "coverMediaId",
            bn ? "প্রচ্ছদের ছবি" : "Cover photo",
            "image/jpeg,image/png,image/webp",
          ],
          [
            "videoMediaId",
            bn ? "সংবাদের ভিডিও" : "News video",
            "video/mp4,video/webm",
          ],
        ].map(([field, label, accept]) => (
          <label key={field}>
            {label}
            <input
              type="file"
              accept={accept}
              onChange={(e) => {
                upload(e.target.files[0], field);
                e.target.value = "";
              }}
            />
            {current[field] && (
              <>
                <small>{bn ? "যুক্ত হয়েছে" : "Attached"}</small>
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => setCurrent({ ...current, [field]: null })}
                >
                  {bn ? "সরান" : "Remove"}
                </button>
              </>
            )}
          </label>
        ))}
      </div>
      <p>
        {bn
          ? "ক্রমের ছোট সংখ্যা আগে দেখাবে। প্রথম ৮টি নির্বাচিত সংবাদ মূল পাতায় থাকবে। ছবি/ভিডিও কেবল নিরাপত্তা পরীক্ষায় উত্তীর্ণ হলে যুক্ত হবে।"
          : "Lower order numbers appear first. The first eight featured stories appear on the homepage. Media is attached only after a clean security scan."}
      </p>
      {!complete && (
        <Alert error>
          {bn
            ? "প্রকাশের আগে বাংলা ও ইংরেজি শিরোনাম এবং লেখা সম্পূর্ণ করুন।"
            : "Complete Bengali and English titles and information before publishing."}
        </Alert>
      )}
      {busy && (
        <p role="status">
          {bn ? "আপলোড ও নিরাপত্তা পরীক্ষা চলছে…" : "Uploading and scanning…"}
        </p>
      )}
      {error && <Alert error>{error}</Alert>}
      <button
        type="button"
        className="button outline"
        onClick={() => setPreview(!preview)}
      >
        {bn ? "প্রকাশের পূর্বরূপ" : "Publication preview"}
      </button>
      {preview && (
        <section className="news-preview">
          <div className="actions">
            <button type="button" onClick={() => setPreviewBn(!previewBn)}>
              {previewBn ? "English" : "বাংলা"}
            </button>
            <button type="button" onClick={() => setMobile(!mobile)}>
              {bn
                ? mobile
                  ? "বড় পর্দা"
                  : "মোবাইল"
                : mobile
                  ? "Desktop"
                  : "Mobile"}
            </button>
          </div>
          <div style={{ maxWidth: mobile ? 360 : 720, margin: "12px auto" }}>
            <NewsCard item={current} bn={previewBn} preview />
            <div className="news-preview-body">
              <h2>{storyText(current, previewBn, "title")}</h2>
              <p>{storyText(current, previewBn, "body")}</p>
              {current.videoMediaId && (
                <video
                  src={newsMediaUrl(current.videoMediaId, true)}
                  poster={
                    current.coverMediaId
                      ? newsMediaUrl(current.coverMediaId, true)
                      : undefined
                  }
                  controls
                  preload="none"
                  playsInline
                  aria-label={bn ? "ভিডিওর পূর্বরূপ" : "Video preview"}
                />
              )}
            </div>
          </div>
        </section>
      )}
    </fieldset>
  );
}
