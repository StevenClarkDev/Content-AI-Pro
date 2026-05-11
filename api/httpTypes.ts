export type HeaderValue = string | string[] | undefined;

export type ApiRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
};

export type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): ApiResponse;
};
