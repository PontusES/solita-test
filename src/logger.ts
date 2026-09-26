type Fields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

// One JSON object per line, so logs can be searched and shipped without parsing free text.
export function createLogger(base: Fields = {}): Logger {
  function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
    const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...base, ...fields });
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
