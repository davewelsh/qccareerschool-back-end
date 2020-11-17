import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import util from 'util';

import { Picture } from './models/picture';
import { Portrait } from './models/portrait';
import { Profile } from './models/profile';
import { PushSubscription } from './models/push-subscription';
import { Testimonial } from './models/testimonial';
import { pool } from './pool';

const transportOptions: SMTPTransport.Options = {
  host: process.env.EMAIL_HOST || '',
  port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587,
  secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : false,
  requireTLS: process.env.EMAIL_REQUIRE_TLS ? process.env.EMAIL_REQUIRE_TLS === 'true' : true,
};
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transportOptions.auth = {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  };
}
const transport = nodemailer.createTransport(transportOptions);

const hash = util.promisify(bcrypt.hash);
const compare = util.promisify(bcrypt.compare);
const randomBytes = util.promisify(crypto.randomBytes);

interface AddUserResult {
  id: number;
  verificationCode: string;
}

export async function addSubscription(userId: number, subscription: PushSubscription, userAgent: string | null): Promise<number> {
  const connection = await (await pool).getConnection();
  try {
    // see if we have already stored this subscription
    const selectSubscriptionResult: Array<{ id: number }> = await connection.query('SELECT id FROM pushSubscriptions WHERE endpoint = ? LIMIT 1', subscription.endpoint);
    if (selectSubscriptionResult.length) {
      return selectSubscriptionResult[0].id;
    }

    // find the id for this userAgent
    let userAgentId: number | null = null;
    if (userAgent) {
      const selectAgentResult: Array<{ id: number }> = await connection.query('SELECT id FROM userAgents WHERE userAgent = ? LIMIT 1', userAgent);
      if (selectAgentResult.length) {
        userAgentId = selectAgentResult[0].id;
      } else {
        const insertAgentResult = await connection.query('INSERT INTO userAgents SET userAgent = ?', userAgent);
        userAgentId = insertAgentResult.insertId as number;
      }
    }

    // insert the subscription
    const payload = {
      userId,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgentId,
    };
    const insertSubscriptionResult = await connection.query('INSERT INTO pushSubscriptions SET ?', payload);
    return insertSubscriptionResult.insertId as number;
  } finally {
    connection.release();
  }
}

export async function getUser(emailAddress: string, password: string): Promise<number | false> {
  const connection = await (await pool).getConnection();
  try {
    const selectUserResult = await connection.query('SELECT id, password FROM users WHERE emailAddress = ? LIMIT 1', emailAddress);
    if (selectUserResult.length === 0) {
      return false;
    }
    if (!await compare(password, selectUserResult[0].password)) {
      return false;
    }
    return selectUserResult[0].id;
  } finally {
    connection.release();
  }
}

export async function addUser(emailAddress: string, password: string): Promise<AddUserResult | false> {
  const connection = await (await pool).getConnection();
  try {
    const selectUserResult = await connection.query('SELECT id, password FROM users WHERE emailAddress = ? LIMIT 1', emailAddress);
    if (selectUserResult.length !== 0) {
      return false;
    }
    const randomCode = await randomBytes(64);
    const passwordHash = await hash(password, 10);
    const insertUserResult = await connection.query('INSERT INTO users SET emailAddress = ?, password = ?, verified = 0, verificationCode = UNHEX(?)', [ emailAddress, passwordHash, randomCode.toString('hex') ]);
    return { id: insertUserResult.insertId, verificationCode: randomCode.toString('base64') };
  } finally {
    connection.release();
  }
}

export async function verifyUser(emailAddress: string, code: string): Promise<boolean> {
  const connection = await (await pool).getConnection();
  const hexCode = Buffer.from(code, 'base64').toString('hex');
  try {
    const selectUserResult = await connection.query('SELECT id FROM users WHERE emailAddress = ? AND HEX(verificationCode) = ? LIMIT 1', [ emailAddress, hexCode ]);
    if (selectUserResult.length === 0) {
      return false;
    }
    const id = selectUserResult[0].id as number;
    await connection.query('UPDATE users SET verified = 1 WHERE id = ?', id);
    return true;
  } finally {
    connection.release();
  }
}

export async function getProfile(id: number): Promise<Profile | null> {
  const connection = await (await pool).getConnection();
  try {
    const selectProfileResult = await connection.query(`
SELECT
  a.id,
  a.sex,
  a.first_name firstName,
  a.last_name lastName,
  p.company,
  p.email_address emailAddress,
  p.website,
  p.intro,
  p.additional,
  p.slogan,
  p.services,
  p.city,
  provinces.code provinceCode,
  countries.code countryCode,
  p.phone_number phoneNumber,
  p.noindex,
  p.active,
  p.facebook,
  p.twitter,
  p.pinterest,
  p.instagram,
  p.linkedin,
  UNIX_TIMESTAMP(p.timestamp) timestamp,
  s.name AS styleName,
  s.dark,
  b.name AS backgroundName,
  b.url AS backgroundUrl,
  profiles_professions.profession_name professionName,
  portraits.filename portrait_filename,
  portraits.width portrait_width,
  portraits.height portrait_height,
  portraits.mime_type portrait_mime_type,
  UNIX_TIMESTAMP(portraits.modified) portrait_modified
FROM
  student_center.accounts a
LEFT JOIN
  student_center.profiles p ON p.account_id = a.id
LEFT JOIN
  student_center.styles s USING(style_id)
LEFT JOIN
  student_center.backgrounds b USING (background_id)
LEFT JOIN
  student_center.countries ON countries.id = p.country_id
LEFT JOIN
  student_center.provinces ON provinces.id = p.province_id
LEFT JOIN
  student_center.profiles_professions ON profiles_professions.account_id = a.id
LEFT JOIN
  student_center.portraits ON portraits.account_id = a.id
WHERE
  a.arrears = 0
    AND
  NOT p.active = 0
    AND
  a.id = ?`, id);
    if (selectProfileResult.length === 0) {
      return null;
    }
    // const courses: Array<{ code: string; }> = await connection.query('SELECT c.code FROM student_center.accounts a LEFT JOIN student_center.students s ON s.account_id = a.id LEFT JOIN student_center.courses c ON c.id = s.course_id WHERE a.id = ? AND NOT s.graduated = 0;', selectProfileResult[0].id);
    // const images: Picture[] = await connection.query('SELECT id, description, priority, width, height FROM student_center.pictures WHERE account_id = ? ORDER by priority, id', selectProfileResult[0].id);
    // const testimonials: Testimonial[] = await connection.query('SELECT t.quote, t.name, t.rating FROM student_center.testimonials t WHERE t.account_id = ?', selectProfileResult[0].id);
    const [ courses, images, testimonials ]: [ Array<{ code: string; }>, Picture[], Testimonial[]] = await Promise.all([
      connection.query('SELECT c.code FROM student_center.accounts a LEFT JOIN student_center.students s ON s.account_id = a.id LEFT JOIN student_center.courses c ON c.id = s.course_id WHERE a.id = ? AND NOT s.graduated = 0;', selectProfileResult[0].id),
      connection.query('SELECT p.id, p.heading, p.description, p.priority, p.width, p.height FROM student_center.pictures p WHERE p.account_id = ? ORDER by p.priority, p.id', selectProfileResult[0].id),
      connection.query('SELECT t.quote, t.name, t.rating FROM student_center.testimonials t WHERE t.account_id = ? ORDER BY t.id', selectProfileResult[0].id),
    ]);
    let portrait: Portrait | null = null;
    if (selectProfileResult[0].portrait_filename) {
      portrait = {
        accountId: selectProfileResult[0].id,
        filename: selectProfileResult[0].portrait_filename,
        width: selectProfileResult[0].portrait_width,
        height: selectProfileResult[0].portrait_height,
        mimeType: selectProfileResult[0].portrait_mime_type,
        modified: selectProfileResult[0].portrait_modified,
      };
    }
    const profile: Profile = {
      id: selectProfileResult[0].id,
      sex: selectProfileResult[0].sex,
      firstName: selectProfileResult[0].firstName,
      lastName: selectProfileResult[0].lastName,
      company: selectProfileResult[0].company,
      emailAddress: selectProfileResult[0].emailAddress,
      website: selectProfileResult[0].website,
      intro: selectProfileResult[0].intro,
      additional: selectProfileResult[0].additional,
      slogan: selectProfileResult[0].slogan,
      services: selectProfileResult[0].services,
      city: selectProfileResult[0].city,
      provinceCode: selectProfileResult[0].provinceCode,
      countryCode: selectProfileResult[0].countryCode,
      phoneNumber: selectProfileResult[0].phoneNumber,
      noindex: selectProfileResult[0].noindex,
      facebook: selectProfileResult[0].facebook,
      twitter: selectProfileResult[0].twitter,
      pinterest: selectProfileResult[0].pinterest,
      instagram: selectProfileResult[0].instagram,
      linkedin: selectProfileResult[0].linkedin,
      timestamp: selectProfileResult[0].timestamp,
      styleName: selectProfileResult[0].styleName,
      dark: selectProfileResult[0].dark,
      backgroundName: selectProfileResult[0].backgroundName,
      backgroundUrl: selectProfileResult[0].backgroundUrl,
      professions: selectProfileResult.map((p: any) => p.professionName),
      certifications: courses.map(c => c.code),
      testimonials,
      images,
      portrait,
    };
    return profile;
  } finally {
    connection.release();
  }
}

export async function getProfiles(
  onlyCrawable = true,
  firstName = '',
  lastName = '',
  countryCode = '',
  provinceCode: string | null = null,
  area = '',
  profession = '',
): Promise<Array<Partial<Profile>>> {
  const connection = await (await pool).getConnection();

  let sql = `
SELECT DISTINCT
  a.id,
  a.sex,
  a.first_name firstName,
  a.last_name lastName,
  p.company,
  p.email_address emailAddress,
  p.website,
  p.slogan,
  p.city,
  provinces.code provinceCode,
  countries.code countryCode,
  p.phone_number phoneNumber,
  p.timestamp,
  portraits.filename portrait_filename,
  portraits.width portrait_width,
  portraits.height portrait_height,
  portraits.mime_type portrait_mime_type,
  UNIX_TIMESTAMP(portraits.modified) portrait_modified
FROM
  student_center.accounts a
LEFT JOIN
  student_center.profiles p ON p.account_id = a.id
LEFT JOIN
  student_center.countries ON countries.id = p.country_id
LEFT JOIN
  student_center.provinces ON provinces.id = p.province_id
LEFT JOIN
  student_center.profiles_professions ON profiles_professions.account_id = a.id
LEFT JOIN
  student_center.service_areas ON service_areas.account_id = a.id
LEFT JOIN
  student_center.portraits ON portraits.account_id = a.id
WHERE
  a.arrears = 0
    AND
  NOT p.active = 0
    AND
  NOT (
    (p.intro IS NULL OR LENGTH(p.intro) = 0)
      AND
    (p.additional IS NULL OR LENGTH(p.additional) = 0)
      AND
    (p.services IS NULL OR LENGTH(p.services) = 0)
  )`;
  if (onlyCrawable) {
    sql += ' AND noindex = 0';
  }
  const params: string[] = [];
  if (firstName) {
    sql += ' AND a.first_name LIKE ?';
    params.push(`${firstName}%`);
  }
  if (lastName) {
    sql += ' AND a.last_name LIKE ?';
    params.push(`${lastName}%`);
  }
  if (countryCode) {
    sql += ' AND countries.code = ?';
    params.push(countryCode);
  }
  if (provinceCode) {
    sql += ' AND provinces.code = ?';
    params.push(provinceCode);
  }
  if (area) {
    sql += ' AND (service_areas.name LIKE ? OR p.city LIKE ?)';
    params.push(`%${area}%`, `%${area}%`);
  }
  if (profession) {
    sql += ' AND profiles_professions.profession_name = ?';
    params.push(profession);
  }
  sql += ' ORDER BY `random`';
  try {
    const selectUserResult = await connection.query(sql, params);
    return selectUserResult.map((row: any) => {
      const profile: Partial<Profile> = {
        id: row.id,
        sex: row.sex,
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
        emailAddress: row.emailAddress,
        website: row.website,
        slogan: row.slogan,
        city: row.city,
        provinceCode: row.provinceCode,
        countryCode: row.countryCode,
        phoneNumber: row.phoneNumber,
        timestamp: row.timestamp,
        portrait: null,
      };
      if (row.portrait_filename) {
        profile.portrait = {
          accountId: row.id,
          filename: row.portrait_filename,
          width: row.portrait_width,
          height: row.portrait_height,
          mimeType: row.portrait_mime_type,
          modified: row.portrait_modified,
        };
      }
      return profile;
    });
  } finally {
    connection.release();
  }
}

export async function sendVerificationEmail(emailAddress: string, verificationCode: string): Promise<any> {
  const url = `https://api.qccareerschool.com/qccareerschool/verify?emailAddress=${encodeURIComponent(emailAddress)}&code=${encodeURIComponent(verificationCode)}`;
  const mailOptions: Mail.Options = {
    to: emailAddress,
    from: 'QC Career School <info@qccareerschool.com>',
    subject: 'Verify Your Account',
    text: `To verify your account, please click the following link or paste it into your web browser's address bar:

    <${url}>`,
    html: `<p>To verify your account, please click the button below:</p><a href="${url}"><button>Verify Account</button></a>`,
  };
  return transport.sendMail(mailOptions);
}
