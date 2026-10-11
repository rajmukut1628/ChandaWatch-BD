import { OwnershipPanel } from "./OwnershipPanel";
import { useFeature } from "./FeaturePublic";
import { AdminWorkQueue } from "./AdminWorkQueue";
import { translate, languageLocale } from "./staff-copy";
import { Text } from "./ui";
import {
  ReportWorkspace,
  MediaViewer,
  BulkTools,
  RedactionPreview,
} from "./FeatureStaff";
import { SavedFilters } from "./FeaturePublic";
import {
  AdminReportEditor,
  AdminEvidenceUpload,
  AdminDelete,
  StaffAccountEditor,
} from "./AdminTools";
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, setCsrf, statusLabels, typeLabels } from "./api";
import { useApp, PageTitle, Alert, Loading, Empty, Icon } from "./ui";
function useLoad(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    api(url)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [url, tick]);
  return {
    data,
    error,
    reload: () => setTick((t) => t + 1),
  };
}
function Feedback({ error, message }) {
  return (
    <>
      {error && <Alert error>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
    </>
  );
}
export function StaffLogin() {
  const { user, setUser } = useApp(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/staff/auth/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.target)),
      });
      setCsrf(d.csrfToken);
      setUser(d.user);
      navigate(
        d.user.role === "super_admin" ? "/admin/dashboard" : "/staff/dashboard",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container login-section">
      <div className="login-intro">
        <span className="soft-icon">
          <Icon.ShieldCheck size={30} />
        </span>
        <span className="eyebrow">
          <Text value={"TRUST & RESPONSIBILITY"} />
        </span>
        <h1>
          {" "}
          <Text value={"A private workspace."} /> <br />
          <Text value={"A shared responsibility."} />{" "}
        </h1>
        <p>
          {" "}
          <Text
            value={
              "Review with care. Protect identities. Keep community awareness grounded in responsible information."
            }
          />{" "}
        </p>
        <div className="trust-line">
          <Icon.LockKeyhole size={16} />{" "}
          <Text value={"Email and password \xB7 Role-based access"} />{" "}
        </div>
      </div>
      <form className="card form-card login-form" onSubmit={login}>
        <PageTitle
          eyebrow={translate("AUTHORIZED STAFF ONLY")}
          title={translate("Welcome back")}
        >
          {" "}
          <Text
            value={
              "Administrator and Staff: sign in with your email and password. Your account role determines access."
            }
          />{" "}
        </PageTitle>
        {user && (
          <Link className="text-link" to="/staff/dashboard">
            {" "}
            <Text value={"Already signed in \xB7 Open dashboard"} />{" "}
          </Link>
        )}
        <label>
          {" "}
          <Text value={"Email address"} />{" "}
          <input type="email" name="email" required autoComplete="username" />
        </label>
        <label>
          {" "}
          <Text value={"Password"} />{" "}
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </label>
        <Feedback error={error} />
        <button className="button" disabled={busy}>
          <Text value={busy ? "Signing in…" : "Sign in securely"} />
          <Icon.ArrowRight size={17} />
        </button>
        <Link to="/staff/recovery" className="text-link">
          {" "}
          <Text value={"Forgot password / Password recovery"} />{" "}
        </Link>
        <p className="fine-print">
          {" "}
          <Text
            value={
              "Staff accounts are provisioned by an administrator. No public staff registration."
            }
          />{" "}
        </p>
      </form>
    </div>
  );
}
export function Dashboard() {
  const { bn, user } = useApp(),
    { data, error } = useLoad("/staff/analytics");
  return (
    <>
      <PageTitle
        eyebrow={translate("MODERATION WORKSPACE")}
        title={
          bn
            ? `স্বাগতম, ${user.name.split(" ")[0]}।`
            : `Welcome, ${user.name.split(" ")[0]}.`
        }
      >
        {" "}
        <Text
          value={"Every report deserves careful, independent review."}
        />{" "}
      </PageTitle>
      <Feedback error={error} />
      {data ? (
        <>
          <div className="metric-grid">
            <div className="metric">
              <Icon.FileText />
              <strong>{data.total}</strong>
              <span>
                <Text value={"Total platform reports"} />
              </span>
            </div>
            <div className="metric">
              <Icon.Clock />
              <strong>
                {data.byStatus
                  .filter((s) =>
                    [
                      "submitted",
                      "screening",
                      "under_review",
                      "needs_information",
                    ].includes(s.name),
                  )
                  .reduce((a, s) => a + s.count, 0)}
              </strong>
              <span>
                <Text value={"In the review workflow"} />
              </span>
            </div>
            <div className="metric">
              <Icon.CheckCircle2 />
              <strong>
                {data.byStatus.find((s) => s.name === "resolved")?.count || 0}
              </strong>
              <span>
                <Text value={"Resolved reports"} />
              </span>
            </div>
          </div>
          <div className="card">
            <div className="row">
              <h2>
                <Text value={"Your next review starts here"} />
              </h2>
              <Link className="button" to="/staff/reports">
                {" "}
                <Text value={"Open moderation queue"} />{" "}
                <Icon.ArrowRight size={17} />
              </Link>
            </div>
            <p>
              {" "}
              <Text
                value={
                  "Moderators access assigned reports. Senior reviewers independently approve redacted, reviewed reports. Only approved aggregate counts enter public statistics."
                }
              />{" "}
            </p>
          </div>
          {user.role === "super_admin" && (
            <>
              <AdminWorkQueue />
              <SecurityPanel />
            </>
          )}
          <div className="card mt">
            <h3>
              <Text value={"Review checklist"} />
            </h3>
            <div className="checklist">
              <span>
                <Icon.Check />{" "}
                <Text
                  value={"Check possible duplicates and sensitive details"}
                />{" "}
              </span>
              <span>
                <Icon.Check />{" "}
                <Text value={"Inspect only clean, authorized evidence"} />{" "}
              </span>
              <span>
                <Icon.Check />{" "}
                <Text value={"Redact identifying information"} />{" "}
              </span>
              <span>
                <Icon.Check />{" "}
                <Text value={"Request an independent senior decision"} />{" "}
              </span>
            </div>
          </div>
        </>
      ) : (
        <Loading />
      )}
    </>
  );
}
function SecurityPanel() {
  const { data, error, reload } = useLoad("/admin/security");
  return (
    <div className="card mt">
      <div className="row">
        <h3>
          <Text value={"Security monitoring"} />
        </h3>
        <button className="button outline small" onClick={reload}>
          {" "}
          <Text value={"Refresh"} />{" "}
        </button>
      </div>
      {error ? (
        <Alert error>{error}</Alert>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="detail-grid">
            <div>
              <span>
                <Text value={"Denied/blocked events \xB7 24h"} />
              </span>
              <strong>{data.denied}</strong>
            </div>
            <div>
              <span>
                <Text value={"Quarantined or infected evidence"} />
              </span>
              <strong>{data.quarantined}</strong>
            </div>
            <div>
              <span>
                <Text value={"Locked staff accounts"} />
              </span>
              <strong>{data.locked}</strong>
            </div>
            <div>
              <span>
                <Text value={"Malware scanner mode"} />
              </span>
              <strong>{data.scanner}</strong>
            </div>
          </div>
          <p className="muted">
            {" "}
            <Text
              value={
                "Email/password login \xB7 30-minute idle expiry \xB7 15-minute account lock after 5 failures. Development quarantine blocks evidence downloads and publication until a real scanner marks files clean."
              }
            />{" "}
          </p>
          {data.events.map((e, i) => (
            <div className="evidence-row" key={i}>
              <Icon.Shield size={16} />
              <span>
                <Text value={e.action} /> · <Text value={e.outcome} />
                <small>
                  {new Date(e.createdAt).toLocaleString(languageLocale())}
                </small>
              </span>
            </div>
          ))}
          {!data.events.length && (
            <p>
              <Text
                value={
                  "No denied or blocked audit events in the last 24 hours."
                }
              />
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function Queue() {
  const { user, districts, upazilas, unions } = useApp(),
    [status, setStatus] = useState(""),
    [district, setDistrict] = useState(""),
    [upazila, setUpazila] = useState(""),
    [union, setUnion] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const query = new URLSearchParams({
    page,
    ...(status
      ? {
          status,
        }
      : {}),
    ...(district
      ? {
          district,
        }
      : {}),
    ...(upazila
      ? {
          upazila,
        }
      : {}),
    ...(union
      ? {
          union,
        }
      : {}),
    ...(search
      ? {
          search,
        }
      : {}),
  });
  const { data, error, reload } = useLoad("/staff/reports?" + query);
  return (
    <>
      <PageTitle
        eyebrow={translate("RESPONSIBLE REPORT REVIEW")}
        title={translate("Moderation queue")}
      >
        {" "}
        <Text
          value={"Your role and report assignments determine access."}
        />{" "}
      </PageTitle>
      {user.role === "super_admin" && (
        <Link className="button mb" to="/admin/reports/new">
          {" "}
          <Text value={"Add report information"} />{" "}
          <Icon.ArrowRight size={16} />
        </Link>
      )}
      <SavedFilters
        scope={"staff_" + user.id}
        query={query}
        onLoad={(q) => {
          const p = new URLSearchParams(q);
          setStatus(p.get("status") || "");
          setDistrict(p.get("district") || "");
          setUpazila(p.get("upazila") || "");
          setUnion(p.get("union") || "");
          setSearch(p.get("search") || "");
          setPage(1);
        }}
      />
      {data && <BulkTools items={data.items} onChanged={reload} />}
      <div className="filter-bar">
        <div className="search-input">
          <Icon.Search size={17} />
          <input
            placeholder={translate("Exact tracking ID")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label={translate("Filter report status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            <Text value={"All statuses"} />
          </option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label={translate("Filter district")}
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            setUpazila("");
            setUnion("");
            setPage(1);
          }}
        >
          <option value="">
            <Text value={"All districts"} />
          </option>
          {districts.map((d) => (
            <option value={d.code} key={d.code}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label={translate("Filter upazila")}
          disabled={!district}
          value={upazila}
          onChange={(e) => {
            setUpazila(e.target.value);
            setUnion("");
            setPage(1);
          }}
        >
          <option value="">
            <Text value={"All upazilas"} />
          </option>
          {upazilas
            .filter((u) => u.districtCode === district)
            .map((u) => (
              <option value={u.code} key={u.code}>
                {u.name}
              </option>
            ))}
        </select>
        <select
          aria-label={translate("Filter union")}
          disabled={!upazila}
          value={union}
          onChange={(e) => {
            setUnion(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            <Text value={"All unions"} />
          </option>
          {unions
            .filter((u) => u.upazilaCode === upazila)
            .map((u) => (
              <option value={u.code} key={u.code}>
                {u.name}
              </option>
            ))}
        </select>
      </div>
      <Feedback error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="card table-card">
            <div className="row table-heading">
              <h3>
                <Text value={"Reports"} />
              </h3>
              <span className="muted">
                {data.total} <Text value={"records"} />
              </span>
            </div>
            {data.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <Text value={"Tracking ID"} />
                      </th>
                      <th>
                        <Text value={"Incident / district"} />
                      </th>
                      <th>
                        <Text value={"Status"} />
                      </th>
                      <th>
                        <Text value={"Received"} />
                      </th>
                      <th>
                        <Text value={"Review"} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <Link
                            className="mono text-link"
                            to={"/staff/reports/" + r._id}
                          >
                            {r.trackingId}
                          </Link>
                          {r.screeningFlags.length > 0 && (
                            <small className="flag">
                              <Text value={"Screening flags"} />
                            </small>
                          )}
                        </td>
                        <td>
                          {typeLabels[r.incidentType]?.[1]}
                          <small>
                            {
                              districts.find((d) => d.code === r.districtCode)
                                ?.name
                            }
                          </small>
                        </td>
                        <td>
                          <span className={"badge " + r.status}>
                            <Text value={statusLabels[r.status]} />
                          </span>
                        </td>
                        <td>
                          {new Date(r.createdAt).toLocaleDateString(
                            languageLocale(),
                          )}
                        </td>
                        <td>
                          <Link
                            className="icon-button"
                            aria-label={translate("Review report")}
                            to={"/staff/reports/" + r._id}
                          >
                            <Icon.ArrowUpRight size={18} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                <Text value={"No reports match your filters or assignments."} />
              </Empty>
            )}
          </div>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {" "}
              <Text value={"Previous"} />{" "}
            </button>
            <span>
              {" "}
              <Text value={"Page"} /> {page} <Text value={"of"} />{" "}
              {Math.max(1, data.pages)}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {" "}
              <Text value={"Next"} />{" "}
            </button>
          </div>
        </>
      )}
    </>
  );
}
const transitions = {
  submitted: ["screening", "rejected"],
  screening: ["under_review", "rejected"],
  under_review: ["needs_information", "reviewed", "rejected"],
  needs_information: ["under_review", "rejected"],
  reviewed: ["resolved", "under_review"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};
export function ReportReview() {
  const { id } = useParams(),
    { user, districts, upazilas, unions } = useApp(),
    { data, error, reload } = useLoad("/staff/reports/" + id),
    [mutationError, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [staff, setStaff] = useState([]),
    [draftPreview, setDraftPreview] = useState(null),
    navigate = useNavigate();
  useEffect(() => {
    if (user.role === "super_admin")
      api("/admin/users")
        .then((d) => setStaff(d.items))
        .catch(() => {});
  }, [user.role]);
  async function mutate(url, body, method = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(url, {
        method,
        body,
      });
      setMessage("Changes saved.");
      reload();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Alert error>{error}</Alert>;
  if (!data) return <Loading />;
  const r = data.report;
  return (
    <>
      <Link className="text-link" to="/staff/reports">
        {" "}
        <Text value={"\u2190 Back to queue"} />{" "}
      </Link>
      <PageTitle
        eyebrow={r.trackingId}
        title={translate("Private report review")}
      >
        {" "}
        <Text value={"Sensitive information \xB7 Access is audited"} />{" "}
      </PageTitle>
      <Feedback error={mutationError} message={message} />
      <ReportWorkspace report={r} onChanged={reload} />
      <div className="review-grid">
        <div>
          <div className="card">
            <div className="row">
              <h2>{typeLabels[r.incidentType]?.[1]}</h2>
              <span className={"badge " + r.status}>
                <Text value={statusLabels[r.status]} />
              </span>
            </div>
            <div className="detail-grid">
              <div>
                <span>
                  <Text value={"District"} />
                </span>
                <strong>
                  {districts.find((d) => d.code === r.districtCode)?.name}
                </strong>
              </div>
              <div>
                <span>
                  <Text value={"General area"} />
                </span>
                <strong>{r.area}</strong>
              </div>
              <div>
                <span>
                  <Text value={"Incident date"} />
                </span>
                <strong>
                  {new Date(r.incidentDate).toLocaleDateString(
                    languageLocale(),
                  )}
                </strong>
              </div>
              <div>
                <span>
                  <Text value={"Amount demanded"} />
                </span>
                <strong>
                  <Text
                    value={
                      r.demandedAmount != null
                        ? `${r.demandedAmount.toLocaleString(languageLocale())} BDT`
                        : "Not provided"
                    }
                  />
                </strong>
              </div>
            </div>
            <p>
              <strong>
                <Text value={"Upazila:"} />
              </strong>{" "}
              {upazilas.find((u) => u.code === r.upazilaCode)?.name ||
                "Not provided"}{" "}
              ·{" "}
              <strong>
                <Text value={"Union:"} />
              </strong>{" "}
              {unions.find((u) => u.code === r.unionCode)?.name ||
                "Not provided"}{" "}
              ·{" "}
              <strong>
                <Text value={"Public-story consent:"} />
              </strong>{" "}
              <Text value={r.publicConsent ? "Granted" : "Not granted"} />
            </p>
            <h3>
              <Text value={"Reporter description"} />
            </h3>
            <p className="description-text">{r.description}</p>
            {r.contact && (
              <>
                <h3>
                  <Text value={"Optional contact \xB7 senior access"} />
                </h3>
                <p>{r.contact}</p>
              </>
            )}
            {r.screeningFlags.length > 0 && (
              <Alert>
                {" "}
                <Text value={"Screening flags:"} />{" "}
                {r.screeningFlags.join(", ")}
                <Text
                  value={". Automated indicators are not verification."}
                />{" "}
              </Alert>
            )}
            <h3>
              <Text value={"Duplicate candidates"} />
            </h3>
            {data.duplicateCandidates.length ? (
              data.duplicateCandidates.map((d) => (
                <p key={d._id}>
                  <Link to={"/staff/reports/" + d._id}>{d.trackingId}</Link>
                  <br />
                  <small>
                    <Text value={"ID:"} /> {d._id}
                  </small>
                </p>
              ))
            ) : (
              <p className="muted">
                {" "}
                <Text
                  value={
                    "No exact-description candidates visible to your role."
                  }
                />{" "}
              </p>
            )}
          </div>
          <div className="card mt">
            <h3>
              <Text value={"Private evidence"} />
            </h3>
            {user.role === "super_admin" && data.evidence.length < 5 && (
              <AdminEvidenceUpload reportId={id} onUploaded={reload} />
            )}
            {data.evidence.length ? (
              data.evidence.map((e) => (
                <div className="evidence-admin-item" key={e._id}>
                  <MediaViewer evidence={e} reportId={r._id} />
                  <div className="evidence-row">
                    <Icon.FileText />
                    <span>
                      {e.mimeType}
                      <small>
                        {Math.ceil(e.fileSize / 1024)}{" "}
                        <Text value={"KB \xB7"} />{" "}
                        <Text value={e.malwareScanStatus} />
                      </small>
                    </span>
                    {e.malwareScanStatus === "clean" ? (
                      <a
                        className="button outline small"
                        href={"/api/v1/staff/evidence/" + e._id}
                      >
                        {" "}
                        <Text value={"Download"} />{" "}
                      </a>
                    ) : (
                      user.role !== "moderator" && (
                        <button
                          className="button outline small"
                          disabled={busy}
                          onClick={() =>
                            mutate("/staff/evidence/" + e._id + "/scan", {})
                          }
                        >
                          {" "}
                          <Text value={"Scan"} />{" "}
                        </button>
                      )
                    )}
                  </div>
                  {user.role === "super_admin" && (
                    <AdminDelete
                      url={"/admin/evidence/" + e._id}
                      label="evidence"
                      onDeleted={reload}
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="muted">
                <Text value={"No evidence uploaded."} />
              </p>
            )}
          </div>
          <div className="card mt">
            <h3>
              <Text value={"Status history"} />
            </h3>
            <div className="timeline">
              {data.history.map((h) => (
                <div className="timeline-item" key={h._id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      <Text value={statusLabels[h.status]} />
                    </strong>
                    <small>
                      {new Date(h.createdAt).toLocaleString(languageLocale())}
                    </small>
                    <p>{h.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <h3>
              <Text value={"Senior reviews"} />
            </h3>
            {data.reviews.map((v) => (
              <div className="review-note" key={v._id}>
                <span className="badge">
                  <Text value={v.decision} />
                </span>
                <p>{v.notes}</p>
                <small>
                  {new Date(v.createdAt).toLocaleString(languageLocale())}
                </small>
              </div>
            ))}
          </div>
        </div>
        <aside>
          {user.role === "super_admin" && (
            <details className="card mb">
              <summary>
                <Text value={"Administrator \xB7 Edit report information"} />
              </summary>
              <AdminReportEditor
                key={r.updatedAt}
                report={r}
                onSaved={reload}
              />
            </details>
          )}
          {r.publicConsent && (
            <form
              className="card form-card mb"
              key={"public" + r.updatedAt}
              onInput={(e) =>
                setDraftPreview(
                  Object.fromEntries(new FormData(e.currentTarget)),
                )
              }
              onSubmit={(e) => {
                e.preventDefault();
                const b = Object.fromEntries(new FormData(e.target));
                b.displayUpazila = b.displayUpazila === "on";
                b.displayUnion = b.displayUnion === "on";
                b.updatedAt = r.updatedAt;
                mutate("/staff/reports/" + id + "/public-draft", b, "PATCH");
              }}
            >
              <h3>
                <Text value={"Redacted public account"} />
              </h3>
              <RedactionPreview
                privateText={r.description}
                draft={draftPreview || r.publicEntry}
              />
              <p>
                {" "}
                <Text
                  value={
                    "Prepare a separate public story. Remove names, precise places, contact details and identifying clues. A different senior reviewer must approve it."
                  }
                />{" "}
              </p>
              <label>
                {" "}
                <Text value={"Public title"} />{" "}
                <input
                  name="title"
                  required
                  minLength={10}
                  maxLength={120}
                  defaultValue={r.publicEntry?.title || ""}
                />
              </label>
              <label>
                {" "}
                <Text value={"Public summary"} />{" "}
                <textarea
                  name="summary"
                  required
                  minLength={30}
                  maxLength={600}
                  rows={3}
                  defaultValue={r.publicEntry?.summary || ""}
                />
              </label>
              <label>
                {" "}
                <Text value={"Public account"} />{" "}
                <textarea
                  name="body"
                  required
                  minLength={50}
                  maxLength={3000}
                  rows={6}
                  defaultValue={r.publicEntry?.body || ""}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="displayUpazila"
                  disabled={!r.upazilaCode}
                  defaultChecked={r.publicEntry?.displayUpazila}
                />{" "}
                <Text
                  value={
                    "Allow upazila display after privacy threshold and safety review"
                  }
                />{" "}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="displayUnion"
                  disabled={!r.unionCode}
                  defaultChecked={r.publicEntry?.displayUnion}
                />{" "}
                <Text
                  value={
                    "Allow union display after privacy threshold and safety review (also select upazila)"
                  }
                />{" "}
              </label>
              <button className="button outline" disabled={busy}>
                {" "}
                <Text value={"Save public draft"} />{" "}
              </button>
              <small>
                <Text value={"Saving revokes previous publication approval."} />
              </small>
              {r.publicEntry && (
                <div className="public-draft-preview">
                  <span className="eyebrow">
                    <Text value={"SAVED PUBLIC PREVIEW"} />
                  </span>
                  <h3>{r.publicEntry.title}</h3>
                  <p>{r.publicEntry.summary}</p>
                  <p className="description-text">{r.publicEntry.body}</p>
                  <strong>
                    <Text
                      value={
                        r.publicEntry.approved
                          ? "Approved public account"
                          : "Awaiting independent approval"
                      }
                    />
                  </strong>
                  {r.publicEntry.approved && (
                    <Link
                      className="text-link"
                      to={"/incidents/" + r.publicEntry.publicId}
                    >
                      {" "}
                      <Text value={"Open public account \u2192"} />{" "}
                    </Link>
                  )}
                </div>
              )}
            </form>
          )}
          <form
            className="card form-card"
            key={r.updatedAt}
            onSubmit={(e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.target));
              b.duplicateOf = b.duplicateOf || null;
              b.updatedAt = r.updatedAt;
              mutate("/staff/reports/" + id + "/status", b, "PATCH");
            }}
          >
            <h3>
              <Text value={"Update review status"} />
            </h3>
            <label>
              {" "}
              <Text value={"Next status"} />{" "}
              <select name="status" required>
                {transitions[r.status].map((s) => (
                  <option key={s} value={s}>
                    <Text value={statusLabels[s]} />
                  </option>
                ))}
              </select>
            </label>
            <label>
              {" "}
              <Text value={"Reporter-visible update"} />{" "}
              <textarea
                name="message"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder={translate("No private details or internal notes")}
              />
            </label>
            <label>
              {" "}
              <Text value={"Redacted summary"} />{" "}
              <textarea
                name="redactedSummary"
                defaultValue={r.redactedSummary || ""}
                maxLength={500}
                rows={3}
                placeholder={translate("Remove names and identifying details")}
              />
            </label>
            <label>
              {" "}
              <Text value={"Duplicate report ID (optional)"} />{" "}
              <input
                name="duplicateOf"
                defaultValue={r.duplicateOf || ""}
                pattern="[a-fA-F0-9]{24}"
              />
            </label>
            <button className="button" disabled={busy}>
              {" "}
              <Text value={"Save status"} />{" "}
            </button>
            <small>
              <Text value={"Changing status revokes publication approval."} />
            </small>
          </form>
          {user.role !== "moderator" && (
            <form
              className="card form-card mt"
              onSubmit={(e) => {
                e.preventDefault();
                mutate("/staff/reports/" + id + "/review", {
                  ...Object.fromEntries(new FormData(e.target)),
                  publishPublic:
                    new FormData(e.target).get("publishPublic") === "on",
                  redactionConfirmed:
                    new FormData(e.target).get("redactionConfirmed") === "on",
                });
              }}
            >
              <h3>
                <Text value={"Independent senior review"} />
              </h3>
              <p className="muted">
                {" "}
                <Text value={"Publication:"} />{" "}
                <Text
                  value={r.publicationApproved ? "Approved" : "Not approved"}
                />
              </p>
              <label>
                {" "}
                <Text value={"Decision"} />{" "}
                <select name="decision">
                  <option value="needs_review">
                    <Text value={"Needs further review"} />
                  </option>
                  <option value="approve">
                    <Text value={"Approve aggregate publication"} />
                  </option>
                  <option value="reject">
                    <Text value={"Reject publication"} />
                  </option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="publishPublic"
                  disabled={!r.publicConsent || !r.publicEntry}
                />{" "}
                <Text value={"Also approve the separate public account"} />{" "}
              </label>
              <label className="check-label">
                <input type="checkbox" name="redactionConfirmed" />
                <Text
                  value={
                    "I checked every public field for identifying information and safety"
                  }
                />{" "}
              </label>
              <label>
                {" "}
                <Text value={"Verification label"} />{" "}
                <select name="verificationLevel">
                  <option value="reviewed">
                    <Text value={"Reviewed report (not proof)"} />
                  </option>
                  <option value="independently_verified">
                    {" "}
                    <Text value={"Independently verified"} />{" "}
                  </option>
                </select>
              </label>
              <label>
                {" "}
                <Text
                  value={
                    "Safe public verification method (required for verified)"
                  }
                />{" "}
                <textarea name="verificationNote" maxLength={500} rows={3} />
              </label>
              <label>
                {" "}
                <Text value={"Internal notes"} />{" "}
                <textarea
                  name="notes"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <button className="button outline" disabled={busy}>
                {" "}
                <Text value={"Record decision"} />{" "}
              </button>
            </form>
          )}
          {user.role === "super_admin" && (
            <>
              <form
                className="card form-card mt"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate(
                    "/admin/reports/" + id + "/assign",
                    Object.fromEntries(new FormData(e.target)),
                    "PATCH",
                  );
                }}
              >
                <h3>
                  <Text value={"Report assignment"} />
                </h3>
                <select
                  aria-label={translate("Assign to staff")}
                  name="staffId"
                  required
                  defaultValue={r.assignedTo || ""}
                >
                  <option value="" disabled>
                    {" "}
                    <Text value={"Select staff member"} />{" "}
                  </option>
                  {staff
                    .filter((s) => s.accountStatus === "active")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · <Text value={s.role} />
                      </option>
                    ))}
                </select>
                <button className="button outline" disabled={busy}>
                  {" "}
                  <Text value={"Assign report"} />{" "}
                </button>
              </form>
              <form
                className="card form-card mt danger-zone"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    !window.confirm(
                      translate(
                        "Permanently delete this report and its evidence?",
                      ),
                    )
                  )
                    return;
                  const ok = await mutate(
                    "/admin/reports/" + id,
                    Object.fromEntries(new FormData(e.target)),
                    "DELETE",
                  );
                  if (ok) navigate("/staff/reports");
                }}
              >
                <h3>
                  <Text value={"Data removal"} />
                </h3>
                <p>
                  {" "}
                  <Text
                    value={
                      "This permanently removes report details, evidence, and review history. Audit metadata remains."
                    }
                  />{" "}
                </p>
                <label>
                  {" "}
                  <Text value={"Reason"} />{" "}
                  <input
                    name="reason"
                    required
                    minLength={10}
                    maxLength={500}
                  />
                </label>
                <button className="button danger" disabled={busy}>
                  {" "}
                  <Text value={"Delete report"} />{" "}
                </button>
              </form>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
export function StaffUsers() {
  const { bn, user, setUser } = useApp(),
    navigate = useNavigate();
  const { data: ownership, reload: reloadOwnership } =
    useFeature("/staff/ownership");
  const protectedAccount = (id) =>
    !ownership ||
    id === ownership?.owner?.id ||
    id === ownership?.pending?.targetId;
  const { data, error, reload } = useLoad("/admin/users"),
    [editing, setEditing] = useState(null),
    [mutationError, setError] = useState(""),
    [created, setCreated] = useState(null),
    [busy, setBusy] = useState(false);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCreated(
        await api("/admin/users", {
          method: "POST",
          body: Object.fromEntries(new FormData(e.target)),
        }),
      );
      e.target.reset();
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function update(id, body) {
    setError("");
    try {
      await api("/admin/users/" + id, {
        method: "PATCH",
        body,
      });
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={translate("ADMINISTRATION")}
        title={translate("Staff & permissions")}
      >
        {" "}
        <Text
          value={
            "Manage administrator and staff accounts. Members sign in with email and password."
          }
        />{" "}
      </PageTitle>
      <OwnershipPanel
        onChanged={() => {
          reload();
          reloadOwnership();
        }}
      />
      <Feedback error={error || mutationError} />
      {created && (
        <Alert>
          {" "}
          <Text value={"Account created for"} /> {created.user.email}
          <Text
            value={
              ". They can sign in with the email and password you provided."
            }
          />{" "}
        </Alert>
      )}
      <div className="card table-card">
        {!data ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table className="staff-members-table">
              <thead>
                <tr>
                  <th>
                    <Text value={"Member"} />
                  </th>
                  <th>
                    <Text value={"Role"} />
                  </th>
                  <th>
                    <Text value={"Status"} />
                  </th>
                  <th>
                    <Text value={"Action"} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="staff-member-identity">
                        <span className="staff-avatar">
                          {u.name.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                          {u.id === ownership?.owner?.id && (
                            <span className="owner-label">
                              {bn
                                ? "প্রধান মালিক · সুরক্ষিত"
                                : "OWNER · PROTECTED"}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        disabled={protectedAccount(u.id)}
                        aria-label={(bn ? "ভূমিকা: " : "Role for ") + u.name}
                        value={u.role}
                        onChange={(e) =>
                          update(u.id, {
                            role: e.target.value,
                          })
                        }
                      >
                        {["moderator", "senior_reviewer", "super_admin"].map(
                          (r) => (
                            <option key={r} value={r}>
                              <Text value={r} />
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td>
                      <span className="badge">
                        <Text value={u.accountStatus} />
                      </span>
                    </td>
                    <td>
                      <button
                        className="button outline small"
                        disabled={protectedAccount(u.id)}
                        onClick={() =>
                          update(u.id, {
                            accountStatus:
                              u.accountStatus === "active"
                                ? "disabled"
                                : "active",
                          })
                        }
                      >
                        <Text
                          value={
                            u.accountStatus === "active" ? "Disable" : "Enable"
                          }
                        />
                      </button>
                      <button
                        className="button outline small"
                        disabled={protectedAccount(u.id)}
                        onClick={() => setEditing(u)}
                      >
                        {" "}
                        <Text value={"Edit account"} />{" "}
                      </button>
                      {u.id !== user.id && !protectedAccount(u.id) && (
                        <AdminDelete
                          url={"/admin/users/" + u.id}
                          label={u.name}
                          onDeleted={reload}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <>
          <StaffAccountEditor
            key={editing.id}
            member={editing}
            onSaved={() => {
              if (editing.id === user.id) {
                setUser(null);
                setCsrf("");
                navigate("/staff/login");
              } else {
                setEditing(null);
                reload();
              }
            }}
          />
          <button
            className="button outline small mt"
            onClick={() => setEditing(null)}
          >
            {" "}
            <Text value={"Cancel editing"} />{" "}
          </button>
        </>
      )}
      <form className="card form-card mt" onSubmit={create}>
        <h2>
          <Text value={"Add a staff member"} />
        </h2>
        <div className="form-grid">
          <label>
            {" "}
            <Text value={"Name"} />{" "}
            <input name="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            {" "}
            <Text value={"Email"} />{" "}
            <input type="email" name="email" required />
          </label>
          <label>
            {" "}
            <Text value={"Initial password"} />{" "}
            <input
              type="password"
              name="password"
              required
              minLength={14}
              maxLength={200}
              autoComplete="new-password"
            />
          </label>
          <label>
            {" "}
            <Text value={"Role"} />{" "}
            <select name="role">
              <option value="moderator">
                <Text value={"Moderator"} />
              </option>
              <option value="senior_reviewer">
                <Text value={"Senior reviewer"} />
              </option>
              <option value="super_admin">
                <Text value={"Super admin"} />
              </option>
            </select>
          </label>
        </div>
        <button className="button" disabled={busy}>
          <Text value={busy ? "Creating…" : "Create staff account"} />
          <Icon.Users size={17} />
        </button>
      </form>
    </>
  );
}
export function AuditLogs() {
  const [page, setPage] = useState(1),
    { data, error } = useLoad("/admin/audit-logs?page=" + page);
  return (
    <>
      <PageTitle
        eyebrow={translate("ACCOUNTABILITY & SECURITY")}
        title={translate("Audit log")}
      >
        {" "}
        <Text
          value={
            "Metadata records of sensitive actions. Secrets and report descriptions are excluded."
          }
        />{" "}
      </PageTitle>
      <Feedback error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="card table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <Text value={"Time"} />
                    </th>
                    <th>
                      <Text value={"Action"} />
                    </th>
                    <th>
                      <Text value={"Resource"} />
                    </th>
                    <th>
                      <Text value={"Actor"} />
                    </th>
                    <th>
                      <Text value={"Outcome"} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l._id}>
                      <td>
                        {new Date(l.createdAt).toLocaleString(languageLocale())}
                      </td>
                      <td className="mono">
                        <Text value={l.action} />
                      </td>
                      <td>
                        {l.resourceType}
                        <small className="mono">{l.resourceId}</small>
                      </td>
                      <td className="mono">{l.actorId || "Public"}</td>
                      <td>
                        <span className="badge">
                          <Text value={l.outcome} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <Empty />}
          </div>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {" "}
              <Text value={"Previous"} />{" "}
            </button>
            <span>
              {data.total} <Text value={"events \xB7 Page"} /> {page}
            </span>
            <button
              disabled={page * 50 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {" "}
              <Text value={"Next"} />{" "}
            </button>
          </div>
        </>
      )}
    </>
  );
}
export function PrivacyQueue() {
  const { data, error, reload } = useLoad("/admin/privacy-requests"),
    [mutationError, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow={translate("PRIVATE DATA REQUESTS")}
        title={translate("Correction & removal queue")}
      >
        {" "}
        <Text
          value={
            "Verify ownership and authority before changing or deleting records."
          }
        />{" "}
      </PageTitle>
      <Feedback error={error || mutationError} />
      {!data ? (
        <Loading />
      ) : !data.items.length ? (
        <Empty>
          <Text value={"No privacy requests yet."} />
        </Empty>
      ) : (
        data.items.map((r) => (
          <form
            className="card form-card mb"
            key={r._id}
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await api("/admin/privacy-requests/" + r._id, {
                  method: "PATCH",
                  body: Object.fromEntries(new FormData(e.target)),
                });
                reload();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <div className="row">
              <h3>{r.reference}</h3>
              <span className="badge">
                <Text value={r.state} />
              </span>
            </div>
            <p>
              <strong>
                <Text value={r.details.kind} />
              </strong>{" "}
              <Text value={"\xB7 Ownership"} />{" "}
              <Text
                value={
                  r.details.ownershipVerified ? "verified" : "not verified"
                }
              />
            </p>
            <p className="description-text">{r.details.description}</p>
            <p>
              {" "}
              <Text value={"Contact:"} /> {r.details.contact}
              <br /> <Text value={"Tracking ID:"} />{" "}
              {r.details.trackingId || "Not provided"}
            </p>
            <div className="form-grid">
              <label>
                {" "}
                <Text value={"Request status"} />{" "}
                <select name="state" defaultValue={r.state}>
                  {["pending", "in_review", "completed", "denied"].map((s) => (
                    <option key={s} value={s}>
                      <Text value={s} />
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {" "}
                <Text value={"Private resolution notes"} />{" "}
                <textarea
                  name="resolution"
                  required
                  minLength={5}
                  maxLength={2000}
                  defaultValue={r.resolution}
                />
              </label>
            </div>
            <button className="button outline">
              <Text value={"Save resolution"} />
            </button>
          </form>
        ))
      )}
    </>
  );
}
