import mongoose from "mongoose";
const { Schema } = mongoose;
const model = (n, s) =>
  mongoose.model(n, new Schema(s, { timestamps: true, strict: "throw" }));
export const Report = model("Report", {
  trackingId: { type: String, unique: true, index: true },
  trackingSecretHash: String,
  incidentType: String,
  districtCode: { type: String, index: true },
  upazilaCode: { type: String, index: true },
  unionCode: { type: String, index: true },
  publicConsent: { type: Boolean, default: false },
  publicEntry: {
    type: new Schema(
      {
        publicId: { type: String, unique: true, sparse: true },
        title: String,
        summary: String,
        body: String,
        incidentMonth: String,
        displayUpazila: { type: Boolean, default: false },
        displayUnion: { type: Boolean, default: false },
        preparedBy: Schema.Types.ObjectId,
        approved: { type: Boolean, default: false },
        verificationLevel: {
          type: String,
          enum: ["reviewed", "independently_verified"],
          default: "reviewed",
        },
        verificationNote: String,
        publishedAt: Date,
        reviewedAt: Date,
        snapshotStatus: String,
      },
      { _id: false },
    ),
    default: undefined,
  },
  incidentDate: Date,
  detailsEncrypted: String,
  evidenceCount: { type: Number, default: 0 },
  status: {
    type: String,
    default: "submitted",
    enum: [
      "submitted",
      "screening",
      "under_review",
      "needs_information",
      "reviewed",
      "resolved",
      "rejected",
    ],
  },
  reviewState: { type: String, default: "unreviewed" },
  publicationApproved: { type: Boolean, default: false },
  assignedTo: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  redactedSummary: String,
  duplicateOf: { type: Schema.Types.ObjectId, ref: "Report" },
  fingerprint: { type: String, index: true },
  screeningFlags: [String],
  priority: {
    type: String,
    enum: ["normal", "high", "urgent"],
    default: "normal",
  },
  dueAt: Date,
  checklist: [String],
  lastModerator: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  publicationReviewer: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  expiresAt: { type: Date, index: true },
});
export const Evidence = model("Evidence", {
  reportId: { type: Schema.Types.ObjectId, index: true, ref: "Report" },
  encryptedStorageKey: String,
  mimeType: String,
  fileSize: Number,
  malwareScanStatus: {
    type: String,
    enum: ["clean", "quarantined", "infected"],
  },
  contentHash: String,
});
Evidence.schema.index({ reportId: 1, contentHash: 1 }, { unique: true });
Report.schema.index({
  publicationApproved: 1,
  publicConsent: 1,
  "publicEntry.approved": 1,
  "publicEntry.publishedAt": -1,
});
export const Staff = model("StaffUser", {
  email: { type: String, unique: true },
  name: String,
  passwordHash: String,
  role: { type: String, enum: ["moderator", "senior_reviewer", "super_admin"] },
  mfaSecretEncrypted: String,
  mfaEnabled: { type: Boolean, default: true },
  lastMfaStep: Number,
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: Date,
  accountStatus: {
    type: String,
    default: "active",
    enum: ["active", "disabled"],
  },
  emailVerifiedAt: Date,
  available: { type: Boolean, default: true },
  unavailableUntil: Date,
  deniedPermissions: [String],
  suspensionReasonEncrypted: String,
});
export const Session = model("StaffSession", {
  tokenHash: { type: String, unique: true },
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  csrfHash: String,
  csrfTokenEncrypted: String,
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  deviceHash: String,
  deviceLabel: String,
});
export const Review = model("ReportReview", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  reviewerId: Schema.Types.ObjectId,
  decision: String,
  internalNotesEncrypted: String,
});
export const History = model("StatusHistory", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  status: String,
  message: String,
  actorId: Schema.Types.ObjectId,
});
export const Privacy = model("PrivacyRequest", {
  reference: { type: String, unique: true },
  requestEncrypted: String,
  state: {
    type: String,
    default: "pending",
    enum: ["pending", "in_review", "completed", "denied"],
  },
  resolutionEncrypted: String,
});
export const Audit = model("AuditLog", {
  actorId: Schema.Types.ObjectId,
  action: String,
  resourceType: String,
  resourceId: String,
  outcome: String,
  integrityMac: String,
});
export const PageInfo = model("PageInfo", {
  slug: { type: String, unique: true },
  title: String,
  titleBn: String,
  body: String,
  bodyBn: String,
  published: { type: Boolean, default: false },
});
