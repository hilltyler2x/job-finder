import { route } from "@/lib/api";
import { resumeFromPdf } from "@/lib/ai";

// Turns an uploaded PDF resume into text for the Profile form.
export const POST = route(async (_userId, req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose a PDF file.");
  if (file.type !== "application/pdf") throw new Error("Upload a PDF. For Word files, save as PDF first.");
  if (file.size > 10_000_000) throw new Error("That file is too big (10 MB max).");
  const text = await resumeFromPdf(Buffer.from(await file.arrayBuffer()).toString("base64"));
  return { text };
});
