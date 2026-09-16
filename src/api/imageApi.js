import { client } from "./client.js";

export function uploadImages(files, signal) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return client.request("/images", { method: "POST", body, signal });
}
