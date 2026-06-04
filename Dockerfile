# ==============================================================================
#  Stage 1 — Build Angular
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifiestos primero para aprovechar la caché de Docker
COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps

# Copiar el resto del código fuente
COPY . .

# Build de producción
RUN npm run build -- --configuration production

# ==============================================================================
#  Stage 2 — Servidor Nginx (imagen mínima)
# ==============================================================================
FROM nginx:1.27-alpine AS runner

# Eliminar configuración por defecto de Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar nuestra configuración personalizada
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copiar el build de Angular al directorio de Nginx
COPY --from=builder /app/dist/frontend-plantilla/browser /usr/share/nginx/html

# Nginx escucha en el puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
