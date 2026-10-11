import { translate } from "./staff-copy";
import { Text } from "./ui";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useApp, PageTitle, Alert, Icon } from "./ui";
import { api, typeLabels, download, uploadEvidence } from "./api";
import { PendingUploads, UploadMetrics } from "./FeatureReporter";
import { MediaPicker } from "./MediaPicker";
export function AdminDelete({ url, label, onDeleted }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="admin-delete">
      {!open ? (
        <button
          type="button"
          className="button outline small danger"
          onClick={() => setOpen(true)}
        >
          {" "}
          <Text value={"Delete"} /> {translate(label)}
        </button>
      ) : (
        <form
          className="form-card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            if (!["DELETE", "মুছুন"].includes(f.get("confirmation"))) {
              setError("Type DELETE to confirm.");
              setBusy(false);
              return;
            }
            try {
              await api(url, {
                method: "DELETE",
                body: {
                  reason: f.get("reason"),
                },
              });
              onDeleted?.();
              setOpen(false);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {" "}
            <Text value={"Delete"} /> {translate(label)}{" "}
            <Text
              value={
                "permanently? This removes the stored record. Audit events remain for accountability."
              }
            />{" "}
          </p>
          <label>
            {" "}
            <Text value={"Reason"} />{" "}
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={2}
            />
          </label>
          <label>
            {" "}
            <Text value={"Type DELETE"} />{" "}
            <input
              name="confirmation"
              required
              pattern="DELETE"
              autoComplete="off"
            />
          </label>
          {error && <Alert error>{error}</Alert>}
          <div className="actions">
            <button className="button danger small" disabled={busy}>
              {" "}
              <Text value={"Confirm deletion"} />{" "}
            </button>
            <button
              type="button"
              className="button outline small"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {" "}
              <Text value={"Cancel"} />{" "}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export function AdminReportEditor({ report, onSaved }) {
  const { bn, districts, upazilas, unions } = useApp(),
    [district, setDistrict] = useState(report?.districtCode || ""),
    [upazila, setUpazila] = useState(report?.upazilaCode || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(null),
    [message, setMessage] = useState("");
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget),
      b = {
        incidentType: f.get("incidentType"),
        district: f.get("district"),
        upazila: f.get("upazila") || undefined,
        union: f.get("union") || undefined,
        area: f.get("area"),
        incidentDate: f.get("incidentDate"),
        description: f.get("description"),
        contactRequested: !!f.get("contact"),
        contact: f.get("contact") || undefined,
        publicConsent: f.get("publicConsent") === "on",
        privacyAcknowledged: true,
      };
    if (f.get("demandedAmount"))
      b.demandedAmount = Number(f.get("demandedAmount"));
    if (report) b.reason = f.get("reason");
    try {
      const result = await api(
        "/admin/reports" + (report ? "/" + report._id : ""),
        {
          method: report ? "PATCH" : "POST",
          body: b,
        },
      );
      if (!report) setCreated(result);
      setMessage(
        report
          ? "Information corrected. Public approval and stale draft were revoked."
          : "Report added privately. Normal independent publication review is still required.",
      );
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="form-card" onSubmit={save}>
        <h3>
          <Text value={report ? "Edit report information" : "Add a report"} />
        </h3>
        <p className="muted">
          {" "}
          <Text
            value={
              "Enter source information accurately. Only record public-story consent when the source explicitly granted it."
            }
          />{" "}
        </p>
        <div className="form-grid">
          <label>
            {" "}
            <Text value={"Incident type"} />{" "}
            <select
              name="incidentType"
              required
              defaultValue={report?.incidentType || ""}
            >
              <option value="" disabled>
                {" "}
                <Text value={"Choose type"} />{" "}
              </option>
              {Object.entries(typeLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {" "}
            <Text value={"District"} />{" "}
            <select
              name="district"
              value={district}
              required
              onChange={(e) => {
                setDistrict(e.target.value);
                setUpazila("");
              }}
            >
              <option value="" disabled>
                {" "}
                <Text value={"Choose district"} />{" "}
              </option>
              {districts.map((d) => (
                <option key={d.code} value={d.code}>
                  {bn ? d.bn : d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {" "}
            <Text value={"Upazila"} />{" "}
            <select
              name="upazila"
              value={upazila}
              disabled={!district}
              onChange={(e) => setUpazila(e.target.value)}
            >
              <option value="">
                <Text value={"Not provided / metropolitan"} />
              </option>
              {upazilas
                .filter((u) => u.districtCode === district)
                .map((u) => (
                  <option value={u.code} key={u.code}>
                    {bn ? u.bn : u.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {" "}
            <Text value={"Union"} />{" "}
            <select
              name="union"
              key={upazila}
              defaultValue={
                upazila === report?.upazilaCode ? report?.unionCode || "" : ""
              }
              disabled={!upazila}
            >
              <option value="">
                <Text value={"Not provided / municipality"} />
              </option>
              {unions
                .filter((u) => u.upazilaCode === upazila)
                .map((u) => (
                  <option value={u.code} key={u.code}>
                    {bn ? u.bn : u.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {" "}
            <Text value={"General area"} />{" "}
            <input
              name="area"
              defaultValue={report?.area || ""}
              required
              minLength={2}
              maxLength={150}
            />
          </label>
          <label>
            {" "}
            <Text value={"Incident date"} />{" "}
            <input
              name="incidentDate"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              defaultValue={report?.incidentDate?.slice(0, 10) || ""}
            />
          </label>
          <label>
            {" "}
            <Text value={"Demanded amount \xB7 BDT"} />{" "}
            <input
              name="demandedAmount"
              type="number"
              min="0"
              max="10000000000"
              defaultValue={report?.demandedAmount ?? ""}
            />
          </label>
          <label>
            {" "}
            <Text value={"Private contact (optional)"} />{" "}
            <input
              name="contact"
              maxLength={200}
              defaultValue={report?.contact || ""}
            />
          </label>
          <label className="full">
            {" "}
            <Text value={"Private description"} />{" "}
            <textarea
              name="description"
              required
              minLength={30}
              maxLength={6000}
              rows={6}
              defaultValue={report?.description || ""}
            />
          </label>
        </div>
        <label className="check-label">
          <input
            name="publicConsent"
            type="checkbox"
            defaultChecked={report?.publicConsent}
          />{" "}
          <Text
            value={
              "Source gave permission for a separately redacted public story"
            }
          />{" "}
        </label>
        {report && (
          <label>
            {" "}
            <Text value={"Correction reason"} />{" "}
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={3}
            />
          </label>
        )}
        {error && <Alert error>{error}</Alert>}
        {message && <Alert>{message}</Alert>}
        <button className="button" disabled={busy}>
          <Text
            value={
              busy
                ? "Saving…"
                : report
                  ? "Save correction"
                  : "Add private report"
            }
          />
        </button>
      </form>
      {created && (
        <div className="card pale mt">
          <h3>
            <Text value={"Report created \xB7 save credentials once"} />
          </h3>
          <p>
            {" "}
            <Text
              value={
                "These credentials provide private reporter access. Store and deliver them securely."
              }
            />{" "}
          </p>
          <div className="credential">
            <code>{created.trackingId}</code>
          </div>
          <div className="credential">
            <code>{created.secret}</code>
          </div>
          <div className="actions">
            <button
              className="button outline small"
              onClick={() =>
                download("chandawatch-tracking.json", {
                  id: created.id,
                  trackingId: created.trackingId,
                  secret: created.secret,
                })
              }
            >
              {" "}
              <Text value={"Save credentials"} />{" "}
            </button>
            <Link className="button small" to={"/staff/reports/" + created.id}>
              {" "}
              <Text value={"Open report"} />{" "}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
export function AdminNewReport() {
  return (
    <>
      <PageTitle
        eyebrow={translate("ADMINISTRATION")}
        title={translate("Add report information")}
      >
        {" "}
        <Text
          value={
            "Admin-created reports start private and follow the same publication review process."
          }
        />{" "}
      </PageTitle>
      <div className="card">
        <AdminReportEditor />
      </div>
    </>
  );
}
export function AdminEvidenceUpload({ reportId, onUploaded }) {
  const [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState("");
  return (
    <form
      className="form-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !files.length) return;
        setBusy(true);
        setError("");
        setMessage("");
        let count = 0;
        try {
          for (const file of files) {
            setProgress(0);
            await uploadEvidence(
              {
                id: reportId,
              },
              file,
              setProgress,
              true,
            );
            count++;
          }
          setFiles([]);
          setMessage(
            "Evidence uploaded privately. Files remain quarantined until scanned clean.",
          );
        } catch (e) {
          setFiles((current) => current.slice(count));
          setError(e.message);
        } finally {
          setBusy(false);
          onUploaded?.();
        }
      }}
    >
      <MediaPicker files={files} onChange={setFiles} disabled={busy} />
      <UploadMetrics />
      <PendingUploads
        credentials={{
          id: reportId,
        }}
        admin
        busy={busy}
      />
      {busy && (
        <progress
          max="100"
          value={progress}
          aria-label={translate("Admin upload progress")}
        />
      )}
      {error && <Alert error>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
      <button className="button outline small" disabled={busy || !files.length}>
        <Text value={busy ? "Uploading…" : "Add private evidence"} />
      </button>
    </form>
  );
}
export function StaffAccountEditor({ member, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form-card card mt"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const b = Object.fromEntries(new FormData(e.currentTarget));
        if (!b.password) delete b.password;
        try {
          await api("/admin/users/" + member.id, {
            method: "PATCH",
            body: b,
          });
          onSaved();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        <Text value={"Edit"} /> {member.name}
      </h3>
      <label>
        {" "}
        <Text value={"Name"} />{" "}
        <input
          name="name"
          defaultValue={member.name}
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label>
        {" "}
        <Text value={"Email"} />{" "}
        <input
          name="email"
          type="email"
          defaultValue={member.email}
          required
          maxLength={200}
        />
      </label>
      <label>
        {" "}
        <Text value={"New password (optional, minimum 14 characters)"} />{" "}
        <input
          name="password"
          type="password"
          minLength={14}
          maxLength={200}
          autoComplete="new-password"
        />
      </label>
      <small>
        {" "}
        <Text
          value={
            "Changes revoke existing sessions. Leaving password blank preserves it."
          }
        />{" "}
      </small>
      {error && <Alert error>{error}</Alert>}
      <button className="button" disabled={busy}>
        {" "}
        <Text value={"Save account"} />{" "}
      </button>
    </form>
  );
}
