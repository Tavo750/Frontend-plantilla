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
  private readonly apiUrl    = `${environment.apiUrl}simulacion`;
  private readonly importUrl = `${environment.apiUrl}maestro/importacion`;

  constructor(private readonly http: HttpClient) {}

  /** Importa los planes de vuelo generando vuelos para el rango dado */
  importarVuelos(fechaInicio: string, dias: number): Observable<ApiResponse<any>> {
    const params = new HttpParams()
      .set('fechaInicio', fechaInicio)
      .set('dias', dias.toString());
    return this.http.post<ApiResponse<any>>(
      `${this.importUrl}/vuelos`,
      null,
      { params }
    );
  }

  /** Importa los envíos de todos los aeropuertos de _envios_preliminar_ para el rango dado */
  importarTodosEnvios(fechaInicio: string, dias: number): Observable<ApiResponse<any>> {
    const params = new HttpParams()
      .set('fechaInicio', fechaInicio)
      .set('dias', dias.toString());
    return this.http.post<ApiResponse<any>>(
      `${this.importUrl}/envios/todos`,
      null,
      { params }
    );
  }

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

  /** Cancela un vuelo por su código */
  cancelarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(
      `${environment.apiUrl}maestro/vuelos/${encodeURIComponent(codigoVuelo)}/cancelar`, null);
  }

  /** Reactiva un vuelo cancelado */
  reactivarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(
      `${environment.apiUrl}maestro/vuelos/${encodeURIComponent(codigoVuelo)}/reactivar`, null);
  }

  /** URL del endpoint SSE para usar con EventSource */
  getStreamUrl(fechaInicio: string, horaInicio: string, dias: number): string {
    return `${this.apiUrl}/periodo/stream?fechaInicio=${fechaInicio}&horaInicio=${horaInicio}&dias=${dias}`;
  }

  /** Obtiene la fecha mínima de datos disponibles desde monitoreo */
  obtenerFechaMinima(): Observable<Date> {
    return new Observable(observer => {
      this.http.get<ApiResponse<any>>(`${this.apiUrl}/monitoreo/estado`).subscribe({
        next: (resp) => {
          if (resp.data?.relojSim) {
            const relojSim = resp.data.relojSim;
            const partes = relojSim.split('T');
            if (partes.length === 2) {
              const fecha = new Date(partes[0]);
              observer.next(fecha);
              observer.complete();
              return;
            }
          }
          observer.next(new Date('2026-01-02'));
          observer.complete();
        },
        error: () => {
          observer.next(new Date('2026-01-02'));
          observer.complete();
        }
      });
    });
  }
}
