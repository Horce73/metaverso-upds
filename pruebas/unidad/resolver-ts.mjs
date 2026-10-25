// El código fuente importa './modulo.js' (lo que exige la compilación a ESM),
// pero en las pruebas se carga el .ts directo con el borrado de tipos de Node.
// Este hook resuelve './x.js' a './x.ts' cuando el .js no existe.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { existsSync } from 'node:fs';
      import { fileURLToPath } from 'node:url';
      export async function resolve(especificador, contexto, siguiente) {
        if (especificador.startsWith('.') && especificador.endsWith('.js') && contexto.parentURL?.endsWith('.ts')) {
          const comoTs = new URL(especificador.slice(0, -3) + '.ts', contexto.parentURL);
          if (!existsSync(new URL(especificador, contexto.parentURL)) && existsSync(fileURLToPath(comoTs))) {
            return siguiente(comoTs.href, contexto);
          }
        }
        return siguiente(especificador, contexto);
      }
    `),
  import.meta.url
);
