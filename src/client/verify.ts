import { context } from "@devvit/web/client";
import {
  ApiEndpoint,
  type VerifyRequest,
  type VerifyResponse,
} from "../shared/api.ts";

const form = document.getElementById("verify-form") as HTMLFormElement;
const codeInput = document.getElementById("code-input") as HTMLInputElement;
const submitButton = document.getElementById("submit-button") as HTMLButtonElement;
const statusElement = document.getElementById("status") as HTMLDivElement;
const usernameElement = document.getElementById("username") as HTMLSpanElement;

let verifyButtonText = "";

setUsername(context.username ?? "");
setStatus("idle", "Paste your verification code.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = codeInput.value.trim().toUpperCase();
  if (!isPlausibleCode(code)) {
    setStatus("error", "Enter a code like ABCD-1234.");
    codeInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Verifying...";
  setStatus("loading", "Checking code...");

  try {
    const response = await fetch(ApiEndpoint.Verify, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code } satisfies VerifyRequest),
    });
    const data = (await response.json()) as VerifyResponse | { error: string };

    if (!response.ok || "error" in data) {
      throw new Error("error" in data ? data.error : "Verification failed.");
    }

    completeVerification(data.message);
  } catch (err) {
    setStatus(
      "error",
      err instanceof Error ? err.message : "Verification failed. Try again.",
    );
    submitButton.disabled = false;
    submitButton.textContent = verifyButtonText;
  }
});

function isPlausibleCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code);
}

function setStatus(
  kind: "idle" | "loading" | "success" | "error",
  text: string,
): void {
  statusElement.dataset.kind = kind;
  statusElement.textContent = text;
}

function setUsername(username: string): void {
  const usernameLabel = username ? `u/${username}` : "u/redditor";
  usernameElement.textContent = usernameLabel;
  verifyButtonText = `Verify as ${usernameLabel}`;
  submitButton.textContent = verifyButtonText;
}

function completeVerification(message: string): void {
  document.body.classList.add("verify-complete");
  setStatus("success", message);
  codeInput.value = "";
  codeInput.placeholder = "Verified";
  codeInput.disabled = true;
  submitButton.disabled = true;
  submitButton.textContent = "Verified";
}
