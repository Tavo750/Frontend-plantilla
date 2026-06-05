export const environment = {
  production: true,

  // ── Producción (Dokploy) ───────────────────────────────────────────────────
  // El frontend corre en su propio contenedor Docker administrado por Dokploy.
  // El backend corre en un contenedor separado y se expone públicamente
  // a través del dominio generado por Dokploy (sslip.io).
  // El navegador hace las peticiones directamente al backend; Nginx solo
  // sirve los archivos estáticos de Angular (SPA).
  apiUrl:  'http://backend7g-tasfb2bbackend-fvm1gb-41d9b0-200-16-7-153.sslip.io/api/',
  authUrl: 'http://frontend7g-tasfb2bfrontend-fvm1gb-41d9b0-200-16-7-153.sslip.io/auth',
};
