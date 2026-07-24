#!/bin/bash

# Obtener el directorio raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  Iniciando todos los servicios de Metaverso UPDS"
echo "============================================="

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
    exit 0
}

# Capturar Ctrl+C (SIGINT) y SIGTERM
trap cleanup SIGINT SIGTERM

# Mantener el script en espera de los procesos en segundo plano
wait
