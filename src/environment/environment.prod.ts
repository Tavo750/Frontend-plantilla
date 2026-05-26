export const environment = {
  production: true,

  // ── Producción ────────────────────────────────────────────────────────────
  // Las URLs son RELATIVAS al dominio actual (sin host ni puerto).
  // Nginx escucha en el puerto 80 y redirige el tráfico de /api/*
  // hacia el backend interno en http://127.0.0.1:8080/.
  // De esta forma nunca se expone el puerto 8080 al exterior.
  apiUrl: '/api/',       // Peticiones generales  → Nginx → :8080/api/
  authUrl: '/api/auth/', // Peticiones de auth     → Nginx → :8080/auth/
};
