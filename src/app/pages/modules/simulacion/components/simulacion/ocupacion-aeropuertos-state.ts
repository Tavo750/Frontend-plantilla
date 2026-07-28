export interface OcupacionAeropuertoSnapshot {
  ocupacionActual: number;
  capacidadMaxima: number;
  porcentaje: number;
  entradas: number;
  salidas: number;
}

export interface ResultadoOcupaciones {
  aplicado: boolean;
  ocupaciones: Map<string, OcupacionAeropuertoSnapshot>;
  tiempoSimulacionMs: number;
}

export function aplicarUpdateOcupaciones(
  actuales: Map<string, OcupacionAeropuertoSnapshot>,
  payload: Record<string, unknown> | null | undefined,
  tiempoSimulacionMs: number,
  ultimoTiempoMs: number,
  colapsada: boolean
): ResultadoOcupaciones {
  if (!payload || typeof payload !== 'object' || colapsada
      || (tiempoSimulacionMs > 0 && tiempoSimulacionMs < ultimoTiempoMs)) {
    return { aplicado: false, ocupaciones: actuales, tiempoSimulacionMs: ultimoTiempoMs };
  }

  const ocupaciones = new Map<string, OcupacionAeropuertoSnapshot>();
  Object.entries(payload).forEach(([codigo, valor]) => {
    if (!valor || typeof valor !== 'object') return;
    const raw = valor as Record<string, unknown>;
    const ocupacionActual = Number(raw['ocupacionActual']);
    const capacidadMaxima = Number(raw['capacidadMaxima']);
    if (!Number.isFinite(ocupacionActual) || !Number.isFinite(capacidadMaxima)) return;
    const porcentajeRecibido = Number(raw['porcentaje']);
    ocupaciones.set(codigo, {
      ocupacionActual,
      capacidadMaxima,
      porcentaje: Number.isFinite(porcentajeRecibido)
        ? porcentajeRecibido
        : capacidadMaxima > 0 ? ocupacionActual * 100 / capacidadMaxima : 0,
      entradas: Number(raw['entradas']) || 0,
      salidas: Number(raw['salidas']) || 0
    });
  });

  return {
    aplicado: true,
    ocupaciones,
    tiempoSimulacionMs: tiempoSimulacionMs || ultimoTiempoMs
  };
}

export function aplicarColapsoOcupacion(
  actuales: Map<string, OcupacionAeropuertoSnapshot>,
  codigo: string,
  ocupacionActual: number,
  capacidadMaxima: number
): Map<string, OcupacionAeropuertoSnapshot> {
  const ocupaciones = new Map(actuales);
  const anterior = ocupaciones.get(codigo);
  ocupaciones.set(codigo, {
    ocupacionActual,
    capacidadMaxima,
    porcentaje: capacidadMaxima > 0 ? ocupacionActual * 100 / capacidadMaxima : 0,
    entradas: anterior?.entradas ?? 0,
    salidas: anterior?.salidas ?? 0
  });
  return ocupaciones;
}
