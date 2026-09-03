-- Reset password for existing admin for testing
UPDATE auth.users 
SET encrypted_password = crypt('teste123456', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'edinhold@gmail.com';