export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function conflict(code, message) {
  return new HttpError(409, code, message)
}

export function forbidden(message = 'You do not have permission to access this resource') {
  return new HttpError(403, 'FORBIDDEN', message)
}

export function unauthorized(message = 'Authentication session is required') {
  return new HttpError(401, 'AUTH_REQUIRED', message)
}

export function validation(message, details) {
  return new HttpError(422, 'VALIDATION_ERROR', message, details)
}
