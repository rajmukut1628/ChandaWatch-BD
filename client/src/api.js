import { sha256 } from "@noble/hashes/sha2.js";
import { localizeError } from "./staff-copy";
let csrf = "";
export async function uploadEvidence(
  credentials,
  file,
  onProgress = () => {},
  admin = false,
) {
  if (
    !file.size ||
    file.size > (file.type.startsWith("video/") ? 200 : 10) * 1024 * 1024
  )
    throw Error("Images/documents/audio: 10 MB; video: 200 MB maximum.");
  const hash = sha256.create(),
    size = 5 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += size)
    hash.update(
      new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()),
    );
  const fingerprint = [...hash.digest()]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const url = admin
    ? `/features/admin/reports/${credentials.id}`
    : `/features/reporter/${credentials.id}`;
  const headers = admin
    ? {}
    : {
        "x-tracking-id": credentials.trackingId,
        "x-tracking-secret": credentials.secret,
      };
  const u = await api(url + "/uploads", {
    method: "POST",
    headers,
    body: { fingerprint, size: file.size },
  });
  if (u.state === "complete") {
    onProgress(100);
    return u.result;
  }
  let completed = u.received.reduce(
      (n, index) => n + Math.min(size, file.size - index * size),
      0,
    ),
    sent = 0;
  const started = performance.now();
  for (let index = 0; index < Math.ceil(file.size / size); index++) {
    if (u.received.includes(index)) continue;
    const chunk = file.slice(
      index * size,
      Math.min(file.size, (index + 1) * size),
    );
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", "/api/v1" + url + `/uploads/${u.id}/chunks/${index}`);
      xhr.timeout = 5 * 60000;
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      if (csrf) xhr.setRequestHeader("x-csrf-token", csrf);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        const progress = Math.min(
            99,
            Math.round(((completed + e.loaded) / file.size) * 100),
          ),
          speed =
            (sent + e.loaded) /
            Math.max(0.1, (performance.now() - started) / 1000);
        onProgress(progress);
        window.dispatchEvent(
          new CustomEvent("cw-upload-metrics", {
            detail: {
              name: file.name,
              bytesPerSecond: speed,
              remainingSeconds:
                (file.size - completed - e.loaded) / Math.max(1, speed),
              progress,
            },
          }),
        );
      };
      xhr.onerror = () =>
        reject(
          Error(
            "Connection interrupted. Retry or reselect the same file from tracking to resume.",
          ),
        );
      xhr.ontimeout = () =>
        reject(Error("Chunk timed out. Reselect the same file to resume."));
      xhr.onload = () => {
        let d;
        try {
          d = JSON.parse(xhr.responseText);
        } catch {
          return reject(
            Error("Upload response unavailable. Retry the same file."),
          );
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else
          reject(
            Error(localizeError(d.error || "Chunk upload failed.", xhr.status)),
          );
      };
      xhr.send(chunk);
    });
    completed += chunk.size;
    sent += chunk.size;
  }
  window.dispatchEvent(
    new CustomEvent("cw-upload-metrics", {
      detail: {
        name: file.name,
        bytesPerSecond:
          sent / Math.max(0.1, (performance.now() - started) / 1000),
        remainingSeconds: null,
        progress: 99,
      },
    }),
  );
  const result = await api(url + `/uploads/${u.id}/complete`, {
    method: "POST",
    headers,
    body: {},
  });
  onProgress(100);
  window.dispatchEvent(
    new CustomEvent("cw-upload-metrics", {
      detail: {
        name: file.name,
        bytesPerSecond:
          sent / Math.max(0.1, (performance.now() - started) / 1000),
        remainingSeconds: 0,
        progress: 100,
      },
    }),
  );
  return result;
}
export const setCsrf = (v) => (csrf = v);
export async function api(url, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch("/api/v1" + url, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await res
    .json()
    .catch(() => ({ error: "Server unavailable. Please try again." }));
  if (!res.ok)
    throw Error(localizeError(data.error || "Request failed.", res.status));
  return data;
}
export const typeLabels = {
  extortion_demand: ["চাঁদা দাবি", "Extortion demand"],
  business_extortion: ["ব্যবসায় চাঁদাবাজি", "Business extortion"],
  transport_extortion: ["পরিবহনে চাঁদাবাজি", "Transport extortion"],
  threat_intimidation: ["হুমকি ও ভয়ভীতি", "Threat / intimidation"],
  other: ["অন্যান্য", "Other"],
};
export const baseTypeLabels = JSON.parse(JSON.stringify(typeLabels));
export const statusLabels = {
  submitted: "Submitted",
  screening: "Screening",
  under_review: "Under review",
  needs_information: "Needs information",
  reviewed: "Reviewed",
  resolved: "Resolved",
  rejected: "Rejected",
};
export function download(name, data, type = "application/json") {
  const link = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob(
        [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
        { type },
      ),
    );
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
