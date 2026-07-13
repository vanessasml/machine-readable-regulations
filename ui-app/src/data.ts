import type { Payload } from "./types";

declare global {
  interface Window {
    /** Inlined by build_ui.py at pack time; the string token "__PAYLOAD__" in dev. */
    __PAYLOAD__?: unknown;
  }
}

/** Resolve the app payload: inlined object in the packed single-file build,
 *  otherwise fetched from the dev-server middleware (/artifacts/payload.json). */
export async function getPayload(): Promise<Payload> {
  const inline = window.__PAYLOAD__;
  if (inline && typeof inline === "object") {
    return inline as Payload;
  }
  const res = await fetch("/artifacts/payload.json");
  if (!res.ok) {
    throw new Error(
      `Could not load payload (${res.status}). Run \`python3 build_ui.py\` in the repo root, then reload.`,
    );
  }
  return (await res.json()) as Payload;
}
