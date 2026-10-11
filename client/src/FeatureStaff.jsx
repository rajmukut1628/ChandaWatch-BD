import { OwnershipPanel } from "./OwnershipPanel";
import { translate, languageLocale } from "./staff-copy";
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setCsrf, statusLabels } from "./api";
import { useApp, PageTitle, Alert, Loading, Text } from "./ui";
import { useFeature, SavedFilters } from "./FeaturePublic";
const base = "/features/staff";
function Feedback({ error, message }) {
  return (
    <>
      {error && <Alert error>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
    </>
  );
}
export function NotificationLink() {
  const { user, bn } = useApp(),
    [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const check = () =>
      api(base + "/notifications")
        .then((d) => alive && setCount(d.unread))
        .catch(() => {});
    check();
    const t = setInterval(check, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user?.id]);
  return user ? (
    <Link to="/staff/notifications" className="notification-link">
      <Text value={bn ? "নোটিফিকেশন" : "Notifications"} />{" "}
      <span className="badge" aria-label={translate(bn ? "না পড়া" : "Unread")}>
        {count}
      </span>
    </Link>
  ) : null;
}
export function NotificationsPage() {
  const { bn } = useApp(),
    { data, error, reload } = useFeature(base + "/notifications"),
    [mutation, setMutation] = useState("");
  return (
    <>
      <PageTitle title={translate(bn ? "নোটিফিকেশন" : "Notifications")}>
        <Text
          value={
            bn
              ? "আপনার assignment, review ও account update"
              : "Your assignments, reviews and account updates"
          }
        />
      </PageTitle>
      <Feedback error={error || mutation} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <button
            className="button outline small"
            onClick={async () => {
              try {
                await api(base + "/notifications/read", {
                  method: "POST",
                  body: {
                    ids: data.items.filter((i) => !i.readAt).map((i) => i._id),
                  },
                });
                reload();
              } catch (e) {
                setMutation(e.message);
              }
            }}
          >
            <Text value={bn ? "সব পড়া হিসেবে চিহ্নিত" : "Mark all as read"} />
          </button>
          {data.items.map((n) => (
            <article
              key={n._id}
              className={"card mt notification " + (!n.readAt ? "unread" : "")}
            >
              <h3>
                <Text value={n.title} />
              </h3>
              <small>
                {new Date(n.createdAt).toLocaleString(bn ? "bn-BD" : "en-GB")}
              </small>
              {n.reportId && (
                <Link className="text-link" to={"/staff/reports/" + n.reportId}>
                  <Text value={bn ? "রিপোর্ট খুলুন" : "Open report"} />
                </Link>
              )}
              {!n.readAt && (
                <button
                  className="button outline small"
                  onClick={async () => {
                    try {
                      await api(base + "/notifications/read", {
                        method: "POST",
                        body: {
                          ids: [n._id],
                        },
                      });
                      reload();
                    } catch (e) {
                      setMutation(e.message);
                    }
                  }}
                >
                  <Text value={bn ? "পড়েছি" : "Mark read"} />
                </button>
              )}
            </article>
          ))}
          {!data.items.length && (
            <p>
              <Text value={bn ? "কোনো নোটিফিকেশন নেই" : "No notifications"} />
            </p>
          )}
        </>
      )}
    </>
  );
}
export function AccountPage() {
  const { bn, setUser, user } = useApp(),
    { data, error, reload } = useFeature(base + "/account"),
    [message, setMessage] = useState(""),
    [mutation, setMutation] = useState(""),
    navigate = useNavigate();
  async function action(url, method = "POST", body) {
    setMutation("");
    try {
      const d = await api(base + url, {
        method,
        body,
      });
      setMessage(bn ? "পরিবর্তন সংরক্ষিত" : "Changes saved");
      if (d.current) {
        setCsrf("");
        setUser(null);
        navigate("/staff/login");
      } else reload();
    } catch (e) {
      setMutation(e.message);
    }
  }
  return (
    <>
      <OwnershipPanel />
      <PageTitle
        title={translate(bn ? "Account ও sessions" : "Account and sessions")}
      >
        {user.email}
      </PageTitle>
      <Feedback error={error || mutation} message={message} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="card form-card">
            <h2>
              <Text value={bn ? "Email verification" : "Email verification"} />
            </h2>
            <p>
              <Text
                value={
                  data.emailVerifiedAt
                    ? bn
                      ? "Email যাচাই হয়েছে"
                      : "Email verified"
                    : bn
                      ? "Email এখনো যাচাই হয়নি"
                      : "Email not yet verified"
                }
              />
            </p>
            {!data.emailDeliveryConfigured && (
              <Alert>
                <Text
                  value={
                    bn
                      ? "SMTP সংযোগ দেওয়া হয়নি; email পাঠানো যাবে না।"
                      : "SMTP is not configured; email delivery is unavailable."
                  }
                />
              </Alert>
            )}
            <button
              className="button outline"
              disabled={
                !data.emailDeliveryConfigured || Boolean(data.emailVerifiedAt)
              }
              onClick={() => action("/account/verify/request")}
            >
              <Text
                value={
                  bn ? "Verification email পাঠান" : "Send verification email"
                }
              />
            </button>
          </div>
          <form
            className="card form-card mt"
            key={String(data.available) + String(data.unavailableUntil)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.target);
              action("/availability", "PATCH", {
                available: f.get("available") === "on",
                unavailableUntil: f.get("until")
                  ? new Date(f.get("until")).toISOString()
                  : null,
              });
            }}
          >
            <h2>
              <Text
                value={
                  bn ? "Assignment availability" : "Assignment availability"
                }
              />
            </h2>
            <label className="check-label">
              <input
                name="available"
                type="checkbox"
                defaultChecked={data.available}
              />
              <Text
                value={
                  bn
                    ? "আমি নতুন assignment নিতে পারব"
                    : "Available for new assignments"
                }
              />
            </label>
            <label>
              <Text
                value={
                  bn
                    ? "ছুটি শেষ হওয়ার সময় (ঐচ্ছিক)"
                    : "Unavailable until (optional)"
                }
              />
              <input name="until" type="datetime-local" />
            </label>
            <button className="button">
              <Text value={bn ? "সংরক্ষণ" : "Save"} />
            </button>
          </form>
          <div className="card mt">
            <h2>
              <Text value={bn ? "Active sessions" : "Active sessions"} />
            </h2>
            <button
              className="button outline small"
              onClick={() => action("/sessions/revoke-others")}
            >
              <Text
                value={bn ? "অন্য সব session বন্ধ" : "Sign out other sessions"}
              />
            </button>
            {data.sessions.map((s) => (
              <div className="session-row" key={s._id}>
                <div>
                  <strong>
                    {s.deviceLabel || "Browser"}{" "}
                    {s.current && (bn ? "(বর্তমান)" : "(current)")}
                  </strong>
                  <p>
                    <Text value={bn ? "সর্বশেষ ব্যবহার" : "Last active"} />:{" "}
                    {new Date(s.lastSeenAt).toLocaleString(languageLocale())}
                  </p>
                </div>
                <button
                  className="button outline small"
                  onClick={() => action("/sessions/" + s._id, "DELETE")}
                >
                  <Text value={bn ? "Session বন্ধ" : "Revoke session"} />
                </button>
              </div>
            ))}
          </div>
          <div className="card mt">
            <h2>
              <Text value={bn ? "Login history" : "Login history"} />
            </h2>
            {data.logins.map((l, i) => (
              <p key={i}>
                {new Date(l.createdAt).toLocaleString(languageLocale())} ·{" "}
                <Text value={l.outcome} /> · <Text value={l.action} />
              </p>
            ))}
          </div>
          <div className="card mt">
            <h2>
              <Text value={bn ? "পরিচয়মুক্ত export" : "Safe exports"} />
            </h2>
            <p>
              <Text
                value={
                  bn
                    ? "আপনার অনুমতি অনুযায়ী সর্বোচ্চ ৫০০টি row; ব্যক্তিগত বিবরণ বা tracking credentials থাকবে না।"
                    : "Up to 500 authorized rows, without private narratives or tracking credentials."
                }
              />
            </p>
            <div className="actions">
              <a
                className="button outline"
                href="/api/v1/features/staff/export?format=csv"
              >
                {" "}
                <Text value={"CSV"} />{" "}
              </a>
              <a
                className="button outline"
                href="/api/v1/features/staff/export?format=pdf"
              >
                {" "}
                <Text value={"PDF"} />{" "}
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
export function RecoveryPage({ verify = false }) {
  const { bn } = useApp(),
    [token] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { data } = useFeature("/features/account/status");
  useEffect(() => {
    if (token) history.replaceState(null, "", location.pathname);
  }, [token]);
  return (
    <div className="container narrow section">
      <PageTitle
        title={translate(
          verify
            ? bn
              ? "Email যাচাই"
              : "Verify email"
            : bn
              ? "Password recovery"
              : "Password recovery",
        )}
      />
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.target);
          try {
            await api(
              "/features/account/" +
                (verify
                  ? "verify"
                  : token
                    ? "reset/complete"
                    : "reset/request"),
              {
                method: "POST",
                body: verify
                  ? {
                      token,
                    }
                  : token
                    ? {
                        token,
                        password: f.get("password"),
                      }
                    : {
                        email: f.get("email"),
                      },
              },
            );
            setMessage(
              verify
                ? bn
                  ? "Email যাচাই হয়েছে"
                  : "Email verified"
                : token
                  ? bn
                    ? "Password পরিবর্তিত; সব আগের session বন্ধ হয়েছে।"
                    : "Password changed; previous sessions revoked."
                  : bn
                    ? "Account থাকলে ও email সংযোগ চালু থাকলে নির্দেশনা পাঠানো হবে।"
                    : "Instructions will be sent if the account exists and email delivery is configured.",
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!verify && !token && (
          <>
            <label>
              <Text value={bn ? "Email" : "Email"} />
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
            {data && !data.emailDeliveryConfigured && (
              <Alert>
                <Text
                  value={
                    bn
                      ? "Email service এখনো সংযুক্ত হয়নি। Admin-এর মাধ্যমে password reset করতে হবে।"
                      : "Email service is not configured. Contact your administrator for password recovery."
                  }
                />
              </Alert>
            )}
          </>
        )}
        {!verify && token && (
          <label>
            <Text
              value={
                bn
                  ? "নতুন password (কমপক্ষে ১৪ অক্ষর)"
                  : "New password (at least 14 characters)"
              }
            />
            <input
              name="password"
              type="password"
              minLength={14}
              maxLength={200}
              required
              autoComplete="new-password"
            />
          </label>
        )}
        {verify && !token && (
          <Alert error>
            <Text
              value={
                bn
                  ? "Verification link প্রয়োজন"
                  : "A verification link is required"
              }
            />
          </Alert>
        )}
        <button
          className="button"
          disabled={
            busy ||
            (verify && !token) ||
            (!token && !verify && data?.emailDeliveryConfigured === false)
          }
        >
          <Text
            value={
              verify
                ? bn
                  ? "যাচাই করুন"
                  : "Verify"
                : bn
                  ? "পাঠান"
                  : "Continue"
            }
          />
        </button>
        <Feedback error={error} message={message} />
        <Link to="/staff/login">
          <Text value={bn ? "Login-এ ফিরুন" : "Return to sign in"} />
        </Link>
      </form>
    </div>
  );
}
export function ReporterConversation({ credentials }) {
  const { bn } = useApp(),
    headers = {
      "x-tracking-id": credentials.trackingId,
      "x-tracking-secret": credentials.secret,
    },
    url = `/features/reporter/${credentials.id}/messages`,
    { data, error, reload } = useFeature(url, headers),
    [message, setMessage] = useState(""),
    [mutation, setMutation] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card form-card mt">
      <h2>
        <Text
          value={
            bn ? "ব্যক্তিগত যোগাযোগ ও আবেদন" : "Private messages and requests"
          }
        />
      </h2>
      <p>
        <Text
          value={
            bn
              ? "এখানে পাঠানো তথ্য শুধু অনুমোদিত staff দেখবেন। সংশোধন, নতুন তথ্য বা প্রত্যাহারের আবেদন করলে Public বিবরণ review না হওয়া পর্যন্ত লুকাবে।"
              : "Only authorized staff can read these messages. Corrections, supplemental information and withdrawal requests hide the public account pending review."
          }
        />
      </p>
      <Feedback error={error || mutation} message={message} />
      <div className="message-list">
        {data?.items.map((m) => (
          <article className={"message " + m.author} key={m.id}>
            <strong>
              <Text
                value={
                  m.author === "staff"
                    ? bn
                      ? "Staff"
                      : "Staff"
                    : bn
                      ? "আপনি"
                      : "You"
                }
              />{" "}
              · <Text value={m.kind} />
            </strong>
            <p>{m.text}</p>
            <small>
              {new Date(m.createdAt).toLocaleString(languageLocale())} ·{" "}
              <Text value={m.state} />
            </small>
            {m.resolution && (
              <p>
                <Text value={bn ? "উত্তর" : "Resolution"} />: {m.resolution}
              </p>
            )}
          </article>
        ))}
      </div>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMutation("");
          try {
            await api(url, {
              method: "POST",
              headers,
              body: Object.fromEntries(new FormData(e.target)),
            });
            setMessage(bn ? "পাঠানো হয়েছে" : "Sent privately");
            e.target.reset();
            reload();
          } catch (e) {
            setMutation(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <Text value={bn ? "ধরন" : "Type"} />
          <select name="kind">
            <option value="message">
              <Text value={bn ? "প্রশ্ন / উত্তর" : "Question / answer"} />
            </option>
            <option value="correction">
              <Text value={bn ? "সংশোধনের আবেদন" : "Correction request"} />
            </option>
            <option value="supplement">
              <Text value={bn ? "অতিরিক্ত তথ্য" : "Supplemental information"} />
            </option>
            <option value="withdrawal">
              <Text value={bn ? "প্রত্যাহারের আবেদন" : "Withdrawal request"} />
            </option>
          </select>
        </label>
        <label>
          <Text value={bn ? "আপনার বক্তব্য" : "Your message"} />
          <textarea
            name="text"
            required
            minLength={3}
            maxLength={4000}
            rows={4}
          />
        </label>
        <button className="button" disabled={busy}>
          <Text value={bn ? "ব্যক্তিগতভাবে পাঠান" : "Send privately"} />
        </button>
      </form>
    </section>
  );
}
export function WorkloadPage() {
  const { bn } = useApp(),
    { data, error } = useFeature(base + "/workload");
  return (
    <>
      <PageTitle title={translate(bn ? "Staff workload" : "Staff workload")} />
      {error && <Alert error>{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <div className="metric-grid">
          {data.items.map((u) => (
            <article className="card" key={u._id}>
              <h2>{u.name}</h2>
              <p>
                <Text value={u.role} />
              </p>
              <strong>{u.pending}</strong>
              <p>
                <Text value={bn ? "অপেক্ষমাণ" : "Pending"} /> · {u.overdue}{" "}
                <Text value={bn ? "সময় পেরিয়েছে" : "overdue"} />
              </p>
              <span className="badge">
                <Text
                  value={
                    u.available ||
                    (u.unavailableUntil &&
                      new Date(u.unavailableUntil) < new Date())
                      ? bn
                        ? "কাজ নিতে পারবেন"
                        : "Available"
                      : bn
                        ? "ছুটিতে"
                        : "Unavailable"
                  }
                />
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function PriorityQueue() {
  const { bn } = useApp(),
    [priority, setPriority] = useState(""),
    [overdue, setOverdue] = useState(false),
    q = new URLSearchParams({
      ...(priority
        ? {
            priority,
          }
        : {}),
      ...(overdue
        ? {
            overdue: "true",
          }
        : {}),
    }),
    { data, error } = useFeature(base + "/priority-queue?" + q);
  return (
    <>
      <PageTitle
        title={translate(
          bn ? "Priority ও overdue queue" : "Priority and overdue queue",
        )}
      />
      <div className="filter-bar">
        <label>
          <Text value={bn ? "অগ্রাধিকার" : "Priority"} />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">
              <Text value={bn ? "সব" : "All"} />
            </option>
            {["normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {bn
                  ? {
                      normal: "সাধারণ",
                      high: "উচ্চ",
                      urgent: "জরুরি",
                    }[p]
                  : p}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />
          <Text value={bn ? "শুধু সময় পেরোনো" : "Only overdue"} />
        </label>
      </div>
      <Feedback error={error} />
      {data?.items.map((r) => (
        <article className="card mt" key={r._id}>
          <Link to={"/staff/reports/" + r._id}>{r.trackingId}</Link>
          <p>
            <Text value={r.priority} /> ·{" "}
            <Text value={statusLabels[r.status]} /> ·{" "}
            <Text
              value={
                r.dueAt
                  ? new Date(r.dueAt).toLocaleString(languageLocale())
                  : bn
                    ? "Deadline নেই"
                    : "No deadline"
              }
            />
          </p>
        </article>
      ))}
      {data && !data.items.length && (
        <p>
          <Text value={bn ? "কোনো রিপোর্ট নেই" : "No reports found"} />
        </p>
      )}
    </>
  );
}
export function ReportWorkspace({ report, onChanged }) {
  const { bn, user } = useApp(),
    url = base + `/reports/${report._id}`,
    { data, error, reload } = useFeature(url + "/workspace"),
    [mutation, setMutation] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => reload(), [report.updatedAt]);
  async function action(path, body, method = "POST") {
    setBusy(true);
    setMutation("");
    try {
      await api(url + path, {
        method,
        body,
      });
      reload();
      onChanged?.();
      setMessage(bn ? "সংরক্ষিত" : "Saved");
      return true;
    } catch (e) {
      setMutation(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return error ? <Alert error>{error}</Alert> : <Loading />;
  const name = (id) =>
    data.colleagues.find((u) => u._id === id)?.name ||
    (bn ? "পুরোনো account" : "Former account");
  return (
    <div className="workspace-features">
      <Feedback error={error || mutation} message={message} />
      <form
        className="card form-card mt"
        key={data.report.updatedAt}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          action(
            "/workflow",
            {
              updatedAt: data.report.updatedAt,
              priority: f.get("priority"),
              dueAt: f.get("dueAt")
                ? new Date(f.get("dueAt")).toISOString()
                : null,
              checklist: f.getAll("checklist"),
            },
            "PATCH",
          );
        }}
      >
        <h2>
          <Text value={bn ? "Review পরিকল্পনা" : "Review planning"} />
        </h2>
        <div className="form-grid">
          <label>
            <Text value={bn ? "অগ্রাধিকার" : "Priority"} />
            <select
              name="priority"
              defaultValue={data.report.priority || "normal"}
            >
              {["normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {bn
                    ? {
                        normal: "সাধারণ",
                        high: "উচ্চ",
                        urgent: "জরুরি",
                      }[p]
                    : p}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Text value={bn ? "Deadline" : "Deadline"} />
            <input
              name="dueAt"
              type="datetime-local"
              defaultValue={
                data.report.dueAt
                  ? new Date(
                      new Date(data.report.dueAt).getTime() -
                        new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
            />
          </label>
        </div>
        {[
          "duplicates",
          "sensitive_details",
          "evidence",
          "redaction",
          "consent",
          "independent_review",
        ].map((c) => (
          <label className="check-label" key={c}>
            <input
              type="checkbox"
              name="checklist"
              value={c}
              defaultChecked={data.report.checklist.includes(c)}
            />
            <Text value={c} />
          </label>
        ))}
        <small>
          <Text
            value={
              bn
                ? "Checklist নিজে পূরণ করুন; এটি independent approval-এর বিকল্প নয়।"
                : "Record completed checks; this does not replace independent approval."
            }
          />
        </small>
        <button className="button" disabled={busy}>
          <Text value={bn ? "পরিকল্পনা সংরক্ষণ" : "Save planning"} />
        </button>
      </form>
      <details className="card mt">
        <summary>
          <Text
            value={
              bn
                ? "Private messages ও reporter requests"
                : "Private messages and reporter requests"
            }
          />
        </summary>
        <div className="message-list">
          {data.messages.map((m) => (
            <article className={"message " + m.author} key={m.id}>
              <strong>
                <Text value={m.author} /> · <Text value={m.kind} />
              </strong>
              <p>{m.text}</p>
              <small>
                {new Date(m.createdAt).toLocaleString(languageLocale())} ·{" "}
                <Text value={m.state} />
              </small>
              {m.resolution && <p>{m.resolution}</p>}
              {m.author === "reporter" &&
                m.kind !== "message" &&
                !["completed", "denied"].includes(m.state) && (
                  <form
                    className="form-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(
                        "/messages/" + m.id,
                        Object.fromEntries(new FormData(e.target)),
                        "PATCH",
                      );
                    }}
                  >
                    <label>
                      <Text value={bn ? "সিদ্ধান্ত" : "Resolution"} />
                      <select name="state">
                        <option value="in_review">
                          <Text value={bn ? "পর্যালোচনায়" : "In review"} />
                        </option>
                        <option value="completed">
                          <Text value={bn ? "সম্পন্ন" : "Completed"} />
                        </option>
                        <option value="denied">
                          <Text value={bn ? "গ্রহণ হয়নি" : "Denied"} />
                        </option>
                      </select>
                    </label>
                    <label>
                      <Text
                        value={
                          bn
                            ? "Reporter-এর জন্য উত্তর"
                            : "Reporter-visible response"
                        }
                      />
                      <textarea
                        name="resolution"
                        required
                        minLength={3}
                        maxLength={4000}
                      />
                    </label>
                    <button className="button small" disabled={busy}>
                      <Text value={bn ? "উত্তর সংরক্ষণ" : "Save response"} />
                    </button>
                  </form>
                )}
            </article>
          ))}
        </div>
        <form
          className="form-card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await action("/messages", {
                channel: "reporter",
                text: new FormData(e.target).get("text"),
              })
            )
              e.target.reset();
          }}
        >
          <label>
            <Text
              value={
                bn
                  ? "Reporter-কে প্রশ্ন / উত্তর"
                  : "Question / reply to reporter"
              }
            />
            <textarea name="text" required minLength={3} maxLength={4000} />
          </label>
          <button className="button small" disabled={busy}>
            <Text value={bn ? "পাঠান" : "Send"} />
          </button>
        </form>
      </details>
      <details className="card mt">
        <summary>
          <Text
            value={
              bn ? "Internal notes ও mentions" : "Internal notes and mentions"
            }
          />
        </summary>
        {data.notes.map((n) => (
          <article className="message" key={n.id}>
            <strong>{name(n.authorId)}</strong>
            <p>{n.text}</p>
            {n.seconds !== undefined && (
              <p>
                <Text value={bn ? "ভিডিও সময়" : "Video timestamp"} />:{" "}
                {n.seconds}
                <Text value={"s"} />{" "}
              </p>
            )}
            <small>
              {new Date(n.createdAt).toLocaleString(languageLocale())}
            </small>
            {n.mentions?.length > 0 && (
              <p>
                <Text value={bn ? "Mention" : "Mention"} />:{" "}
                {n.mentions.map(name).join(", ")}
              </p>
            )}
          </article>
        ))}
        <form
          className="form-card"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            if (
              await action("/messages", {
                channel: "internal",
                text: f.get("text"),
                mentions: f.getAll("mentions"),
              })
            )
              e.target.reset();
          }}
        >
          <label>
            <Text value={bn ? "Internal note" : "Internal note"} />
            <textarea name="text" required minLength={3} maxLength={4000} />
          </label>
          <label>
            <Text
              value={
                bn
                  ? "Mention staff (Ctrl দিয়ে একাধিক)"
                  : "Mention staff (Ctrl for multiple)"
              }
            />
            <select name="mentions" multiple>
              {data.colleagues
                .filter(
                  (u) => u.role !== "moderator" || u._id === report.assignedTo,
                )
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="button small" disabled={busy}>
            <Text value={bn ? "Note সংরক্ষণ" : "Save note"} />
          </button>
        </form>
      </details>
      <details className="card mt">
        <summary>
          <Text
            value={bn ? "Public draft versions" : "Public draft versions"}
          />
        </summary>
        {data.versions.map((v) => (
          <article className="message" key={v.id}>
            <h3>{v.snapshot.title}</h3>
            <p>{v.snapshot.summary}</p>
            <details>
              <summary>
                <Text value={bn ? "পূর্ণ লেখা" : "Full text"} />
              </summary>
              <p className="description-text">{v.snapshot.body}</p>
            </details>
            <small>
              {new Date(v.createdAt).toLocaleString(languageLocale())} ·{" "}
              {name(v.authorId)}
            </small>
            <button
              className="button outline small"
              disabled={busy || !report.publicConsent}
              onClick={() =>
                action("/draft-restore/" + v.id, {
                  updatedAt: data.report.updatedAt,
                })
              }
            >
              <Text
                value={bn ? "এই draft ফিরিয়ে আনুন" : "Restore this draft"}
              />
            </button>
          </article>
        ))}
        {!data.versions.length && (
          <p>
            <Text value={bn ? "কোনো version নেই" : "No versions yet"} />
          </p>
        )}
      </details>
      <details className="card mt">
        <summary>
          <Text
            value={
              bn ? "Assignment transfer history" : "Assignment transfer history"
            }
          />
        </summary>
        {data.assignments.map((a) => (
          <p key={a._id}>
            {new Date(a.createdAt).toLocaleString(languageLocale())} ·{" "}
            <Text
              value={
                a.fromId ? name(a.fromId) : bn ? "Unassigned" : "Unassigned"
              }
            />{" "}
            → {name(a.toId)} · {name(a.actorId)}
          </p>
        ))}
      </details>
    </div>
  );
}
export function RedactionPreview({ privateText, draft }) {
  const { bn } = useApp();
  return (
    <details className="redaction-comparison card mt">
      <summary>
        <Text
          value={
            bn
              ? "Private / Public পাশাপাশি দেখুন"
              : "Compare private information and public draft"
          }
        />
      </summary>
      <div className="redaction-columns">
        <article>
          <h3>
            <Text value={bn ? "ব্যক্তিগত বিবরণ" : "Private description"} />
          </h3>
          <p className="description-text">{privateText}</p>
        </article>
        <article>
          <h3>{draft?.title || (bn ? "Public draft" : "Public draft")}</h3>
          <p>{draft?.summary}</p>
          <p className="description-text">{draft?.body}</p>
          {/(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+|https?:\/\//i.test(
            [draft?.title, draft?.summary, draft?.body].join(" "),
          ) && (
            <Alert error>
              <Text
                value={
                  bn
                    ? "পরিচয় / যোগাযোগের pattern সরান"
                    : "Remove identity or contact patterns"
                }
              />
            </Alert>
          )}
        </article>
      </div>
    </details>
  );
}
export function MediaViewer({ evidence, reportId }) {
  const { bn } = useApp(),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(1),
    [seconds, setSeconds] = useState(0),
    [message, setMessage] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (evidence.malwareScanStatus !== "clean") return null;
  async function open() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/v1/features/staff/evidence/${evidence._id}/preview`,
        {
          credentials: "same-origin",
        },
      );
      if (!res.ok) {
        const d = await res.json();
        throw Error(d.error);
      }
      setUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="media-viewer no-print">
      {!url ? (
        <button className="button outline small" disabled={busy} onClick={open}>
          <Text
            value={bn ? "নিরাপদ viewer খুলুন" : "Open clean evidence viewer"}
          />
        </button>
      ) : (
        <>
          <button
            className="button outline small"
            onClick={() => {
              URL.revokeObjectURL(url);
              setUrl("");
            }}
          >
            <Text value={bn ? "Viewer বন্ধ" : "Close viewer"} />
          </button>
          {evidence.mimeType.startsWith("image/") ? (
            <>
              <label>
                <Text value={bn ? "Zoom" : "Zoom"} />
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.25"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <div className="image-zoom">
                <img
                  src={url}
                  alt={bn ? "ব্যক্তিগত clean প্রমাণ" : "Private clean evidence"}
                  style={{
                    width: zoom * 100 + "%",
                    maxWidth: "none",
                  }}
                />
              </div>
            </>
          ) : evidence.mimeType.startsWith("video/") ? (
            <video
              controls
              src={url}
              onTimeUpdate={(e) =>
                setSeconds(Math.round(e.target.currentTime * 10) / 10)
              }
            />
          ) : evidence.mimeType.startsWith("audio/") ? (
            <audio controls src={url} />
          ) : (
            <iframe
              title={translate(bn ? "ব্যক্তিগত PDF" : "Private PDF")}
              sandbox="allow-downloads"
              src={url}
            />
          )}
          {evidence.mimeType.startsWith("video/") && (
            <form
              className="form-card"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                try {
                  await api(`${base}/reports/${reportId}/messages`, {
                    method: "POST",
                    body: {
                      channel: "internal",
                      text: new FormData(e.target).get("text"),
                      evidenceId: evidence._id,
                      seconds,
                    },
                  });
                  setMessage(
                    bn ? "Timestamp note সংরক্ষিত" : "Timestamp note saved",
                  );
                  e.target.reset();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <label>
                <Text
                  value={
                    bn
                      ? "এই সময়ের Internal note"
                      : "Internal note at this timestamp"
                  }
                />{" "}
                · {seconds}
                <Text value={"s"} />{" "}
                <textarea name="text" required minLength={3} maxLength={4000} />
              </label>
              <button className="button small">
                <Text value={bn ? "Note সংরক্ষণ" : "Save timestamp note"} />
              </button>
            </form>
          )}
        </>
      )}
      <Feedback error={error} message={message} />
    </div>
  );
}
export function BulkTools({ items, onChanged }) {
  const { user, bn } = useApp(),
    [ids, setIds] = useState([]),
    [staff, setStaff] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setIds([]);
  }, [items.map((i) => i._id).join(",")]);
  useEffect(() => {
    if (user.role === "super_admin")
      api("/admin/users")
        .then((d) => setStaff(d.items))
        .catch((e) => setError(e.message));
  }, [user.role]);
  if (user.role !== "super_admin") return null;
  return (
    <details className="card mb">
      <summary>
        <Text
          value={bn ? "একসঙ্গে রিপোর্ট পরিচালনা" : "Bulk report management"}
        />
      </summary>
      <div className="bulk-checks">
        {items.map((r) => (
          <label className="check-label" key={r._id}>
            <input
              type="checkbox"
              checked={ids.includes(r._id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, r._id]
                    : ids.filter((x) => x !== r._id),
                )
              }
            />
            {r.trackingId}
          </label>
        ))}
      </div>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.target),
            operation = f.get("operation");
          try {
            await api(`/features/admin/bulk-${operation}`, {
              method: "POST",
              body:
                operation === "assign"
                  ? {
                      ids,
                      staffId: f.get("staffId"),
                    }
                  : {
                      ids,
                      status: f.get("status"),
                      message: f.get("message"),
                    },
            });
            setMessage(
              bn
                ? "নির্বাচিত রিপোর্ট update হয়েছে"
                : "Selected reports updated",
            );
            setIds([]);
            onChanged?.();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <Text value={bn ? "কাজ" : "Action"} />
          <select name="operation">
            <option value="assign">
              <Text value={bn ? "Assignment" : "Assign"} />
            </option>
            <option value="status">
              <Text value={bn ? "Status update" : "Status update"} />
            </option>
          </select>
        </label>
        <label>
          <Text value={bn ? "Staff" : "Staff"} />
          <select name="staffId">
            <option value="">
              <Text value={bn ? "নির্বাচন করুন" : "Choose"} />
            </option>
            {staff
              .filter(
                (s) =>
                  s.accountStatus === "active" &&
                  (s.available !== false ||
                    (s.unavailableUntil &&
                      new Date(s.unavailableUntil) < new Date())),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <Text value={bn ? "নতুন status" : "New status"} />
          <select name="status">
            {Object.entries(statusLabels).map(([s, label]) => (
              <option key={s} value={s}>
                {translate(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Text
            value={
              bn
                ? "Reporter-visible update (status বদলালে)"
                : "Reporter-visible update (for status changes)"
            }
          />
          <textarea name="message" maxLength={500} />
        </label>
        <p>
          <Text
            value={
              bn
                ? "সব রিপোর্টে বৈধ transition হতে হবে; approval কখনো bulk-এ দেওয়া যায় না।"
                : "All status transitions must be valid; bulk publication approval is unavailable."
            }
          />
        </p>
        <button className="button small" disabled={!ids.length || busy}>
          <Text value={bn ? "নির্বাচিতগুলো update" : "Update selected"} /> (
          {ids.length})
        </button>
        <Feedback error={error} message={message} />
      </form>
    </details>
  );
}
