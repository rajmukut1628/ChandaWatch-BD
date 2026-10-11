import { translate, languageLocale } from "./staff-copy";
import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, typeLabels, download } from "./api";
import { useApp, PageTitle, Alert, Loading, Empty, Icon, Text } from "./ui";
export function useStatistics(internal = false) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api(internal ? "/staff/analytics" : "/public/statistics")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [internal]);
  return {
    data,
    error,
  };
}
function Chart({ rows, area = false }) {
  const { bn } = useApp();
  const count = (value) => Number(value).toLocaleString(bn ? "bn-BD" : "en-GB");
  if (!rows?.length)
    return (
      <Empty>
        <Text value="There is no publishable data for this dimension yet." />
      </Empty>
    );
  return (
    <ResponsiveContainer width="100%" height={280}>
      {area ? (
        <AreaChart data={rows}>
          <CartesianGrid vertical={false} stroke="#e7ece8" />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: 12,
            }}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={count}
            tick={{
              fontSize: 12,
            }}
          />
          <Tooltip formatter={(value) => [count(value), translate("Count")]} />
          <Area
            dataKey="count"
            name={translate("Count")}
            stroke="#176653"
            fill="#dfeee4"
            strokeWidth={2}
          />
        </AreaChart>
      ) : (
        <BarChart
          data={rows}
          margin={{
            left: -20,
            right: 10,
            bottom: 30,
          }}
        >
          <CartesianGrid vertical={false} stroke="#e7ece8" />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: 11,
            }}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis allowDecimals={false} tickFormatter={count} />
          <Tooltip formatter={(value) => [count(value), translate("Count")]} />
          <Bar
            dataKey="count"
            name={translate("Count")}
            fill="#27735b"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
export function Statistics({ internal = false }) {
  const { districts, bn } = useApp(),
    { data, error } = useStatistics(internal);
  const districtName = (name) =>
    districts.find((d) => d.code === name)?.[bn ? "bn" : "name"] || name;
  return (
    <div className={internal ? "" : "container section"}>
      <PageTitle
        eyebrow={translate(
          internal ? "INTERNAL INSIGHTS" : "PUBLIC COMMUNITY INSIGHTS",
        )}
        title={translate(
          internal
            ? "Internal analytics"
            : bn
              ? "তথ্য দিয়ে সচেতনতা"
              : "Understanding the reports",
        )}
      >
        <Text
          value={
            internal
              ? "Operational counts include all reports."
              : "Anonymized, approved report counts. These figures do not represent actual crime rates."
          }
        />
      </PageTitle>
      {error ? (
        <Alert error>{error}</Alert>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <Alert>{data.notice}</Alert>
          <div className="metric-grid">
            <div className="metric">
              <Icon.FileText />
              <strong>{data.total ?? "—"}</strong>
              <span>
                <Text
                  value={internal ? "All reports" : "Approved report count"}
                />
              </span>
            </div>
            <div className="metric">
              <Icon.MapPin />
              <strong>{data.byDistrict.length || "—"}</strong>
              <span>
                <Text value="Districts with displayable data" />
              </span>
            </div>
            <div className="metric">
              <Icon.ShieldCheck />
              <strong>{data.privacyThreshold}+</strong>
              <span>
                <Text value="Minimum public group size" />
              </span>
            </div>
          </div>
          <div className="chart-grid">
            <div className="card">
              <h3>
                <Text value="Monthly reporting trend" />
              </h3>
              <p className="muted">
                <Text value="Reports by incident month" />
              </p>
              <Chart rows={data.monthly} area />
            </div>
            <div className="card">
              <h3>
                <Text value="Incident types" />
              </h3>
              <p className="muted">
                <Text value="Categories of reports" />
              </p>
              <Chart
                rows={data.byType.map((r) => ({
                  ...r,
                  name: typeLabels[r.name]?.[bn ? 0 : 1] || r.name,
                }))}
              />
            </div>
            <div className="card full">
              <div className="row">
                <h3>
                  <Text value="District overview" />
                </h3>
                <button
                  className="button outline small"
                  onClick={() => download("chandawatch-statistics.json", data)}
                >
                  <Icon.Download size={15} />
                  <Text value="Export counts" />
                </button>
              </div>
              <Chart
                rows={data.byDistrict.map((r) => ({
                  ...r,
                  name: districtName(r.name),
                }))}
              />
            </div>
            {internal && (
              <div className="card full">
                <h3>
                  <Text value={"Review workflow"} />
                </h3>
                <Chart
                  rows={data.byStatus.map((row) => ({
                    ...row,
                    name: translate(row.name),
                  }))}
                />
              </div>
            )}
          </div>
          <p className="fine-print">
            {" "}
            <Text value={"Updated"} />{" "}
            {new Date(data.updatedAt).toLocaleString(languageLocale())}{" "}
            <Text
              value={
                "\xB7 Empty charts may indicate privacy suppression or no eligible reports."
              }
            />{" "}
          </p>
        </>
      )}
    </div>
  );
}
export function MapPage() {
  const { districts, bn } = useApp(),
    { data, error } = useStatistics(),
    [division, setDivision] = useState(""),
    [enabled, setEnabled] = useState(false);
  const rows = (data?.byDistrict || [])
    .map((r) => ({
      ...districts.find((d) => d.code === r.name),
      count: r.count,
    }))
    .filter((d) => d.code && (!division || d.division === division));
  return (
    <div className="container section">
      <PageTitle
        eyebrow={translate("DISTRICT-LEVEL AWARENESS")}
        title={translate(
          bn ? "বাংলাদেশের রিপোর্ট ম্যাপ" : "A district view of Bangladesh",
        )}
      >
        <Text value="Markers show district centers and aggregate counts. They never show incident addresses." />
      </PageTitle>
      <Alert>
        <Text value="OpenStreetMap tiles are loaded from an external provider only when you enable the map. That provider can receive your IP address and map requests." />
      </Alert>
      <div className="row mb">
        <label className="inline-label">
          <Text value="Division" />
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="">
              <Text value="All divisions" />
            </option>
            {[...new Set(districts.map((d) => d.division))].map((d) => (
              <option key={d} value={d}>
                <Text value={d} />
              </option>
            ))}
          </select>
        </label>
        <span className="badge">
          <Text value="PUBLIC AGGREGATES ONLY" />
        </span>
      </div>
      {error && <Alert error>{error}</Alert>}
      <div className="map-layout">
        <div className="map-panel">
          {enabled ? (
            <MapContainer
              center={[23.8, 90.3]}
              zoom={7}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {rows.map((d) => (
                <CircleMarker
                  key={d.code}
                  center={d.center}
                  radius={Math.min(30, 8 + Math.sqrt(d.count) * 2)}
                  pathOptions={{
                    color: "#1b6750",
                    fillColor: "#1b6750",
                    fillOpacity: 0.5,
                  }}
                >
                  <Popup>
                    <strong>{bn ? d.bn : d.name}</strong>
                    <br />
                    {d.count} <Text value={"approved reports"} /> <br />{" "}
                    <Text value={"District center only"} />{" "}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          ) : (
            <div className="map-consent">
              <Icon.MapPin size={44} />
              <h2>
                <Text value="District statistics map" />
              </h2>
              <p>
                <Text value="Enable external map tiles to explore the district overview." />
              </p>
              <button className="button" onClick={() => setEnabled(true)}>
                <Text value="Enable map" />
                <Icon.ArrowUpRight size={17} />
              </button>
            </div>
          )}
        </div>
        <div className="card map-list">
          <h3>
            <Text value="Displayable district counts" />
          </h3>
          <p className="muted">
            <Text value="Groups below the privacy threshold are withheld." />
          </p>
          {!data ? (
            <Loading />
          ) : rows.length ? (
            rows.map((d) => (
              <div className="district-row" key={d.code}>
                <span>
                  {bn ? d.bn : d.name}
                  <small>{d.division}</small>
                </span>
                <strong>{d.count}</strong>
              </div>
            ))
          ) : (
            <Empty>
              <Text value="No district counts can currently be published." />
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
