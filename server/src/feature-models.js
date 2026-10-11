import mongoose from "mongoose";
const { Schema } = mongoose;
const model = (name, definition) =>
  mongoose.model(
    name,
    new Schema(definition, { timestamps: true, strict: "throw" }),
  );
export const Notification = model("Notification", {
  staffId: { type: Schema.Types.ObjectId, index: true },
  kind: String,
  title: String,
  reportId: Schema.Types.ObjectId,
  readAt: Date,
  dedupe: { type: String, unique: true, sparse: true },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
export const KnownDevice = model("KnownDevice", {
  staffId: Schema.Types.ObjectId,
  deviceHash: String,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
KnownDevice.schema.index({ staffId: 1, deviceHash: 1 }, { unique: true });
export const Message = model("PrivateMessage", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  authorId: Schema.Types.ObjectId,
  channel: { type: String, enum: ["reporter", "internal"] },
  kind: String,
  textEncrypted: String,
  mentions: [Schema.Types.ObjectId],
  evidenceId: Schema.Types.ObjectId,
  seconds: Number,
  state: { type: String, default: "pending" },
  resolutionEncrypted: String,
});
export const DraftVersion = model("DraftVersion", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  authorId: Schema.Types.ObjectId,
  snapshotEncrypted: String,
});
export const Assignment = model("AssignmentHistory", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  fromId: Schema.Types.ObjectId,
  toId: Schema.Types.ObjectId,
  actorId: Schema.Types.ObjectId,
});
export const Content = model("ManagedContent", {
  slug: { type: String, unique: true },
  kind: {
    type: String,
    enum: [
      "faq",
      "article",
      "resource",
      "announcement",
      "category",
      "section",
      "news",
    ],
  },
  title: String,
  titleBn: String,
  body: String,
  bodyBn: String,
  url: String,
  page: String,
  rank: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  newsCategory: {
    type: String,
    enum: ["important", "alert", "local", "awareness"],
    default: "important",
  },
  district: { type: String, default: "" },
  coverMediaId: { type: Schema.Types.ObjectId, default: null },
  videoMediaId: { type: Schema.Types.ObjectId, default: null },
  state: {
    type: String,
    enum: ["draft", "published", "trash"],
    default: "draft",
  },
  publishAt: Date,
  deletedAt: Date,
  revision: { type: Number, default: 1 },
});
export const ContentVersion = model("ContentVersion", {
  contentId: { type: Schema.Types.ObjectId, index: true },
  actorId: Schema.Types.ObjectId,
  snapshot: Schema.Types.Mixed,
});
export const NewsMedia = model("NewsMedia", {
  storageName: { type: String, unique: true },
  mimeType: String,
  size: Number,
  actorId: Schema.Types.ObjectId,
});
export const PublicFeedback = model("PublicFeedback", {
  publicId: String,
  reportId: Schema.Types.ObjectId,
  kind: String,
  textEncrypted: String,
  state: { type: String, default: "pending" },
  resolutionEncrypted: String,
  dueAt: Date,
});
export const AccountToken = model("AccountToken", {
  staffId: Schema.Types.ObjectId,
  tokenHash: { type: String, unique: true },
  kind: String,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
export const Mail = model("MailQueue", {
  staffId: Schema.Types.ObjectId,
  envelopeEncrypted: String,
  purpose: String,
  state: { type: String, default: "queued" },
  attempts: { type: Number, default: 0 },
  nextAt: Date,
  sentAt: Date,
  failureCode: String,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
export const Setting = model("SystemSetting", {
  key: { type: String, unique: true },
  value: Schema.Types.Mixed,
});
export const Job = model("OperationJob", {
  kind: String,
  state: String,
  startedAt: Date,
  finishedAt: Date,
  code: String,
  count: Number,
  owner: String,
});
export const AppError = model("ApplicationError", {
  code: { type: String, unique: true },
  route: String,
  status: Number,
  count: { type: Number, default: 0 },
  lastAt: Date,
});
export const Upload = model("ResumableUpload", {
  reportId: { type: Schema.Types.ObjectId, index: true },
  staffId: Schema.Types.ObjectId,
  fingerprint: String,
  size: Number,
  chunkSize: Number,
  chunkCount: Number,
  received: [Number],
  state: { type: String, default: "uploading" },
  result: Schema.Types.Mixed,
  expiresAt: { type: Date, index: true },
});
