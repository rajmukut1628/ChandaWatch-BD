import { z } from "zod";
import { Report } from "./models.js";
import { districts, types } from "./districts.js";
import { upazilas, validUpazila, unions, validUnion } from "./geography.js";
import { config } from "./config.js";
import { Content } from "./feature-models.js";
export const publicEligibility = () => ({
  publicationApproved: true,
  publicConsent: true,
  "publicEntry.approved": true,
  reviewState: "approved",
  duplicateOf: null,
  expiresAt: { $gt: new Date() },
});
export async function visibleUpazilas() {
  const rows = await Report.aggregate([
    {
      $match: {
        ...publicEligibility(),
        "publicEntry.displayUpazila": true,
        upazilaCode: { $type: "string", $ne: "" },
      },
    },
    { $group: { _id: "$upazilaCode", count: { $sum: 1 } } },
    { $match: { count: { $gte: config.minCount } } },
  ]);
  return new Set(rows.map((r) => r._id));
}
export async function visibleUnions() {
  const rows = await Report.aggregate([
    {
      $match: {
        ...publicEligibility(),
        "publicEntry.displayUpazila": true,
        "publicEntry.displayUnion": true,
        unionCode: { $type: "string", $ne: "" },
      },
    },
    { $group: { _id: "$unionCode", count: { $sum: 1 } } },
    { $match: { count: { $gte: config.minCount } } },
  ]);
  return new Set(rows.map((r) => r._id));
}
export function serializeCase(r, visible, safeUnions = new Set()) {
  const d = districts.find((d) => d.code === r.districtCode);
  const u =
    r.publicEntry.displayUpazila && visible.has(r.upazilaCode)
      ? upazilas.find((u) => u.code === r.upazilaCode)
      : null;
  return {
    id: r.publicEntry.publicId,
    title: r.publicEntry.title,
    summary: r.publicEntry.summary,
    body: r.publicEntry.body,
    incidentType: r.incidentType,
    district: {
      code: d.code,
      name: d.name,
      bn: d.bn,
      division: d.division,
      center: d.center,
    },
    upazila: u ? { code: u.code, name: u.name, bn: u.bn } : null,
    union:
      r.publicEntry.displayUnion && u && safeUnions.has(r.unionCode)
        ? (() => {
            const union = unions.find((x) => x.code === r.unionCode);
            return union
              ? { code: union.code, name: union.name, bn: union.bn }
              : null;
          })()
        : null,
    incidentMonth: r.publicEntry.incidentMonth,
    status: r.publicEntry.snapshotStatus,
    verificationLevel: r.publicEntry.verificationLevel,
    verificationNote: r.publicEntry.verificationNote || "",
    publishedAt: r.publicEntry.publishedAt,
    reviewedAt: r.publicEntry.reviewedAt,
  };
}
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    district: z.string().optional(),
    upazila: z.string().optional(),
    union: z.string().optional(),
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{2,60}$/)
      .optional(),
    from: month.optional(),
    to: month.optional(),
    status: z.enum(["reviewed", "resolved"]).optional(),
    verification: z.enum(["reviewed", "independently_verified"]).optional(),
    search: z.string().trim().max(80).optional(),
    sort: z.enum(["latest", "oldest"]).default("latest"),
  })
  .strict();
export function installPublicCases(app) {
  app.get("/api/v1/public/cases", async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid public filters." });
    const q = parsed.data;
    if (
      q.type &&
      !types.includes(q.type) &&
      !(await Content.exists({
        kind: "category",
        slug: q.type,
        state: "published",
      })) &&
      !(await Report.exists({ ...publicEligibility(), incidentType: q.type }))
    )
      return res.status(400).json({ error: "Invalid incident category." });
    if (
      (q.district && !districts.some((d) => d.code === q.district)) ||
      (q.upazila && (!q.district || !validUpazila(q.district, q.upazila))) ||
      (q.from && q.to && q.from > q.to)
    )
      return res
        .status(400)
        .json({ error: "Choose valid district, upazila and date filters." });
    const filter = publicEligibility(),
      visible = await visibleUpazilas(),
      safeUnions = await visibleUnions();
    if (
      q.union &&
      (!q.district || !q.upazila || !validUnion(q.district, q.upazila, q.union))
    )
      return res
        .status(400)
        .json({ error: "Choose a valid union for the selected upazila." });
    if (q.union) {
      if (safeUnions.has(q.union)) {
        filter.unionCode = q.union;
        filter["publicEntry.displayUnion"] = true;
      } else filter._id = { $exists: false };
    }
    if (q.district) filter.districtCode = q.district;
    if (q.upazila) {
      if (visible.has(q.upazila)) {
        filter.upazilaCode = q.upazila;
        filter["publicEntry.displayUpazila"] = true;
      } else filter._id = { $exists: false };
    }
    if (q.type) filter.incidentType = q.type;
    if (q.status) filter["publicEntry.snapshotStatus"] = q.status;
    if (q.verification)
      filter["publicEntry.verificationLevel"] = q.verification;
    if (q.from || q.to)
      filter["publicEntry.incidentMonth"] = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    if (q.search) {
      const term = [...q.search]
        .map((c) =>
          (String.fromCharCode(92) + "^$.*+?()[]{}|").includes(c)
            ? String.fromCharCode(92) + c
            : c,
        )
        .join("");
      filter.$or = [
        { "publicEntry.title": { $regex: term, $options: "i" } },
        { "publicEntry.summary": { $regex: term, $options: "i" } },
      ];
    }
    const [items, total] = await Promise.all([
      Report.find(filter)
        .select("publicEntry incidentType districtCode upazilaCode unionCode")
        .sort({
          "publicEntry.publishedAt": q.sort === "oldest" ? 1 : -1,
          "publicEntry.publicId": 1,
        })
        .skip((q.page - 1) * 10)
        .limit(10)
        .lean(),
      Report.countDocuments(filter),
    ]);
    res.json({
      items: items.map((r) => {
        const x = serializeCase(r, visible, safeUnions);
        delete x.body;
        return x;
      }),
      total,
      page: q.page,
      pageSize: 10,
      pages: Math.ceil(total / 10),
      notice:
        "Consented, redacted reports approved by an independent reviewer. A reviewed report is not proof of an allegation.",
    });
  });
  app.get("/api/v1/public/cases/:publicId", async (req, res) => {
    if (!/^[\w-]{20,40}$/.test(req.params.publicId))
      return res.status(404).json({ error: "Public report unavailable." });
    const r = await Report.findOne({
      ...publicEligibility(),
      "publicEntry.publicId": req.params.publicId,
    })
      .select(
        "publicEntry incidentType districtCode upazilaCode unionCode createdAt",
      )
      .lean();
    if (!r)
      return res.status(404).json({ error: "Public report unavailable." });
    const entry = serializeCase(
      r,
      await visibleUpazilas(),
      await visibleUnions(),
    );
    res.json({
      entry,
      timeline: [
        {
          stage: "report_received",
          date: new Date(r.createdAt).toISOString().slice(0, 7),
        },
        { stage: "privacy_review", date: r.publicEntry.reviewedAt },
        { stage: "independent_approval", date: r.publicEntry.publishedAt },
        ...(r.publicEntry.snapshotStatus === "resolved"
          ? [{ stage: "resolved", date: r.publicEntry.publishedAt }]
          : []),
      ],
      notice:
        "This is a redacted public account. Original evidence, identifying details and internal review notes remain private.",
    });
  });
}
