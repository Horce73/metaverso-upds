# Etapa 1: Build de la aplicación React con Vite
FROM node:20-alpine AS build

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código del proyecto
COPY . .

# Compilar la aplicación para producción (genera la carpeta /app/dist)
RUN npm run build

# Etapa 2: Servidor Nginx de alta eficiencia
FROM nginx:alpine

# Copiar los archivos estáticos compilados desde la etapa de build
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer el puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
