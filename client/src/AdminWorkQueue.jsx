import React from "react";
import { Link } from "react-router-dom";
import { useFeature } from "./FeaturePublic";
import { useApp, Alert } from "./ui";
export function AdminWorkQueue() {
  const { bn } = useApp();
  const { data, error } = useFeature("/features/admin/work-queue");
  return (
    <section className="card mt">
      <h2>{bn ? "আজকের কাজের তালিকা" : "Work queue"}</h2>
      {error && <Alert error>{error}</Alert>}
      <div className="metric-grid">
        {[
          ["submitted", "নতুন অভিযোগ", "New reports", "/staff/reports"],
          [
            "review",
            "পর্যালোচনার অপেক্ষায়",
            "Awaiting review",
            "/staff/reports",
          ],
          ["newsDrafts", "খসড়া সংবাদ", "Draft news", "/admin/content"],
          ["scheduled", "নির্ধারিত সংবাদ", "Scheduled news", "/admin/content"],
        ].map(([key, b, e, url]) => (
          <Link className="metric" to={url} key={key}>
            <strong>
              {data ? data[key].toLocaleString(bn ? "bn-BD" : "en-GB") : "…"}
            </strong>
            <span>{bn ? b : e}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
