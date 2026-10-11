import { translate, languageLocale } from "./staff-copy";
import {
  DraftTools,
  SubmissionPreview,
  submissionFingerprint,
  recentlySubmitted,
  rememberSubmission,
  UploadMetrics,
  PendingUploads,
} from "./FeatureReporter";
import { ReporterConversation } from "./FeatureStaff";
import { MediaPicker, IntakeUploadQueue } from "./MediaPicker";
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api, typeLabels, statusLabels, download, uploadEvidence } from "./api";
import { useApp, PageTitle, Alert, Icon, Text } from "./ui";
export function EvidenceUpload({ credentials, onUploaded }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [file, setFile] = useState(null);
  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setProgress(0);
    try {
      const data = await uploadEvidence(credentials, file, setProgress);
      setMessage(
        "Evidence uploaded privately. Files remain quarantined until scanned clean.",
      );
      setFile(null);
      e.target.reset();
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={upload} className="evidence-form">
      <UploadMetrics />
      <PendingUploads credentials={credentials} busy={busy} />
      <h3>
        <Icon.Upload size={19} />
        <Text value="Private evidence" />
      </h3>
      <p>
        <Text value="Up to 5 files. Images, documents and audio: 10 MB; MP4 or WebM video: 200 MB. Evidence stays private." />
      </p>
      <input
        aria-label={translate("Choose evidence file")}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
        onChange={(e) => {
          const f = e.target.files[0];
          if (
            f?.size >
            (f.type.startsWith("video/") ? 200 : 10) * 1024 * 1024
          ) {
            setError(
              "Images must be smaller than 10 MB; videos smaller than 200 MB.",
            );
            setFile(null);
          } else {
            setError("");
            setFile(f);
          }
        }}
      />
      <button className="button outline small" disabled={!file || busy}>
        <Text value={busy ? "Uploading…" : "Upload privately"} />
        <Icon.LockKeyhole size={15} />
      </button>
      {busy && (
        <progress
          max="100"
          value={progress}
          aria-label={translate("Evidence upload progress")}
        />
      )}
      {error && <Alert error>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
    </form>
  );
}
export function ReportPage() {
  const { bn, districts, upazilas, unions, setReceipt, categories } = useApp(),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [contact, setContact] = useState(false),
    [district, setDistrict] = useState(""),
    [upazila, setUpazila] = useState(""),
    [files, setFiles] = useState([]),
    [preview, setPreview] = useState(null),
    [snapshot, setSnapshot] = useState(null),
    [restore, setRestore] = useState(null),
    formRef = useRef(null),
    t = (b, e) => translate(bn ? b : e);
  useEffect(() => {
    if (!restore || !formRef.current) return;
    for (const [name, value] of Object.entries(restore)) {
      const input = formRef.current.elements.namedItem(name);
      if (input && name !== "district" && name !== "upazila")
        input.value = value;
    }
    setSnapshot(Object.fromEntries(new FormData(formRef.current)));
  }, [restore]);
  async function submit(e, confirmed = false) {
    e?.preventDefault();
    if (busy) return;
    setError("");
    if (!formRef.current.reportValidity()) return;
    const f = new FormData(formRef.current);
    const body = {
      incidentType: f.get("incidentType"),
      district: f.get("district"),
      upazila: f.get("upazila") || undefined,
      union: f.get("union") || undefined,
      publicConsent: f.get("publicConsent") === "on",
      area: f.get("area"),
      incidentDate: f.get("incidentDate"),
      description: f.get("description"),
      currency: "BDT",
      contactRequested: contact,
      privacyAcknowledged: f.get("privacyAcknowledged") === "on",
      website: f.get("website"),
    };
    if (f.get("demandedAmount"))
      body.demandedAmount = Number(f.get("demandedAmount"));
    if (contact) body.contact = f.get("contact");
    const fingerprint = await submissionFingerprint(body);
    if (!confirmed) {
      setPreview({
        body,
        fingerprint,
        duplicate: recentlySubmitted(fingerprint),
      });
      return;
    }
    setBusy(true);
    try {
      const credentials = await api("/reports", {
        method: "POST",
        body,
      });
      rememberSubmission(fingerprint);
      setReceipt({
        ...credentials,
        uploads: files.map((file) => ({
          file,
          name: file.name,
          status: "pending",
          progress: 0,
        })),
      });
      navigate("/report/success", {
        replace: true,
      });
      for (let index = 0; index < files.length; index++) {
        const update = (changes) =>
          setReceipt((current) =>
            current?.id === credentials.id
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
        update({
          status: "uploading",
        });
        try {
          const result = await uploadEvidence(
            credentials,
            files[index],
            (progress) =>
              update({
                progress,
              }),
          );
          update({
            status: "uploaded",
            progress: 100,
            scanStatus: result.malwareScanStatus,
            file: null,
          });
        } catch (err) {
          update({
            status: "failed",
            error: err.message,
          });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container section">
      <PageTitle
        eyebrow={translate("PRIVATE INCIDENT REPORTING")}
        title={t("আপনার ঘটনা জানান", "Tell us what happened")}
      >
        {t(
          "নিজের পরিচয় না দিয়েই রিপোর্ট করতে পারবেন। সঠিক তথ্য দিন, অপ্রয়োজনীয় ব্যক্তিগত তথ্য নয়।",
          "No account required. Share accurate details and avoid unnecessary identifying information.",
        )}
      </PageTitle>
      <div className="form-layout">
        <form
          ref={formRef}
          hidden={Boolean(preview)}
          className="card form-card"
          onChange={() =>
            setSnapshot(Object.fromEntries(new FormData(formRef.current)))
          }
          onSubmit={submit}
        >
          <DraftTools
            formRef={formRef}
            snapshot={snapshot}
            onRestore={(data) => {
              setDistrict(data.district || "");
              setUpazila(data.upazila || "");
              setRestore(data);
            }}
          />
          <details className="form-help">
            <summary>
              {t("ফর্ম পূরণের সাহায্য", "Help completing this form")}
            </summary>
            <p>
              {t(
                "নিজে দেখা ঘটনা, সময় ও সাধারণ এলাকা লিখুন। সম্পূর্ণ ঠিকানা, পরিচয় নম্বর বা অপ্রয়োজনীয় নাম দেবেন না। ইউনিয়ন না থাকলে ফাঁকা রাখুন। ছবি/ভিডিও private থাকবে।",
                "Describe what you directly observed, the date and general area. Avoid exact addresses, identity numbers and unneeded names. Leave union blank for municipalities. Photos and video remain private.",
              )}
            </p>
          </details>
          <div className="form-heading">
            <span className="soft-icon">
              <Icon.FileText />
            </span>
            <div>
              <h2>{t("ঘটনার বিবরণ", "Incident details")}</h2>
              <p>
                {t(
                  "তারকা চিহ্নিত তথ্যগুলো প্রয়োজনীয়",
                  "Fields marked * are required",
                )}
              </p>
            </div>
            <span className="badge">
              <Text value={"PRIVATE"} />
            </span>
          </div>
          <div className="form-grid">
            <label>
              {t("ঘটনার ধরন", "Incident type")} *
              <select name="incidentType" required defaultValue="">
                <option value="" disabled>
                  {t("ধরন নির্বাচন করুন", "Select incident type")}
                </option>
                {Object.entries(typeLabels)
                  .filter(
                    ([key]) =>
                      !categories?.some((c) => c.slug === key && !c.enabled),
                  )
                  .map(([key, labels]) => (
                    <option key={key} value={key}>
                      {labels[bn ? 0 : 1]}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("জেলা", "District")} *
              <select
                name="district"
                required
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setUpazila("");
                }}
              >
                <option value="" disabled>
                  {t("জেলা নির্বাচন করুন", "Select district")}
                </option>
                {districts.map((d) => (
                  <option value={d.code} key={d.code}>
                    {bn ? d.bn : d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("উপজেলা (ঐচ্ছিক)", "Upazila (optional)")}
              <select
                name="upazila"
                value={upazila}
                onChange={(e) => setUpazila(e.target.value)}
                key={district}
                disabled={!district}
              >
                <option value="">
                  {t(
                    "অনির্দিষ্ট / মহানগর এলাকা",
                    "Not specified / metropolitan area",
                  )}
                </option>
                {upazilas
                  .filter((u) => u.districtCode === district)
                  .map((u) => (
                    <option key={u.code} value={u.code}>
                      {bn ? u.bn : u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("ইউনিয়ন (ঐচ্ছিক)", "Union (optional)")}
              <select
                name="union"
                key={upazila}
                disabled={!upazila}
                defaultValue=""
              >
                <option value="">
                  {t(
                    "অনির্দিষ্ট / পৌরসভা এলাকা",
                    "Not provided / municipal area",
                  )}
                </option>
                {unions
                  .filter((u) => u.upazilaCode === upazila)
                  .map((u) => (
                    <option key={u.code} value={u.code}>
                      {bn ? u.bn : u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("এলাকা", "General area")} *
              <input
                name="area"
                required
                minLength={2}
                maxLength={150}
                placeholder={t("উদাহরণ: মিরপুর", "e.g. Mirpur")}
              />
              <small>
                {t(
                  "বাড়ি বা দোকানের পূর্ণ ঠিকানা দেবেন না",
                  "Avoid an exact home or shop address.",
                )}
              </small>
            </label>
            <label>
              {t("ঘটনার তারিখ", "Incident date")} *
              <input
                type="date"
                name="incidentDate"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="full">
              {t("কী ঘটেছিল?", "What happened?")} *
              <textarea
                name="description"
                required
                minLength={30}
                maxLength={6000}
                rows={7}
                placeholder={t(
                  "আপনি যা সরাসরি দেখেছেন বা অভিজ্ঞতা করেছেন তা লিখুন। কখন, কোথায়, কী দাবি করা হয়েছিল?",
                  "Describe what you directly observed or experienced. When, where, and what was demanded?",
                )}
              />
              <small>
                {" "}
                <Text
                  value={
                    "30\u20136,000 characters. Avoid identity numbers, personal addresses and unneeded names."
                  }
                />{" "}
              </small>
            </label>
            <label>
              {t("দাবিকৃত টাকা (ঐচ্ছিক)", "Amount demanded (optional)")}
              <div className="input-unit">
                <input
                  name="demandedAmount"
                  type="number"
                  min={0}
                  max={1e10}
                  step="0.01"
                  placeholder={translate("0.00")}
                />
                <span>
                  <Text value={"BDT"} />
                </span>
              </div>
            </label>
          </div>
          <MediaPicker files={files} onChange={setFiles} disabled={busy} />
          <div className="form-divider" />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={contact}
              onChange={(e) => setContact(e.target.checked)}
            />
            <span>
              {t(
                "আমি যোগাযোগের তথ্য দিতে চাই (ঐচ্ছিক)",
                "I would like to provide contact details (optional)",
              )}
            </span>
          </label>
          {contact && (
            <label>
              {t("নিরাপদ যোগাযোগের তথ্য", "Safe contact information")}
              <input
                name="contact"
                required
                maxLength={200}
                placeholder={translate("Phone or email")}
              />
              <small>
                <Text value="Only senior reviewers and administrators can access contact details." />
              </small>
            </label>
          )}
          <div className="honeypot" aria-hidden="true">
            <label>
              {" "}
              <Text value={"Website"} />{" "}
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="checkbox consent">
            <input type="checkbox" name="publicConsent" />
            <span>
              {t(
                "আমি পরিচয়মুক্ত বিবরণ independent review-এর পর Public view-তে প্রকাশের অনুমতি দিচ্ছি (ঐচ্ছিক)। ছবি/ভিডিও private থাকবে।",
                "I consent to a redacted public account after independent review (optional). Photos and video stay private.",
              )}
            </span>
          </label>
          <label className="checkbox consent">
            <input type="checkbox" name="privacyAcknowledged" required />
            <span>
              {t(
                "আমি গোপনীয়তা নীতি পড়েছি এবং জানি যে এই প্ল্যাটফর্ম জরুরি সেবা নয়।",
                "I have read the privacy policy and understand this is not an emergency service.",
              )}{" "}
              <Link to="/privacy">{t("নীতি পড়ুন", "Read policy")}</Link>
            </span>
          </label>
          {error && <Alert error>{error}</Alert>}
          <button className="button" disabled={busy || !districts.length}>
            {busy
              ? t("জমা হচ্ছে…", "Submitting…")
              : t("রিপোর্ট জমা দিন", "Submit private report")}
            <Icon.ArrowRight size={18} />
          </button>
          <p className="fine-print">
            {t(
              "রিপোর্টের সঙ্গে নির্বাচিত ফাইলগুলো আলাদাভাবে নিরাপদে upload হবে।",
              "Selected evidence uploads privately after your report is saved.",
            )}
          </p>
        </form>
        {error && preview && <Alert error>{error}</Alert>}
        {preview && (
          <SubmissionPreview
            {...preview}
            files={files}
            districts={districts}
            upazilas={upazilas}
            unions={unions}
            onConfirm={() => submit(null, true)}
            onCancel={() => setPreview(null)}
            busy={busy}
          />
        )}
        <aside className="report-aside">
          <div className="card pale">
            <Icon.ShieldCheck size={30} />
            <h3>{t("আপনার গোপনীয়তা গুরুত্বপূর্ণ", "Your privacy matters")}</h3>
            <ul>
              <li>
                <Text value="No account or name required." />
              </li>
              <li>
                <Text value="Private details are encrypted." />
              </li>
              <li>
                <Text value="Evidence is never publicly displayed." />
              </li>
              <li>
                <Text value="Two separate credentials protect tracking." />
              </li>
            </ul>
          </div>
          <Alert>
            <Text value="Anonymous does not mean untraceable. Files, networks and hosting metadata may reveal identity." />
          </Alert>
          <div className="card">
            <Icon.Phone size={25} />
            <h3>
              <Text value="Immediate danger?" />
            </h3>
            <p>
              <Text value="This service does not dispatch help. Call 999 for emergency assistance." />
            </p>
            <Link className="text-link" to="/safety">
              <Text value="Safety resources" />
              <Icon.ArrowUpRight size={15} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
export function SuccessPage() {
  const { receipt: c } = useApp(),
    [saved, setSaved] = useState(false);
  if (!c)
    return (
      <div className="container narrow section">
        <Alert>
          {" "}
          <Text
            value={
              "Credentials are shown once after submission and are not stored in your browser. Use your saved credentials to track a report."
            }
          />{" "}
        </Alert>
        <Link className="button" to="/track">
          {" "}
          <Text value={"Track a report"} />{" "}
        </Link>
      </div>
    );
  return (
    <div className="container narrow section">
      <div className="success-heading">
        <span className="success-icon">
          <Icon.CheckCircle2 size={36} />
        </span>
        <PageTitle
          eyebrow={translate("REPORT RECEIVED")}
          title={<Text value="Your voice has been heard." />}
        >
          <Text value="Your report is submitted for review. This does not confirm the allegation." />
        </PageTitle>
      </div>
      <div className="card">
        <Alert>
          <Text value="Save both credentials now. The secret cannot be recovered. Do not share these credentials with anyone you do not trust." />
        </Alert>
        <div className="credential">
          <span>
            <Text value="TRACKING ID" />
          </span>
          <code>{c.trackingId}</code>
        </div>
        <div className="credential">
          <span>
            <Text value="SECRET ACCESS CODE" />
          </span>
          <code>{c.secret}</code>
        </div>
        <div className="actions no-print">
          <button
            type="button"
            className="button outline"
            onClick={() => window.print()}
          >
            <Text value="Print receipt" />
          </button>
          <button
            className="button"
            onClick={() => {
              download("chandawatch-tracking.json", {
                id: c.id,
                trackingId: c.trackingId,
                secret: c.secret,
              });
              setSaved(true);
            }}
          >
            <Icon.Download size={17} />
            <Text value={saved ? "Download again" : "Save credentials"} />
          </button>
          <Link className="button outline" to="/track">
            <Text value="Track report" />
            <Icon.ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <IntakeUploadQueue />
      <div className="card mt">
        <EvidenceUpload credentials={c} />
      </div>
    </div>
  );
}
export function TrackPage() {
  const { receipt } = useApp(),
    [c, setC] = useState(
      receipt || {
        trackingId: "",
        secret: "",
      },
    ),
    [report, setReport] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function track(e) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(
        await api("/reports/track", {
          method: "POST",
          body: {
            trackingId: c.trackingId.trim(),
            secret: c.secret.trim(),
          },
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container narrow section">
      <PageTitle
        eyebrow={translate("YOUR REPORT, YOUR ACCESS")}
        title={<Text value="Track your report privately" />}
      >
        <Text value="Enter your tracking ID and secret access code to see progress." />
      </PageTitle>
      <form className="card form-card" onSubmit={track}>
        <label>
          <Text value="Tracking ID" />
          <input
            required
            value={c.trackingId}
            onChange={(e) =>
              setC({
                ...c,
                trackingId: e.target.value,
              })
            }
            placeholder={translate("CW-…")}
            autoComplete="off"
          />
        </label>
        <label>
          <Text value="Secret access code" />
          <input
            required
            type="password"
            value={c.secret}
            onChange={(e) =>
              setC({
                ...c,
                secret: e.target.value,
              })
            }
            placeholder={translate("Your saved secret code")}
            autoComplete="off"
          />
        </label>
        {error && <Alert error>{error}</Alert>}
        <button className="button" disabled={busy}>
          <Text value={busy ? "Checking…" : "View report status"} />
          <Icon.Search size={17} />
        </button>
      </form>
      {report && (
        <div className="card mt">
          <div className="row">
            <h2>
              <Text value="Report progress" />
            </h2>
            <span className={"badge " + report.status}>
              <Text value={statusLabels[report.status]} />
            </span>
          </div>
          <p className="muted">
            {report.trackingId} <Text value={"\xB7 Received"} />{" "}
            {new Date(report.createdAt).toLocaleDateString(languageLocale())}
          </p>
          <div className="timeline">
            {report.history.map((h, i) => (
              <div className="timeline-item" key={i}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    <Text value={statusLabels[h.status]} />
                  </strong>
                  <small>
                    {new Date(h.createdAt).toLocaleString(languageLocale())}
                  </small>
                  <p>
                    <Text value={h.message} />
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="notice">
            <Icon.Shield size={18} />
            <div>
              <strong>
                {" "}
                <Text value={"Public-story consent:"} />{" "}
                <Text
                  value={report.publicConsent ? "Granted" : "Not granted"}
                />
              </strong>
              <p>
                {" "}
                <Text
                  value={
                    "Original evidence always remains private. Withdrawing consent removes the public account immediately; granting consent still requires a new staff approval."
                  }
                />{" "}
              </p>
              <button
                type="button"
                className="button outline small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api("/reports/" + report.id + "/public-consent", {
                      method: "PATCH",
                      headers: {
                        "x-tracking-id": c.trackingId,
                        "x-tracking-secret": c.secret,
                      },
                      body: {
                        consent: !report.publicConsent,
                      },
                    });
                    await track();
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text
                  value={
                    report.publicConsent
                      ? "Withdraw consent"
                      : "Grant public-story consent"
                  }
                />
              </button>
              {report.publicConsent && report.publicId && (
                <Link
                  className="text-link"
                  to={"/incidents/" + report.publicId}
                >
                  {" "}
                  <Text value={"View approved public account \u2192"} />{" "}
                </Link>
              )}
            </div>
          </div>
          <h3>
            <Text value={"Evidence ("} />
            {report.evidence.length}/5)
          </h3>
          {report.evidence.map((e) => (
            <div className="evidence-row" key={e._id}>
              <Icon.FileText size={17} />
              <span>
                {e.mimeType} · {Math.ceil(e.fileSize / 1024)}{" "}
                <Text value={"KB"} />{" "}
              </span>
              <span className="badge">
                <Text value={e.malwareScanStatus} />
              </span>
            </div>
          ))}
          {report.evidence.length < 5 && (
            <EvidenceUpload
              credentials={{
                ...c,
                id: report.id,
              }}
              onUploaded={() => track()}
            />
          )}
          <ReporterConversation
            credentials={{
              ...c,
              id: report.id,
            }}
          />
        </div>
      )}
      <p className="fine-print">
        <Icon.LockKeyhole size={14} />
        <Text value="Tracking credentials stay in this page\u2019s memory only." />
      </p>
    </div>
  );
}
export function PrivacyRequestPage() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api("/privacy/requests", {
        method: "POST",
        body: f,
      });
      setReference(d.reference);
      e.target.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container narrow section">
      <PageTitle
        eyebrow={translate("CORRECTION & DATA RIGHTS")}
        title={<Text value="Request a correction or removal" />}
      >
        <Text value="Senior staff review requests privately. Submission does not automatically delete a report." />
      </PageTitle>
      {reference && (
        <Alert>
          <Text value={"Request received. Save your reference:"} /> {reference}
        </Alert>
      )}
      <form className="card form-card" onSubmit={submit}>
        <label>
          <Text value="Request type" />
          <select name="kind">
            <option value="correction">
              <Text value="Correct information" />
            </option>
            <option value="removal">
              <Text value="Remove information" />
            </option>
            <option value="data_access">
              <Text value="Access my information" />
            </option>
            <option value="other">
              <Text value="Other privacy concern" />
            </option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            <Text value="Tracking ID (optional)" />
            <input name="trackingId" maxLength={80} />
          </label>
          <label>
            <Text value="Secret (optional, verifies ownership)" />
            <input
              type="password"
              name="secret"
              maxLength={100}
              autoComplete="off"
            />
          </label>
        </div>
        <label>
          <Text value="Safe contact information *" />
          <input name="contact" required minLength={3} maxLength={200} />
        </label>
        <label>
          <Text value="Describe your request *" />
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={3000}
            rows={6}
          />
        </label>
        {error && <Alert error>{error}</Alert>}
        <button className="button" disabled={busy}>
          <Text value={busy ? "Submitting…" : "Submit private request"} />
          <Icon.ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}
