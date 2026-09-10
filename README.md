# Divine Desire — CRM

## Antes de nada
1. Ve a Supabase → tu proyecto → SQL Editor → New query.
2. Pega el contenido completo de `schema.sql` y pulsa Run.
3. Ve a Authentication → Users → Invite user → invítate a ti mismo con tu email.
4. Acepta la invitación desde tu correo y crea tu contraseña.
5. Vuelve a Supabase → SQL Editor y ejecuta (cambia el email por el tuyo):
   ```sql
   update profiles set role = 'admin' where id = (select id from auth.users where email = 'tu-email@ejemplo.com');
   ```
   Esto te convierte en administrador. El resto de gente que invites será "chatter" por defecto — puedes cambiarles el rol de la misma manera.

## Desarrollo local
```
npm install
npm run dev
```

## Variables de entorno necesarias (Netlify → Site settings → Environment variables)
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
