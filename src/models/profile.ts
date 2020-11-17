import { Picture } from './picture';
import { Portrait } from './portrait';
import { Testimonial } from './testimonial';

export interface Profile {
  id: number;
  sex: 'M' | 'F';
  firstName: string;
  lastName: string;
  company: string;
  emailAddress: string;
  website: string;
  intro: string;
  additional: string;
  slogan: string;
  services: string;
  city: string;
  provinceCode: string | null;
  countryCode: string;
  phoneNumber: string;
  noindex: boolean;
  facebook: string | null;
  twitter: string | null;
  pinterest: string | null;
  instagram: string | null;
  linkedin: string | null;
  timestamp: number;
  styleName: string;
  dark: boolean;
  backgroundName: string | null;
  backgroundUrl: string | null;
  professions: string[];
  certifications: string[];
  images: Picture[];
  testimonials: Testimonial[];
  portrait: Portrait | null;
}
