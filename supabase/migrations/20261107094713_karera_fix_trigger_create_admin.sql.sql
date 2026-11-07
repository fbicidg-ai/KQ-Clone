/*
# Fix missing handle_new_profile trigger + create admin user
*/

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- Create admin user directly
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'boying@jerome.com';
  
  IF v_admin_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'boying@jerome.com',
      crypt('Boying@jerome2026@', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Administrator","mobile":""}'::jsonb
    )
    RETURNING id INTO v_admin_id;
  END IF;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, mobile, role)
    VALUES (v_admin_id, 'Administrator', '', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Administrator';
  END IF;
END $$;

-- Verify
SELECT count(*) as admin_count FROM public.profiles WHERE role = 'admin';
SELECT count(*) as user_count FROM auth.users;
SELECT count(*) as profile_count FROM public.profiles;
