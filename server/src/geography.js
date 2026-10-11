import fs from "node:fs";
export const upazilas = JSON.parse(
  fs.readFileSync(new URL("./data/upazilas.json", import.meta.url), "utf8"),
);
export const validUpazila = (district, code) =>
  !code || upazilas.some((u) => u.code === code && u.districtCode === district);
export const unions = JSON.parse(
  fs.readFileSync(new URL("./data/unions.json", import.meta.url), "utf8"),
);
export const validUnion = (district, upazila, code) =>
  !code ||
  unions.some(
    (u) =>
      u.code === code &&
      u.districtCode === district &&
      u.upazilaCode === upazila,
  );
