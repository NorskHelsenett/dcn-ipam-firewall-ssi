/**
 * Logger Configuration - Winston-based logging system for IPAM-Firewall-SSI
 * Provides console, file rotation, and Splunk HEC logging with multiple log levels
 * File loggers are only enabled in development mode to avoid container filesystem issues
 */

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import {
  EnvLoader,
  isDevMode,
  WinstonHecLogger,
  WinstonLoggerConsoleColors,
  WinstonLoggerLevels,
} from "@norskhelsenett/zeniki";
import https from "node:https";

/** Splunk HEC logger transport instance */
let hecLogger: WinstonHecLogger | undefined;
/** Combined file logger transport */
let combinedFileLogger: DailyRotateFile | undefined;
/** Warning level file logger transport */
let warningFileLogger: DailyRotateFile | undefined;
/** Error level file logger transport */
let errorFileLogger: DailyRotateFile | undefined;
/** Debug level file logger transport */
let debugFileLogger: DailyRotateFile | undefined;
/** Splunk-formatted file logger transport */
let splunkFileLogger: DailyRotateFile | undefined;

/** Path to secrets configuration file */
const SECRETS_PATH = Deno.env.get("SECRETS_PATH") ?? undefined;
/** Path to application configuration file */
const CONFIG_PATH = Deno.env.get("CONFIG_PATH") ?? undefined;

/** Environment loader for secrets and config */
const envLoader = new EnvLoader(SECRETS_PATH, CONFIG_PATH);

/** HTTP request timeout in milliseconds (default: 10000) */
const REQUEST_TIMEOUT = Deno.env.get("REQUEST_TIMEOUT")
  ? parseInt(Deno.env.get("REQUEST_TIMEOUT") as string)
  : 10000;

/** HTTPS agent with certificate verification for production */
const _HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: Deno.env.get("DENO_ENV")! != "development",
  keepAlive: true,
  timeout: REQUEST_TIMEOUT,
});

/** Splunk HEC endpoint URL */
const SPLUNK_URL = Deno.env.get("SPLUNK_URL") ?? undefined;
/** Splunk HEC authentication token */
const SPLUNK_TOKEN = Deno.env.get("SPLUNK_TOKEN") ?? undefined;

/** Directory for log files (default: "logs") */
const FILELOG_DIR = Deno.env.get("FILELOG_DIR")
  ? Deno.env.get("FILELOG_DIR")
  : "logs";

/** Maximum size per log file (default: "50m") */
const FILELOG_SIZE = Deno.env.get("FILELOG_SIZE")
  ? Deno.env.get("FILELOG_SIZE")
  : "50m";

/** Log file retention period (default: "30d") */
const FILELOG_DAYS = Deno.env.get("FILELOG_DAYS")
  ? Deno.env.get("FILELOG_DAYS")
  : "30d";

/** Splunk index for log events */
const SPLUNK_INDEX = Deno.env.get("SPLUNK_INDEX") ?? undefined;
/** Splunk source identifier (default: "ssi") */
const SPLUNK_SOURCE = Deno.env.get("SPLUNK_SOURCE") ?? "ssi";
/** Splunk source type (default: "ipam-firewall-ssi:high") */
const SPLUNK_SOURCE_TYPE = Deno.env.get("SPLUNK_SOURCE_TYPE") ??
  "ipam-firewall-ssi:high";
envLoader.close();
/**
 * Determines log level based on environment mode
 * @returns 'debug' in development, 'info' in production
 */
const logLevel = () => {
  return isDevMode() ? "debug" : "info";
};

winston.addColors(WinstonLoggerConsoleColors);

/**
 * Standard log format for console and file output
 */
const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  }),
);

/**
 * Splunk HEC (HTTP Event Collector) format
 * Structures logs for Splunk ingestion with metadata and event fields
 */
const splunkHECFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.printf(({ level, message, ...metadata }) => {
    const hecWriterObject = {
      event: {
        level: level,
        message: message,
        // Include any other metadata or custom fields you want
        // The '...meta' captures any additional properties passed to the log function
        meta: metadata && Object.keys(metadata).length > 0
          ? metadata
          : undefined,
      },
      host: Deno.hostname(),
      index: SPLUNK_INDEX,
      source: SPLUNK_SOURCE,
      sourcetype: SPLUNK_SOURCE_TYPE,
      time: Date.now(),
    };

    return JSON.stringify(hecWriterObject);
  }),
);

/**
 * Filters logs to include only debug level
 * @returns Winston format function that passes debug logs only
 */
const debugFilter = winston.format((info, _opts) => {
  return info.level === "debug" ? info : false;
});

/**
 * Filters out notice level logs
 * @returns Winston format function that excludes notice level
 */
const _noHttpFilter = winston.format((info, _opts) => {
  return info.level === "info" ||
      info.level === "warning" ||
      info.level === "error" ||
      info.level === "debug"
    ? info
    : false;
});

/**
 * Winston logger transports array
 * Initially contains only console transport; file transports added via addFileLoggers()
 */
const transports = [
  // Allow the use the console to print the messages

  new winston.transports.Console({
    level: logLevel(),
    handleExceptions: true,
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.colorize({ all: true }),
    ),
  }),
];

/**
 * Main Winston logger instance with custom levels, formats, and transports
 */
const logger = winston.createLogger({
  level: logLevel(),
  levels: WinstonLoggerLevels,
  format: winston.format.combine(format),
  transports: transports,
});

logger.on("error", (error: Error) => {
  logger.warning(`ipam-firewall-ssi: Error in logger ${error.message}`, {
    component: "logger",
    method: "winston.createLogger",
    error: isDevMode() ? error : error?.message,
  });
});

/**
 * Adds Splunk HEC logger transport if credentials are configured
 * @throws Error if HEC logger initialization fails
 */
const addHecLogger = () => {
  try {
    if (SPLUNK_URL && SPLUNK_TOKEN && !hecLogger) {
      hecLogger = new WinstonHecLogger(
        {
          baseURL: SPLUNK_URL,
          headers: {
            "User-Agent": "Winston-HEC-Logger/0.0.1",
            "Content-Type": "application/json",
            Authorization: `Splunk ${SPLUNK_TOKEN}`,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT);
        },
        {
          level: "info",
          format: splunkHECFormat,
        },
      );
      logger.add(hecLogger);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on WinstonHecLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "addHecLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }

    throw error;
  }
};

/**
 * Removes and disposes Splunk HEC logger transport
 */
export const removeHecLogger = () => {
  try {
    if (hecLogger) {
      logger.remove(hecLogger);
      hecLogger.dispose();
      hecLogger = undefined;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on removeHecLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "removeHecLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }
  }
};

/**
 * Adds file-based logger transports (combined, warning, error, debug)
 * Creates daily rotating logs when explicitly called
 */
export const addFileLoggers = () => {
  try {
    if (
      !combinedFileLogger &&
      !warningFileLogger &&
      !errorFileLogger &&
      !debugFileLogger
    ) {
      // Combined log, combines all logs into one file.
      combinedFileLogger = new DailyRotateFile({
        filename: "combined-%DATE%.log",
        dirname: FILELOG_DIR,
        datePattern: "YYYYMMDD",
        createSymlink: true,
        symlinkName: "combined.log",
        zippedArchive: true,
        maxSize: FILELOG_SIZE,
        maxFiles: FILELOG_DAYS,
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      });

      // Warning log..
      warningFileLogger = new DailyRotateFile({
        level: "warning",
        filename: "warn-%DATE%.log",
        dirname: FILELOG_DIR,
        datePattern: "YYYYMMDD",
        createSymlink: true,
        symlinkName: "warn.log",
        zippedArchive: true,
        maxSize: FILELOG_SIZE,
        maxFiles: FILELOG_DAYS,
        handleExceptions: true,
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      });

      // Error log..
      errorFileLogger = new DailyRotateFile({
        level: "error",
        filename: "error-%DATE%.log",
        dirname: FILELOG_DIR,
        datePattern: "YYYYMMDD",
        createSymlink: true,
        symlinkName: "error.log",
        zippedArchive: true,
        maxSize: FILELOG_SIZE,
        maxFiles: FILELOG_DAYS,
        handleExceptions: true,
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      });

      // Debug log..
      debugFileLogger = new DailyRotateFile({
        level: "debug",
        filename: "debug-%DATE%.log",
        dirname: FILELOG_DIR,
        datePattern: "YYYYMMDD",
        createSymlink: true,
        symlinkName: "debug.log",
        zippedArchive: true,
        maxSize: FILELOG_SIZE,
        maxFiles: FILELOG_DAYS,
        handleExceptions: true,
        format: winston.format.combine(
          debugFilter(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      });

      logger.add(combinedFileLogger);
      logger.add(warningFileLogger);
      logger.add(errorFileLogger);
      logger.add(debugFileLogger);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on FileLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "addFileLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }
  }
};

/**
 * Removes all file-based logger transports
 */
export const removeFileLoggers = () => {
  try {
    if (combinedFileLogger) {
      logger.remove(combinedFileLogger);
      combinedFileLogger = undefined;
    }
    if (warningFileLogger) {
      logger.remove(warningFileLogger);
      warningFileLogger = undefined;
    }
    if (errorFileLogger) {
      logger.remove(errorFileLogger);
      errorFileLogger = undefined;
    }
    if (debugFileLogger) {
      logger.remove(debugFileLogger);
      debugFileLogger = undefined;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on removeFileLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "removeFileLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }
  }
};

/**
 * Adds Splunk-formatted file logger for development mode
 * Creates daily rotating logs in Splunk HEC JSON format for local testing
 */
export const addSplunkFileLogger = () => {
  try {
    if (isDevMode() && !splunkFileLogger) {
      splunkFileLogger = new DailyRotateFile({
        level: "debug",
        filename: "splunk-%DATE%.log",
        dirname: FILELOG_DIR,
        datePattern: "YYYYMMDD",
        createSymlink: true,
        symlinkName: "splunk.log",
        zippedArchive: true,
        maxSize: FILELOG_SIZE,
        maxFiles: FILELOG_DAYS,
        handleExceptions: true,
        format: winston.format.combine(splunkHECFormat),
      });

      logger.add(splunkFileLogger);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on SplunkFileLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "addSplunkFileLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }
  }
};

/**
 * Removes Splunk-formatted file logger transport
 */
export const removeSplunkFileLogger = () => {
  try {
    if (splunkFileLogger) {
      logger.remove(splunkFileLogger);
      splunkFileLogger = undefined;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        `ipam-firewall-ssi: Error on removeSplunkFileLogger,  ${error?.message}`,
        {
          component: "logger",
          method: "removeSplunkFileLogger",
          error: isDevMode() ? error : error?.message,
        },
      );
    }
  }
};

/**
 * Initialize default loggers
 * - HEC logger: Added if SPLUNK_URL and SPLUNK_TOKEN configured
 * - Splunk file logger: Added in development mode only
 */
addHecLogger();
addSplunkFileLogger();

logger.debug(`ipam-firewall-ssi: Logger initialized at ${logLevel()} level`);

/** Configured Winston logger instance */
export default logger;
