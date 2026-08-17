# Poner Globo en producción

Guía de principio a fin: registrar el dominio, publicar la tienda con HTTPS, cobrar de
verdad y cumplir con lo que exige la ley española para una tienda online.

Orden recomendado: **dominio → servidor → despliegue → HTTPS → pagos → correos → legal → copias**.

---

## 1. Registrar el dominio

### Elegir la extensión

| Extensión | Cuándo tiene sentido | Precio orientativo/año |
|---|---|---|
| `.es` | Vendes sobre todo en España. Transmite cercanía y es el que busca el cliente español. | 8–15 € |
| `.com` | Piensas vender fuera o quieres la opción por defecto que todo el mundo teclea. | 10–15 € |
| `.shop`, `.store` | Alternativas si el nombre está pillado. Menos reconocibles. | 20–40 € |

Lo habitual es **registrar `.es` y `.com` a la vez** y redirigir uno al otro. Cuestan poco
y evitan que alguien se quede con la versión que no compraste.

### Dónde registrarlo

- **Cloudflare Registrar** — lo vende a precio de coste, sin margen ni renovaciones infladas. No admite `.es`.
- **Dinahosting** (Santiago de Compostela) — soporte en español y por teléfono, buena opción para `.es`.
- **DonDominio / Nominalia** — clásicos del mercado español.
- **Namecheap / Porkbun** — baratos y correctos para `.com`.

Evita registradores que ofrezcan el primer año a 0,99 € y renueven a 25 €. Mira siempre el
**precio de renovación**, no el de alta.

### Al contratarlo, revisa esto

1. **Renovación automática activada.** Un dominio caducado tumba la tienda y el correo a la vez.
2. **Privacidad WHOIS.** En `.com` suele ser gratuita; ocúltala salvo que necesites lo contrario. En `.es` los datos de personas físicas ya están protegidos por defecto.
3. **Datos de titularidad correctos.** El titular debe ser tu empresa, no la agencia ni el desarrollador. Si un tercero registra el dominio a su nombre, el dominio es suyo.
4. **Bloqueo de transferencia** activado hasta que necesites moverlo.

### Qué NO necesitas todavía

No contrates el "hosting web" que te ofrecen junto al dominio. El alojamiento compartido
típico (Plesk, cPanel) sirve para WordPress, **no ejecuta aplicaciones Node.js**. Lo verás
en el paso siguiente.

---

## 2. Elegir el alojamiento

Globo es un proceso Node que debe estar siempre encendido, así que necesitas un **VPS**
o una **plataforma tipo PaaS**.

| Opción | Coste | Esfuerzo | Cuándo elegirla |
|---|---|---|---|
| **VPS** (Hetzner, DigitalOcean, Vultr, Clouding.io) | 4–8 €/mes | Medio: lo configuras tú una vez | Control total, precio imbatible, la base SQLite vive en un disco de verdad |
| **PaaS** (Railway, Render, Fly.io) | 5–20 €/mes | Bajo: conectas el repositorio y listo | No quieres administrar un servidor |
| **Hosting compartido** | 3 €/mes | — | **No sirve.** No ejecuta Node |

Con un VPS de 2 vCPU y 4 GB (unos 5 €/mes en Hetzner) vas sobrado para miles de visitas diarias.

> **Aviso sobre PaaS y SQLite:** muchas plataformas usan sistemas de ficheros efímeros que se
> borran en cada despliegue, y ahí perderías la base de datos. Si vas por esa vía, contrata un
> **volumen persistente** y apunta `DB_PATH` a él, o migra a PostgreSQL (ver sección 9).

---

## 3. Apuntar el dominio al servidor

En el panel DNS de tu registrador, crea dos registros con la IP pública del servidor:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `203.0.113.45` (tu IP) | 3600 |
| A | `www` | `203.0.113.45` | 3600 |

Si usas un PaaS, en lugar del segundo registro pondrán un `CNAME` hacia el host que te den.

La propagación tarda de unos minutos a unas horas. Compruébalo con:

```bash
dig +short modaglobo.es
```

**Recomendación:** pon los DNS en Cloudflare (plan gratuito). Ganas caché de imágenes,
protección básica ante ataques y cambios de DNS que se propagan en segundos.

---

## 4. Preparar el servidor

Sobre Ubuntu 24.04 recién instalado, conectado por SSH como root:

```bash
# Usuario sin privilegios para la aplicación
adduser globo && usermod -aG sudo globo

# Cortafuegos: solo SSH y web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx git

# Gestor de procesos
npm install -g pm2
```

Endurece el acceso SSH: entra solo con clave pública y desactiva el acceso de root
(`PermitRootLogin no` y `PasswordAuthentication no` en `/etc/ssh/sshd_config`).

---

## 5. Desplegar la tienda

Como usuario `globo`:

```bash
cd ~
git clone https://github.com/tu-usuario/globo.git   # o sube el ZIP y descomprímelo
cd globo

npm ci --omit=dev
cp .env.example .env
```

> Si ves un aviso de que `better-sqlite3` no ha podido compilarse, **no es un error**:
> es una dependencia opcional y la tienda funcionará con el SQLite incorporado de Node.
> Al arrancar, el servidor indica qué motor está usando. Para tener `better-sqlite3`,
> instala primero las herramientas de compilación: `sudo apt install build-essential python3`.

Edita `.env` y **cambia obligatoriamente**:

```bash
# Genera una clave larga y aleatoria:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```ini
PORT=3000
JWT_SECRET=<pega aquí la clave generada>
ADMIN_EMAIL=tucorreo@modaglobo.es
ADMIN_PASSWORD=<una contraseña larga y única>
ENVIO_ESTANDAR=4.95
ENVIO_GRATIS_DESDE=49
```

Carga los datos y arranca:

```bash
npm run seed
pm2 start server/index.js --name globo
pm2 save
pm2 startup          # ejecuta el comando que imprima, para que arranque tras un reinicio
```

Comprueba que responde en local antes de seguir:

```bash
curl -s localhost:3000/api/salud
```

**Entra en `/admin` y borra o renombra el cliente de ejemplo `cliente@ejemplo.es` y sus
tres pedidos de demostración** antes de abrir al público.

---

## 6. Nginx como proxy inverso

Crea `/etc/nginx/sites-available/globo`:

```nginx
server {
    listen 80;
    server_name modaglobo.es www.modaglobo.es;

    # Cabeceras de seguridad
    add_header X-Content-Type-Options   "nosniff" always;
    add_header X-Frame-Options          "SAMEORIGIN" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 10M;
    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;

    # Las imágenes de producto se sirven directamente y se cachean
    location /img/ {
        alias /home/globo/globo/public/img/;
        expires 30d;
        access_log off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Actívalo y recarga:

```bash
sudo ln -s /etc/nginx/sites-available/globo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. HTTPS gratuito

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d modaglobo.es -d www.modaglobo.es
```

Certbot reescribe la configuración, activa la redirección de `http` a `https` y renueva
solo cada 90 días. Verifica la renovación automática con `sudo certbot renew --dry-run`.

Sin HTTPS no puedes cobrar con tarjeta, y el navegador marcará la tienda como no segura.

---

## 8. Cobrar de verdad

El pago actual **está simulado**: el pedido se crea sin cargo. Antes de vender necesitas una
pasarela real.

| Pasarela | Comisión orientativa | Notas |
|---|---|---|
| **Stripe** | 1,5 % + 0,25 € (tarjetas europeas) | La más sencilla de integrar. Alta online en un día. |
| **Redsys** | La negocia tu banco (0,4–1 %) | Es lo que ofrecen BBVA, Santander, CaixaBank… Más barato con volumen, más burocrático. |
| **PayPal** | ~2,9 % + 0,35 € | Cómodo como método secundario. |
| **Bizum** | Vía Redsys o Stripe | Muy usado en España; conviene ofrecerlo. |

### Cómo encaja en este código

El punto de integración es `server/routes/pedidos.js`, en `POST /api/pedidos`. El flujo con
Stripe queda así:

1. El navegador envía la cesta. El servidor **calcula el importe** (ya lo hace) y crea un
   *PaymentIntent* con ese total.
2. Se guarda el pedido en estado `pendiente` con el identificador del intento.
3. El navegador confirma el pago con Stripe.js.
4. Stripe llama a un *webhook* tuyo. Ahí, y **solo ahí**, pasas el pedido a `pagado` y
   registras el evento.

Reglas que no conviene saltarse:

- **Nunca confíes en el importe que manda el navegador.** El servidor ya recalcula precios contra la base de datos; mantenlo así.
- **Confirma el cobro por webhook**, no en la respuesta del navegador: el cliente puede cerrar la pestaña.
- **No guardes números de tarjeta.** Que los datos vayan siempre a la pasarela, nunca a tu servidor.

Mientras tanto, `transferencia` y `contrareembolso` sí funcionan tal cual: gestionas el
cobro fuera y marcas el pedido como pagado desde el panel.

---

## 9. Correos de confirmación

La tienda muestra el número de pedido en pantalla, pero no envía correos. Para añadirlos:

- **Proveedor:** Resend, Postmark o Brevo. Los tres tienen plan gratuito suficiente para empezar. No envíes desde el propio servidor: acabarás en la carpeta de spam.
- **Autenticación:** configura **SPF, DKIM y DMARC** en el DNS del dominio. Sin esto, Gmail y Outlook filtrarán tus confirmaciones.
- **Dónde engancharlo:** justo después de crear el pedido (`POST /api/pedidos`) y en cada cambio de estado (`PUT /api/admin/pedidos/:codigo/estado`). Ambos puntos ya tienen todos los datos que necesita el correo.

Correos mínimos de una tienda: confirmación de pedido, aviso de envío con el número de
seguimiento, y confirmación de la devolución.

---

## 10. Cumplimiento legal en España

Esto no es asesoramiento jurídico: revísalo con un profesional. Lo que la ley exige a una
tienda online española:

**Identificación (LSSI-CE, art. 10).** Razón social, CIF, domicilio, correo y datos
registrales, accesibles desde cualquier página. Ya están maquetados en `/legal`; sustituye
los datos de ejemplo por los reales.

**Protección de datos (RGPD y LOPDGDD).**
- Política de privacidad con responsable, finalidades, bases jurídicas, plazos y derechos. Plantilla en `/legal#privacidad`.
- **Registro de actividades de tratamiento** interno. Ya no hay que inscribir ficheros en la AEPD, pero sí mantener este registro.
- **Contrato de encargado de tratamiento** con cada proveedor que toque datos: hosting, transportista, pasarela, proveedor de correo.
- La casilla de aceptación **no puede venir premarcada**, y el consentimiento comercial va separado del de la compra. Así está implementado en `/checkout`.

**Cookies.** Esta versión no instala cookies de analítica ni publicidad; usa almacenamiento
local para la cesta y la sesión, que es técnicamente necesario y no requiere banner. **En
cuanto añadas Google Analytics, el píxel de Meta o similares, necesitas banner de
consentimiento** conforme a la guía de la AEPD: rechazar debe ser tan fácil como aceptar.

**Derecho de desistimiento.** 14 días naturales desde la entrega, sin justificación, y hay
que informar antes de la compra y facilitar el formulario de desistimiento. Globo amplía
el plazo a 30 días como argumento comercial, lo cual es perfectamente válido.

**Garantía.** Tres años frente a faltas de conformidad en productos nuevos.

**Precios.** Con IVA incluido y gastos de envío visibles antes de confirmar el pedido. Si
anuncias una rebaja, el precio tachado debe ser el más bajo aplicado en los 30 días previos.

**Facturación.** Guarda las facturas seis años. Si trabajas con empresas, ten en cuenta el
calendario de facturación electrónica obligatoria y consulta con tu gestoría el estado
actual de la normativa, que ha ido cambiando de fechas.

**Menores.** Vendes ropa infantil, pero la compra la hace un adulto. No recojas datos de
menores y déjalo dicho en la política de privacidad.

---

## 11. Copias de seguridad

Toda la tienda cabe en un fichero: `data/globo.db`. No lo copies con `cp` mientras el
servidor escribe; usa el comando de respaldo de SQLite:

```bash
sudo apt install -y sqlite3

mkdir -p ~/copias
sqlite3 ~/globo/data/globo.db ".backup '$HOME/copias/globo-$(date +%F).db'"
```

Automatízalo a diario y **envía la copia fuera del servidor** (S3, Backblaze B2 o tu propio
equipo). Una copia que vive en la misma máquina que la base de datos no es una copia.

```bash
crontab -e
# 0 4 * * * sqlite3 /home/globo/globo/data/globo.db ".backup '/home/globo/copias/globo-$(date +\%F).db'"
```

Guarda también las imágenes de `public/img/productos/` y prueba a restaurar una copia de vez
en cuando: una copia que nunca se ha restaurado es una hipótesis, no un respaldo.

---

## 12. Actualizar la tienda

```bash
cd ~/globo
git pull
npm ci --omit=dev
pm2 restart globo
```

`npm run seed` **no** vuelve a cargar nada si ya hay artículos, así que es seguro ejecutarlo.
Lo que sí borra todo es `npm run reset`: no lo lances en producción.

Vigila los registros con `pm2 logs globo` y el estado con `pm2 monit`.

---

## 13. Cuando la tienda crezca

Señales de que toca dar el salto, y qué hacer en cada caso:

- **Varios administradores editando a la vez, o más de ~50 pedidos al día.** Migra a PostgreSQL. Toca `server/db.js` y adaptar las consultas; el esquema es prácticamente idéntico.
- **Catálogo con miles de referencias.** Añade índices por `nombre` y `descripcion`, o un buscador dedicado (Meilisearch, Typesense).
- **Muchas fotos y visitas internacionales.** Sirve las imágenes desde un CDN y conviértelas a WebP o AVIF.
- **Necesitas facturación, contabilidad y stock unificados.** Conecta con Holded o Sage a través de su API desde el punto donde se crea el pedido.
- **Quieres una app o un front con React/Astro.** No hace falta tocar nada: la API ya está separada del front y documentada en el README.

---

## Lista de comprobación antes de abrir

- [ ] Dominio registrado, con renovación automática y a nombre de la empresa
- [ ] DNS apuntando al servidor y propagado
- [ ] `JWT_SECRET` cambiado por una clave aleatoria larga
- [ ] Contraseña de administración cambiada
- [ ] Cliente y pedidos de ejemplo eliminados
- [ ] HTTPS activo y redirección desde `http`
- [ ] Cortafuegos activo, SSH solo con clave
- [ ] Pasarela de pago real integrada y probada en modo de pruebas
- [ ] Correos de confirmación funcionando, con SPF/DKIM/DMARC
- [ ] Datos reales en el aviso legal, privacidad y condiciones
- [ ] Plazos y costes de envío reales en `/ayuda`
- [ ] Fotografías reales sustituyendo las ilustraciones
- [ ] Copias de seguridad automáticas y fuera del servidor
- [ ] `pm2 save` y `pm2 startup` ejecutados
- [ ] Pedido de prueba completo: comprar, cobrar, cambiar estado y rastrear
