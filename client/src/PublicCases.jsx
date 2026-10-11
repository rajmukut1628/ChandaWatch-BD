import { translate } from "./staff-copy";
import {
  SavedFilters,
  ShareLink,
  BookmarkButton,
  CaseExtras,
} from "./FeaturePublic";
import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, typeLabels, statusLabels } from "./api";
import { useApp, Icon, Alert, Text } from "./ui";
const visuals = {
  extortion_demand: {
    tone: "sage",
    icon: Icon.FileText,
  },
  business_extortion: {
    tone: "sand",
    icon: Icon.ClipboardList,
  },
  transport_extortion: {
    tone: "blue",
    icon: Icon.MapPin,
  },
  threat_intimidation: {
    tone: "rose",
    icon: Icon.Shield,
  },
  other: {
    tone: "sage",
    icon: Icon.HeartHandshake,
  },
};
function useCases(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    api(url)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [url, attempt]);
  return {
    data,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
function monthLabel(month, bn) {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString(
    bn ? "bn-BD" : "en-GB",
    {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Dhaka",
    },
  );
}
export function CaseIllustration({ type, large = false }) {
  const visual = visuals[type] || visuals.other,
    I = visual.icon;
  return (
    <div
      className={"case-art " + visual.tone + (large ? " large" : "")}
      aria-hidden="true"
    >
      <div className="art-orbit first" />
      <div className="art-orbit second" />
      <div className="art-lines">
        <span />
        <span />
        <span />
      </div>
      <span className="art-icon">
        <I strokeWidth={1.25} />
      </span>
      <span className="art-caption">
        <Text value={"COMMUNITY JOURNAL / BD"} />
      </span>
    </div>
  );
}
function ReviewBadge({ level, bn }) {
  const verified = level === "independently_verified";
  return (
    <span className={"review-badge " + (verified ? "verified" : "")}>
      <Icon.ShieldCheck size={13} />
      <Text
        value={
          verified
            ? bn
              ? "স্বাধীনভাবে যাচাইকৃত"
              : "Independently verified"
            : bn
              ? "পর্যালোচিত রিপোর্ট"
              : "Reviewed report"
        }
      />
    </span>
  );
}
function Skeletons() {
  return (
    <div
      className="case-grid"
      aria-label={translate("Loading reports")}
      aria-busy="true"
    >
      {Array.from(
        {
          length: 6,
        },
        (_, i) => (
          <div className="case-card skeleton" key={i}>
            <div className="skeleton-art" />
            <div className="skeleton-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
function PublicMap({ items, bn }) {
  const [enabled, setEnabled] = useState(false),
    rows = Object.values(
      items.reduce((m, r) => {
        const d = r.district;
        m[d.code] ??= {
          ...d,
          count: 0,
        };
        m[d.code].count++;
        return m;
      }, {}),
    );
  return (
    <div className="journal-map">
      {enabled ? (
        <>
          <MapContainer center={[23.8, 90.3]} zoom={7} scrollWheelZoom={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {rows.map((d) => (
              <CircleMarker
                key={d.code}
                center={d.center}
                radius={10 + Math.sqrt(d.count) * 3}
                pathOptions={{
                  color: "#155947",
                  fillOpacity: 0.35,
                }}
              >
                <Popup>
                  {bn ? d.bn : d.name}
                  <br />
                  {d.count}{" "}
                  <Text
                    value={
                      bn ? "এই page-এ প্রকাশিত বিবরণ" : "accounts on this page"
                    }
                  />
                  <br />
                  <Text
                    value={bn ? "শুধু জেলার কেন্দ্র" : "District center only"}
                  />
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          <p className="map-legend">
            <Text
              value={
                bn
                  ? "এই page-এর প্রকাশিত বিবরণের জেলা। ঘটনার সুনির্দিষ্ট অবস্থান নয়।"
                  : "Districts represented on this page. Markers do not indicate incident locations."
              }
            />
          </p>
        </>
      ) : (
        <div className="map-consent">
          <Icon.MapPin size={38} />
          <h3>
            <Text
              value={bn ? "জেলার চিত্র দেখুন" : "Explore the district view"}
            />
          </h3>
          <p>
            <Text
              value={
                bn
                  ? "ম্যাপ চালু করলে OpenStreetMap provider আপনার IP address এবং tile request পেতে পারে।"
                  : "Enabling the map sends tile requests and your IP address to OpenStreetMap providers."
              }
            />
          </p>
          <button className="button" onClick={() => setEnabled(true)}>
            <Text value={bn ? "ম্যাপ চালু করুন" : "Enable map"} />
          </button>
        </div>
      )}
    </div>
  );
}
export function PublicCases() {
  const { bn, districts, upazilas, unions } = useApp(),
    [params, setParams] = useSearchParams(),
    t = (b, e) => translate(bn ? b : e),
    [view, setView] = useState("list"),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(() => Object.fromEntries(params));
  useEffect(() => setDraft(Object.fromEntries(params)), [params.toString()]);
  const query = params.toString(),
    { data, error, retry } = useCases(
      "/public/cases" + (query ? "?" + query : ""),
    ),
    selectedUpazilas = upazilas.filter(
      (u) => u.districtCode === draft.district,
    );
  const change = (key, value) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "district"
        ? {
            upazila: "",
            union: "",
          }
        : key === "upazila"
          ? {
              union: "",
            }
          : {}),
    }));
  function apply(e) {
    e.preventDefault();
    setParams(
      Object.fromEntries(
        Object.entries({
          ...draft,
          page: "1",
        }).filter(([, v]) => v),
      ),
    );
  }
  function page(n) {
    const p = new URLSearchParams(params);
    p.set("page", String(n));
    setParams(p);
    document.getElementById("journal-results")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
  const filters = Object.entries(Object.fromEntries(params)).filter(
    ([k, v]) => v && !["page", "sort"].includes(k),
  );
  return (
    <>
      <section className="journal-hero">
        <div className="container">
          <div className="journal-heading">
            <div>
              <span className="eyebrow">
                <span className="live-dot" />
                {t(
                  "নাগরিক অভিজ্ঞতা · দায়িত্বশীল প্রকাশ",
                  "COMMUNITY JOURNAL · RESPONSIBLE PUBLICATION",
                )}
              </span>
              <h1>
                {t("ঘটনার চিত্র।", "Stories that inform.")}
                <br />
                <span>
                  {t("সচেতনতার নতুন দিগন্ত।", "Perspectives that matter.")}
                </span>
              </h1>
              <p>
                {t(
                  "মানুষের অভিজ্ঞতা থেকে সচেতনতা। সম্মতি, পরিচয় সুরক্ষা এবং স্বাধীন পর্যালোচনার পর প্রকাশিত বিবরণ এক জায়গায়।",
                  "Community experiences, shared with care. Explore consented accounts after privacy review and independent publication approval.",
                )}
              </p>
            </div>
            <div className="journal-seal">
              <Icon.ShieldCheck size={36} />
              <strong>
                {t("প্রকাশের আগে পর্যালোচনা", "Care before publication")}
              </strong>
              <span>
                {t(
                  "পরিচয়মুক্ত বিবরণ • ব্যক্তিগত প্রমাণ",
                  "Redacted accounts · Private evidence",
                )}
              </span>
              <Link to="/privacy">
                {t("আমাদের নীতি", "Our privacy approach")}
                <Icon.ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
          <div className="journal-principles">
            <span>
              <Icon.EyeOff size={16} />
              {t("নাম ও পরিচয় গোপন", "Identities protected")}
            </span>
            <span>
              <Icon.Users size={16} />
              {t("স্বাধীন দ্বিতীয় পর্যালোচনা", "Independent second review")}
            </span>
            <span>
              <Icon.LockKeyhole size={16} />
              {t("ছবি ও ভিডিও ব্যক্তিগত", "Photos and video remain private")}
            </span>
          </div>
        </div>
      </section>
      <div className="container journal-body">
        <div className="journal-caution">
          <Icon.TriangleAlert size={18} />
          <p>
            {t(
              "“পর্যালোচিত” মানেই অভিযোগ প্রমাণিত নয়। স্বাধীন যাচাইয়ের দাবি থাকলে তার পদ্ধতি আলাদাভাবে দেখানো হয়। এই তথ্য অপরাধের প্রকৃত হার নয়।",
              "“Reviewed” does not mean an allegation is proven. Independent verification is labeled separately with its method. These accounts do not measure crime rates.",
            )}
          </p>
        </div>
        <div className="journal-tools no-print">
          <SavedFilters
            scope="public"
            query={query}
            onLoad={(q) => setParams(new URLSearchParams(q))}
          />
          <ShareLink
            url={location.origin + "/incidents" + (query ? "?" + query : "")}
            label={t("Filter link কপি", "Copy filter link")}
          />
          <button
            className="button outline mobile-filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            {t("ফিল্টার দেখান / লুকান", "Show / hide filters")}
          </button>
        </div>
        <form
          className={"journal-filters " + (filtersOpen ? "filters-open" : "")}
          onSubmit={(e) => {
            apply(e);
            setFiltersOpen(false);
          }}
        >
          <div className="filter-heading">
            <span>
              <Icon.Search size={16} />
              {t(
                "আপনার এলাকার তথ্য খুঁজুন",
                "Find the accounts that matter to you",
              )}
            </span>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setDraft({});
                setParams({});
              }}
            >
              {t("সব মুছুন", "Reset filters")}
            </button>
          </div>
          <div className="journal-filter-grid">
            <label>
              {t("জেলা", "District")}
              <select
                value={draft.district || ""}
                onChange={(e) => change("district", e.target.value)}
              >
                <option value="">{t("সব জেলা", "All districts")}</option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {bn ? d.bn : d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("উপজেলা", "Upazila")}
              <select
                value={draft.upazila || ""}
                disabled={!draft.district}
                onChange={(e) => change("upazila", e.target.value)}
              >
                <option value="">
                  {t("সব প্রকাশযোগ্য উপজেলা", "All visible upazilas")}
                </option>
                {selectedUpazilas.map((u) => (
                  <option key={u.code} value={u.code}>
                    {bn ? u.bn : u.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("ইউনিয়ন", "Union")}
              <select
                disabled={!draft.upazila}
                value={draft.union || ""}
                onChange={(e) => change("union", e.target.value)}
              >
                <option value="">
                  {t("সব প্রকাশযোগ্য ইউনিয়ন", "All publishable unions")}
                </option>
                {unions
                  .filter((u) => u.upazilaCode === draft.upazila)
                  .map((u) => (
                    <option key={u.code} value={u.code}>
                      {bn ? u.bn : u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("ঘটনার ধরন", "Incident type")}
              <select
                value={draft.type || ""}
                onChange={(e) => change("type", e.target.value)}
              >
                <option value="">{t("সব ধরন", "All types")}</option>
                {Object.entries(typeLabels).map(([key, labels]) => (
                  <option key={key} value={key}>
                    {labels[bn ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("অবস্থা", "Status")}
              <select
                value={draft.status || ""}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="">{t("সব অবস্থা", "All statuses")}</option>
                <option value="reviewed">{t("পর্যালোচিত", "Reviewed")}</option>
                <option value="resolved">{t("নিষ্পত্তি", "Resolved")}</option>
              </select>
            </label>
            <label>
              {t("শুরু মাস", "From month")}
              <input
                type="month"
                value={draft.from || ""}
                max={draft.to || undefined}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label>
              {t("শেষ মাস", "To month")}
              <input
                type="month"
                value={draft.to || ""}
                min={draft.from || undefined}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
            <label>
              {t("বিবরণ খুঁজুন", "Search accounts")}
              <input
                value={draft.search || ""}
                maxLength={80}
                onChange={(e) => change("search", e.target.value)}
                placeholder={t(
                  "শিরোনাম বা সংক্ষিপ্ত বিবরণ",
                  "Title or summary",
                )}
              />
            </label>
            <label>
              {t("যাচাইয়ের ধরন", "Review level")}
              <select
                value={draft.verification || ""}
                onChange={(e) => change("verification", e.target.value)}
              >
                <option value="">
                  {t("সব পর্যালোচনা", "All review levels")}
                </option>
                <option value="reviewed">
                  {t("পর্যালোচিত রিপোর্ট", "Reviewed report")}
                </option>
                <option value="independently_verified">
                  {t("স্বাধীনভাবে যাচাইকৃত", "Independently verified")}
                </option>
              </select>
            </label>
          </div>
          <div className="filter-footer">
            <small>
              {t(
                "ছোট দলের উপজেলা ও ইউনিয়ন privacy threshold-এর কারণে গোপন থাকতে পারে।",
                "Upazilas and unions for small groups may be withheld by the privacy threshold.",
              )}
            </small>
            <button className="button small">
              {t("ফিল্টার প্রয়োগ", "Apply filters")}
              <Icon.ArrowRight size={15} />
            </button>
          </div>
        </form>
        <section id="journal-results">
          <div className="journal-results-heading">
            <div>
              <span className="eyebrow">
                {t("প্রকাশিত বিবরণ", "PUBLISHED ACCOUNTS")}
              </span>
              <h2>
                {filters.length
                  ? t("আপনার খোঁজের ফলাফল", "Your filtered view")
                  : t("সাম্প্রতিক ১০টি ঘটনা", "The latest 10 accounts")}
              </h2>
              {data && (
                <p>
                  {t("মোট", "Total")}{" "}
                  {data.total.toLocaleString(bn ? "bn-BD" : "en-GB")}{" "}
                  {t(
                    "প্রকাশিত বিবরণ • প্রতি page-এ ১০টি",
                    "published accounts · 10 per page",
                  )}
                </p>
              )}
            </div>
            <div className="journal-tools">
              <select
                aria-label={t("সাজানোর ক্রম", "Sort accounts")}
                value={params.get("sort") || "latest"}
                onChange={(e) => {
                  const p = new URLSearchParams(params);
                  p.set("sort", e.target.value);
                  p.set("page", "1");
                  setParams(p);
                }}
              >
                <option value="latest">{t("নতুন আগে", "Newest first")}</option>
                <option value="oldest">{t("পুরনো আগে", "Oldest first")}</option>
              </select>
              <div className="view-toggle">
                <button
                  aria-pressed={view === "list"}
                  aria-label={t("তালিকা view", "List view")}
                  onClick={() => setView("list")}
                >
                  <Icon.ClipboardList size={17} />
                </button>
                <button
                  aria-pressed={view === "map"}
                  aria-label={t("ম্যাপ view", "Map view")}
                  onClick={() => setView("map")}
                >
                  <Icon.MapPin size={17} />
                </button>
              </div>
            </div>
          </div>
          {filters.length > 0 && (
            <div className="filter-chips">
              {filters.map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    p.delete(key);
                    if (key === "district") {
                      p.delete("upazila");
                      p.delete("union");
                    }
                    if (key === "upazila") p.delete("union");
                    p.set("page", "1");
                    setParams(p);
                  }}
                >
                  {key}:{" "}
                  {key === "district"
                    ? districts.find((d) => d.code === value)?.[
                        bn ? "bn" : "name"
                      ] || value
                    : key === "upazila"
                      ? upazilas.find((u) => u.code === value)?.[
                          bn ? "bn" : "name"
                        ] || value
                      : key === "union"
                        ? unions.find((u) => u.code === value)?.[
                            bn ? "bn" : "name"
                          ] || value
                        : value}
                  <Icon.X size={12} />
                </button>
              ))}
            </div>
          )}
          {error ? (
            <div className="journal-empty">
              <Alert error>{error}</Alert>
              <button className="button outline" onClick={retry}>
                {t("আবার চেষ্টা করুন", "Retry")}
              </button>
            </div>
          ) : !data ? (
            <Skeletons />
          ) : !data.items.length ? (
            <div className="journal-empty">
              <span className="soft-icon">
                <Icon.FileText size={31} />
              </span>
              <h3>
                {t("এখনো প্রকাশযোগ্য ঘটনা নেই", "No publishable accounts yet")}
              </h3>
              <p>
                {t(
                  "আপনার filter বদলে দেখুন। রিপোর্ট সম্মতি, পরিচয়মুক্তকরণ এবং স্বাধীন অনুমোদনের পর এখানে আসে; জমা পড়লেই প্রকাশ হয় না।",
                  "Try adjusting your filters. Accounts appear only after consent, redaction and independent approval; submission alone does not publish them.",
                )}
              </p>
              <Link className="button outline" to="/report">
                {t("নিজের ঘটনা জানান", "Share your experience")}
                <Icon.ArrowUpRight size={16} />
              </Link>
            </div>
          ) : view === "map" ? (
            <PublicMap items={data.items} bn={bn} />
          ) : (
            <div className="case-grid">
              {data.items.map((r, i) => (
                <article className="case-card" key={r.id}>
                  <Link to={"/incidents/" + r.id} aria-label={r.title}>
                    <CaseIllustration type={r.incidentType} />
                  </Link>
                  <div className="case-content">
                    <div className="case-topline">
                      <span>{typeLabels[r.incidentType]?.[bn ? 0 : 1]}</span>
                      <small>
                        {String((data.page - 1) * 10 + i + 1).padStart(2, "0")}
                      </small>
                    </div>
                    <h3>
                      <Link to={"/incidents/" + r.id}>{r.title}</Link>
                    </h3>
                    <p>{r.summary}</p>
                    <div className="case-location">
                      <Icon.MapPin size={14} />
                      {bn ? r.district.bn : r.district.name}
                      {r.upazila &&
                        " · " + (bn ? r.upazila.bn : r.upazila.name)}
                      {r.union && " · " + (bn ? r.union.bn : r.union.name)}
                      <span>·</span>
                      <Icon.Clock size={13} />
                      {monthLabel(r.incidentMonth, bn)}
                    </div>
                    <BookmarkButton id={r.id} />
                    <div className="case-footer">
                      <ReviewBadge level={r.verificationLevel} bn={bn} />
                      <Link to={"/incidents/" + r.id} className="read-case">
                        {t("পড়ুন", "Read account")}
                        <Icon.ArrowUpRight size={16} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {data?.pages > 0 && (
            <nav
              className="journal-pagination"
              aria-label={translate("Public accounts pagination")}
            >
              <button
                className="button outline small"
                disabled={data.page <= 1}
                onClick={() => page(data.page - 1)}
              >
                ← {t("আগের page", "Previous")}
              </button>
              <span>
                {t("Page", "Page")}{" "}
                {data.page.toLocaleString(bn ? "bn-BD" : "en-GB")} /{" "}
                {data.pages.toLocaleString(bn ? "bn-BD" : "en-GB")}
              </span>
              <button
                className="button outline small"
                disabled={data.page >= data.pages}
                onClick={() => page(data.page + 1)}
              >
                {t("পরের page", "Next")} →
              </button>
            </nav>
          )}
        </section>
        <div className="journal-bottom-cta">
          <Icon.HeartHandshake size={29} />
          <div>
            <h3>
              {t("আপনার অভিজ্ঞতা গুরুত্বপূর্ণ।", "Your experience matters.")}
            </h3>
            <p>
              {t(
                "নিজের পরিচয় না দিয়েই ঘটনা জানান। Public view-তে প্রকাশের অনুমতি দেওয়া ঐচ্ছিক।",
                "Share an incident without an account. Giving permission for a redacted public story is optional.",
              )}
            </p>
          </div>
          <Link to="/report" className="button">
            {t("ঘটনা জানান", "Report an incident")}
            <Icon.ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
    </>
  );
}
export function PublicCaseDetail() {
  const { publicId } = useParams(),
    { bn } = useApp(),
    { data, error, retry } = useCases(
      "/public/cases/" + encodeURIComponent(publicId),
    ),
    t = (b, e) => translate(bn ? b : e);
  return (
    <div className="container case-detail-page">
      <Link to="/incidents" className="text-link">
        ← {t("ঘটনার চিত্রে ফিরুন", "Back to the community journal")}
      </Link>
      {error ? (
        <div className="journal-empty">
          <Alert error>{error}</Alert>
          <button className="button outline" onClick={retry}>
            {t("আবার চেষ্টা", "Retry")}
          </button>
        </div>
      ) : !data ? (
        <Skeletons />
      ) : (
        <>
          <div className="case-detail-header">
            <span className="eyebrow">
              {typeLabels[data.entry.incidentType]?.[bn ? 0 : 1]}{" "}
              <Text value={"/ COMMUNITY JOURNAL"} />{" "}
            </span>
            <h1>{data.entry.title}</h1>
            <div className="case-detail-meta">
              <ReviewBadge level={data.entry.verificationLevel} bn={bn} />
              <span>
                <Icon.MapPin size={15} />
                {bn ? data.entry.district.bn : data.entry.district.name}
                {data.entry.upazila &&
                  " · " +
                    (bn ? data.entry.upazila.bn : data.entry.upazila.name)}
                {data.entry.union &&
                  " · " + (bn ? data.entry.union.bn : data.entry.union.name)}
              </span>
              <span>
                <Icon.Clock size={15} />
                {monthLabel(data.entry.incidentMonth, bn)}
              </span>
            </div>
          </div>
          <CaseExtras entry={data.entry} />
          <div className="case-detail-grid">
            <article className="case-detail-story">
              <CaseIllustration type={data.entry.incidentType} large />
              <span className="illustration-note">
                {t(
                  "Category illustration • এটি আসল evidence নয়",
                  "Category illustration · not original evidence",
                )}
              </span>
              <p className="case-lede">{data.entry.summary}</p>
              <div className="case-body">
                {data.entry.body
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
              <div className="story-status">
                <Icon.CheckCircle2 size={19} />
                <div>
                  <strong>
                    {t("পর্যালোচনার বর্তমান অবস্থা", "Published review status")}
                  </strong>
                  <span>
                    <Text value={statusLabels[data.entry.status]} />
                  </span>
                </div>
              </div>
              {data.entry.verificationLevel === "independently_verified" && (
                <div className="verification-method">
                  <h3>
                    {t(
                      "স্বাধীন যাচাইয়ের পদ্ধতি",
                      "Independent verification method",
                    )}
                  </h3>
                  <p>{data.entry.verificationNote}</p>
                </div>
              )}
            </article>
            <aside className="case-detail-sidebar">
              <div className="card">
                <span className="eyebrow">
                  {t("দায়িত্বশীল প্রকাশ", "RESPONSIBLE PUBLICATION")}
                </span>
                <h3>
                  {t(
                    "কীভাবে এই বিবরণ প্রকাশিত",
                    "How this account was published",
                  )}
                </h3>
                <div className="timeline">
                  {data.timeline.map((s) => (
                    <div className="timeline-item" key={s.stage}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>
                          {s.stage === "report_received"
                            ? t("রিপোর্ট গ্রহণের মাস", "Submission month")
                            : s.stage === "resolved"
                              ? t(
                                  "নিষ্পত্তির public review",
                                  "Public resolution review",
                                )
                              : s.stage === "privacy_review"
                                ? t(
                                    "পরিচয় ও privacy review",
                                    "Identity & privacy review",
                                  )
                                : t(
                                    "স্বাধীন প্রকাশ অনুমোদন",
                                    "Independent publication approval",
                                  )}
                        </strong>
                        <small>
                          {new Date(s.date).toLocaleDateString(
                            bn ? "bn-BD" : "en-GB",
                            {
                              timeZone: "Asia/Dhaka",
                              ...(s.stage === "report_received"
                                ? {
                                    month: "long",
                                    year: "numeric",
                                  }
                                : {}),
                            },
                          )}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
                <p>
                  {t(
                    "Reporter-এর সম্মতি রয়েছে। Original evidence, ব্যক্তিগত পরিচয় এবং internal notes প্রকাশ করা হয়নি।",
                    "Reporter permission was recorded. Original evidence, identifying information and internal notes are not published.",
                  )}
                </p>
              </div>
              <div className="card pale">
                <Icon.Shield size={25} />
                <h3>
                  {t(
                    "পর্যালোচনা ও সত্যতা আলাদা",
                    "Review and proof are different",
                  )}
                </h3>
                <p>
                  {t(
                    "এই বিবরণ একটি অভিযোগের পরিচয়মুক্ত account। Reviewed label অভিযোগ সত্য প্রমাণ করে না।",
                    "This is a redacted account of a report. A reviewed label does not establish that an allegation is true.",
                  )}
                </p>
                <Link className="text-link" to="/awareness">
                  {t("আরও জানুন", "Understand the process")}
                  <Icon.ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="card">
                <h3>{t("সংশোধন প্রয়োজন?", "Something needs correcting?")}</h3>
                <p>
                  {t(
                    "এই public reference উল্লেখ করে ব্যক্তিগতভাবে সংশোধন বা অপসারণের আবেদন করতে পারবেন।",
                    "Request a correction or removal privately. Include this public reference in your description.",
                  )}
                </p>
                <code className="public-reference">{data.entry.id}</code>
                <Link className="button outline small" to="/report-content">
                  {t("আবেদন করুন", "Request a correction")}
                </Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
