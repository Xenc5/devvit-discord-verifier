export type VerifyRequest = {
  code: string;
};

export type VerifyResponse = {
  type: "verify";
  ok: true;
  message: string;
};

export const ApiEndpoint = {
  Verify: "/api/verify",
  CreatePost: "/internal/menu/create-post",
  CreatePostSubmit: "/internal/form/create-post-submit",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];
