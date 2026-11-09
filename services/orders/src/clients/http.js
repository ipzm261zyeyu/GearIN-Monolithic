import { UpstreamError } from "../errors.js";

const TIMEOUT_MS = 30000;

export const postJson = async (service, url, body) => {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status, body: await response.json() };
  } catch (error) {
    console.error(error);
    throw new UpstreamError(service);
  }
};
