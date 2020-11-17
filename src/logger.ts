import { NodemailerTransport } from '@qccareerschool/winston-nodemailer';
import dotenv from 'dotenv';
import winston, { format, transports } from 'winston';

dotenv.config();

if (typeof process.env.LOG_EMAIL_USERNAME === 'undefined') {
  throw new Error('EMAIL_USERNAME not specified in .env file');
}
const user = process.env.LOG_EMAIL_USERNAME;

if (typeof process.env.LOG_EMAIL_PASSWORD === 'undefined') {
  throw new Error('EMAIL_PASSWORD not specified in .env file');
}
const pass = process.env.LOG_EMAIL_PASSWORD;

if (typeof process.env.LOG_EMAIL_HOST === 'undefined') {
  throw new Error('EMAIL_HOST not specified in .env file');
}
const host = process.env.LOG_EMAIL_HOST;

if (typeof process.env.LOG_EMAIL_TLS === 'undefined') {
  throw new Error('EMAIL_TLS not specified in .env file');
}
const tls = process.env.LOG_EMAIL_TLS === 'true' ? true : false;

if (typeof process.env.LOG_EMAIL_PORT === 'undefined') {
  throw new Error('EMAIL_PORT not specified in .env file');
}
const port = parseInt(process.env.LOG_EMAIL_PORT, 10);

if (typeof process.env.LOG_EMAIL_TO === 'undefined') {
  throw new Error('EMAIL_TO not specified in .env file');
}
const to = process.env.LOG_EMAIL_TO;

if (typeof process.env.LOG_EMAIL_FROM === 'undefined') {
  throw new Error('EMAIL_FROM not specified in .env file');
}
const from = process.env.LOG_EMAIL_FROM;

/**
 * If the data passed to the logger is an instance of Error, transform the stack trace into an array
 * @param key
 * @param value
 */
const replacer = (key: string, value: unknown) => {
  if (value instanceof Error) {
    return Object.getOwnPropertyNames(value).reduce((previousValue, currentValue) => {
      if (currentValue === 'stack') {
        return {
          ...previousValue,
          stack: value.stack?.split('\n').map(v => {
            v = v.trim();
            return v.substr(0, 3) === 'at ' ? v.slice(3) : v;
          }),
        };
      } else {
        return {
          ...previousValue,
          [currentValue]: value[currentValue as keyof Error],
        };
      }
    }, {});
  } else {
    return value;
  }
};

export const logger = winston.createLogger({
  format: format.combine(
    format.timestamp(),
    format.json({ space: 2, replacer }),
  ),
  transports: [
    new transports.Console({
      format: format.colorize(),
    }),
    new transports.File({
      filename: '/var/log/node-qccareerschool.log',
    }),
    new NodemailerTransport({
      auth: { pass, user },
      filter: ({ level }) => [ 'error', 'crit', 'alert', 'emerg' ].includes(level),
      from,
      host,
      port,
      secure: tls,
      tags: [ 'qccareerschool' ],
      to,
    }),
  ],
});
