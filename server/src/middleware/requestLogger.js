/**
 * Tiny request logger (middleware demo).
 *
 * Middleware runs in the order it is registered: this one logs the incoming
 * method + path, and then again on the `finish` event with the status code and
 * how long the request took. Handy when testing endpoints from Postman.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.statusCode;
    // Colour-code by status family so errors stand out in the terminal.
    const marker = status >= 500 ? '!!' : status >= 400 ? ' !' : '  ';
    console.log(
      `${marker} ${method.padEnd(6)} ${String(status).padEnd(3)} ${originalUrl} (${durationMs.toFixed(1)}ms)`,
    );
  });

  next();
}

export default requestLogger;
