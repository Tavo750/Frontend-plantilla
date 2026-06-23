import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface PlanVueloDiario {
  id: number;
  codigoOrigen: string;
  codigoDestino: string;
  horaSalida: string;
  horaLlegada: string;
  capacidad: number;
  estadoVuelo?: string;
  ciudadOrigen?: string;
  ciudadDestino?: string;
  codigoVuelo?: string;
  totalMaletas?: number;
  ocupacionPct?: number;
  semaforo?: string;
  origen?: string;
  destino?: string;
}

@Injectable({ providedIn: 'root' })
export class PlanVueloService {

  private readonly apiUrl = `${environment.apiUrl}maestro/plan-vuelo-diario`;

  constructor(private readonly http: HttpClient) {}

  listar(): Observable<ApiResponse<PlanVueloDiario[]>> {
    return this.http.get<ApiResponse<PlanVueloDiario[]>>(this.apiUrl);
  }

  obtenerPorId(id: number): Observable<ApiResponse<PlanVueloDiario>> {
    return this.http.get<ApiResponse<PlanVueloDiario>>(`${this.apiUrl}/${id}`);
  }

  crear(vuelo: Partial<PlanVueloDiario>): Observable<ApiResponse<PlanVueloDiario>> {
    return this.http.post<ApiResponse<PlanVueloDiario>>(this.apiUrl, vuelo);
  }

  actualizar(id: number, vuelo: Partial<PlanVueloDiario>): Observable<ApiResponse<PlanVueloDiario>> {
    return this.http.put<ApiResponse<PlanVueloDiario>>(`${this.apiUrl}/${id}`, vuelo);
  }

  eliminar(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }

  /** Importa todos los vuelos desde el archivo planes_vuelo.txt en classpath:data/ */
  cargarDesdeTxt(archivo: string = 'planes_vuelo.txt'): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/cargar-txt?archivo=${archivo}`, null);
  }
}
