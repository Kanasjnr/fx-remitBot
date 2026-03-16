// This utility ensures that BigInt values can be safely serialized to JSON.
// It should be imported at the very beginning of the application entry point.

if (!BigInt.prototype.hasOwnProperty("toJSON")) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function () {
      return this.toString();
    },
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

/**
 * Robust JSON serialization helper that handles BigInt.
 * Can be used as a replacer in JSON.stringify() or app.set('json replacer', ...).
 */
export function jsonSafeReplacer(key: string, value: any): any {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
/**
 * Simple delay helper.
 */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Senior-level retry wrapper for async operations.
 * Implements exponential backoff and skips retries for specific logic errors (like 404s).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  context = "Operation",
  totalRetries = -1,
): Promise<T> {
  // Capture totalRetries on first call
  const initialRetries = totalRetries === -1 ? retries : totalRetries;

  try {
    return await fn();
  } catch (error: any) {
    // If it's a network timeout, socket error, or DNS resolution failure, retry it
    const isNetworkError =
      error.message?.includes("fetch failed") ||
      error.message?.includes("ConnectTimeoutError") ||
      error.message?.includes("SocketError") ||
      error.message?.includes("getaddrinfo ENOTFOUND") ||
      error.code === "UND_ERR_CONNECT_TIMEOUT" ||
      error.code === "ENOTFOUND" ||
      error.code === "EAI_AGAIN";

    if (retries > 0 && isNetworkError) {
      const currentAttempt = initialRetries - retries + 1;
      console.warn(
        `[Retry] ${context} failed (${error.message || error.code}). Attempting retry ${currentAttempt}/${initialRetries} in ${delay}ms...`,
      );
      await sleep(delay);
      return withRetry(fn, retries - 1, delay * 2, context, initialRetries);
    }

    throw error;
  }
}
