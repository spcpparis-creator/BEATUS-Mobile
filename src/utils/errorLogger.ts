/**
 * Logger d'erreurs ultra-détaillé avec fichier, ligne et contexte
 */
export function logErrorDetailed(
  opts: {
    file: string;
    line: number;
    function: string;
    code?: string;
    message: string;
    error?: Error | unknown;
    context?: Record<string, unknown>;
  }
) {
  const err = opts.error instanceof Error ? opts.error : new Error(String(opts.error));
  const stack = err.stack || new Error().stack || '';
  const timestamp = new Date().toISOString();

  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  ERREUR DÉTAILLÉE - Source et contexte                            ║');
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  console.error(`║  Fichier    : ${opts.file}`);
  console.error(`║  Ligne      : ${opts.line}`);
  console.error(`║  Fonction   : ${opts.function}`);
  if (opts.code) {
    console.error(`║  Code       : ${opts.code}`);
  }
  console.error(`║  Message    : ${opts.message}`);
  console.error(`║  Timestamp  : ${timestamp}`);
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  if (opts.context && Object.keys(opts.context).length > 0) {
    console.error('║  Contexte   :');
    Object.entries(opts.context).forEach(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
      const lines = val.split('\n');
      lines.forEach((l, i) => {
        console.error(`║    ${i === 0 ? k + ': ' : ''}${l}`);
      });
    });
  }
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  console.error('║  Stack trace:');
  stack.split('\n').slice(0, 15).forEach(line => {
    console.error(`║    ${line.trim()}`);
  });
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  console.error('');
}
