# Rutas asíncronas y Web Push

## Diseño

El usuario solicita completar el circuito serverless de dataset → rutas → notificación, en una rama separada y sin subagentes. Se conserva Express/MVC y el solver. El front usa el nuevo contrato asíncrono; `/api/resolver` se conserva para compatibilidad.

Se elige Cloudflare Workflows por su ejecución persistente y pasos con reintentos. Un `waitUntil` del request no garantiza la resolución tras cerrar la conexión y una cola requeriría implementar adicionalmente checkpoints/reintentos por etapa. D1 guarda la solicitud, el estado, el resultado y el estado del aviso. El workflow solo recibe el ID: los datasets y los informes no viajan en notificaciones.

## Contratos

- `GET /api/push/config`: clave VAPID pública, o 503 si no está configurada.
- `PUT /api/push/suscripcion`, `DELETE /api/push/suscripcion`: suscripción de esta instalación.
- `PUT /api/trabajos/:id`: ID UUID generado por el front, cuerpo `{archivos, opciones}`. Devuelve 202 una vez persistido y despachado; repetir el mismo ID/cuerpo es idempotente. Cambiar el cuerpo devuelve 409.
- `GET /api/trabajos/:id`: estado de resolución y notificación.
- `GET /api/trabajos/:id/resultado`: informe completo, solo cuando está completado.

Los endpoints privados usan un Bearer aleatorio de 256 bits por instalación y guardan solo su SHA-256. No hay cuentas ni sincronización entre dispositivos. Los IDs ajenos no son accesibles, CORS permite solo orígenes conocidos y el push solo admite endpoints HTTPS de proveedores confiables, sin redirecciones. El consumidor valida los límites antes de reservar CPU.

Los pasos del workflow separan cálculo/persistencia de resultado y envío push. Un reintento de envío no recalcula rutas. Las entregas pueden repetirse ante un corte entre el proveedor y el checkpoint; topic/tag por trabajo permiten reemplazar avisos duplicados. 404/410 desactiva suscripciones vencidas. El resultado sigue disponible si no se autorizó push o el envío agota sus reintentos.

## Plan y verificación

- [ ] Migración D1, modelos, validación, aislamiento, idempotencia y tests con SQLite real.
- [ ] API MVC, binding/export Workflow, retries, persistencia terminal y limpieza de trabajos vencidos.
- [ ] VAPID y Web Push cifrado vía `web-push` + `fetch`; pruebas de criptografía, expiración, fallos y reenvío sin recomputar.
- [ ] Front: suscripción voluntaria/revocación, trabajo persistido, consulta con backoff, restauración y apertura desde aviso.
- [ ] Configuración local de claves sin imprimir secretos, migración local y prueba completa en el runtime Cloudflare.
- [ ] Typecheck, tests, build y CI de ambas ramas, revisión propia (sin agentes), commits y push de ramas sin integrar a main.

## Límites operativos

El solver admite como máximo 120 pedidos, 8 vehículos y 300.000 iteraciones en este contrato. Los trabajos se conservan 7 días. Workflows en Workers Paid permite configurar hasta 5 minutos de CPU por paso; el plan gratuito tiene 10 ms y no sirve para estos cálculos. Las claves VAPID no se regeneran al desplegar y no se guardan en Git. El despliegue requiere aplicar la migración y configurar los secretos antes de habilitar push.

Referencias: [Workflows](https://developers.cloudflare.com/workflows/), [límites](https://developers.cloudflare.com/workflows/reference/limits/), [web-push](https://github.com/web-push-libs/web-push).
