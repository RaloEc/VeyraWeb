import React, { useState } from 'react';
import {
  ArrowLeft,
  Shield,
  FileText,
  Trash2,
  Mail,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

type LegalRoute = 'privacy' | 'terms' | 'delete';

interface LegalLayoutProps {
  active: LegalRoute;
  title: string;
  subtitle: string;
  updatedAt: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({
  active,
  title,
  subtitle,
  updatedAt,
  children,
}) => {
  const navItems: Array<{ key: LegalRoute; href: string; label: string; icon: React.ReactNode }> = [
    {
      key: 'privacy',
      href: '/privacy',
      label: 'Privacidad',
      icon: <Shield className="w-3.5 h-3.5" />,
    },
    {
      key: 'terms',
      href: '/terms',
      label: 'Términos',
      icon: <FileText className="w-3.5 h-3.5" />,
    },
    {
      key: 'delete',
      href: '/delete-account',
      label: 'Eliminar cuenta',
      icon: <Trash2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-veyra-canvas text-veyra-text flex flex-col">
      <header className="border-b border-veyra-border bg-veyra-card/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-veyra-muted hover:text-veyra-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Veyra</span>
          </a>

          <nav className="flex items-center gap-1.5 flex-wrap">
            {navItems.map((item) => {
              const isActive = item.key === active;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    isActive
                      ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                      : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="bg-veyra-card border border-veyra-border rounded-xl p-6 sm:p-8 shadow-elevated space-y-6">
          <div className="border-b border-veyra-border pb-5 space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-veyra-elevated border border-veyra-border text-[11px] uppercase tracking-wider text-veyra-muted">
              <span>Veyra Legal</span>
              <span>•</span>
              <span>Solo mayores de 18 años</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-veyra-text">
              {title}
            </h1>
            <p className="text-sm text-veyra-muted">{subtitle}</p>
            <p className="text-xs text-veyra-subtle">Última actualización: {updatedAt}</p>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-veyra-muted">
            {children}
          </div>
        </div>
      </main>

      <footer className="border-t border-veyra-border py-6 text-center text-xs text-veyra-subtle px-4">
        <p>
          Veyra — Contacto de privacidad:{' '}
          <a href="mailto:soporte@veyra.app" className="text-teal-400 hover:underline">
            soporte@veyra.app
          </a>
        </p>
      </footer>
    </div>
  );
};

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <LegalLayout
      active="privacy"
      title="Política de Privacidad"
      subtitle="Transparencia sobre cómo recopilamos, procesamos, sincronizamos y protegemos tu información en Veyra Web y Android."
      updatedAt="25 de noviembre de 2026"
    >
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">1. Alcance y requisito de edad (+18)</h2>
        <p>
          Veyra es una plataforma de productividad (notas, recordatorios, agenda y asistente con inteligencia
          artificial) destinada exclusivamente a personas mayores de <strong className="text-veyra-text">18 años</strong>.
          Al registrarte confirmas tu mayoría de edad, registrándose la fecha de aceptación y verificación en tu cuenta
          para cumplimiento normativo (LOPDP de Ecuador y RGPD).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">2. Datos que recopilamos</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-veyra-text">Cuenta y perfil:</strong> correo electrónico, nombre visible,
            configuración de tema/idioma y registro auditable de consentimientos (<code className="text-xs">user_consents</code>).
          </li>
          <li>
            <strong className="text-veyra-text">Contenido de productividad:</strong> notas enriquecidas, carpetas,
            recordatorios, eventos de calendario, etiquetas y archivos adjuntos cargados por el usuario.
          </li>
          <li>
            <strong className="text-veyra-text">Metadatos técnicos y notificaciones:</strong> suscripciones Web Push o
            tokens de notificación del dispositivo (Expo/FCM) para entregar alertas programadas.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">3. Cómo protegemos tus datos (sin afirmaciones engañosas)</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-veyra-text">Cifrado en tránsito:</strong> toda comunicación entre las aplicaciones
            (Web y Android) y nuestros servidores se realiza exclusivamente mediante <strong className="text-veyra-text">HTTPS / TLS</strong>.
            El tráfico HTTP en texto plano está deshabilitado.
          </li>
          <li>
            <strong className="text-veyra-text">Control de acceso en servidor:</strong> la base de datos en Supabase
            aplica políticas estrictas de seguridad a nivel de fila (<strong className="text-veyra-text">RLS</strong>) y
            los tokens OAuth de integraciones externas se almacenan cifrados mediante <strong className="text-veyra-text">Supabase Vault</strong>.
          </li>
          <li>
            <strong className="text-veyra-text">Alcance real del cifrado:</strong> Veyra <strong className="text-veyra-text">no implementa cifrado de extremo a extremo (E2EE)</strong>{' '}
            sobre el contenido de las notas ni cifrado a nivel de base de datos local (SQLite en Android / IndexedDB en Web),
            con el fin de permitir sincronización colaborativa, respaldo en la nube y funciones opcionales de IA bajo tu sesión autenticada.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">4. Servicios de terceros e integraciones</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-veyra-text">Inteligencia Artificial (Google Gemini API):</strong> cuando invocas el
            asistente de IA dentro de Veyra, el texto o contexto de la nota/consulta que envíes se transmite a la API de
            Google Gemini a través de nuestras Edge Functions autenticadas para generar resúmenes, borradores o respuestas.
            No se envía contenido a Gemini de forma pasiva si no utilizas las herramientas de IA.
          </li>
          <li>
            <strong className="text-veyra-text">Google Drive (opcional):</strong> si vinculas tu cuenta de Google Drive,
            Veyra utiliza permisos limitados para consultar y adjuntar únicamente los archivos que selecciones (modo de lectura
            vía proxy autenticado). Puedes revocar esta integración en cualquier momento desde Ajustes o tu cuenta de Google.
          </li>
          <li>
            <strong className="text-veyra-text">Sincronización colaborativa (Yjs y Supabase Realtime):</strong> al compartir
            o editar una nota colaborativa, las actualizaciones CRDT se intercambian mediante canales privados autenticados de
            Supabase Realtime exclusivamente con los colaboradores autorizados por el propietario de la nota.
          </li>
          <li>
            <strong className="text-veyra-text">Infraestructura:</strong> Supabase Inc. (autenticación, base de datos PostgreSQL,
            almacenamiento y Edge Functions) y Vercel Inc. (alojamiento de la aplicación Web). No vendemos datos personales a terceros.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">5. Derechos del titular y eliminación de datos</h2>
        <p>
          Conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP — Ecuador) y al RGPD, tienes derecho a acceder,
          rectificar, actualizar, portar y eliminar tus datos personales. Puedes eliminar tu cuenta y todos tus datos de
          forma inmediata siguiendo las instrucciones en{' '}
          <a href="/delete-account" className="text-teal-400 hover:underline font-medium">
            /delete-account
          </a>{' '}
          o escribiendo a{' '}
          <a href="mailto:soporte@veyra.app" className="text-teal-400 hover:underline font-medium">
            soporte@veyra.app
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
};

export const TermsPage: React.FC = () => {
  return (
    <LegalLayout
      active="terms"
      title="Términos de Servicio"
      subtitle="Condiciones de uso aplicables a la plataforma Veyra en Web y Android."
      updatedAt="25 de noviembre de 2026"
    >
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">1. Elegibilidad (+18 años obligatorio)</h2>
        <p>
          El acceso y creación de cuenta en Veyra están estrictamente restringidos a personas mayores de{' '}
          <strong className="text-veyra-text">18 años</strong> con capacidad legal para contratar. Este requisito es
          obligatorio tanto por responsabilidad legal como por las condiciones de servicio de las funciones de
          inteligencia artificial integradas mediante Google Gemini API.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">2. Cuenta y seguridad</h2>
        <p>
          Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de toda actividad realizada
          bajo tu cuenta. Debes proporcionar información veraz y no utilizar el servicio para distribuir contenido ilícito,
          malicioso o automatizar abusos contra nuestra infraestructura o la de nuestros proveedores.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">3. Propiedad del contenido</h2>
        <p>
          Conservas todos los derechos sobre las notas, recordatorios, archivos y documentos que creas o subes a Veyra.
          Nos concedes únicamente una licencia técnica limitada y revocable para almacenar, sincronizar y procesar dicho
          contenido con el fin exclusivo de prestarte el servicio que solicitas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">4. Funciones de Inteligencia Artificial y servicios externos</h2>
        <p>
          Las respuestas generadas mediante Google Gemini API tienen carácter asistencial y pueden contener imprecisiones;
          debes revisarlas antes de utilizarlas para decisiones críticas. Las integraciones opcionales con Google Drive
          dependen de los permisos que autorices y de la disponibilidad de los servicios de Google.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">5. Cancelación y eliminación</h2>
        <p>
          Puedes dejar de usar Veyra y eliminar permanentemente tu cuenta en cualquier momento desde la aplicación o
          visitando{' '}
          <a href="/delete-account" className="text-teal-400 hover:underline font-medium">
            /delete-account
          </a>
          . Consulta también nuestra{' '}
          <a href="/privacy" className="text-teal-400 hover:underline font-medium">
            Política de Privacidad
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
};

export const DeleteAccountPage: React.FC = () => {
  const [requestEmail, setRequestEmail] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleManualRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim()) return;
    const subject = encodeURIComponent('Solicitud de eliminación de cuenta Veyra');
    const body = encodeURIComponent(
      `Hola equipo de Veyra,\n\nSolicito la eliminación permanente de mi cuenta y todos mis datos asociados.\n\nCorreo registrado: ${requestEmail.trim()}\nMotivo (opcional): ${requestReason.trim() || 'No especificado'}\n`
    );
    setSubmitted(true);
    window.location.href = `mailto:soporte@veyra.app?subject=${subject}&body=${body}`;
  };

  return (
    <LegalLayout
      active="delete"
      title="Eliminación de Cuenta y Datos"
      subtitle="Instrucciones directas para eliminar tu cuenta de Veyra Web y Android de forma permanente."
      updatedAt="25 de noviembre de 2026"
    >
      <section className="p-4 rounded-lg bg-red-500/10 border border-red-500/25 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-veyra-text space-y-1">
          <p className="font-semibold">Acción permanente e irreversible</p>
          <p className="text-veyra-muted">
            La eliminación de tu cuenta borra de forma inmediata tus datos en nuestros servidores sin período de retención
            posterior. Una vez confirmada, la cuenta no puede recuperarse.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-veyra-text">1. Cómo eliminar tu cuenta desde la aplicación (Web y Android)</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Inicia sesión en <strong className="text-veyra-text">Veyra</strong> (Web o aplicación móvil Android).</li>
          <li>Abre el menú de <strong className="text-veyra-text">Ajustes / Configuración</strong> (o <strong className="text-veyra-text">Mi Perfil</strong> en Android).</li>
          <li>Dirígete a la sección de <strong className="text-veyra-text">Cuenta</strong> / <strong className="text-veyra-text">Zona de Riesgo</strong>.</li>
          <li>Selecciona <strong className="text-veyra-text">Eliminar cuenta definitivamente</strong> y sigue la confirmación solicitada.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-veyra-text">2. Datos que se eliminan al confirmar</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Credenciales de autenticación (<code className="text-xs">auth.users</code>), perfil y registro de consentimientos.</li>
          <li>Todas tus notas, instantáneas Yjs, carpetas, recordatorios, etiquetas y eventos de calendario propios.</li>
          <li>Archivos adjuntos almacenados en Supabase Storage y vinculaciones/tokens OAuth de Google Drive.</li>
          <li>Suscripciones de notificaciones push y cachés locales del navegador (IndexedDB/localStorage) o dispositivo (SQLite).</li>
        </ul>
      </section>

      <section className="space-y-3 pt-2 border-t border-veyra-border">
        <h2 className="text-base font-semibold text-veyra-text">3. Solicitar eliminación si no tienes acceso a la app</h2>
        <p>
          Si ya desinstalaste la aplicación o no puedes iniciar sesión, completa este formulario para abrir una solicitud
          directa hacia nuestro equipo de privacidad (<strong className="text-veyra-text">soporte@veyra.app</strong>).
        </p>

        <form onSubmit={handleManualRequest} className="space-y-3 bg-veyra-elevated/50 border border-veyra-border rounded-lg p-4">
          <div>
            <label className="block text-xs font-medium text-veyra-text mb-1">
              Correo electrónico de la cuenta a eliminar
            </label>
            <input
              type="email"
              required
              value={requestEmail}
              onChange={(e) => setRequestEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-3 py-2 rounded-md bg-veyra-card border border-veyra-border text-sm text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-veyra-text mb-1">
              Comentarios adicionales (opcional)
            </label>
            <textarea
              rows={2}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Ej.: No tengo acceso al dispositivo donde inicié sesión."
              className="w-full px-3 py-2 rounded-md bg-veyra-card border border-veyra-border text-sm text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-teal-500"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium transition-colors"
          >
            <Mail className="w-4 h-4" />
            <span>Generar solicitud de eliminación</span>
          </button>

          {submitted && (
            <div className="flex items-center gap-2 text-xs text-teal-400 pt-1">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Se abrió tu cliente de correo. Si no se abrió automáticamente, escribe desde tu correo registrado a{' '}
                <a href="mailto:soporte@veyra.app" className="underline">
                  soporte@veyra.app
                </a>
                .
              </span>
            </div>
          )}
        </form>
      </section>
    </LegalLayout>
  );
};
