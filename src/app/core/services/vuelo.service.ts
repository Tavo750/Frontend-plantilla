import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export type EstadoVuelo = 'PROGRAMADO' | 'CANCELADO';

export interface AeropuertoVuelo {
  idAeropuerto: number;
  codigoOaci: string;
  ciudad: string;
  pais: string;
  codigo?: string;
  continente?: string;
  capacidad?: number;
  activo?: boolean;
  gmt?: number;
}

export interface Vuelo {
  idVuelo: number;
  codigoVuelo: string;
  aeropuertoOrigen: AeropuertoVuelo;
  aeropuertoDestino: AeropuertoVuelo;
  horaSalida: string;
  horaLlegada: string;
  duracionHoras: number;
  capacidadMaxima: number;
  estado: EstadoVuelo;
  esIntercontinental: boolean;
}

export interface VueloCreateDTO {
  codigoVuelo: string;
  idAeropuertoOrigen: number;
  idAeropuertoDestino: number;
  horaSalida: string;
  horaLlegada: string;
  duracionHoras: number;
  capacidadMaxima: number;
  estado: EstadoVuelo;
  esIntercontinental: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class VueloService {

  private readonly apiUrl = `${environment.apiUrl}maestro/vuelos`;

  constructor(private readonly http: HttpClient) {}

  listarVuelos(): Observable<ApiResponse<Vuelo[]>> {
    return this.http.get<ApiResponse<Vuelo[]>>(this.apiUrl);
  }

  listarPorOrigen(idAeropuerto: number): Observable<ApiResponse<Vuelo[]>> {
    return this.http.get<ApiResponse<Vuelo[]>>(
      `${this.apiUrl}/origen/${idAeropuerto}`
    );
  }

  crearVuelo(dto: VueloCreateDTO): Observable<ApiResponse<Vuelo>> {
    return this.http.post<ApiResponse<Vuelo>>(
      this.apiUrl,
      dto
    );
  }

  actualizarVuelo(id: number, dto: VueloCreateDTO): Observable<ApiResponse<Vuelo>> {
    return this.http.put<ApiResponse<Vuelo>>(
      `${this.apiUrl}/${id}`,
      dto
    );
  }

  eliminarVuelo(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${this.apiUrl}/${id}`
    );
  }

  /** Elimina en un solo request todos los vuelos indicados (y su fila del plan diario). */
  eliminarVuelosMasivo(ids: number[]): Observable<ApiResponse<{ eliminados: number; noEncontrados: number[] }>> {
    return this.http.post<ApiResponse<{ eliminados: number; noEncontrados: number[] }>>(
      `${this.apiUrl}/eliminar-masivo`,
      ids
    );
  }

  /** Carga masiva: crea cada vuelo igual que la creación individual, etiquetando la tanda. */
  cargaMasiva(vuelos: VueloCreateDTO[])
    : Observable<ApiResponse<{ creados: number; omitidos: number; fechaCarga: string }>> {
    return this.http.post<ApiResponse<{ creados: number; omitidos: number; fechaCarga: string }>>(
      `${this.apiUrl}/carga-masiva`,
      { vuelos }
    );
  }

  /** Lista las tandas de carga masiva (fecha_carga), la más reciente primero. */
  listarCargas(): Observable<ApiResponse<{ fechaCarga: string; total: number; desde: string; hasta: string }[]>> {
    return this.http.get<ApiResponse<{ fechaCarga: string; total: number; desde: string; hasta: string }[]>>(
      `${this.apiUrl}/cargas`
    );
  }

  /** Elimina una tanda completa por su fecha_carga. */
  eliminarCarga(fechaCarga: string): Observable<ApiResponse<{ eliminados: number }>> {
    return this.http.delete<ApiResponse<{ eliminados: number }>>(
      `${this.apiUrl}/carga`,
      { params: { fechaCarga } }
    );
  }

  cancelarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(
      `${this.apiUrl}/${codigoVuelo}/cancelar`,
      {}
    );
  }

  reactivarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(
      `${this.apiUrl}/${codigoVuelo}/reactivar`,
      {}
    );
  }
}