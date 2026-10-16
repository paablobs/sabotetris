# Ranking global: seguridad y puesta en producción

## Qué garantiza esta versión

**El navegador ya no puede elegir el puntaje que se guarda.** Envía el alias,
identificador de partida y una secuencia de acciones. El backend reconstruye la
partida y calcula puntaje/nivel con la misma simulación que usa el juego.

- El servidor asigna semilla aleatoria, modalidad, versión y vencimiento.
- No acepta `score`, `level`, semillas ni reglas elegidas por el cliente.
- Verifica acciones, tiempo disponible, partida terminada, pertenencia y uso único.
- PostgreSQL permite finalizar únicamente a la función de servidor. Ni la clave
  pública ni un usuario autenticado pueden insertar resultados o llamar sus RPC.
- El CAPTCHA **existente de Cloudflare Turnstile se conserva** en Supabase Auth.
- Sin configuración/conexión, o al elegir SKIP, se juega y guarda localmente.
  Los resultados locales nunca se importan al ranking global.

Esto valida una **partida reproducible**, no que haya jugado una persona: bots,
planificación con la semilla, automatización y abuso de cuotas siguen siendo
posibles. No es una garantía de «inhackeable» ni suficiente para premios monetarios.
El servicio privilegiado y sus credenciales forman parte de la base de confianza.

## 1. Revisar Supabase y Cloudflare (manual)

En tu proyecto actual, sin recrearlo ni cambiar de plan:

1. Authentication: mantener **Anonymous sign-ins** y **CAPTCHA/Turnstile** activos.
   La secret key de Turnstile va en Supabase Auth, **nunca** en variables Vite.
   Revisar también los límites de Auth: el código de ranking no limita solicitudes
   directas de creación de invitados. La documentación indica 30 registros/hora/IP
   por defecto; comprobar el valor real en tu panel.
2. Turnstile: mantener el hostname `paablobs.github.io`, sin protocolo ni ruta.
   Añadir `localhost` solo si hace falta para desarrollo.
3. API: usar URL del proyecto y **publishable key** en el frontend; nunca secret
   key, contraseña PostgreSQL ni `service_role`. Las claves públicas no son secretos.
4. Data API → esquemas expuestos: **no incluir `private`**. No desactivar RLS ni
   conceder permisos a `anon`/`authenticated` para resolver errores de publicación.
5. Seguridad de cuenta: MFA, acceso mínimo a colaboradores y revisión de Security
   Advisor. No activar funciones/integraciones que no necesitás. Si alguna clave
   privilegiada estuvo en Git, bundle o logs: rotarla y revisar actividad; borrarla
   del archivo no revoca una copia robada.

Los invitados no tienen contraseña ni recuperación. Borrar almacenamiento crea
otra identidad y requiere CAPTCHA otra vez. Los alias no son identidades verificadas.

## 2. Aplicar las migraciones, en orden

**Este cambio reinicia el top global verificado.** Los puntajes anteriores no
pueden comprobarse retroactivamente: se conservan en `private.ranked_scores`,
pero dejan de mostrarse como verificados. No se borran ni se migran como legítimos.
Las partidas abiertas antes del cambio deberán quedar locales/iniciarse de nuevo.

Desde esta rama, con la Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

No compartir credenciales ni pegarlas en Git/chat. Archivos, en orden:

1. `supabase/migrations/20260601000000_global_ranking.sql`: integración original.
   **Si ya está aplicada, no volver a ejecutarla.**
2. `supabase/migrations/20260602000000_verified_ranking.sql`: nuevas reglas,
   tablas verificadas, cuotas y cierre de la ruta vulnerable.

Alternativa SQL Editor como postgres: ejecutar cada archivo pendiente **completo,
una sola vez**, respetando el orden. No mezclar con CLI sin registrar/reconciliar
el historial. Las migraciones no son idempotentes. Hacer primero una prueba en un
proyecto de staging; conservar backup privado antes del cambio.

Ejecutar también `supabase/schedule.sql` como postgres si aún no está configurado;
es repetible. Verificar que Cron `sabotetris-cleanup` existe y termina bien.

**Orden del despliegue:** SQL → tres Edge Functions → frontend. Hay una ventana
breve sin publicación online para clientes viejos; es intencional, falla cerrado.
La antigua `submit_ranked_run` pierde permisos incluso para `service_role` y su
cuerpo rechaza envíos. No restaurar esa ruta para compatibilidad con clientes viejos.

## 3. Secretos y despliegue de funciones

Edge Functions → Secrets (solo backend):

| Nombre | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://paablobs.github.io` |
| `RATE_LIMIT_SALT` | Aleatorio privado, mínimo 32 caracteres; generar con `openssl rand -hex 32` |

Para desarrollo se pueden agregar `http://localhost:5173,http://127.0.0.1:5173`
a `ALLOWED_ORIGINS`. Son orígenes sin `/sabotetris/` ni barra final. CORS **no es
anti-cheat ni autenticación**: un programa puede falsificar `Origin`.

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al backend.
No copiarlas a Pages/Vite. Las funciones sin configuración fallan cerrado (503).

```bash
npx supabase functions deploy start-run --no-verify-jwt
npx supabase functions deploy submit-score --no-verify-jwt
npx supabase functions deploy leaderboard --no-verify-jwt
```

`verify_jwt = false` es intencional para claves publicables y firmas actuales.
**Las escrituras no son anónimas:** ambos handlers validan el bearer con
`auth.getUser(token)` y exigen un invitado real del proyecto. La lectura pública
no necesita sesión, pero pasa por cuotas. `get_leaderboard` ya no es ejecutable
por `anon`/`authenticated`: no dejar un acceso directo que eluda esas cuotas.

No hay deploy automático de SQL/funciones en GitHub Actions. No se ha desplegado
nada desde esta rama ni se cambió tu proyecto remoto.

## 4. Variables públicas del frontend

Conservar las actuales; `.env.example` muestra los nombres:

```dotenv
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
VITE_TURNSTILE_SITE_KEY=TU_SITE_KEY_PUBLICA
```

Las tres son públicas y deben existir para activar online. Reiniciar Vite al
cambiarlas. En GitHub Actions → Variables, configurar las mismas tres; requieren
nuevo build. Nunca agregar allí credenciales privilegiadas para este flujo.

La preparación dura como máximo 30s, con botón PLAY LOCAL / SKIP; cada petición
web tiene timeout de 8s. Se espera la semilla antes de empezar a jugar. Invitados
con sesión válida no vuelven a resolver CAPTCHA en cada partida.

## 5. Pruebas antes de publicar

```bash
npm ci
npm test
npm run test:db       # Docker aislado, sin puertos ni datos del host
npm run check:edge    # Deno 2.9.6; primera ejecución necesita red
npm run lint
npm run build
npm run dev
```

Las pruebas cubren vectores deterministas, resultados en ambas modalidades,
payloads manipulados, límites, tiempo, estado terminal, recibos, permisos reales,
cutover de datos antiguos, cuotas persistentes y concurrencia. PostgreSQL usa
un contrato mínimo de Auth: **no reemplaza GoTrue/PostgREST/gateway/Turnstile reales**.

En staging y después del deploy, comprobar manualmente:

- Navegador limpio: PLAY → CAPTCHA → partida → SAVE. Comparar puntaje calculado
  con el local y verlo desde otro dispositivo en GLOBAL → SOFT/HARD.
- Repetir en móvil, incluidos gestos, pausa mediante botón atrás e invaders.
  El toque que abrió PLAY no debe activar SKIP accidentalmente.
- Pérdida de red/SKIP: se sigue jugando local. No debe anunciar publicación exitosa.
- Cortar red al guardar, reconectar y RETRY GLOBAL UPLOAD sin salir de Game Over:
  mismo recibo, nunca dos resultados. Recargar/cerrar no recupera envíos pendientes.
- Agregar `score`/`level`/`seed` al POST, cambiar acciones, enviar partida sin terminar,
  adelantar ticks o usar el ID de otro invitado: rechazar, sin insertar puntaje.
- Con publishable key, con y sin sesión: RPC `start_ranked_run`, `inspect_ranked_run`,
  `finalize_verified_run`, `submit_ranked_run`, `get_leaderboard`, limpieza y tablas
  privadas deben denegar acceso. La lectura válida es la función `leaderboard`.
- Puntos de admin y límites de replay: indicar LOCAL ONLY; no publicar esa partida.
- Confirmar esquema `private` no expuesto, grants efectivos, cuotas tras varios
  intentos inválidos, Cron y recuperación de backup.
- Medir latencia/CPU en Supabase real con partidas largas antes de un lanzamiento
  grande. El check Deno es de tipos; no certifica el presupuesto CPU del hosting.

## Protocolo y datos

`supabase/functions/_shared/game/` es la fuente única de simulación, datos y PRNG.
La versión `sabo-replay-v1` fija ticks de **20ms**, gravedad con resto acumulado
(incluidos intervalos menores a 20ms), orden de efectos y enfriamientos de acciones.
No es una réplica de las imprecisiones del antiguo bucle dependiente de frames.
Cambiar gameplay requiere **nueva versión** y conservar un verificador compatible
para partidas abiertas, o rechazarlas explícitamente; nunca reinterpretarlas.

- Replay: máximo **90.000 ticks (30 minutos activos)**, **12.000 acciones**,
  **4 grupos de acciones/tick**, **192KiB** por petición. Por encima se continúa
  localmente. Pausa no avanza simulación, proyectiles ni ticks.
- Tiempo del servidor: ticks × 20ms ≤ tiempo desde inicio + **2s** de tolerancia.
  No impide planificar rápido y esperar antes de subir. El reloj cliente no manda.
- Partida: 24h para el primer envío; recibos/semilla/hash/métricas retenidos 7 días
  desde aceptación. Reintentos idénticos devuelven el mismo recibo aun vencida;
  cambiar alias o replay después del primer éxito se rechaza. No se almacena el
  replay completo: el hash permite vincular reintentos, no reconstruir evidencia.
- `private.ranked_verified_scores`: **20 por modalidad**, hasta 40 filas. Orden
  score descendente, recepción ascendente, UUID. Contiene versión/hash/ticks, no
  ID de usuario público. Puede haber varios resultados de una misma persona.
- `private.ranked_scores`: archivo privado de resultados anteriores **no verificados**.
- Invitados inactivos: limpieza a 30 días; recibos a 7 días y cuotas a 2 días.
  Los tops no tienen FK a invitados/recibos: limpiarlos no borra récords.

Cuotas persistentes (ventanas fijas; puede haber ráfagas al cambiar de ventana):

| Operación | Límites |
|---|---|
| Intentos de inicio/envío, cada tipo | 300/min global y 20.000/día global |
| Intentos de inicio | 20/10min/usuario y 120/10min/bucket IP |
| Intentos de envío | 30/10min/usuario y 120/10min/bucket IP |
| Inspección/replay de una partida propia | 8/10min/partida |
| Inicios exitosos, además | 10/10min/usuario, 120/día/usuario, 60/10min/IP, 10.000/día global |
| Lecturas públicas | 1.200/min global, 20.000/día global y 120/min/bucket IP |

Los intentos autenticados se contabilizan en una transacción separada **antes**
de leer/parsear/reproducir el body: un JSON inválido o replay rechazado no revierte
el contador. Las cuotas se evalúan en orden: al denegar una global o por usuario,
no se crean más contadores por IP. El límite diario de lectura también acota la
creación de esos buckets aunque se roten IPs. Rechazos de
autenticación/CORS/método/tipo de contenido no llegan a
estas cuotas y necesitan protecciones de plataforma. El último `x-forwarded-for`
se usa solo como señal suplementaria HMAC; verificar sanitización del gateway.
Usuario, partida y límite global no confían en ese header. Cambiar cuotas requiere
una migración nueva, no editar una ya aplicada.

Las lecturas devuelven solo alias/score/nivel/modalidad/fecha, máximo 20 filas;
el cliente deduplica y cachea 60s por modalidad. No hay datos de Auth públicos.

## Monitorización, costo y recuperación

Revisar Usage y logs de Auth/Edge/Postgres al principio semanalmente y ante
picos; controlar 429, 400, 503, fallos de Cron, latencia y nuevos invitados.
No registrar tokens, secretos, IPs crudas ni cuerpos completos de solicitudes.
No se instalaron alertas externas ni se promete bloqueo DDoS. Las cuotas SQL no
impiden consumir invocaciones/red al rechazar ni el abuso directo de Auth.

No cambiar de plan ni contratar extras suponiendo que son necesarios. Las cuotas
Free pueden agotarse y el proyecto puede quedar limitado/pausado. Verificar
[precios](https://supabase.com/pricing) y
[control de costos](https://supabase.com/docs/guides/platform/cost-control): Spend
Cap de Pro no cubre todos los recursos. El fallback local es intencional.

Para backup, desde `psql` administrativo seguro, exportar **fuera del repositorio**:

```sql
\copy private.ranked_verified_scores(id,mode,player_name,score,level,rules_version,replay_digest,active_ticks,created_at) TO '/ruta/privada/verified.csv' CSV HEADER
\copy private.ranked_scores(id,mode,player_name,score,level,created_at) TO '/ruta/privada/legacy.csv' CSV HEADER
```

Probar recuperación en **otro proyecto nuevo**: aplicar ambas migraciones y
usar `\copy ... FROM ... CSV HEADER` con las mismas columnas. Restaurar cada CSV
solo en su tabla correspondiente; **no promover legacy a verified**. Se recuperan
tops, no sesiones ni partidas abiertas. No probar borrando tablas de producción.
Ante incidente: pausar publicación, preservar evidencia privada, revisar permisos,
rotar credenciales comprometidas y desplegar corrección, sin reabrir el RPC viejo.

## Fuentes oficiales consultadas

- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Funciones, search_path y EXECUTE](https://supabase.com/docs/guides/database/functions)
- [Claves API y privilegios](https://supabase.com/docs/guides/api/api-keys)
- [Auth anónima y abuso](https://supabase.com/docs/guides/auth/auth-anonymous)
- [CAPTCHA / Turnstile](https://supabase.com/docs/guides/auth/auth-captcha)
- [Límites de Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [Límites Edge](https://supabase.com/docs/guides/functions/limits): CPU activa
  2s/petición; espera de red no cuenta como CPU. Confirmar política vigente.

Estas fuentes respaldan la separación de privilegios y los límites de plataforma;
la autenticidad del puntaje la aporta la simulación servidor, no RLS ni CAPTCHA.
