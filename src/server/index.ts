import type { IncomingMessage, ServerResponse } from "node:http";
import {
  context,
  createServer,
  getServerPort,
  reddit,
  settings,
} from "@devvit/web/server";
import type { PartialJsonValue, UiResponse } from "@devvit/web/shared";
import {
  ApiEndpoint,
  type VerifyRequest,
  type VerifyResponse,
} from "../shared/api.ts";

const DEFAULT_POST_TITLE = "Discord Verification Post";

type DiscordVerificationPayload = {
  type: "reddit_verification";
  code: string;
  redditUserId: string;
  redditUsername: string;
  subredditName: string;
  postId: string;
  verifiedAt: string;
};

type ErrorResponse = {
  error: string;
  status: number;
};

export async function serverOnRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  try {
    await onRequest(req, rsp);
  } catch (err) {
    console.error("Server error:", err);
    writeJSON<ErrorResponse>(
      500,
      { error: "Something went wrong.", status: 500 },
      rsp,
    );
  }
}

async function onRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const endpoint = req.url?.split("?")[0] ?? "";

  switch (endpoint) {
    case ApiEndpoint.Verify:
      writeJSON<VerifyResponse | ErrorResponse>(
        200,
        await onVerify(req),
        rsp,
      );
      return;
    case ApiEndpoint.CreatePost:
      writeJSON<UiResponse | ErrorResponse>(200, await onMenuCreatePost(), rsp);
      return;
    case ApiEndpoint.CreatePostSubmit:
      writeJSON<UiResponse | ErrorResponse>(
        200,
        await onCreatePostSubmit(req),
        rsp,
      );
      return;
    default:
      writeJSON<ErrorResponse>(404, { error: "Not found.", status: 404 }, rsp);
  }
}

async function onVerify(
  req: IncomingMessage,
): Promise<VerifyResponse | ErrorResponse> {
  const { code } = await readJSON<VerifyRequest>(req).catch(() => ({ code: "" }));
  const normalizedCode = code.trim().toUpperCase();

  if (!isPlausibleCode(normalizedCode)) {
    return {
      error: "Enter a code like ABCD-1234.",
      status: 400,
    };
  }

  const payload: DiscordVerificationPayload = {
    type: "reddit_verification",
    code: normalizedCode,
    redditUserId: context.userId ?? "",
    redditUsername: context.username ?? "",
    subredditName: context.subredditName ?? "",
    postId: context.postId ?? "",
    verifiedAt: new Date().toISOString(),
  };

  const result = await sendVerificationToBackend(payload);
  if (!result.ok) {
    return {
      error: result.error,
      status: result.status,
    };
  }

  return {
    type: "verify",
    ok: true,
    message: `Verified as u/${context.username ?? "redditor"}.`,
  };
}

async function getVerificationConfig(): Promise<{
  verifyEndpoint: string;
  sharedSecret: string;
}> {
  const verifyEndpoint = String(await settings.get("verifyEndpoint") ?? "").trim();
  const sharedSecret = String(await settings.get("sharedSecret") ?? "").trim();
  return { verifyEndpoint, sharedSecret };
}

async function sendVerificationToBackend(
  payload: DiscordVerificationPayload,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { verifyEndpoint, sharedSecret } = await getVerificationConfig();

  if (!isValidHttpsUrl(verifyEndpoint) || !sharedSecret) {
    return {
      ok: false,
      error: "Verification is not configured. Set app settings for this subreddit.",
      status: 503,
    };
  }

  try {
    const response = await fetch(verifyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Devvit-Verification-Secret": sharedSecret,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { ok: true };
    }

    const details = await response.text().catch(() => "");
    console.error("Discord verification rejected:", {
      status: response.status,
      details: details.slice(0, 500),
    });
    return {
      ok: false,
      error: "Verification failed.",
      status: response.status >= 400 && response.status < 500 ? 400 : 502,
    };
  } catch (err) {
    console.error("Discord verification request failed:", err);
    return {
      ok: false,
      error: "Verification unavailable.",
      status: 502,
    };
  }
}

async function onMenuCreatePost(): Promise<UiResponse> {
  return {
    showForm: {
      name: "createVerificationPost",
      form: createVerificationPostForm(context.username ?? ""),
    },
  };
}

async function onCreatePostSubmit(
  req: IncomingMessage,
): Promise<UiResponse | ErrorResponse> {
  try {
    const input = (await readJSON<Record<string, unknown>>(req).catch(
      () => ({}),
    )) as Record<string, unknown>;
    const subreddit = await reddit.getCurrentSubreddit();
    const title = stringValue(input.title).trim() || DEFAULT_POST_TITLE;
    const post = await reddit.submitCustomPost({
      subredditName: subreddit.name,
      title,
      entry: "default",
      runAs: "USER",
      styles: {
        backgroundColor: "#00000000", // transparent
        backgroundColorDark: "#00000000", // transparent
      },
      textFallback: {
        text: "Enter your verification code.",
      },
    });

    return {
      showToast: {
        text: `Created verification post in r/${subreddit.name}.`,
        appearance: "success",
      },
      navigateTo: post.url,
    };
  } catch (err) {
    console.error("Unable to create verification post:", err);
    return {
      error: "Unable to create verification post.",
      status: 500,
    };
  }
}

function createVerificationPostForm(username: string) {
  return {
    title: "Create verification post",
    acceptLabel: submitAsUserAcceptLabel(username),
    cancelLabel: "Cancel",
    fields: [
      {
        name: "title",
        label: "Post title",
        type: "string" as const,
        required: false,
        defaultValue: DEFAULT_POST_TITLE,
        placeholder: DEFAULT_POST_TITLE,
        helpText: "Post titles cannot be edited after creation.",
      },
    ],
  };
}

function submitAsUserAcceptLabel(username: string): string {
  return username ? `Submit as u/${username}` : "Submit as user";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  let body = "";
  for await (const chunk of req as AsyncIterable<unknown>) {
    body += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
  }
  return JSON.parse(body) as T;
}

function writeJSON<T extends PartialJsonValue | UiResponse>(
  status: number,
  body: T,
  rsp: ServerResponse,
): void {
  const responseStatus =
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    typeof body.status === "number"
      ? body.status
      : status;
  rsp.statusCode = responseStatus;
  rsp.setHeader("Content-Type", "application/json; charset=utf-8");
  rsp.end(JSON.stringify(body));
}

function isPlausibleCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

const server = createServer(serverOnRequest);
const port: number = getServerPort();

server.on("error", (err) => console.error(`Server error: ${err.stack}`));
server.listen(port);
