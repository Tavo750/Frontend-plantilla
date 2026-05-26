import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface TramoSimulacion {
  orden: number;
  codigoVuelo: string;
  origen: string;
  destino: string;
  horaSalida: string;
  horaLlegada: string;
}

export interface EventoSimulacion {
  idEnvio: number;
  origen: string;
  destino: string;
  cantidad: number;
  prioridad: number;
  estado: 'ASIGNADO' | 'NO_ASIGNADO_ARRASTRE';
  cumpleSla?: boolean;
  idPlanRuta?: number;
  motivo?: string;
  tramos?: TramoSimulacion[];
}

export interface ResumenSimulacion {
  idConfiguracion: number;
  idResultado: number;
  fechaInicio: string;
  dias: number;
  diasProcesados: number;
  totalEnviosProcesados: number;
  enviosAsignados: number;
  enviosNoAsignadosFinales: number;
  totalMaletasFisicas: number;
  maletasFisicasAsignadas: number;
  violacionesSLA: number;
  costoAcumulado: number;
  tasaAsignacion: number;
  tiempoTotalMs: number;
}

export interface ResultadoSimulacion {
  resumen: ResumenSimulacion;
  eventos: EventoSimulacion[];
}

export interface DiaSimulacion {
  dia: number;
  fecha: string;
  eventos: EventoSimulacion[];
  estadisticas: {
    enviosAProcesar: number;
    asignados: number;
    noAsignados: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SimulacionService {
  private readonly apiUrl = `${environment.apiUrl}simulacion`;

  constructor(private readonly http: HttpClient) {}

  /** Endpoint batch (devuelve todo de una vez) */
  simularPeriodo(fechaInicio: string, dias: number): Observable<ApiResponse<any>> {
    const params = new HttpParams()
      .set('fechaInicio', fechaInicio)
      .set('dias', dias.toString());

    return this.http.post<ApiResponse<any>>(
      `${this.apiUrl}/periodo`,
      null,
      { params }
    );
  }

  /** URL del endpoint SSE para usar con EventSource */
  getStreamUrl(fechaInicio: string, dias: number): string {
    return `${this.apiUrl}/periodo/stream?fechaInicio=${fechaInicio}&dias=${dias}`;
  }
}
