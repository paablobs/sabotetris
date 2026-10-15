# Ranking global gratuito: configuración y operación

El juego funciona sin estas variables: sigue guardando localmente y no contacta
Supabase ni carga CAPTCHA. Configurarlas habilita el ranking global para partidas
nuevas. No se importan resultados antiguos de localStorage.

## 1. Crear los servicios (manual, en tus cuentas)

1. En Supabase creá una **organización Free dedicada** y un proyecto para Sabotetris.
   No cambies la organización a Pro ni contrates complementos. Elegí São Paulo
   si la audiencia principal es Argentina. Guardá la contraseña en tu gestor.
2. En la configuración de API obtené la **Project URL** y la **publishable key**
   (`sb_publishable_...`). No uses la secret key ni `service_role` en el navegador.
3. En Authentication activá **Anonymous sign-ins**. No hace falta habilitar
   proveedores sociales, emails ni formularios de acceso. Configurá Site URL como
   `https://paablobs.github.io/sabotetris/`; este flujo no usa redirects OAuth.
4. En Cloudflare Turnstile creá un widget Managed. Permití el hostname
   `paablobs.github.io` (sin protocolo ni `/sabotetris/`) y `localhost` para desarrollo.
   Copiá la **site key pública** y guardá la **secret key** aparte.
5. En Authentication → protección contra bots de Supabase activá CAPTCHA,
   elegí Turnstile y pegá allí la **secret key de Turnstile**. Nunca va en Vite.
   No publiques la integración sin esta protección activada.

Los invitados no tienen contraseña ni recuperación de cuenta. Borrar los datos
del navegador crea otra identidad y vuelve a pedir CAPTCHA. Los alias no son
únicos ni identidades verificadas. El alias y resultado del top son públicos.

## 2. Aplicar PostgreSQL

Opción recomendada, desde esta rama y con la Supabase CLI instalada:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

`TU_PROJECT_REF` es el identificador del proyecto, no una contraseña. La CLI
pedirá autenticación/contraseña localmente; no las pegues en un chat ni en Git.
La migración está en `supabase/migrations/20260601000000_global_ranking.sql`.
Si preferís no usar la CLI para SQL, ejecutá **el archivo completo una sola vez**
en SQL Editor como postgres. No combines ambas vías sin registrar la migración:
la CLI podría intentar aplicarla de nuevo. No es una migración idempotente.

Después ejecutá **`supabase/schedule.sql`** en SQL Editor como postgres. Habilita
pg_cron y programa la limpieza diaria. Este segundo archivo sí puede repetirse.
Comprobá en Cron que existe `sabotetris-cleanup` y que sus ejecuciones terminan bien.

No agregues `private` a los esquemas expuestos de la API. No habilites inserts
públicos ni desactives RLS para arreglar errores.

## 3. Configurar y desplegar las funciones

Definí dos secretos **solo del backend**, en Edge Functions → Secrets:

| Nombre | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://paablobs.github.io,http://localhost:5173,http://127.0.0.1:5173` |
| `RATE_LIMIT_SALT` | Un valor aleatorio privado de al menos 32 caracteres, por ejemplo generado con `openssl rand -hex 32` |

En producción podés dejar únicamente `https://paablobs.github.io`. CORS usa el
**origen**, sin `/sabotetris/` ni barra final. Quitá orígenes de desarrollo cuando
no los necesites. La restricción de origen no reemplaza autenticación: un script
puede falsificar ese header.

Supabase proporciona automáticamente `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` a las funciones. No copies ese segundo valor a Pages.
Si el panel de tu proyecto no lo proporciona, configurá la credencial de servidor
siguiendo su documentación vigente antes de desplegar; no uses una clave pública.

```bash
npx supabase functions deploy start-run --no-verify-jwt
npx supabase functions deploy submit-score --no-verify-jwt
```

**Importante:** `verify_jwt = false` es intencional para compatibilidad con claves
publicables y las claves de firma actuales. **No significa acceso anónimo a las
escrituras**: los handlers llaman a `auth.getUser(token)` y exigen un usuario
anónimo real del proyecto antes de ejecutar SQL con la credencial de servidor.
Los RPC de escritura rechazan `anon` y `authenticated`, incluso con un JWT válido.

No hay despliegue automático de SQL ni funciones en GitHub Actions: hay que
aplicar primero la migración, luego las funciones y finalmente el frontend.

## 4. Configurar el frontend

Localmente copiá `.env.example` a `.env.local` y completá:

```dotenv
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
VITE_TURNSTILE_SITE_KEY=TU_SITE_KEY_PUBLICA
```

Reiniciá `npm run dev` al cambiar variables. Deben estar **las tres** para activar
online; vacías o incompletas mantienen el modo local. Cada petición tiene timeout
de 8 segundos; preparar una partida tiene un máximo de 30 segundos y botón para
jugar local inmediatamente. La preparación detiene el juego, no consume tiempo
de caída ni de caos. El CAPTCHA solo se pide si no hay sesión de invitado válida.

En GitHub → repositorio → Settings → Secrets and variables → Actions →
**Variables**, creá las mismas tres variables de repositorio. Son públicas y se
incluyen en el bundle. No hace falta guardar contraseñas de PostgreSQL ni claves
de servidor en GitHub. Un cambio de variables requiere un nuevo build.

Esta rama no publica nada por sí sola. El workflow publica Pages únicamente con
un push a `master`; una PR a `master` ejecuta las comprobaciones. Merge/push y
publicación requieren tu aprobación, no se hacen automáticamente por el agente.

## 5. Comprobación antes de publicar

```bash
npm ci
npm test
npm run test:db       # Docker; PostgreSQL aislado, sin puertos ni datos del host
npm run check:edge   # Deno 2.9.6 mediante npx; primera vez necesita red
npm run lint
npm run build
npm run dev
```

`test:db` valida SQL, privilegios, concurrencia y limpieza con una tabla mínima
que representa el contrato de Supabase Auth. **No reemplaza probar GoTrue,
PostgREST, CAPTCHA, gateway ni Cron en tu proyecto real.**

Pruebas manuales de aceptación con Supabase configurado:

- En móvil, el toque de PLAY no debe activar por accidente PLAY LOCAL / SKIP;
  el diálogo debe esperar un CAPTCHA o una acción nueva sobre el botón.
- Navegador limpio: PLAY, CAPTCHA y partida. Guardar alias: debe distinguir
  «Saved locally» de «Published» o «Accepted — outside the global top 20».
- Segundo navegador/dispositivo: ver el mismo top en RANKING → GLOBAL → SOFT/HARD.
- Invitado ya creado: nueva partida sin volver a resolver CAPTCHA.
- PLAY LOCAL/SKIP y pérdida de conexión: la partida continúa, sin falsa publicación.
- Cortar conexión al guardar: aparece RETRY GLOBAL UPLOAD. Reconectar y reintentar
  sin salir de Game Over: mismo identificador/payload, nunca dos resultados.
- Cambiar pestaña/modalidad o salir mientras carga: no deben aparecer filas de
  otra selección ni de una activación anterior.
- Usar puntos de depuración: el cliente oficial no publica esa partida.
- Desde un cliente con publishable key, incluso autenticado, intentar llamar
  `start_ranked_run`, `submit_ranked_run`, `cleanup_ranked_data` o tablas privadas:
  deben devolver permiso denegado. `get_leaderboard` sí permite leer como invitado.
- Revisar CORS real y headers de proxy en Supabase. El bucket IP usa el último
  `x-forwarded-for` como límite suplementario; sin una garantía del proxy no es
  una identidad confiable y puede agrupar usuarios. Los límites por usuario y
  globales son independientes. No registrar tokens ni direcciones IP crudas.
- Verificar Cron y probar restaurar un backup en un proyecto de prueba.

La publicación pendiente no se recupera tras recargar/cerrar Game Over: el
resultado queda local si pudo guardarse, pero no se encola para otro día. El
reintento explícito evita subir récords locales alterables o resultados antiguos.

## Modelo y límites iniciales

- `private.ranked_scores`: **20 filas por modalidad**, hasta 40 en total.
  Orden: puntuación descendente, fecha de recepción ascendente y UUID para desempatar.
  Son resultados, no «un mejor récord por persona»: un invitado puede ocupar varios puestos.
- `private.ranked_runs`: partidas con 24 horas para primer envío, recibos 7 días.
  Un reintento idéntico conserva el recibo; cambiar nombre, score, nivel o modalidad
  después de consumir la partida es rechazado. Insertar/recortar está serializado
  por modalidad, incluso entre instancias simultáneas del backend.
- Invitados: eliminados tras 30 días sin inicio/envío de partida; no borra récords.
- Límites compartidos en PostgreSQL: **10 inicios / 10 minutos / usuario**,
  **120 inicios / día / usuario**, **60 inicios / 10 minutos / bucket IP**,
  **10.000 inicios / día globales** y **30 envíos / 10 minutos / usuario**.
  Ventanas fijas: puede haber ráfagas al cambiar de ventana. Ajustarlos requiere
  una migración; no editar una migración ya aplicada.
- Lecturas: RPC limitado a 20 filas, sin IDs de usuarios, cacheado 60 segundos por
  modalidad en cada cliente. El botón REFRESH respeta la caché para no generar spam.
- El ranking local conserva la clave antigua y los registros válidos existentes,
  ampliando el límite a 20 por modalidad. No puede recuperar resultados que el
  viejo límite mixto ya había descartado. No se migra nada local al servidor.

## Precio y disponibilidad: no confundir cuota con cobro

Referencias consultadas al diseñar esta integración:
[Pricing](https://supabase.com/pricing),
[Cost control](https://supabase.com/docs/guides/platform/cost-control),
[Invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations),
[Database size](https://supabase.com/docs/guides/platform/manage-your-usage/database-size).
Revisá siempre el panel: los precios y políticas pueden cambiar.

Free incluye 500 MB de PostgreSQL, 5 GB de transferencia saliente no cacheada,
50.000 usuarios activos de Auth y 500.000 invocaciones mensuales de funciones.
Varias cuotas se comparten a nivel organización. No presupuestes solamente las
40 filas: también ocupan espacio Auth, índices, sesiones y datos internos.

Dos llamadas de función por partida completa dan un máximo **aritmético** de
250.000 partidas por mes, no una garantía de capacidad. Los abandonos consumen
inicios, los errores/reintentos cuentan y las lecturas consumen transferencia.
Los preflight `OPTIONS` no se facturan según la documentación actual.
Este despliegue limita adicionalmente los inicios diarios para reducir abuso.
CAPTCHA y rate limiting no evitan que alguien agote cuotas; las lecturas públicas
también pueden abusarse y el propio backend consume invocaciones al rechazar.

En Free no hay cobro automático por exceder cuota: puede haber restricciones,
solo lectura o pausa. El proyecto gratuito puede pausarse tras inactividad.
No hay garantía de disponibilidad ni de protección frente a un ataque de cuota.
No cambies a Pro asumiendo que Spend Cap cubre todos los cargos: solo existe en
Pro y no cubre todos los recursos. La degradación a ranking local es intencional.

Revisá Usage semanalmente al principio y más seguido si compartís el juego.
Usá 50/75/90 % como umbrales de revisión manual; no se han creado alertas externas
ni se promete que Supabase mande avisos personalizados en esos porcentajes.

## Backups y recuperación

Supabase Free no sustituye un backup externo. El esquema está versionado aquí;
los datos duraderos son las 40 filas de `private.ranked_scores`. Desde una sesión
`psql` segura, conectada como administrador mediante el método indicado en
**Connect** de tu proyecto, exportá fuera del repositorio:

```sql
\copy private.ranked_scores(id,mode,player_name,score,level,created_at) TO '/ruta/privada/ranking.csv' CSV HEADER
```

Para una prueba de recuperación, usá un **proyecto de prueba nuevo**, aplicá la
migración y cargá el CSV en la tabla vacía:

```sql
\copy private.ranked_scores(id,mode,player_name,score,level,created_at) FROM '/ruta/privada/ranking.csv' CSV HEADER
select count(*) from public.get_leaderboard('softcore');
select count(*) from public.get_leaderboard('hardcore');
```

Eso restaura récords, no sesiones, recibos ni identidades de invitado. No hace
falta preservar esos datos transitorios; las partidas abiertas se perderían.
No borres ni reemplaces tablas de producción para probar el procedimiento.

## Seguridad: alcance honesto

El backend valida identidad, forma, límites y consumo de la partida. **No prueba
que el score sea auténtico**: el navegador calcula los puntos. La exclusión de
atajos protege el cliente oficial, no impide uno modificado. No usar este ranking
para premios o competición verificada sin validación de la simulación en servidor.
