#!/bin/bash

# Obtener el directorio raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  Iniciando todos los servicios de Metaverso UPDS"
echo "============================================="

# Función para detener todos los procesos en segundo plano al presionar Ctrl+C
cleanup() {
    echo -e "\n\nDeteniendo todos los servicios en ejecución..."
    # Mata a todos los procesos hijos en el mismo grupo de procesos
    kill 0 2>/dev/null
    exit 0
}

# Capturar Ctrl+C (SIGINT) y SIGTERM
trap cleanup SIGINT SIGTERM EXIT

# 1. Levantar el servidor backend (puerto usualmente 5000/3000)
echo "🚀 Iniciando Backend (/server)..."
cd "$PROJECT_ROOT/server" && npm run dev &

# 2. Levantar el módulo de mundo3d-avatar (puerto secundario)
echo "🚀 Iniciando Mundo 3D Avatar (/mundo3d-avatar)..."
cd "$PROJECT_ROOT/mundo3d-avatar" && npm run dev &

# 3. Levantar la aplicación web principal (frontend principal)
echo "🚀 Iniciando Aplicación Web Principal (root)..."
cd "$PROJECT_ROOT" && npm run dev &

# Mantener el script en espera de los procesos en segundo plano
wait
