DROP TABLE IF EXISTS otp_verifications;
CREATE TABLE otp_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile      VARCHAR(10) NOT NULL,
  otp_hash    TEXT NOT NULL,
  attempts    INTEGER DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
