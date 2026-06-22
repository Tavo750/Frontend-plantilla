import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

/** Estructura de paginación que devuelve Spring Boot Page<T> */
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;      // página actual (0-based)
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface AeropuertoRef {
  idAeropuerto: number;
  codigoOaci: string;
  ciudad: string;
  pais: string;
}

export interface AerolineaRef {
  idAerolinea: number;
  nombre: string;
  codigo: string;
}

export interface EnvioMaletas {
  idEnvio: number;
  cantidad: number;
  estado: string;
  fechaRegistro: string;
  fechaLimiteEntrega: string;
  horaRegistrada: string;
  prioridad: number;
  aeropuertoOrigen: AeropuertoRef;
  aeropuertoDestino: AeropuertoRef;
  aerolinea: AerolineaRef;
  idPlanVueloAsignado?: number; // el signo es para que sea opcional
}

@Injectable({
  providedIn: 'root'
})
export class EnvioService {
  private readonly apiUrl = `${environment.apiUrl}envio/envios-maletas`;

  constructor(private readonly http: HttpClient) {}

  /** Lista paginada de envios (recomendado). Por defecto: página 0, 50 registros, más recientes primero. */
  listarEnviosPaginado(
    page = 0,
    size = 50,
    sort = 'fechaRegistro,desc'
  ): Observable<ApiResponse<SpringPage<EnvioMaletas>>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('sort', sort);
    return this.http.get<ApiResponse<SpringPage<EnvioMaletas>>>(this.apiUrl, { params });
  }

  /** @deprecated Usar listarEnviosPaginado(). Solo carga la primera página (50 registros). */
  listarEnvios(): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.listarEnviosPaginado(0, 50).pipe(
      map(resp => ({ ...resp, data: resp.data?.content ?? [] }))
    );
  }

  crearEnvio(body: {
    idAeropuertoOrigen: number;
    idAeropuertoDestino: number;
    cantidad: number;
  }): Observable<ApiResponse<EnvioMaletas>> {
    return this.http.post<ApiResponse<EnvioMaletas>>(this.apiUrl, body);
  }

  /** Crea múltiples envíos en una sola petición (carga masiva CSV). */
  crearEnviosBatch(envios: {
    idAeropuertoOrigen: number;
    idAeropuertoDestino: number;
    cantidad: number;
  }[]): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.http.post<ApiResponse<EnvioMaletas[]>>(`${this.apiUrl}/batch`, envios);
  }
}
