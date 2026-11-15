import { describe, it, expect } from 'vitest';
import { isSchoolEmail } from './schoolEmail';

describe('isSchoolEmail', () => {
  it('accepts US .edu domains', () => {
    expect(isSchoolEmail('honor@virginia.edu')).toBe(true);
    expect(isSchoolEmail('hokie@vt.edu')).toBe(true);
    expect(isSchoolEmail('a@cs.stanford.edu')).toBe(true); // subdomain
  });

  it('accepts international academic domains (.ac.*, .edu.*)', () => {
    expect(isSchoolEmail('kim@snu.ac.kr')).toBe(true);
    expect(isSchoolEmail('student@ox.ac.uk')).toBe(true);
    expect(isSchoolEmail('s@unsw.edu.au')).toBe(true);
    expect(isSchoolEmail('s@tsinghua.edu.cn')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isSchoolEmail('Honor@VIRGINIA.EDU')).toBe(true);
    expect(isSchoolEmail('  honor@virginia.edu  ')).toBe(true);
  });

  it('rejects consumer domains', () => {
    expect(isSchoolEmail('a@gmail.com')).toBe(false);
    expect(isSchoolEmail('a@outlook.com')).toBe(false);
    expect(isSchoolEmail('a@naver.com')).toBe(false);
  });

  it('rejects look-alike domains', () => {
    expect(isSchoolEmail('a@myedu.com')).toBe(false);   // "edu" not a label
    expect(isSchoolEmail('a@educated.org')).toBe(false);
    expect(isSchoolEmail('a@acme.co')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSchoolEmail('')).toBe(false);
    expect(isSchoolEmail('no-at-sign')).toBe(false);
    expect(isSchoolEmail('@virginia.edu')).toBe(false); // no local part
    expect(isSchoolEmail('a@')).toBe(false);
  });
});
