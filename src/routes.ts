import * as HttpStatus from '@qccareerschool/http-status';
import express from 'express';
import jwt, { VerifyErrors } from 'jsonwebtoken';
import util from 'util';
import xml from 'xml';
import * as yup from 'yup';

import { jwtSecret } from './config';
import { addSubscription, addUser, getProfile, getProfiles, getUser, sendVerificationEmail, verifyUser } from './controller';
import { logger } from './logger';
import { PushSubscription } from './models/push-subscription';

const sign = util.promisify(jwt.sign);

interface Credentials {
  emailAddress: string;
  password: string;
}

interface Verification {
  emailAddress: string;
  code: string;
}

interface ProfileSearch {
  firstName: string;
  lastName: string;
  countryCode: string;
  provinceCode: string;
  area: string;
  profession: string;
}

export const router = express.Router();

router.get('/sitemap', asyncWrapper(async (req, res) => {
  const profiles = await getProfiles();
  // the filter below makes sure that id and timestamp are present on the partial
  const response = { urlset: [
    { _attr: { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' } },
    ...profiles.filter(p => p.id && p.timestamp).map(p => ({
      url: [
        { loc: `https://www.qccareerschool.com/profiles/${p!.id}` },
        { lastmod: p.timestamp ? new Date(p.timestamp).toISOString() : new Date() },
        { priority: 0.5 },
      ],
    })),
  ] };
  res.header('Content-Type', 'text/xml');
  res.header('X-Length', profiles.length.toString());
  res.send(xml(response));
}));

router.post('/register', asyncWrapper(async (req, res) => {
  const schema = yup.object<Credentials>({
    emailAddress: yup.string().email().required(),
    password: yup.string().required(),
  }).required();
  let body: Credentials;
  try {
    body = await schema.validate(req.body);
  } catch (err) {
    throw new HttpStatus.BadRequest(err.message);
  }
  const result = await addUser(body.emailAddress, body.password);
  if (result === false) {
    throw new HttpStatus.Conflict('Email address is already registered');
  }
  sendVerificationEmail(body.emailAddress, result.verificationCode).catch(logger.error);
  const payload = { id: result.id, emailAddress: body.emailAddress };
  const newToken = await sign(payload, jwtSecret) as string;
  res.cookie('accessToken', newToken, { path: '/qccareerschool/', expires: new Date(2147483647000), httpOnly: true, secure: true });
  res.send(payload);
}));

router.get('/verify', asyncWrapper(async (req, res) => {
  const schema = yup.object<Verification>({
    emailAddress: yup.string().required(),
    code: yup.string().required(),
  }).required();
  let query: Verification;
  try {
    query = await schema.validate(req.query);
  } catch (err) {
    throw new HttpStatus.BadRequest(err.message);
  }
  const result = await verifyUser(query.emailAddress, query.code);
  if (result === false) {
    throw new HttpStatus.BadRequest('Invalid email address or code');
  }
  res.redirect('https://localhost:3000/welcome');
}));

router.post('/login', asyncWrapper(async (req, res) => {
  const schema = yup.object<Credentials>({
    emailAddress: yup.string().required(),
    password: yup.string().required(),
  }).required();
  let body: Credentials;
  try {
    body = await schema.validate(req.body);
  } catch (err) {
    throw new HttpStatus.BadRequest(err.message);
  }
  const result = await getUser(body.emailAddress, body.password);
  if (result === false) {
    throw new HttpStatus.BadRequest('Invalid username or password');
  }
  const payload = { id: result, emailAddress: body.emailAddress };
  const newToken = await sign(payload, jwtSecret) as string;
  res.cookie('accessToken', newToken, { path: '/qccareerschool/', expires: new Date(2147483647000), httpOnly: true, secure: true });
  res.send(payload);
}));

router.post('/cookieLogin', authGuard, (req, res) => {
  res.send({
    id: res.locals.userId,
    emailAddress: res.locals.emailAddress,
  });
});

router.post('/subscriptions', authGuard, asyncWrapper(async (req, res) => {
  const userAgent = req.headers['user-agent'] || null;
  const schema = yup.object<PushSubscription>({
    endpoint: yup.string().required(),
    expirationTime: yup.number().integer().positive().nullable().required(),
    keys: yup.object({
      auth: yup.string().required(),
      p256dh: yup.string().required(),
    }).required(),
  }).required();
  try {
    const subscription = await schema.validate(req.body);
    const subscriptionId = await addSubscription(res.locals.userId, subscription, userAgent);
    res.send({ success: true, subscriptionId });
  } catch (err) {
    if (err instanceof yup.ValidationError) {
      throw new HttpStatus.BadRequest(err.message);
    }
    throw err;
  }
}));

router.get('/profiles', asyncWrapper(async (req, res) => {
  const schema = yup.object<ProfileSearch>({
    firstName: yup.string(),
    lastName: yup.string(),
    countryCode: yup.string().length(2).required(),
    provinceCode: yup.string(),
    area: yup.string(),
    profession: yup.string().required(),
  }).required();
  try {
    if (Object.keys(req.query).length) {
      const query = await schema.validate(req.query);
      const profiles = await getProfiles(
        false,
        query.firstName,
        query.lastName,
        query.countryCode,
        query.provinceCode === '' ? null : query.provinceCode,
        query.area,
        query.profession,
      );
      res.send(profiles);
    } else {
      const profiles = await getProfiles();
      res.send(profiles);
    }
  } catch (err) {
    if (err instanceof yup.ValidationError) {
      throw new HttpStatus.BadRequest(err.message);
    }
    throw err;
  }
}));

router.get('/profiles/:id', asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    throw new HttpStatus.NotFound('Invalid profile');
  }
  const profile = await getProfile(id);
  if (profile === null) {
    throw new HttpStatus.NotFound('Profile not found');
  }
  res.send(profile);
}));

function asyncWrapper(handler: express.RequestHandler) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.cookies.accessToken) {
    return res.status(HttpStatus.UNAUTHORIZED).send({ error: 'not authenticated' });
  }
  // eslint-disable-next-line @typescript-eslint/ban-types
  jwt.verify(req.cookies.accessToken, jwtSecret, (err: VerifyErrors | null, decoded?: object) => {
    if (err) {
      return res.status(HttpStatus.UNAUTHORIZED).send({ error: 'invalid authentication token', verifyErrors: err });
    }
    if (typeof decoded === 'undefined') {
      return res.status(HttpStatus.UNAUTHORIZED).send({ error: 'invalid authentication token' });
    }
    if (!(typeof (decoded as any).id === 'number' && typeof (decoded as any).id === 'number')) {
      return res.status(HttpStatus.UNAUTHORIZED).send({ error: 'invalid authentication token data' });
    }
    res.locals.userId = (decoded as any).id;
    res.locals.emailAddress = (decoded as any).emailAddress;
    next();
  });
}
