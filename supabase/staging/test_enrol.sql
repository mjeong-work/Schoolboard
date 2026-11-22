-- test_local.sh only: stands in for staging_seed.sql by giving every
-- new auth user a staging profile (like handle_new_user does for public).
CREATE FUNCTION staging_private.test_enrol() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO staging.profiles (id, email, name, role, status, verified)
  VALUES (NEW.id, NEW.email, coalesce(NEW.raw_user_meta_data->>'name', 'Tester'), 'Current Student', 'pending', false);
  RETURN NEW;
END $$;
CREATE TRIGGER test_enrol AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION staging_private.test_enrol();
-- Prod requires a contact on listings; the shared scenario file predates that column.
ALTER TABLE staging.marketplace_items ALTER COLUMN contact SET DEFAULT 'test';
