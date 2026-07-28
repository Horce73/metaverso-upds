#!/bin/bash

# Obtener el directorio raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  Iniciando todos los servicios de Metaverso UPDS"
echo "============================================="

# 0. Levantar la base de datos con Docker Compose
echo "🏗️  Iniciando Base de Datos con Docker Compose..."
docker compose up -d db

if [ $? -ne 0 ]; then
    echo "❌ Error al levantar la base de datos. Saliendo..."
    exit 1
fi

# Esperar un momento para asegurar que la base de datos esté lista
echo "⏳ Esperando a que la base de datos esté lista..."
sleep 5

# 1. Levantar el servidor backend
echo "🚀 Iniciando Backend (/server)..."
cd "$PROJECT_ROOT/server" && npm run dev &
BACKEND_PID=$!

# 2. Levantar la aplicación web principal unificada (Frontend principal)
echo "🚀 Iniciando Aplicación Web Principal Unificada (root)..."
cd "$PROJECT_ROOT" && npm run dev &
FRONTEND_PID=$!

# Función para detener los procesos al presionar Ctrl+C
cleanup() {
    echo -e "\nDeteniendo todos los servicios en ejecución..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    docker compose down
    exit 0
}

# Capturar Ctrl+C (SIGINT) y SIGTERM    
trap cleanup SIGINT SIGTERM

# Mantener el script en espera de los procesos en segundo plano
wait
