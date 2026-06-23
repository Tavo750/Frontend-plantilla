import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ApiResponse<T> { success?: boolean; message?: string; data: T; }
export type EstadoVuelo = 'PROGRAMADO' | 'CANCELADO';

export interface AeropuertoVuelo {
  idAeropuerto: number; codigoOaci: string; ciudad: string; pais: string;
  codigo?: string; continente?: string; capacidad?: number; activo?: boolean;
}

export interface Vuelo {
  idVuelo: number; codigoVuelo: string; aeropuertoOrigen: AeropuertoVuelo; aeropuertoDestino: AeropuertoVuelo;
  horaSalida: string; horaLlegada: string; duracionHoras: number; capacidadMaxima: number;
  estado: EstadoVuelo; esIntercontinental: boolean;
}

export interface VueloCreateDTO {
  codigoVuelo: string; idAeropuertoOrigen: number; idAeropuertoDestino: number; horaSalida: string; horaLlegada: string;
  duracionHoras: number; capacidadMaxima: number; estado: EstadoVuelo; esIntercontinental: boolean;
}

@Injectable({ providedIn: 'root' })
export class VueloService {
  private readonly apiUrl = 'http://localhost:3000/api/maestro/vuelos';
  constructor(private readonly http: HttpClient) {}
  listarPorOrigen(idAeropuerto: number): Observable<ApiResponse<Vuelo[]>> {
  return this.http.get<ApiResponse<Vuelo[]>>(
    `${this.apiUrl}/origen/${idAeropuerto}`
  );
}
  crearVuelo(dto: VueloCreateDTO): Observable<ApiResponse<Vuelo>> { return this.http.post<ApiResponse<Vuelo>>(this.apiUrl, dto); }
  actualizarVuelo(id: number, dto: VueloCreateDTO): Observable<ApiResponse<Vuelo>> { return this.http.put<ApiResponse<Vuelo>>(`${this.apiUrl}/${id}`, dto); }
  eliminarVuelo(id: number): Observable<ApiResponse<void>> { return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`); }
  cancelarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> { return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${codigoVuelo}/cancelar`, {}); }
  reactivarVuelo(codigoVuelo: string): Observable<ApiResponse<any>> { return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${codigoVuelo}/reactivar`, {}); }
}
