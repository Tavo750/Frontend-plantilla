export interface SimulacionPeriodoResponse {
  status: number;
  message: string;
  data: SimulacionPeriodoData;
}

export interface SimulacionPeriodoData {
  resumen: ResumenSimulacionPeriodo;
  eventos: EventoSimulacionPeriodo[];
}

export interface ResumenSimulacionPeriodo {
  fechaInicio: string;
  dias: number;
  totalEnvios: number;
  enviosAsignados: number;
  enviosNoAsignados: number;
  totalMaletas: number;
  maletasAsignadas: number;
  maletasNoAsignadas: number;
  vuelosUtilizados: number;
}

export interface EventoSimulacionPeriodo {
  idEnvio: number;
  origen: string;
  destino: string;
  cantidad: number;
  estado: string;
  codigoVuelo?: string;
  horaSalida?: string;
  horaLlegada?: string;
  motivo?: string;
}