# Fingallians Shared Platform

One shared React app for the Fingallians Fitness Challenge.

## Run locally

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Fill `.env.local` with the Boys and Girls Supabase project values.

## Foundation v1

Includes:
- squad/year selector
- URL-based squad defaults
- shared Supabase client manager
- RBAC role lookup from `user_roles`
- Parent / Guardian login shell
- Select your child flow
- Admin/SuperAdmin shell

Live apps remain untouched.
