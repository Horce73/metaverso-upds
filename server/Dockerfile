FROM node:20-alpine

WORKDIR /app

# Copiar archivos de definición de paquetes
COPY package*.json ./

# Instalar todas las dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Compilar TypeScript a JavaScript
RUN npm run build

# Exponer el puerto del backend
EXPOSE 3001

# Definir la variable de entorno por defecto para PostgreSQL en Docker Compose
ENV PORT=3001
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/metaverso_upds

CMD ["npm", "start"]
