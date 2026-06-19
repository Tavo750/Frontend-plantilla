import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface Aeropuerto {
  id?: number;
  idAeropuerto?: number;
  codigoOaci: string;
  ciudad: string;
  pais: string;
  codigo?: string;
  latitud: number;
  longitud: number;
  capacidad?: number;
  capacidadMaxima?: number;
  gmt?: number;
  zonaHoraria?: string;
  continente?: string;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GestionAeropuertosService {
  private readonly apiUrl = `${environment.apiUrl}maestro/aeropuertos`;

  constructor(private readonly http: HttpClient) {}

  listar(): Observable<ApiResponse<Aeropuerto[]>> {
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl);
  }

  obtenerPorId(id: number): Observable<ApiResponse<Aeropuerto>> {
    return this.http.get<ApiResponse<Aeropuerto>>(`${this.apiUrl}/${id}`);
  }

  crear(aeropuerto: Aeropuerto): Observable<ApiResponse<Aeropuerto>> {
    return this.http.post<ApiResponse<Aeropuerto>>(this.apiUrl, aeropuerto);
  }

  actualizar(id: number, aeropuerto: Aeropuerto): Observable<ApiResponse<Aeropuerto>> {
    return this.http.put<ApiResponse<Aeropuerto>>(`${this.apiUrl}/${id}`, aeropuerto);
  }

  eliminar(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }
}
