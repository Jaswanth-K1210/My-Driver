-- Admin Portal, part 4: password sign-in for operators.
--
-- Operators have no signup. An operator runs `npm run seed:staff`, which
-- creates the account, grants the role and sets the password in one step.
-- Customers and drivers keep OTP / Google; their password_hash stays NULL,
-- and the staff login refuses any account whose only roles are self-service.
--
-- Stored as scrypt$N$r$p$salt$hash (node:crypto). Never plaintext.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
