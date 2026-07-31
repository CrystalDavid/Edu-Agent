export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "AuthorizationDeniedError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnsupportedIngressError extends Error {
  readonly code = "UNSUPPORTED_INGRESS";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedIngressError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class DomainConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "DomainConflictError";
  }
}

export class InvalidFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 413 = 400
  ) {
    super(message);
    this.name = "InvalidFileError";
  }
}
