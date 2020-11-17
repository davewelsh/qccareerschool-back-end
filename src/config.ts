import dotenv from 'dotenv';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw Error('JWT_SECRET is not defined');
}

export const jwtSecret = process.env.JWT_SECRET;
