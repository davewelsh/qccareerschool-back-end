import dotenv from 'dotenv';
import fs from 'fs';
import mysql from 'promise-mysql';

dotenv.config();

const DEFAULT_CONNECTION_LIMIT = 100;

const options: mysql.PoolConfig = {
  charset: process.env.DB_CHARSET,
  connectionLimit: typeof process.env.DB_CONNECTION_LIMIT === 'undefined' ? DEFAULT_CONNECTION_LIMIT : parseInt(process.env.DB_CONNECTION_LIMIT, 10),
  database: process.env.DB_DATABASE,
  debug: process.env.DB_DEBUG === 'TRUE' ? true : false,
  password: process.env.DB_PASSWORD,
  user: process.env.DB_USERNAME,
};

if (typeof process.env.DB_SOCKET_PATH !== 'undefined') {
  options.socketPath = process.env.DB_SOCKET_PATH;
} else if (typeof process.env.DB_HOST !== 'undefined') {
  options.host = process.env.DB_HOST;
}

if (typeof process.env.DB_SSL !== 'undefined' && process.env.DB_SSL === 'true') {
  options.ssl = {};
  if (typeof process.env.DB_CLIENT_CERT !== 'undefined') {
    options.ssl.cert = fs.readFileSync(process.env.DB_CLIENT_CERT);
  }
  if (typeof process.env.DB_CLIENT_KEY !== 'undefined') {
    options.ssl.key = fs.readFileSync(process.env.DB_CLIENT_KEY);
  }
  if (typeof process.env.DB_SERVER_CA !== 'undefined') {
    options.ssl.ca = fs.readFileSync(process.env.DB_SERVER_CA);
  }
}

export const pool = mysql.createPool(options);
