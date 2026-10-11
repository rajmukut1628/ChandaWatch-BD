import multer from "multer";
import { rateLimit } from "express-rate-limit";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { config } from "./config.js";
import { scan } from "./scanner.js";
import { NewsMedia, Content } from "./feature-models.js";

export const newsCategories = ["important", "alert", "local", "awareness"];
export const mediaPath = (id) => `/api/v1/features/public/news-media/${id}`;
export function registerNewsMedia(admin, pub, { fail, audit }) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: async (_, __, cb) => {
        try {
          await fs.mkdir(config.storage, { recursive: true });
          cb(null, config.storage);
        } catch (e) {
          cb(e);
        }
      },
      filename: (_, __, cb) => cb(null, `news-${randomUUID()}`),
    }),
    limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 0 },
  }).single("file");
  admin.post(
    "/news-media",
    rateLimit({
      windowMs: 10 * 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many media uploads. Try again later." },
    }),
    (req, res, next) => {
      upload(req, res, async (error) => {
        let keep = false;
        try {
          if (error) fail(400, "Invalid media upload or file exceeds 200 MB.");
          if (!req.file) fail(400, "Choose a media file.");
          const type = await fileTypeFromFile(req.file.path);
          if (
            !type ||
            ![
              "image/jpeg",
              "image/png",
              "image/webp",
              "video/mp4",
              "video/webm",
            ].includes(type.mime)
          )
            fail(400, "Choose JPEG, PNG, WebP, MP4 or WebM media.");
          if (
            type.mime.startsWith("image/") &&
            req.file.size > 10 * 1024 * 1024
          )
            fail(
              400,
              "Images must be smaller than 10 MB; videos smaller than 200 MB.",
            );
          let verdict;
          try {
            verdict = await scan(createReadStream(req.file.path));
          } catch {
            fail(
              503,
              "Media scanner unavailable. Try again after the scanner is connected.",
            );
          }
          if (verdict !== "clean") fail(400, "Media failed the security scan.");
          const item = await NewsMedia.create({
            storageName: req.file.filename,
            mimeType: type.mime,
            size: req.file.size,
            actorId: req.staff._id,
          });
          keep = true;
          await audit(req, "news.media_upload", "newsmedia", item._id);
          res.status(201).json({
            id: String(item._id),
            mimeType: item.mimeType,
            url: mediaPath(item._id),
          });
        } catch (e) {
          next(e);
        } finally {
          if (!keep && req.file) await fs.unlink(req.file.path).catch(() => {});
        }
      });
    },
  );
  async function serve(req, res, privatePreview = false) {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) fail(404, "Media unavailable.");
    const item = await NewsMedia.findById(req.params.id).lean();
    if (!item || !/^news-[a-f\d-]{36}$/.test(item.storageName))
      fail(404, "Media unavailable.");
    if (
      !privatePreview &&
      !(await Content.exists({
        kind: "news",
        state: "published",
        enabled: true,
        $and: [
          { $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }] },
          { $or: [{ coverMediaId: item._id }, { videoMediaId: item._id }] },
        ],
      }))
    )
      fail(404, "Media unavailable.");
    res.set({
      "Content-Type": item.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    await new Promise((resolve, reject) =>
      res.sendFile(
        path.resolve(config.storage, item.storageName),
        { dotfiles: "allow" },
        (e) => (e ? reject(e) : resolve()),
      ),
    );
  }
  pub.get("/news-media/:id", (req, res) => serve(req, res));
  admin.get("/news-media/:id", (req, res) => serve(req, res, true));
}
