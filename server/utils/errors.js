export function fail(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; error.statusMessage = message; throw error }
export function ensure(condition, code, message) { if (!condition) fail(code, message) }
