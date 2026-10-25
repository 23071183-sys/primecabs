// Runs before each integration test file: point everything at the test database and fake providers.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/primecabs_test";
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789";
process.env.OTP_HASH_SECRET = "test-otp-secret-0123456789abcdef012345678";
process.env.FILE_URL_SECRET = "test-file-secret-0123456789abcdef01234567";
process.env.DATA_ENCRYPTION_KEY = "0".repeat(64);
process.env.SMS_PROVIDER = "fake";
process.env.PAYMENT_PROVIDER = "fake";
process.env.STORAGE_DIR = "storage-test";
process.env.CORS_ORIGINS = "";
