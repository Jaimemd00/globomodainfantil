# Pasarela de pago

Cómo probar los cobros hoy mismo sin contratar nada, y cómo pasar a cobrar de verdad.

---

## Cómo funciona por dentro

Tres reglas sostienen la integración. Si algún día se cambia el código de pagos,
conviene no romperlas:

**1. El importe lo calcula el servidor.** El navegador manda identificadores de
producto y cantidades; el precio sale de la base de datos. Si alguien edita la
petición desde la consola para pagar un céntimo, el servidor lo ignora. Hay una
prueba automática que lo comprueba en cada ejecución.

**2. El pedido pasa a «pagado» solo por webhook.** No al volver el cliente al
navegador. Si cierra la pestaña justo después de pagar —cosa que pasa— el pedido
se confirma igual porque la pasarela avisa al servidor por su cuenta.

**3. Cada aviso se procesa una sola vez.** Las pasarelas reintentan cuando no
reciben respuesta a tiempo. Sin control de idempotencia, un mismo pago
registraría el evento dos veces. Cada aviso queda anotado por su identificador y
el segundo se descarta.

Y una consecuencia importante: **si el pago se cancela o caduca, el stock vuelve
al catálogo automáticamente**. Sin eso, cada carrito abandonado dejaría unidades
bloqueadas para siempre.

---

## Probar hoy, sin contratar nada

La tienda sale configurada en `PAGO_PROVEEDOR=simulacion`. Al pagar con tarjeta se
abre una página de pago servida por la propia tienda, con dos botones: pagar o
cancelar. No cobra nada, no sale a internet y recorre exactamente el mismo camino
que la pasarela real: crear sesión, confirmar, cambiar estado, avisar al cliente.

Sirve para que la tienda practique el circuito completo antes de que exista
ninguna cuenta de Stripe.

---

## Pasar a Stripe en modo de pruebas

Sigue sin costar dinero y sin necesitar banco. Unos veinte minutos.

### 1. Crear la cuenta

Entra en `stripe.com`, crea una cuenta con correo y contraseña, y **quédate en
modo test** (hay un interruptor arriba en el panel). En modo test no piden NIF,
ni IBAN, ni verificación: eso solo hace falta para cobrar de verdad.

### 2. Copiar las claves

En el panel, *Desarrolladores → Claves de API*. Copia la clave secreta, que
empieza por `sk_test_`. Las claves de prueba nunca mueven dinero real.

### 3. Configurar la tienda

En el archivo `.env`:

```ini
PAGO_PROVEEDOR=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...     # sale en el paso siguiente
STRIPE_METODOS=card
URL_PUBLICA=http://localhost:3000
```

### 4. Recibir los avisos en local

El webhook tiene que llegar a tu ordenador, y Stripe no puede alcanzar tu
`localhost`. Para eso está la Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/pagos/webhook
```

Al arrancar, imprime un secreto que empieza por `whsec_`. Cópialo a
`STRIPE_WEBHOOK_SECRET` y reinicia la tienda. Deja esa terminal abierta mientras
pruebas.

### 5. Comprar con tarjetas de prueba

Arranca la tienda, añade algo a la cesta y paga con tarjeta. Stripe acepta unas
tarjetas ficticias que provocan cada resultado:

| Número | Qué pasa |
|---|---|
| `4242 4242 4242 4242` | El pago se aprueba |
| `4000 0000 0000 0002` | El banco lo rechaza |
| `4000 0025 0000 3155` | Pide autenticación 3D Secure |

Cualquier fecha futura y cualquier CVC valen. Comprueba estas cuatro cosas:

- El pedido pasa a **Pagado** en el panel de administración.
- El cliente lo ve en su página de seguimiento.
- Si cancelas el pago, el **stock vuelve** al catálogo.
- Si cierras la pestaña justo tras pagar, el pedido **se confirma igual**.

> Las tarjetas y los códigos de la CLI pueden cambiar. Si algo no coincide,
> consulta la documentación de Stripe, que es la fuente buena.

---

## Añadir Bizum

En España, Bizum convierte bastante mejor que la tarjeta. Actívalo en el panel de
Stripe (*Configuración → Métodos de pago*) y añádelo a la configuración:

```ini
STRIPE_METODOS=card,bizum
```

Un aviso para la tienda, no para el desarrollador: **desde 2026 los bancos
informan mensualmente a Hacienda de los cobros por Bizum que reciben las
empresas**, y se eliminó el mínimo anual que existía antes. No es un problema,
pero conviene que la gestoría lo sepa.

---

## Pasar a cobrar de verdad

1. En el panel de Stripe, completa la activación de la cuenta: NIF, actividad y
   la cuenta bancaria donde quieres recibir el dinero. Suele tardar de unas horas
   a un par de días.
2. Copia las claves **de producción** (empiezan por `sk_live_`).
3. Crea el webhook definitivo en *Desarrolladores → Webhooks*, apuntando a
   `https://tu-dominio.es/api/pagos/webhook`, y suscríbelo a estos eventos:
   `checkout.session.completed`, `checkout.session.expired` y `charge.refunded`.
4. Copia el nuevo `whsec_` de producción.
5. Pon `URL_PUBLICA` con el dominio real, con `https`.
6. **Haz una compra de verdad de un artículo barato** y devuélvetela. Es la única
   forma de estar seguro.

---

## Cambiar de pasarela

Los adaptadores están en `server/pagos/proveedores.js`. Añadir uno nuevo —Redsys,
por ejemplo— es escribir dos funciones: una que cree la sesión de pago y otra que
verifique la firma de sus avisos, y registrarlas en el objeto `CREADORES`. El
resto del sistema no se entera.

Redsys suele salir más barato con volumen, pero lo negocia el banco y su entorno
de pruebas es más áspero. Merece la pena cuando la tienda tenga cifras que
justifiquen la conversación.

---

## Si algo falla

**El webhook devuelve 400.** La firma no cuadra. Casi siempre es que el
`STRIPE_WEBHOOK_SECRET` no corresponde al webhook que está enviando el aviso: el
de la CLI y el del panel son distintos.

**El pago se cobra pero el pedido sigue pendiente.** El aviso no está llegando.
Míralo en *Desarrolladores → Webhooks*, donde Stripe muestra cada intento y la
respuesta que recibió.

**El pedido se queda pendiente para siempre.** Es un carrito abandonado. Stripe
manda `checkout.session.expired` al cabo de un rato y el stock se repone solo.

**Sale «Falta STRIPE_SECRET_KEY».** El `.env` no se está leyendo o la tienda no se
reinició tras editarlo.
