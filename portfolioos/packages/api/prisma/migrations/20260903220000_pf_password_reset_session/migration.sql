-- Password reset is a third thing a PF session can be doing.
--
-- It shares the shape of a UAN lookup: no account to attach to yet, because
-- the member cannot sign in until it succeeds, and the same captcha-then-OTP
-- conversation with the portal.

ALTER TYPE "PfSessionKind" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
