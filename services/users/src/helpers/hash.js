import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$.{53}$/;

export const hashSecret = (value) => bcrypt.hash(value, SALT_ROUNDS);

export const compareSecret = (value, hash) => bcrypt.compare(value, hash);

export const isHashed = (value) => BCRYPT_HASH.test(value);
