import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

function Doc({ title, children }) {
  return (
    <div className="page narrow">
      <Link to="/" className="back-link">
        <ChevronLeft size={17} /> Volver
      </Link>
      <article className="card prose">
        <h1>{title}</h1>
        {children}
      </article>
    </div>
  );
}

export function Terms() {
  return (
    <Doc title="Términos y condiciones">
      <p className="muted small">Última actualización: {new Date().toLocaleDateString('es-AR')}</p>
      <h2>1. Qué es CHANGAPP</h2>
      <p>
        CHANGAPP es una plataforma que conecta personas que necesitan contratar un trabajo ocasional ("changa") con personas que ofrecen sus
        servicios. CHANGAPP no es empleador, no participa de la relación entre las partes y no intermedia en pagos.
      </p>
      <h2>2. Requisitos de uso</h2>
      <p>
        Para usar CHANGAPP tenés que ser mayor de 18 años, tener capacidad legal para contratar y proporcionar información verdadera. Está prohibido
        crear cuentas falsas, suplantar identidades o publicar contenido engañoso.
      </p>
      <h2>3. Publicaciones y postulaciones</h2>
      <p>
        Quien publica una changa debe describir con exactitud la tarea, el pago total ofrecido, la fecha y la zona aproximada. Quien se postula debe
        comprometerse a realizar el trabajo en las condiciones acordadas. El pago total es el monto que recibe la persona que realiza la changa.
      </p>
      <h2>4. Conducta</h2>
      <p>
        No se permite el acoso, la discriminación, las amenazas, la publicación de datos personales de terceros, las estafas ni los contenidos
        ilegales. CHANGAPP puede suspender cuentas y moderar publicaciones que incumplan estas reglas.
      </p>
      <h2>5. Pagos</h2>
      <p>
        En esta primera versión CHANGAPP no procesa pagos, no cobra comisiones y no retiene dinero. El pago de la changa se acuerda y se realiza
        directamente entre las partes, fuera de la plataforma.
      </p>
      <h2>6. Responsabilidad</h2>
      <p>
        CHANGAPP ofrece la infraestructura tecnológica para el encuentro entre las partes. Cada usuario es responsable de verificar la identidad, las
        condiciones y la seguridad de la contratación. Recomendamos acordar por escrito los detalles y coordinar en lugares públicos.
      </p>
      <h2>7. Reputación</h2>
      <p>
        Las calificaciones solo pueden emitirse entre participantes de trabajos completados. Las reseñas falsas o manipuladas pueden ser eliminadas y
        derivar en la suspensión de la cuenta.
      </p>
      <h2>8. Contacto</h2>
      <p>Para consultas sobre estos términos podés escribir a soporte desde la sección de configuración de tu perfil.</p>
    </Doc>
  );
}

export function Privacy() {
  return (
    <Doc title="Política de privacidad">
      <p className="muted small">Última actualización: {new Date().toLocaleDateString('es-AR')}</p>
      <h2>1. Datos que guardamos</h2>
      <p>
        Nombre, apellido, email, fecha de nacimiento (para verificar la mayoría de edad), contraseña cifrada, foto de perfil opcional, presentación,
        provincia y localidad elegidas, y la actividad dentro de la plataforma: publicaciones, postulaciones, mensajes, calificaciones y reportes.
      </p>
      <h2>2. Qué no mostramos públicamente</h2>
      <p>
        Tu email nunca se muestra a otros usuarios. Tu domicilio exacto no se publica: las changas muestran únicamente la localidad y, cuando existe,
        una distancia aproximada. Las conversaciones solo son visibles para sus dos participantes.
      </p>
      <h2>3. Ubicación</h2>
      <p>
        Si elegís usar tu ubicación actual, pedimos permiso al navegador una sola vez y guardamos las coordenadas para calcular distancias y ordenar
        los resultados. Podés rechazar el permiso y elegir tu localidad manualmente en cualquier momento.
      </p>
      <h2>4. Seguridad</h2>
      <p>
        Las contraseñas se almacenan con hash y nunca en texto plano. Las sesiones se mantienen con cookies firmadas, HttpOnly y SameSite. Todas las
        operaciones sensibles se validan en el servidor.
      </p>
      <h2>5. Tus derechos</h2>
      <p>
        Podés modificar tus datos, cambiar tu ubicación, ocultar tu perfil público, desactivar notificaciones y solicitar la eliminación de tu cuenta
        escribiendo a soporte.
      </p>
      <h2>6. Conservación</h2>
      <p>
        Conservamos el historial de trabajos, mensajes y calificaciones mientras la cuenta esté activa, porque es necesario para la reputación de la
        comunidad y para la resolución de reclamos.
      </p>
    </Doc>
  );
}

export default function Legal({ kind }) {
  return kind === "privacy" ? <Privacy /> : <Terms />;
}
