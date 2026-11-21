let transportPromise = null;

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function getTransport() {
  if (!mailConfigured()) return null;
  if (!transportPromise) {
    transportPromise = (async () => {
      try {
        const nodemailer = (await import('nodemailer')).default;
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
            : undefined,
        });
      } catch (err) {
        console.error('[mail] no se pudo inicializar el envío de correos:', err.message);
        return null;
      }
    })();
  }
  return transportPromise;
}

export async function sendPasswordReset(to, link) {
  const transport = await getTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'CHANGAPP - Recuperá tu contraseña',
      text: `Recibimos un pedido para restablecer tu contraseña.\n\nIngresá a este enlace (válido por 1 hora):\n${link}\n\nSi no fuiste vos, ignorá este mensaje.`,
      html: `<p>Recibimos un pedido para restablecer tu contraseña de CHANGAPP.</p><p><a href="${link}">Restablecer contraseña</a> (válido por 1 hora)</p><p>Si no fuiste vos, ignorá este mensaje.</p>`,
    });
    return true;
  } catch (err) {
    console.error('[mail] error al enviar correo:', err.message);
    return false;
  }
}

export async function sendWelcome(to, name) {
  const transport = await getTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Bienvenido a CHANGAPP',
      text: `Hola ${name}, tu cuenta de CHANGAPP está lista. Conectamos personas con oportunidades.`,
    });
    return true;
  } catch {
    return false;
  }
}
