import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeature } from "./FeaturePublic";
import { api, setCsrf } from "./api";
import { useApp, Alert, Icon } from "./ui";
export function OwnershipPanel({ onChanged }) {
  const { bn, setUser } = useApp(),
    navigate = useNavigate();
  const { data, error, reload } = useFeature("/staff/ownership");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function action(kind, body) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/staff/ownership/" + kind, {
        method: "POST",
        body,
      });
      if (result.signInAgain) {
        setCsrf("");
        setUser(null);
        navigate("/staff/login");
      } else {
        setMessage(
          bn
            ? "মালিকানার অনুরোধ হালনাগাদ হয়েছে।"
            : "Ownership request updated.",
        );
        reload();
        onChanged?.();
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ownership-panel card">
      <div className="ownership-heading">
        <span className="ownership-icon">
          <Icon.ShieldCheck size={28} />
        </span>
        <div>
          <span className="eyebrow">
            {bn ? "সুরক্ষিত মালিকানা" : "PROTECTED OWNERSHIP"}
          </span>
          <h2>{bn ? "প্রধান মালিকের নিয়ন্ত্রণ" : "Platform ownership"}</h2>
        </div>
        <span className="badge">{bn ? "সুরক্ষিত" : "Protected"}</span>
      </div>
      {(error || message) && (
        <Alert error={Boolean(error)}>{error || message}</Alert>
      )}
      {data?.owner && (
        <div className="owner-identity">
          <strong>{data.owner.name}</strong>
          <span>{data.owner.email}</span>
        </div>
      )}
      <p>
        {bn
          ? "প্রধান মালিকের অ্যাকাউন্ট মুছতে, নিষ্ক্রিয় করতে বা ভূমিকা কমাতে পারবেন না। মালিকানা পরিবর্তনে দুই পক্ষের সম্মতি প্রয়োজন।"
          : "The owner's account cannot be deleted, disabled or demoted. Ownership changes require both parties' confirmation."}
      </p>
      {data?.pending && (
        <div className="notice">
          <Icon.Clock size={18} />
          <span>
            {bn
              ? "হস্তান্তরের অনুরোধ অপেক্ষায় আছে। মেয়াদ: "
              : "Transfer pending. Expires: "}
            {new Date(data.pending.expiresAt).toLocaleString(
              bn ? "bn-BD" : "en-GB",
            )}
          </span>
        </div>
      )}
      {data?.isOwner && !data.pending && (
        <details>
          <summary>
            {bn ? "মালিকানা পরিবর্তন করুন" : "Transfer ownership"}
          </summary>
          <form
            className="ownership-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action("request", {
                targetEmail: f.get("targetEmail"),
                password: f.get("password"),
                revision: data.revision,
              });
              e.currentTarget.reset();
            }}
          >
            <label>
              {bn
                ? "নতুন মালিকের অ্যাকাউন্টের ইমেইল"
                : "Successor's staff account email"}
              <input required type="email" name="targetEmail" maxLength={150} />
            </label>
            <label>
              {bn ? "আপনার বর্তমান পাসওয়ার্ড" : "Your current password"}
              <input
                required
                type="password"
                name="password"
                autoComplete="current-password"
                maxLength={128}
              />
            </label>
            <p>
              {bn
                ? "সক্রিয় কর্মী অ্যাকাউন্ট নির্বাচন করুন। অনুরোধ ২৪ ঘণ্টা থাকবে; গ্রহণের পরে নতুন মালিক প্রশাসকের ক্ষমতা পাবেন।"
                : "Choose an active staff account. The request lasts 24 hours; acceptance grants administrator access."}
            </p>
            <button disabled={busy} className="button">
              {bn ? "হস্তান্তরের অনুরোধ পাঠান" : "Request transfer"}
            </button>
          </form>
        </details>
      )}
      {data?.isOwner && data.pending && (
        <button
          className="button outline"
          disabled={busy}
          onClick={() => action("cancel", { revision: data.revision })}
        >
          {bn ? "অনুরোধ বাতিল করুন" : "Cancel request"}
        </button>
      )}
      {data?.canAccept && (
        <form
          className="ownership-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action("accept", {
              password: f.get("password"),
              transferId: data.pending.id,
              revision: data.revision,
            });
            e.currentTarget.reset();
          }}
        >
          <label>
            {bn
              ? "আপনার পাসওয়ার্ড দিয়ে মালিকানা গ্রহণ করুন"
              : "Accept ownership using your password"}
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label className="check-label">
            <input required type="checkbox" />
            {bn
              ? "আমি প্রধান মালিকের দায়িত্ব গ্রহণ করছি।"
              : "I accept responsibility as platform owner."}
          </label>
          <button className="button" disabled={busy}>
            {bn ? "মালিকানা গ্রহণ করুন" : "Accept ownership"}
          </button>
        </form>
      )}
    </section>
  );
}
