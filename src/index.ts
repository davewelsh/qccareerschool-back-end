import * as HttpStatus from '@qccareerschool/http-status';
import bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { logger } from './logger';

import { router } from './routes';

const app = express();

app.use(compression());
app.use(helmet());
app.use(cors({
  allowedHeaders: [ 'X-Length' ],
  origin: [
    'http://localhost:3000',
    /qccareerschool\.com$/,
    /qccareer\.school$/,
    /^https:\/\/qccareerschool-com-.*\.now\.sh$/,
  ],
  credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.json());
app.use('/qccareerschool', router);
app.use(httpErrorHandler);
app.use(logErrors);
app.use(errorHandler);
app.listen(process.env.PORT);

function httpErrorHandler(err: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
    return res.status(err.statusCode).send(err.message);
  }
  next(err);
}

function logErrors(err: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
  logger.error(err);
  next(err);
}

function errorHandler(err: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err);
}
